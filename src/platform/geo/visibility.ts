import { randomUUID } from 'node:crypto'
import { isSiteLocale } from '../site-locales'
import {
  geoAliasMatches,
  geoUrl,
  normalizeGeoText,
  GeoError,
  geoObject,
  type GeoKeyword,
  type GeoKeywordValues,
} from './keywords'

export type GeoQueryType = 'brand_self' | 'discovery'
export type GeoTrackedQuestion = {
  id: string
  queryType: GeoQueryType
  question: string
  language: string
}
export type GeoObservationState = 'detected' | 'not_mentioned' | 'failed'
export type GeoCitation = {
  url: string
  status: 'known_available' | 'not_in_source_inventory'
  title: string
  kind: string
}
export type GeoObservation = {
  id: string
  batchID: string
  questionID: string
  question: string
  queryType: GeoQueryType
  resultState: GeoObservationState
  matchedAliases: string[]
  recommendationContext: string
  rawAnswer: string
  groundingQueries: string[]
  citations: GeoCitation[]
  failureMessage: string
  platform: string
  model: string
  browsingMode: string
  language: string
  region: string
  optimizationVersion: number
  questionSetVersion: number
  method: 'manual'
  sampledAt: string
  optimizationSnapshot: Pick<
    GeoKeyword,
    'brand' | 'aliases' | 'core' | 'terms' | 'website' | 'blog' | 'version'
  >
}
export type GeoVisibilityMetrics = {
  trackedQuestions: number
  coveredQuestions: number
  validSamples: number
  detectedSamples: number
  validCitationSamples: number
  mentionRate: number | null
  citationRate: number | null
  questionCoverage: number | null
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const clean = (value: unknown, label: string, max: number, optional = false) => {
  if (value === undefined && optional) return ''
  if (typeof value !== 'string') throw new GeoError('INVALID_INPUT', `${label}格式不正确。`)
  const result = value.trim()
  if (
    (!optional && !result) ||
    result.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(result)
  )
    throw new GeoError('INVALID_INPUT', `请填写${label}，不超过${max}个字符。`)
  return result
}
const lines = (value: unknown, label: string, maxItems: number, maxLength: number) => {
  if (value === undefined || value === '') return [] as string[]
  if (typeof value !== 'string') throw new GeoError('INVALID_INPUT', `${label}格式不正确。`)
  const result = value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
  if (result.length > maxItems || result.some((item) => item.length > maxLength))
    throw new GeoError('INVALID_INPUT', `${label}最多${maxItems}项，每项不超过${maxLength}个字符。`)
  return [...new Set(result)]
}
const rawText = (value: unknown, label: string, max: number, optional = false) => {
  if (value === undefined && optional) return ''
  if (typeof value !== 'string') throw new GeoError('INVALID_INPUT', `${label}格式不正确。`)
  if (
    (!optional && !value.trim()) ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
  )
    throw new GeoError('INVALID_INPUT', `请填写${label}，不超过${max}个字符。`)
  return value
}

export function parseGeoQuestions(value: unknown): GeoTrackedQuestion[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new GeoError('INVALID_QUESTIONS', '问题集最多保存100条问题。')
  const questions = value.map((item) => {
    const row = geoObject(item)
    if (row.queryType !== 'brand_self' && row.queryType !== 'discovery')
      throw new GeoError('INVALID_QUESTIONS', '请选择品牌自查或非品牌发现问题。')
    const language = clean(row.language ?? 'zh', '问题语言', 8)
    if (!isSiteLocale(language))
      throw new GeoError('INVALID_QUESTIONS', '问题语言不在当前站点支持范围内。')
    const question = clean(row.question, '问题', 500)
    const id =
      typeof row.id === 'string' && uuidPattern.test(row.id) ? row.id.toLowerCase() : randomUUID()
    return { id, queryType: row.queryType, question, language } as GeoTrackedQuestion
  })
  const unique = questions.map(
    (item) => `${item.queryType}:${item.language}:${normalizeGeoText(item.question)}`,
  )
  if (
    new Set(unique).size !== unique.length ||
    new Set(questions.map((item) => item.id)).size !== questions.length
  )
    throw new GeoError('INVALID_QUESTIONS', '问题或问题编号重复，请检查后重试。')
  return questions
}

export type GeoObservationInput = {
  questionID: string
  optimizationVersion: number
  questionSetVersion: number
  platform: string
  model: string
  browsingMode: 'connected' | 'disconnected' | 'unknown'
  language: string
  region: string
  outcome: 'answered' | 'failed'
  rawAnswer: string
  groundingQueries: string[]
  citationURLs: string[]
  recommendationContext: string
  failureMessage: string
}
export function parseGeoObservation(value: unknown): GeoObservationInput {
  const body = geoObject(value)
  if (typeof body.questionID !== 'string' || !uuidPattern.test(body.questionID))
    throw new GeoError('INVALID_QUESTION', '问题编号无效，请刷新页面后重试。')
  for (const key of ['optimizationVersion', 'questionSetVersion'] as const) {
    if (!Number.isSafeInteger(body[key]) || Number(body[key]) < 1)
      throw new GeoError('VERSION_CONFLICT', '问题集或优化词已更新，请刷新后重试。', 409)
  }
  const platform = clean(body.platform, 'AI平台', 80)
  const model = clean(body.model ?? '', '模型名称', 120, true)
  if (!['connected', 'disconnected', 'unknown'].includes(String(body.browsingMode)))
    throw new GeoError('INVALID_INPUT', '请选择联网模式。')
  const language = clean(body.language, '语言', 8)
  if (!isSiteLocale(language)) throw new GeoError('INVALID_INPUT', '请选择当前站点支持的语言。')
  const region = clean(body.region, '地区', 16).toUpperCase()
  if (!/^(GLOBAL|[A-Z]{2})$/u.test(region))
    throw new GeoError('INVALID_INPUT', '地区请填写两位国家代码或 GLOBAL。')
  if (body.outcome !== 'answered' && body.outcome !== 'failed')
    throw new GeoError('INVALID_INPUT', '请选择已获得答案或检测失败。')
  const rawAnswer = rawText(body.rawAnswer, '原始答案', 30000, body.outcome === 'failed')
  const failureMessage = clean(
    body.failureMessage ?? '',
    '失败说明',
    1000,
    body.outcome === 'answered',
  )
  if (body.outcome === 'answered' && !rawAnswer)
    throw new GeoError('INVALID_INPUT', '请粘贴真实采样得到的原始答案。')
  if (body.outcome === 'failed' && !failureMessage)
    throw new GeoError('INVALID_INPUT', '请填写检测失败原因；失败记录不计入提及率分母。')
  const recommendationContext = body.recommendationContext ?? 'not_applicable'
  if (
    !['recommended', 'mentioned', 'not_recommended', 'unclear', 'not_applicable'].includes(
      String(recommendationContext),
    )
  )
    throw new GeoError('INVALID_INPUT', '请选择答案中公司的推荐语境。')
  const groundingQueries = lines(body.groundingQueries, '引擎检索词', 20, 500)
  const rawURLs = lines(body.citationURLs, '引用链接', 20, 2048)
  const citationURLs = rawURLs.map((url) => geoUrl(url, '引用链接'))
  return {
    questionID: body.questionID.toLowerCase(),
    optimizationVersion: Number(body.optimizationVersion),
    questionSetVersion: Number(body.questionSetVersion),
    platform,
    model,
    browsingMode: body.browsingMode as GeoObservationInput['browsingMode'],
    language,
    region,
    outcome: body.outcome,
    rawAnswer,
    groundingQueries,
    citationURLs,
    recommendationContext:
      body.outcome === 'answered' ? String(recommendationContext) : 'not_applicable',
    failureMessage,
  }
}

export function normalizeGeoCitationURL(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/u, '') || '/'
    return url.href
  } catch {
    return ''
  }
}

export function classifyGeoCitations(
  urls: string[],
  sources: Array<{ url: string; status: string; title: string | null; kind: string }>,
): GeoCitation[] {
  const available = new Map(
    sources
      .filter((source) => source.status === 'available')
      .map((source) => [normalizeGeoCitationURL(source.url), source]),
  )
  return urls.map((url) => {
    const source = available.get(normalizeGeoCitationURL(url))
    return source?.status === 'available'
      ? { url, status: 'known_available' as const, title: source.title || '', kind: source.kind }
      : { url, status: 'not_in_source_inventory' as const, title: '', kind: '' }
  })
}

export function detectGeoObservation(
  answer: string,
  config: Pick<GeoKeywordValues, 'brand' | 'aliases'>,
) {
  return geoAliasMatches(answer, config)
}

export function computeGeoVisibilityMetrics(
  questions: GeoTrackedQuestion[],
  observations: GeoObservation[],
): GeoVisibilityMetrics {
  const valid = observations.filter(
    (item) => item.resultState === 'detected' || item.resultState === 'not_mentioned',
  )
  const covered = new Set(valid.map((item) => item.questionID)).size
  const detected = valid.filter((item) => item.resultState === 'detected').length
  const validCitationSamples = valid.filter((item) =>
    item.citations.some((citation) => citation.status === 'known_available'),
  ).length
  const total = questions.length
  return {
    trackedQuestions: total,
    coveredQuestions: covered,
    validSamples: valid.length,
    detectedSamples: detected,
    validCitationSamples,
    mentionRate: valid.length ? detected / valid.length : null,
    citationRate: valid.length ? validCitationSamples / valid.length : null,
    questionCoverage: total && valid.length ? covered / total : null,
  }
}

export function defaultGeoQuestions(config: GeoKeyword): GeoTrackedQuestion[] {
  return [
    {
      id: randomUUID(),
      queryType: 'brand_self',
      question: `${config.brand}的${config.core}有哪些产品与服务？`,
      language: 'zh',
    },
    ...config.terms.map((term) => ({
      id: randomUUID(),
      queryType: 'discovery' as const,
      question: `哪些厂家提供${term}？`,
      language: 'zh',
    })),
  ]
}
