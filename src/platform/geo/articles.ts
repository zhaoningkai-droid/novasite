import { GeoError, geoObject, type GeoTermLink } from './keywords'
import { geoTaskText, type GeoQuestion, type GeoTaskValues } from './tasks'
// Shared with the browser editor: no Node/network imports in this module.
const decodeSourceText = (value: string) =>
  value
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/gu,
      (m) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
          '&nbsp;': ' ',
        })[m] || m,
    )
    .replace(/&#(x[0-9a-f]+|\d+);/giu, (_m, n: string) => {
      const p = n.startsWith('x') ? parseInt(n.slice(1), 16) : Number(n)
      return p > 0 && p <= 0x10ffff ? String.fromCodePoint(p) : ''
    })
const sourceAttributes = (tag: string): Record<string, string> =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)].map((m) => [
      m[1].toLowerCase(),
      decodeSourceText(m[2] ?? m[3] ?? m[4]),
    ]),
  )
export type ArticleSource = {
  url: string
  kind: 'site' | 'blog'
  title: string
  excerpt: string
  terms: string[]
  checked_at?: string
}
export type ArticleImage = { id: number; url: string; alt: string; filename: string }
export type ArticlePublicationLink = { url: string; title: string; kind: 'site' | 'blog' }
export type ArticleContext = {
  settings: GeoTaskValues
  question: GeoQuestion
  optimization: {
    id: string
    version: number
    brand: string
    aliases: string[]
    core: string
    terms: string[]
    website: string
    blog: string
    termLinks: GeoTermLink[]
  }
  materialGroup: { id: string; version: number; images: ArticleImage[] }
  sources: ArticleSource[]
  direction: string
  writingMode?: 'keyword' | 'knowledge'
  knowledge?: {
    id: string
    title: string
    text: string
    documentID?: string
    chunkID?: string
    documentVersion?: number
    heading?: string
    score?: number
    filename?: string
  }[]
  knowledgeRetrieval?: { strategy: string; queries: string[]; retrievedAt: string }
  publicationLinks?: ArticlePublicationLink[]
}
/** Publication URLs are tenant-owned configuration, never factual writing evidence. */
export function geoPublicationLinks(
  optimization: ArticleContext['optimization'],
  term: string,
): ArticlePublicationLink[] {
  const mapped = optimization.termLinks?.find((item) => item.term === term)
  return (
    [
      ['site', mapped?.website || optimization.website],
      ['blog', mapped?.blog || optimization.blog],
    ] as const
  )
    .filter((entry) => /^https?:\/\//iu.test(entry[1] || ''))
    .map(([kind, url]) => ({ kind, url, title: kind === 'site' ? '官方网站' : 'Blog' }))
}
export function appendGeoPublicationLinks(
  html: string,
  publicationLinks: ArticlePublicationLink[] = [],
) {
  if (!publicationLinks.length) return html
  const existing = new Set(
    [...html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/giu)].map((match) => decodeSourceText(match[2])),
  )
  const missing = publicationLinks.filter((link) => !existing.has(link.url))
  if (!missing.length) return html
  const links = missing
    .map((link) => `<a href="${escapeGeoHTML(link.url)}">${escapeGeoHTML(link.title)}</a>`)
    .join(' · ')
  return `${html}<p>相关链接：${links}</p>`
}
export function geoWritingDirection(settings: ArticleContext['settings'], question: GeoQuestion) {
  void question
  return settings.direction
}
export type ArticleContent = { title: string; summary: string; html: string }
export type GeoArticle = {
  id: string
  task_id: string | null
  task_version: number | null
  question_id: string | null
  version: number
  title: string
  summary: string
  html: string
  status: 'needs_edit' | 'ready'
  context: ArticleContext
  validation: string[]
  review_note: string
  updated_at: string
  warnings: string[]
}
export const escapeGeoHTML = (s: string) =>
  s.replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const tags = new Set([
  'p',
  'div',
  'span',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'strong',
  'b',
  'em',
  'i',
  's',
  'strike',
  'del',
  'u',
  'font',
  'ul',
  'ol',
  'li',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'br',
  'a',
  'img',
])
const safeImage = (url: string) =>
  /^\/api\/media\/file\/(?:[\w.~-]|%[\da-f]{2})+$/iu.test(url) || /^https:\/\//iu.test(url)
const safeArticleStyle = (tag: string, attrs: Record<string, string>) => {
  const styles = new Map<string, string>()
  for (const declaration of (attrs.style || '').split(';')) {
    const separator = declaration.indexOf(':')
    if (separator < 0) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration
      .slice(separator + 1)
      .trim()
      .toLowerCase()
    if (property === 'font-size' && /^(?:1[2-9]|[2-4]\d)px$/u.test(value))
      styles.set(property, value)
    else if (property === 'color' && /^#[\da-f]{3}(?:[\da-f]{3})?$/iu.test(value))
      styles.set(property, value)
    else if (property === 'line-height' && /^(?:1|1\.2|1\.5|1\.75|2|2\.5|3)$/u.test(value))
      styles.set(property, value)
    else if (property === 'text-align' && ['left', 'center', 'right', 'justify'].includes(value))
      styles.set(property, value)
  }
  if (attrs.align && ['left', 'center', 'right', 'justify'].includes(attrs.align.toLowerCase()))
    styles.set('text-align', attrs.align.toLowerCase())
  if (tag === 'font') {
    const color = attrs.color?.toLowerCase()
    if (color && /^#[\da-f]{3}(?:[\da-f]{3})?$/iu.test(color)) styles.set('color', color)
    const size = Number(attrs.size)
    const legacySizes: Record<number, string> = {
      1: '12px',
      2: '13px',
      3: '16px',
      4: '18px',
      5: '24px',
      6: '32px',
      7: '48px',
    }
    if (legacySizes[size]) styles.set('font-size', legacySizes[size])
  }
  if (
    ![
      'span',
      'p',
      'div',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'li',
      'blockquote',
      'td',
      'th',
      'font',
    ].includes(tag)
  )
    return ''
  if (!styles.size) return ''
  return ` style="${[...styles].map(([property, value]) => `${property}:${value}`).join(';')}"`
}
/** Canonical allowlist renderer: text is escaped; input attributes are never copied wholesale. */
export function cleanGeoArticleHTML(
  input: string,
  sources: ArticleSource[],
  images: ArticleImage[],
  publicationLinks: ArticlePublicationLink[] = [],
) {
  const links = new Set([...sources, ...publicationLinks].map((s) => s.url)),
    media = new Map(images.filter((i) => safeImage(i.url)).map((i) => [i.url, i]))
  const usedLinks = new Set<string>(),
    usedImages = new Set<number>(),
    issues = new Set<string>()
  let html = '',
    offset = 0,
    plain = ''
  for (const match of input.matchAll(/<\/?[a-zA-Z][^>]*>/gu)) {
    const text = decodeSourceText(input.slice(offset, match.index))
    html += escapeGeoHTML(text)
    plain += text
    offset = match.index! + match[0].length
    const name = match[0].match(/^<\/?([a-zA-Z0-9]+)/u)![1].toLowerCase()
    if (!tags.has(name)) {
      issues.add('正文包含不支持的标签，已移除。')
      continue
    }
    if (match[0].startsWith('</')) {
      if (!['br', 'img'].includes(name)) html += `</${name === 'font' ? 'span' : name}>`
      plain += ' '
      continue
    }
    const attrs = sourceAttributes(match[0])
    if (name === 'a') {
      if (!links.has(attrs.href)) {
        issues.add('存在非当前来源的链接。')
        html += '<a>'
        continue
      }
      html += `<a href="${escapeGeoHTML(attrs.href)}" rel="noopener noreferrer">`
    } else if (name === 'img') {
      const image = media.get(attrs.src)
      if (!image) {
        issues.add('存在非当前素材组的图片。')
        continue
      }
      usedImages.add(image.id)
      html += `<img src="${escapeGeoHTML(image.url)}" alt="${escapeGeoHTML(image.alt || image.filename)}">`
    } else if (name === 'font') {
      html += `<span${safeArticleStyle(name, attrs)}>`
    } else {
      html += `<${name}${safeArticleStyle(name, attrs)}>`
    }
    plain += ' '
  }
  const tail = decodeSourceText(input.slice(offset))
  html += escapeGeoHTML(tail)
  plain += tail
  for (const link of html.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)) {
    if (decodeSourceText(link[2].replace(/<[^>]*>/gu, '')).trim())
      usedLinks.add(decodeSourceText(link[1]))
    else issues.add('引用链接必须包含可见文字。')
  }
  return {
    html,
    plain: plain.replace(/\s+/gu, ' ').trim(),
    usedLinks: [...usedLinks],
    usedImages: [...usedImages],
    issues: [...issues],
  }
}
export function articleDirection(
  requested: string,
  sources: ArticleSource[],
  question: GeoQuestion,
  brand: string,
) {
  const text = sources.map((s) => `${s.title} ${s.excerpt}`).join(' ')
  if (
    requested === '企业榜单' &&
    (sources.length < 3 ||
      !/(排名方法|评测方法|ranking methodology|comparison methodology)/iu.test(text))
  )
    throw new GeoError(
      'DIRECTION_EVIDENCE',
      '企业榜单需要已核查的多企业比较与排名方法依据，当前来源不足。',
    )
  if (
    requested === '体验分享' &&
    !/(实施记录|运行记录|使用记录|项目实录|case study|commissioning record|deployment record)/iu.test(
      text,
    )
  )
    throw new GeoError(
      'DIRECTION_EVIDENCE',
      '体验分享需要实际项目或使用记录，不能把产品图片当成客户体验。',
    )
  if (
    requested === '新闻报道' &&
    (!/(公告|发布|新闻|announc|launch|news)/iu.test(text) ||
      !/20\d{2}[-年/]\d{1,2}[-月/]\d{1,2}/u.test(text))
  )
    throw new GeoError('DIRECTION_EVIDENCE', '新闻报道需要带明确日期的事件来源。')
  if (requested === '企业推荐' && !text.toLocaleLowerCase().includes(brand.toLocaleLowerCase()))
    throw new GeoError('DIRECTION_EVIDENCE', '企业推荐需要来源中可识别的公司主体与能力依据。')
  if (requested !== 'AI匹配') return requested
  return /技术|原理|参数|technical|parameter/iu.test(question.original)
    ? '技术解读'
    : /场景|工地|户外|scenario/iu.test(question.original)
      ? '场景化问题解答'
      : '产品介绍'
}
export function validateGeoArticle(content: ArticleContent, context: ArticleContext) {
  const clean = cleanGeoArticleHTML(
    content.html,
    context.sources,
    context.materialGroup.images,
    context.publicationLinks,
  )
  const issues = [...clean.issues],
    text = `${content.title} ${content.summary} ${clean.plain}`
  const words =
    context.settings.locale === 'zh'
      ? clean.plain.replace(/\s/gu, '').length
      : [
          ...new Intl.Segmenter(context.settings.locale, { granularity: 'word' }).segment(
            clean.plain,
          ),
        ].filter((s) => s.isWordLike).length
  if (!context.writingMode && context.settings.name !== '手动创作') {
    const maximum = context.settings.length === 'short' ? 1000 : 2000
    const minimum =
      context.settings.length === 'short'
        ? context.settings.locale === 'zh'
          ? 350
          : 180
        : context.settings.locale === 'zh'
          ? 750
          : 450
    if (words < minimum || words > maximum)
      issues.push(
        `正文长度应在${minimum}至${maximum}${context.settings.locale === 'zh' ? '字符' : '词'}之间，当前${words}。`,
      )
  }
  if (!context.writingMode && !clean.usedLinks.length)
    issues.push('正文至少保留一个对应来源的独立页面引用。')
  if (
    context.writingMode &&
    (context.publicationLinks || []).some((link) => !clean.usedLinks.includes(link.url))
  )
    issues.push('文章需保留当前关键词配置的官网与Blog独立链接。')
  if (
    context.settings.imagesPerArticle > 0 &&
    clean.usedImages.length !== context.settings.imagesPerArticle
  )
    issues.push(`正文需保留${context.settings.imagesPerArticle}张不同的本素材组图片。`)
  const letters = text.match(/\p{L}/gu) || []
  const script =
    context.settings.locale === 'zh'
      ? /\p{Script=Han}/gu
      : context.settings.locale === 'ar'
        ? /\p{Script=Arabic}/gu
        : context.settings.locale === 'ru'
          ? /\p{Script=Cyrillic}/gu
          : /\p{Script=Latin}/gu
  if (!letters.length || (text.match(script)?.length || 0) / letters.length < 0.45)
    issues.push('正文主要书写系统与文章语言不符。')
  if (!context.writingMode) {
    const evidence = context.sources.map((s) => s.excerpt).join(' ')
    const numbers = (s: string) => s.normalize('NFKC').match(/\d+(?:[.,]\d+)*/gu) || []
    const supported = new Set(numbers(evidence))
    if (numbers(text).some((n) => !supported.has(n)))
      issues.push('正文含来源摘录中不存在的数字，请补充依据或删除。')
    try {
      articleDirection(
        context.direction,
        context.sources,
        context.question,
        context.optimization.brand,
      )
    } catch (error) {
      issues.push(error instanceof Error ? error.message : '方向依据不足。')
    }
  }
  return { ...content, html: clean.html, issues: [...new Set(issues)], words }
}
export function parseArticleContent(value: unknown): ArticleContent {
  const b = geoObject(value)
  if (typeof b.html !== 'string' || !b.html.trim() || b.html.length > 100000)
    throw new GeoError('INVALID_CONTENT', '请填写正文，最多100000字符。')
  return {
    title: geoTaskText(b.title, '文章标题', 180),
    summary: geoTaskText(b.summary ?? '', '摘要', 1600, true),
    html: b.html,
  }
}
