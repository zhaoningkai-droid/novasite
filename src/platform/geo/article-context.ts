import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError } from './keywords'
import type { GeoQuestion, GeoTaskValues } from './tasks'
import {
  geoPublicationLinks,
  geoWritingDirection,
  type ArticleContext,
  type ArticleImage,
} from './articles'
import { geoImageTypes } from './materials'
import { discoverGeoSources } from './source-discovery'
export function buildArticleContext(
  settings: GeoTaskValues,
  snapshot: Record<string, unknown>,
  question: GeoQuestion,
  index = 0,
): ArticleContext {
  const optimization = snapshot.optimization as ArticleContext['optimization']
  const group = snapshot.materialGroup as ArticleContext['materialGroup']
  if (!optimization || !group)
    throw new GeoError('MISSING_SNAPSHOT', '任务快照不完整，请重新保存任务。')
  const images: ArticleImage[] = Array.from(
    { length: settings.imagesPerArticle },
    (_, n) => group.images[(index + n) % group.images.length],
  )
  if (
    !group.images.length ||
    images.some((i) => !i) ||
    new Set(images.map((i) => i.id)).size !== settings.imagesPerArticle
  )
    throw new GeoError('INSUFFICIENT_IMAGES', '任务素材组图片不足，请重新保存任务。')
  return {
    settings,
    question,
    optimization,
    materialGroup: { ...group, images },
    // Website and Blog URLs are publication links only. They are never article evidence.
    sources: [],
    direction: geoWritingDirection(settings, question),
    writingMode: 'keyword',
    publicationLinks: geoPublicationLinks(optimization, question.term),
  }
}
type Snapshot = Pick<ArticleContext, 'optimization' | 'materialGroup'>
type CurrentSnapshot = {
  optimizationVersion?: number | null
  groupVersion?: number | null
  groupType?: string | null
  groupArchived?: boolean | null
}

export function generationSnapshotProblem(
  snapshot: Snapshot,
  current: CurrentSnapshot,
  optionalGroup = false,
) {
  if (!snapshot.optimization || current.optimizationVersion !== snapshot.optimization.version)
    return { code: 'OPTIMIZATION_VERSION_CHANGED', message: '优化词配置已更新或不可用，请更新任务后再生成。' }
  if (!optionalGroup && (!snapshot.materialGroup || current.groupType !== 'group' || current.groupArchived !== false))
    return { code: 'MATERIAL_GROUP_UNAVAILABLE', message: '原素材组不可用，请重新选择素材组并保存任务。' }
  if (!optionalGroup && current.groupVersion !== snapshot.materialGroup.version)
    return { code: 'MATERIAL_GROUP_VERSION_CHANGED', message: '素材组已更新，请采用当前素材配置并保存任务。' }
  return null
}

export async function assertGenerationSnapshot(
  pool: Pick<PostgresAdapter['pool'], 'query'>,
  tenantID: number,
  context: Snapshot & { settings: GeoTaskValues },
  lock = false,
) {
  const lockSQL = lock ? ' FOR SHARE' : ''
  const optionalGroup = context.settings.name === '手动创作' && !context.materialGroup.id
  const config = (await pool.query(
    'SELECT version FROM platform_geo.optimizations WHERE tenant_id=$1 AND id=$2::uuid' + lockSQL,
    [tenantID, context.optimization.id],
  )).rows[0]
  const group = optionalGroup ? null : (await pool.query(
    'SELECT version,archived,entry_type FROM platform_geo.material_groups WHERE tenant_id=$1 AND id=$2::uuid' + lockSQL,
    [tenantID, context.materialGroup.id],
  )).rows[0]
  const problem = generationSnapshotProblem(context, {
    optimizationVersion: config?.version,
    groupVersion: group?.version,
    groupType: group?.entry_type,
    groupArchived: group?.archived,
  }, optionalGroup)
  if (problem) throw new GeoError(problem.code, problem.message, 409)
}

/** Recheck current tenant-owned configuration and media before model dispatch. */
export async function refreshArticleContext(
  pool: Pick<PostgresAdapter['pool'], 'query'>,
  tenantID: number,
  context: ArticleContext,
  discover = discoverGeoSources,
): Promise<ArticleContext> {
  await assertGenerationSnapshot(pool, tenantID, context)
  await assertArticleMedia(pool, tenantID, context)
  // Keep the optional discovery argument for existing callers; article generation does not invoke it.
  void discover
  return {
    ...context,
    writingMode: context.knowledge?.length ? 'knowledge' : 'keyword',
    publicationLinks: geoPublicationLinks(context.optimization, context.question.term),
    direction: geoWritingDirection(context.settings, context.question),
  }
}
export async function assertArticleMedia(
  pool: Pick<PostgresAdapter['pool'], 'query'>,
  tenantID: number,
  context: Pick<ArticleContext, 'settings' | 'materialGroup'>,
  lock = false,
) {
  const images = context.materialGroup.images
  if (context.settings.name === '手动创作' && images.length === 0) return
  const rows = (
    await pool.query(
      `SELECT m.id,m.url FROM public.media m JOIN platform_geo.material_items i
    ON i.media_id=m.id AND i.tenant_id=m.tenant_id JOIN platform_geo.material_groups g ON g.id=i.group_id AND g.tenant_id=i.tenant_id
    WHERE m.tenant_id=$1 AND i.group_id=$2::uuid AND m.id=ANY($3::int[]) AND m.mime_type=ANY($4::text[])
      AND coalesce(m.filesize,0)<=512000 AND NOT g.archived AND g.entry_type='group'` + (lock ? ' FOR SHARE OF m,i' : ''),
      [tenantID, context.materialGroup.id, images.map((i) => i.id), geoImageTypes],
    )
  ).rows
  if (
    rows.length !== images.length ||
    images.some((i) => !rows.some((row) => row.id === i.id && row.url === i.url))
  )
    throw new GeoError('MEDIA_CHANGED', '部分任务图片已失效或不再属于本客户素材组，请更新任务。', 409)
}
