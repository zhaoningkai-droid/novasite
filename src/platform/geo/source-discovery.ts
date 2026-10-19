import type { GeoKeyword } from './keywords'
import { GeoError, normalizeGeoText } from './keywords'
import { fetchPublicSource, type SourceResponse } from './source-fetch'
import {
  decodeSourceText,
  isSourceInScope,
  robotsAllows,
  robotsRules,
  sourceAttributes,
  sourcePlainText,
} from './source-policy'
export type GeoSourcePage = {
  url: string
  kind: 'site' | 'blog'
  title: string
  excerpt: string
  terms: string[]
  status: 'available' | 'pending' | 'invalid'
  reason: string
}
export type GeoSourceCandidate = { url: string; title: string; terms?: string[] }
const matches = (text: string, config: GeoKeyword) => {
  const normalized = normalizeGeoText(text)
  const terms = config.terms.filter((term) => normalized.includes(normalizeGeoText(term)))
  return terms.length || !normalized.includes(normalizeGeoText(config.core)) ? terms : [config.core]
}
const candidatePriority = (value: string) => {
  const path = new URL(value).pathname.replace(/\/+$/u, '')
  if (/\.(?:html?|aspx?)$/iu.test(path)) return 3
  if (/\/(?:c\d+|products?|articles?|news|blog|cases?|about|faq|contact)$/iu.test(path)) return 0
  return path.split('/').filter(Boolean).length >= 2 ? 2 : 1
}
const sourceFailure = (error: unknown, fallback: string) =>
  error instanceof GeoError ? error.message : fallback
const acceptablePath = (url: string) =>
  !/\/(?:api|admin|workspace|login)(?:\/|$)/iu.test(new URL(url).pathname) &&
  !/\.(?:pdf|jpe?g|png|webp|svg|mp4|zip|css|js)$/iu.test(new URL(url).pathname)

/** Bounded, on-demand source discovery. External content is only parsed as data. */
export async function discoverGeoSources(
  config: GeoKeyword,
  seeds: GeoSourceCandidate[] = [],
  read: (
    url: string,
    root: string,
    canVisit?: (url: string) => boolean,
  ) => Promise<SourceResponse> = fetchPublicSource,
  options: { seedsOnly?: boolean } = {},
) {
  const result: GeoSourcePage[] = [],
    seen = new Set<string>()
  const started = Date.now()
  let requests = 0
  const fetch = async (url: string, root: string, canVisit?: (url: string) => boolean) => {
    if (++requests > 32 || Date.now() - started > 30000) throw new Error('source-budget')
    return read(url, root, canVisit)
  }
  for (const [kind, root] of [
    ['site', config.website],
    ['blog', config.blog],
  ] as const) {
    if (!root) continue
    const explicit = config.termLinks.flatMap((link) => {
      const url = kind === 'site' ? link.website : link.blog
      return url && isSourceInScope(url, root, true) ? [{ url, title: '', terms: [link.term] }] : []
    })
    const explicitlyMappedTerms = new Set(
      explicit.flatMap((candidate) => candidate.terms || []).map(normalizeGeoText),
    )
    const needsDiscovery =
      !options.seedsOnly &&
      (!explicit.length ||
        config.terms.some((term) => !explicitlyMappedTerms.has(normalizeGeoText(term))))
    try {
      const origin = new URL(root).origin
      const technicalScope = origin + '/'
      const robots = await fetch(new URL('/robots.txt', root).href, technicalScope)
      if (robots.status !== 200 && robots.status !== 404) throw new Error('robots-unavailable')
      const rules = robotsRules(robots.body)
      const mayVisit = (url: string) => robotsAllows(url, rules)
      if (!robotsAllows(root, rules)) throw new Error('robots-denied')
      const candidates = [
        ...explicit,
        ...seeds
          .filter((s) => isSourceInScope(s.url, root, true))
          .sort((a, b) => matches(b.title, config).length - matches(a.title, config).length),
      ]
      if (needsDiscovery) {
        const home = await fetch(root, root, mayVisit)
        if (home.status === 200 && home.type.includes('html')) {
          for (const tag of home.body.match(/<a\b[^>]*>/giu) || []) {
            const href = sourceAttributes(tag).href
            if (!href) continue
            try {
              const url = new URL(href, home.url).href
              if (isSourceInScope(url, root, true) && acceptablePath(url))
                candidates.push({ url, title: '' })
            } catch {
              /* Invalid third-party links are ignored. */
            }
          }
        }
        const sitemapURL = new URL('/sitemap.xml', root).href
        if (robotsAllows(sitemapURL, rules)) {
          const sitemap = await fetch(sitemapURL, technicalScope, mayVisit)
          if (sitemap.status === 200 && /(?:xml|text)/u.test(sitemap.type)) {
            const locations = (xml: string) =>
              [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/giu)]
                .slice(0, 500)
                .map((loc) =>
                  decodeSourceText(loc[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1').trim()),
                )
            let urls = locations(sitemap.body)
            const index = urls.find(
              (url) =>
                url.endsWith('.xml') &&
                isSourceInScope(url, technicalScope) &&
                acceptablePath(url) &&
                mayVisit(url),
            )
            if (index && requests < 32) {
              const child = await fetch(index, technicalScope, mayVisit)
              if (child.status === 200 && /(?:xml|text)/u.test(child.type))
                urls = [...urls, ...locations(child.body)]
            }
            for (const url of urls) {
              if (isSourceInScope(url, root, true) && acceptablePath(url) && !url.endsWith('.xml'))
                candidates.push({ url, title: '' })
            }
          }
        }
      }
      const uniqueCandidates = [
        ...new Map(
          candidates.map((candidate) => {
            const clean = new URL(candidate.url)
            clean.hash = ''
            clean.search = ''
            return [clean.href, candidate]
          }),
        ).values(),
      ]
        .filter((candidate) => candidatePriority(candidate.url) > 0)
        .sort(
          (a, b) =>
            Number(!!b.terms) - Number(!!a.terms) ||
            candidatePriority(b.url) - candidatePriority(a.url),
        )
      let checked = 0
      const maxChecked = needsDiscovery ? 10 : uniqueCandidates.length
      for (const candidate of uniqueCandidates) {
        if (checked >= maxChecked || requests >= 32 || Date.now() - started > 30000) break
        const clean = new URL(candidate.url)
        clean.hash = ''
        clean.search = ''
        if (seen.has(clean.href) || !robotsAllows(clean.href, rules)) continue
        seen.add(clean.href)
        checked++
        const entry: GeoSourcePage = {
          url: clean.href,
          kind,
          title: candidate.title,
          excerpt: '',
          terms: [],
          status: 'invalid',
          reason: '',
        }
        try {
          const page = await fetch(clean.href, root, mayVisit)
          if (page.status !== 200 || !page.type.includes('html'))
            throw new Error('not-readable-html')
          if (!isSourceInScope(page.url, root, true) || !robotsAllows(page.url, rules))
            throw new Error('redirect-scope')
          const meta = (page.body.match(/<meta\b[^>]*>/giu) || []).map(sourceAttributes)
          if (
            /noindex/iu.test(page.robots) ||
            meta.some(
              (m) =>
                /^(robots|novasite-geo-source)$/iu.test(m.name || '') &&
                /noindex/iu.test(m.content || ''),
            )
          )
            throw new Error('noindex')
          const canonical = (page.body.match(/<link\b[^>]*>/giu) || [])
            .map(sourceAttributes)
            .find((m) => m.rel?.toLowerCase().split(/\s+/u).includes('canonical'))?.href
          if (canonical) {
            const canonicalURL = new URL(canonical, page.url)
            const samePage =
              canonicalURL.origin === new URL(page.url).origin &&
              canonicalURL.pathname.replace(/\/+$/u, '') ===
                new URL(page.url).pathname.replace(/\/+$/u, '')
            if (!isSourceInScope(canonicalURL.href, root, true) || !samePage)
              throw new Error('canonical-mismatch')
          }
          entry.url = page.url
          entry.title = sourcePlainText(
            page.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] || candidate.title,
          ).slice(0, 300)
          entry.excerpt = sourcePlainText(page.body).slice(0, 12000)
          const matchedTerms = matches(entry.title + ' ' + entry.excerpt, config)
          entry.terms = candidate.terms
            ? matchedTerms.filter((term) => candidate.terms?.includes(term))
            : matchedTerms
          if (!entry.title || entry.excerpt.length < 80) throw new Error('insufficient-content')
          entry.status = entry.terms.length ? 'available' : 'pending'
          entry.reason = entry.terms.length ? '' : '页面可读取，但尚未匹配核心词或细分词。'
        } catch (error) {
          entry.reason = sourceFailure(error, '页面未通过可达性、索引、规范URL或内容检查。')
        }
        result.push(entry)
      }
      if (!checked)
        result.push({
          url: root,
          kind,
          title: '',
          excerpt: '',
          terms: [],
          status: 'pending',
          reason: '未发现可引用的独立页面，请完善当前客户官网或Blog内容。',
        })
    } catch (error) {
      result.push({
        url: root,
        kind,
        title: '',
        excerpt: '',
        terms: [],
        status: 'pending',
        reason: sourceFailure(error, '来源暂不可读取、受抓取规则限制或超出本次读取预算。'),
      })
    }
  }
  return [...new Map(result.map((item) => [item.url, item])).values()]
}
