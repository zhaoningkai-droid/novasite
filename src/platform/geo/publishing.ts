import { GeoError, geoID, geoVersion } from './keywords'
export type GeoPublishInput = {
  articleID: string
  version: number
  collection: 'news' | 'posts'
  categoryID: number
  publishAt: string | null
}
export type GeoPublishTarget = {
  collection: 'news' | 'posts'
  categoryID: number
  categoryName: string
  categoryUpdatedAt: string
  locale: string
  companySlug: string
  origin: string
  companyUpdatedAt: string
}
export type GeoPublishRecord = {
  id: string
  article_id: string
  article_version: number
  snapshot: import('./articles').GeoArticle
  target: GeoPublishTarget
  publish_at: string
  state: 'queued' | 'running' | 'published' | 'failed' | 'unknown' | 'cancelled'
  input_hash: string
  actor_id: number
  tenant_id: number
  lease_owner: string | null
  attempts: number
  target_id: number | null
  target_url: string | null
  message: string | null
  error_code: string | null
  created_at: string
  updated_at: string
}
export function parseGeoPublishInput(
  b: Record<string, unknown>,
  now = Date.now(),
): GeoPublishInput {
  if (
    !['news', 'posts'].includes(String(b.collection)) ||
    !Number.isSafeInteger(b.categoryID) ||
    Number(b.categoryID) < 1
  )
    throw new GeoError('INVALID_TARGET', '请选择本站新闻/Blog及当前客户分类。')
  let publishAt: string | null = null
  if (b.publishAt !== null && b.publishAt !== undefined && b.publishAt !== '') {
    if (
      typeof b.publishAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(b.publishAt)
    )
      throw new GeoError('INVALID_TIME', '指定时间需要完整UTC时间。')
    const time = Date.parse(b.publishAt)
    if (!Number.isFinite(time) || time < now + 60_000 || time > now + 90 * 86400_000)
      throw new GeoError('INVALID_TIME', '指定时间需在1分钟后至90天内。')
    publishAt = new Date(time).toISOString()
  }
  return {
    articleID: geoID(b.articleID),
    version: geoVersion(b.version),
    collection: b.collection as 'news' | 'posts',
    categoryID: Number(b.categoryID),
    publishAt,
  }
}
export const geoPublishSlug = (articleID: string, version: number, locale: string) =>
  `geo-${articleID.replaceAll('-', '')}-v${version}-${locale}`
export const geoPublishURL = (target: GeoPublishTarget, articleID: string, version: number) =>
  `${target.origin.replace(/\/$/u, '')}/${target.locale}/${target.collection === 'posts' ? 'blog' : 'news'}/${geoPublishSlug(articleID, version, target.locale)}`
export const geoPublishStates = {
  queued: '等待发布',
  running: '发布处理中',
  published: '站点已发布',
  failed: '发布失败',
  unknown: '结果待核对',
  cancelled: '已取消',
}
