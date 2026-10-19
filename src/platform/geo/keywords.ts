export type GeoTermLink = { term: string; website: string; blog: string }
export type GeoKeywordValues = {
  brand: string
  aliases: string[]
  core: string
  terms: string[]
  website: string
  blog: string
  termLinks: GeoTermLink[]
}
export type GeoKeyword = GeoKeywordValues & {
  id: string
  tenantID: number
  version: number
  createdAt: string
  updatedAt: string
}
export class GeoError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}
export const normalizeGeoText = (text: string) =>
  text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
export const geoLines = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
export const geoAliases = (text: string) => [
  ...new Set(
    text
      .split(/[/\n,，;；]+/u)
      .map((s) => s.normalize('NFKC').trim())
      .filter(Boolean),
  ),
]
export function geoObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GeoError('INVALID_INPUT', '请求内容格式不正确。')
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, max: number, optional = false) {
  if (value === undefined && optional) return ''
  if (typeof value !== 'string') throw new GeoError('INVALID_INPUT', `${label}格式不正确。`)
  const result = value.normalize('NFKC').trim()
  if (
    (!result && !optional) ||
    result.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(result)
  )
    throw new GeoError('INVALID_INPUT', `请填写${label}，不超过${max}个字符。`)
  return result
}
export function geoUrl(value: unknown, label: string, optional = false) {
  const result = text(value, label, 2048, optional)
  if (!result && optional) return ''
  try {
    const url = new URL(result)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      throw new Error()
    return url.href
  } catch {
    throw new GeoError('INVALID_URL', `请填写有效的${label}。`)
  }
}
function isIndependentChild(value: string, root: string) {
  try {
    const url = new URL(value)
    const base = new URL(root)
    const sameOrigin =
      url.origin === base.origin ||
      (base.protocol === 'http:' && url.protocol === 'https:' && url.hostname === base.hostname)
    const basePath = base.pathname.replace(/\/+$/u, '')
    const path = url.pathname.replace(/\/+$/u, '')
    return (
      sameOrigin &&
      !url.search &&
      !url.hash &&
      path !== basePath &&
      path.startsWith(`${basePath}/`)
    )
  } catch {
    return false
  }
}
const sourceURLKey = (value: string) => {
  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/u, '') || '/'
    return url.href
  } catch {
    return ''
  }
}
export function geoTermSourceMatches(
  config: Pick<GeoKeywordValues, 'terms' | 'termLinks'>,
  value: string,
  kind: 'site' | 'blog',
  term?: string,
) {
  if (!Array.isArray(config.termLinks)) return false
  const key = sourceURLKey(value)
  if (!key) return false
  const urlFor = (link: GeoTermLink) => sourceURLKey(kind === 'site' ? link.website : link.blog)
  if (term) {
    const mapped = config.termLinks
      .filter((link) => normalizeGeoText(link.term) === normalizeGeoText(term))
      .map(urlFor)
      .filter(Boolean)
    return !mapped.length || mapped.includes(key)
  }
  const hasCompleteMappings =
    config.terms.length > 0 &&
    config.terms.every((configuredTerm) =>
      config.termLinks.some(
        (link) =>
          normalizeGeoText(link.term) === normalizeGeoText(configuredTerm) && !!urlFor(link),
      ),
    )
  return !hasCompleteMappings || config.termLinks.map(urlFor).filter(Boolean).includes(key)
}
export function parseGeoValues(input: unknown): GeoKeywordValues {
  const body = geoObject(input)
  const brand = text(body.brand, '品牌词', 50)
  const core = text(body.core, '一个核心词', 50)
  if (/[\r\n]/u.test(brand + core))
    throw new GeoError('INVALID_INPUT', '品牌词和核心词各填写一项。')
  const rawTerms = typeof body.terms === 'string' ? geoLines(body.terms) : body.terms
  if (!Array.isArray(rawTerms) || rawTerms.length !== 10)
    throw new GeoError('INVALID_TERMS', '请填写10个细分词，每行一个。')
  const terms = rawTerms.map((term) => text(term, '细分词', 100))
  if (terms.some((term) => /[\r\n]/u.test(term)))
    throw new GeoError('INVALID_TERMS', '每个细分词只能填写一项。')
  if (
    new Set(terms.map(normalizeGeoText)).size !== 10 ||
    terms.some((term) => normalizeGeoText(term) === normalizeGeoText(core))
  )
    throw new GeoError('INVALID_TERMS', '10个细分词须互不重复，且不能与核心词相同。')
  const aliases = geoAliases(text(body.aliases ?? '', '比对标识', 2000, true))
  if (aliases.length > 30 || aliases.some((alias) => alias.length > 100))
    throw new GeoError('INVALID_ALIASES', '比对标识最多30个，每个不超过100个字符。')
  const website = geoUrl(body.website, '官网网址')
  const blog = geoUrl(body.blog ?? '', 'Blog链接', true)
  const rawTermLinks = body.termLinks === undefined ? [] : body.termLinks
  if (!Array.isArray(rawTermLinks) || rawTermLinks.length > 10)
    throw new GeoError('INVALID_TERM_LINKS', '发文引用子链接配置格式不正确。')
  const mappedTerms = new Set<string>()
  const termLinks = rawTermLinks.flatMap((input): GeoTermLink[] => {
    const row = geoObject(input)
    const mappedTerm = text(row.term, '细分词', 100)
    const normalizedTerm = normalizeGeoText(mappedTerm)
    if (!terms.some((term) => normalizeGeoText(term) === normalizedTerm) || mappedTerms.has(normalizedTerm))
      throw new GeoError('INVALID_TERM_LINKS', '发文引用子链接必须对应一个不同的细分词。')
    mappedTerms.add(normalizedTerm)
    const websiteLink = geoUrl(row.website ?? '', '官网独立子链接', true)
    const blogLink = geoUrl(row.blog ?? '', 'Blog独立子链接', true)
    if (!websiteLink && !blogLink) return []
    if (websiteLink && !isIndependentChild(websiteLink, website))
      throw new GeoError('INVALID_TERM_LINKS', `“${mappedTerm}”的官网链接必须是官网网址下的独立子页面。`)
    if (blogLink && (!blog || !isIndependentChild(blogLink, blog)))
      throw new GeoError('INVALID_TERM_LINKS', `“${mappedTerm}”的Blog链接必须是Blog网址下的独立子页面。`)
    return [{ term: terms.find((term) => normalizeGeoText(term) === normalizedTerm)!, website: websiteLink, blog: blogLink }]
  })
  const mappedURLs = termLinks.flatMap((link) => [link.website, link.blog]).filter(Boolean)
  if (new Set(mappedURLs.map(sourceURLKey)).size !== mappedURLs.length)
    throw new GeoError('INVALID_TERM_LINKS', '每个细分词请配置不同的独立页面链接。')
  return {
    brand,
    aliases,
    core,
    terms,
    website,
    blog,
    termLinks,
  }
}
export function geoID(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
    throw new GeoError('INVALID_ID', '优化词编号格式不正确。')
  return value.toLowerCase()
}
export function geoVersion(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new GeoError('INVALID_VERSION', '请刷新配置后重试。')
  return value
}
export function assertGeoBodyOwnership(body: Record<string, unknown>) {
  if (
    ['tenant', 'tenantID', 'tenantId', 'tenant_id', 'company', 'companyID'].some(
      (key) => key in body,
    )
  )
    throw new GeoError('INVALID_TENANT', '客户归属由当前工作公司确定，不能由请求修改。')
}
export const geoAliasMatches = (
  answer: string,
  values: Pick<GeoKeywordValues, 'brand' | 'aliases'>,
) => {
  const normalized = answer.normalize('NFKC').toLocaleLowerCase('en-US')
  return [...new Set([values.brand, ...values.aliases])].filter((alias) => {
    const term = alias.normalize('NFKC').toLocaleLowerCase('en-US')
    if (/^[\x00-\x7f]+$/u.test(term)) {
      const tokens = term.match(/[a-z0-9]+/gu)
      return (
        !!tokens?.length &&
        new RegExp(`(?<![a-z0-9])${tokens.join('[\\s\\p{P}]*')}(?![a-z0-9])`, 'u').test(normalized)
      )
    }
    const compact = (s: string) => s.replace(/[\s\p{P}]+/gu, '')
    return !!compact(term) && compact(normalized).includes(compact(term))
  })
}
