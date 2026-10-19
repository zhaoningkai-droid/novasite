import { GeoError, geoID, geoObject, geoVersion, normalizeGeoText } from './keywords'
import { isSiteLocale, type SiteLocale } from '../site-locales'

export const geoIntents = [
  ['default', '常见问题'],
  ['supplier', '找供应商'],
  ['manufacturer', '找产品厂家'],
  ['wholesale', '批量采购'],
  ['industry', '行业场景'],
  ['comparison', '产品比较'],
] as const
export const geoDirections = [
  'AI匹配',
  '企业榜单',
  '产品介绍',
  '技术解读',
  '场景化问题解答',
  '行业问题解答',
  '行业百科',
  '体验分享',
  '企业推荐',
  '新闻报道',
  '知识科普',
] as const
export type GeoIntent = (typeof geoIntents)[number][0]
export type GeoQuestion = {
  id: string
  term: string
  intent: GeoIntent
  original: string
  translated: string
  translatedFrom: string
  translatedLocale: string
}
export type GeoTaskValues = {
  name: string
  optimizationID: string
  optimizationVersion: number
  locale: SiteLocale
  questions: GeoQuestion[]
  questionSource?: 'original' | 'translated'
  materialGroupID: string
  materialGroupVersion: number
  imagesPerArticle: number
  direction: string
  length: 'short' | 'long'
  mode: 'deduplicate' | 'repeat'
  count: number
}
export type GeoTask = GeoTaskValues & {
  id: string
  version: number
  status: 'ready' | 'waiting_sources'
  updatedAt: string
  snapshot: Record<string, unknown>
}
export function geoTaskText(value: unknown, label: string, max = 300, empty = false) {
  if (
    typeof value !== 'string' ||
    (!empty && !value.trim()) ||
    value.length > max ||
    /[\u0000-\u001f]/u.test(value)
  )
    throw new GeoError('INVALID_INPUT', `${label}格式不正确，最多${max}个字符。`)
  return value.trim()
}
export function parseGeoQuestions(value: unknown): GeoQuestion[] {
  if (!Array.isArray(value) || !value.length)
    throw new GeoError('INVALID_QUESTIONS', '请至少保留一个搜索问题。')
  const questions = value.map((raw) => {
    const item = geoObject(raw)
    if (!geoIntents.some(([key]) => key === item.intent))
      throw new GeoError('INVALID_INTENT', '请选择搜索意图。')
    return {
      id: geoID(item.id),
      term: geoTaskText(item.term, '所属关键词', 100),
      intent: item.intent as GeoIntent,
      original: geoTaskText(item.original, '问题'),
      translated: geoTaskText(item.translated ?? '', '译文', 600, true),
      translatedFrom: geoTaskText(item.translatedFrom ?? '', '译文原文', 300, true),
      translatedLocale: geoTaskText(item.translatedLocale ?? '', '译文语言', 10, true),
    }
  })
  if (
    new Set(questions.map((q) => q.id)).size !== questions.length ||
    new Set(questions.map((q) => normalizeGeoText(q.original))).size !== questions.length
  )
    throw new GeoError('DUPLICATE_QUESTIONS', '问题编号与规范化后的问题内容不能重复。')
  return questions
}
/** Reject obvious translation failures; Latin-script languages still need human review. */
export function assertGeoQuestionTranslation(
  original: string,
  translated: string,
  locale: SiteLocale,
  status = 422,
) {
  const markup = translated
    .replace(/&lt;|&#0*60;|&#x0*3c;/giu, '<')
    .replace(/&gt;|&#0*62;|&#x0*3e;/giu, '>')
  if (/<\/?[a-z][^>]*>|<!--|<!doctype\b/iu.test(markup))
    throw new GeoError(
      'TRANSLATION_MARKUP',
      '译文包含HTML标签，请只保留问题文字，原文已保留。',
      status,
    )
  if (
    locale !== 'zh' &&
    /\p{Script=Han}/u.test(original) &&
    normalizeGeoText(original) === normalizeGeoText(translated)
  )
    throw new GeoError(
      'UNCHANGED_TRANSLATION',
      '译文仍是原始中文问题，请重新翻译或手工填写，原文已保留。',
      status,
    )
  // English names and model numbers carried over from a Chinese question are not language errors.
  const names = /\p{Script=Han}/u.test(original)
    ? original.match(/[a-z][a-z\d_.+/-]*(?:[ \t]+[a-z][a-z\d_.+/-]*)*/giu) || []
    : original.match(/\b[A-Z][A-Z\d]*(?:[-./][A-Z\d]+)*\b/gu) || []
  const withoutIdentifiers = (text: string) => {
    let result = normalizeGeoText(text)
    for (const name of names.sort((a, b) => b.length - a.length)) {
      const escaped = normalizeGeoText(name).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
      result = result.replace(new RegExp(`(?<![a-z\\d])${escaped}(?![a-z\\d])`, 'gu'), ' ')
    }
    return result.replace(
      /https?:\/\/\S+|\b[a-z][a-z\d_.+/-]*\d[a-z\d_.+/-]*\b|\d+(?:[.,]\d+)*(?:\s*[a-z]+)?/gu,
      ' ',
    )
  }
  const remaining = withoutIdentifiers(translated),
    letters = remaining.match(/\p{L}/gu) || []
  const expected =
    locale === 'zh'
      ? /\p{Script=Han}/gu
      : locale === 'ar'
        ? /\p{Script=Arabic}/gu
        : locale === 'ru'
          ? /\p{Script=Cyrillic}/gu
          : /\p{Script=Latin}/gu
  const matching = remaining.match(expected)?.length || 0
  if (
    (!letters.length && /\p{L}/u.test(withoutIdentifiers(original))) ||
    (letters.length && matching / letters.length < 0.35)
  )
    throw new GeoError(
      'TRANSLATION_LANGUAGE',
      '译文主要文字与目标语言明显不符，请重新翻译或手工填写，原文已保留。',
      status,
    )
}
export function parseGeoTask(value: unknown): GeoTaskValues {
  const b = geoObject(value),
    questions = parseGeoQuestions(b.questions)
  if (typeof b.locale !== 'string' || !isSiteLocale(b.locale))
    throw new GeoError('INVALID_LANGUAGE', '请选择文章语言。')
  const questionSource =
    b.questionSource === 'original' || b.locale === 'zh' ? 'original' : 'translated'
  if (
    !geoDirections.includes(b.direction as (typeof geoDirections)[number]) ||
    !['short', 'long'].includes(String(b.length)) ||
    !['deduplicate', 'repeat'].includes(String(b.mode))
  )
    throw new GeoError('INVALID_METHOD', '请选择创作方向、长度与模式。')
  if (
    !Number.isInteger(b.imagesPerArticle) ||
    Number(b.imagesPerArticle) < 1 ||
    Number(b.imagesPerArticle) > 10
  )
    throw new GeoError('INVALID_IMAGES', '每篇选择1至10张素材组图片。')
  if (!Number.isInteger(b.count) || Number(b.count) < 1 || Number(b.count) > questions.length)
    throw new GeoError('INVALID_COUNT', '本批篇数不能超过实际搜索问题数。')
  if (
    b.locale !== 'zh' &&
    questionSource === 'translated' &&
    questions.some(
      (q) => !q.translated || q.translatedFrom !== q.original || q.translatedLocale !== b.locale,
    )
  )
    throw new GeoError('STALE_TRANSLATION', '部分问题缺少当前语言译文，或原文已修改，请重新翻译。')
  if (b.locale !== 'zh' && questionSource === 'translated')
    for (const q of questions) assertGeoQuestionTranslation(q.original, q.translated, b.locale)
  const usable = questions.map((q) =>
    normalizeGeoText(b.locale === 'zh' || questionSource === 'original' ? q.original : q.translated),
  )
  if (new Set(usable).size !== usable.length)
    throw new GeoError('DUPLICATE_TRANSLATIONS', '目标语言问题有重复，请修改后保存。')
  return {
    name: geoTaskText(b.name, '任务名称', 100),
    optimizationID: geoID(b.optimizationID),
    optimizationVersion: geoVersion(b.optimizationVersion),
    locale: b.locale,
    questions,
    questionSource,
    materialGroupID: geoID(b.materialGroupID),
    materialGroupVersion: geoVersion(b.materialGroupVersion),
    imagesPerArticle: Number(b.imagesPerArticle),
    direction: String(b.direction),
    length: b.length as GeoTaskValues['length'],
    mode: b.mode as GeoTaskValues['mode'],
    count: Number(b.count),
  }
}

/** Local question templates are explicitly separate from model expansion. */
export function seedGeoQuestion(term: string, intent: GeoIntent): string {
  return {
    default: `${term}怎么选？`,
    supplier: `哪里可以买到${term}？`,
    manufacturer: `生产${term}的厂家怎么找？`,
    wholesale: `${term}批量采购要注意什么？`,
    industry: `${term}适合哪些行业使用？`,
    comparison: `选购${term}时要比较哪些方面？`,
  }[intent]
}
