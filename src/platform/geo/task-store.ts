import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError, geoID, normalizeGeoText } from './keywords'
import { geoImageTypes } from './materials'
import type { GeoTask, GeoTaskValues } from './tasks'
import { parseGeoTask } from './tasks'
import { buildArticleContext } from './article-context'
import { geoArticleFingerprint } from './article-store'
type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
type Row = {
  id: string
  name: string
  settings: GeoTaskValues
  snapshot: Record<string, unknown>
  version: number
  status: GeoTask['status']
  updated_at: Date | string
}
export type GeoTaskListItem = {
  id: string
  name: string
  version: number
  status: GeoTask['status']
  updated_at: string
  locale: string
  questions: number
  direction: string
  count: number
  generated_count: number
  used_count: number
  generation_state: 'queued' | 'running' | 'failed' | 'unknown' | 'succeeded' | 'idle'
  related_plan_count: number
  available_count: number
}
type TaskListRow = Omit<GeoTaskListItem, 'available_count'> & {
  settings: unknown
  snapshot: Record<string, unknown>
}
const dto = (row: Row): GeoTask => ({
  ...row.settings,
  id: row.id,
  version: row.version,
  snapshot: row.snapshot,
  status: row.status === 'waiting_sources' ? 'ready' : row.status,
  updatedAt: new Date(row.updated_at).toISOString(),
})
function savedTaskCandidates(
  values: unknown,
  snapshot: Record<string, unknown>,
  status: GeoTask['status'],
) {
  const keys: string[] = []
  let maximum = 0,
    repeat = false
  if (status !== 'ready' && status !== 'waiting_sources') return { keys, maximum, repeat }
  try {
    const settings = parseGeoTask(values)
    maximum = Math.min(10, settings.count)
    repeat = settings.mode === 'repeat'
    for (const [index, question] of settings.questions.entries()) {
      try {
        keys.push(geoArticleFingerprint(buildArticleContext(settings, snapshot, question, index)))
      } catch {
        /* The enqueue path omits questions without usable saved images or task settings. */
      }
    }
  } catch {
    /* Invalid saved settings cannot be enqueued. */
  }
  return { keys, maximum, repeat }
}
/** Same saved-snapshot eligibility as enqueue; excludes live rechecks and the daily provider limit. */
export function geoTaskAvailableCount(
  values: unknown,
  snapshot: Record<string, unknown>,
  status: GeoTask['status'],
  usedKeys: readonly string[] = [],
) {
  const candidate = savedTaskCandidates(values, snapshot, status),
    used = new Set(usedKeys)
  return Math.min(
    candidate.maximum,
    candidate.keys.filter((key) => candidate.repeat || !used.has(key)).length,
  )
}
export function createGeoTaskStore(pool: Pool, tenantID: number, actorID: number) {
  if (
    !Number.isSafeInteger(tenantID) ||
    tenantID < 1 ||
    !Number.isSafeInteger(actorID) ||
    actorID < 1
  )
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)
  const find = async (id: string) => {
    const row = (
      await pool.query<Row>(
        'SELECT * FROM platform_geo.creation_tasks WHERE tenant_id=$1 AND id=$2::uuid AND archived_at IS NULL',
        [tenantID, id],
      )
    ).rows[0]
    return row ? dto(row) : null
  }
  return {
    find,
    async list(query: string, page: number, locale = '', pageSize = 10) {
      if (![10, 15, 20, 50].includes(pageSize))
        throw new GeoError('INVALID_QUERY', '每页条数无效。')
      const result = (
        await pool.query<{ total: number; items: TaskListRow[] }>(
          `WITH matched AS (
        SELECT * FROM platform_geo.creation_tasks WHERE tenant_id=$1 AND archived_at IS NULL
          AND position($2 in lower(name))>0 AND ($4='' OR settings->>'locale'=$4)
      ), current_page AS (SELECT * FROM matched ORDER BY updated_at DESC,id LIMIT $5 OFFSET $3)
      SELECT (SELECT count(*)::int FROM matched) AS total,
        coalesce((SELECT jsonb_agg(item ORDER BY item.updated_at DESC,item.id) FROM (
          SELECT t.id,t.name,t.version,t.status,t.updated_at,t.settings,t.snapshot,
            t.settings->>'locale' AS locale,jsonb_array_length(t.settings->'questions') AS questions,
            t.settings->>'direction' AS direction,coalesce((t.settings->>'count')::int,0) AS count,
            a.generated_count,a.used_count,j.generation_state,
            (SELECT count(*)::int FROM platform_geo.publish_plans p WHERE p.tenant_id=t.tenant_id AND p.archived_at IS NULL AND p.state='active' AND (
              (p.config->>'sourceMode'='tasks' AND (p.config->'sourceIDs') ? t.id::text) OR
              (p.config->>'sourceMode'='articles' AND EXISTS(SELECT 1 FROM platform_geo.articles source
                WHERE source.tenant_id=t.tenant_id AND source.task_id=t.id AND (p.config->'sourceIDs') ? source.id::text))
            )) AS related_plan_count
          FROM current_page t
          CROSS JOIN LATERAL (SELECT count(*)::int AS generated_count,
            count(*) FILTER(WHERE EXISTS(SELECT 1 FROM platform_geo.publish_intents p
              WHERE p.tenant_id=t.tenant_id AND p.article_id=article.id AND p.state='published'))::int AS used_count
            FROM platform_geo.articles article WHERE article.tenant_id=t.tenant_id AND article.task_id=t.id) a
          CROSS JOIN LATERAL (SELECT CASE WHEN bool_or(state='running') THEN 'running'
            WHEN bool_or(state='queued') THEN 'queued' WHEN bool_or(state='unknown') THEN 'unknown'
            WHEN bool_or(state='failed') THEN 'failed' WHEN bool_or(state='succeeded') THEN 'succeeded'
            ELSE 'idle' END AS generation_state FROM platform_geo.generation_jobs
            WHERE tenant_id=t.tenant_id AND task_id=t.id) j
        ) item),'[]'::jsonb) AS items`,
          [tenantID, normalizeGeoText(query), (page - 1) * pageSize, locale, pageSize],
        )
      ).rows[0]
      const candidates = result.items.map((item) =>
        savedTaskCandidates(item.settings, item.snapshot, item.status),
      )
      const keys = [
        ...new Set(
          candidates
            .filter((candidate) => !candidate.repeat)
            .flatMap((candidate) => candidate.keys),
        ),
      ]
      const used = new Set(
        keys.length
          ? (
              await pool.query<{ dedup_key: string }>(
                'SELECT dedup_key FROM platform_geo.generation_jobs WHERE tenant_id=$1 AND dedup_key=ANY($2::text[])',
                [tenantID, keys],
              )
            ).rows.map((row) => row.dedup_key)
          : [],
      )
      const items: GeoTaskListItem[] = result.items.map(
        ({ settings: _settings, snapshot: _snapshot, ...item }, index) => {
          const candidate = candidates[index]
          return {
            ...item,
            status: item.status === 'waiting_sources' ? 'ready' : item.status,
            available_count: Math.min(
              candidate.maximum,
              candidate.keys.filter((key) => candidate.repeat || !used.has(key)).length,
            ),
          }
        },
      )
      return { ...result, items, page, pageSize }
    },
    async archive(ids: string[], expectedVersions: Record<string, number> = {}) {
      if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length)
        throw new GeoError('INVALID_TASKS', '请选择1至50个不重复的创作任务。')
      ids.forEach((id) => geoID(id))
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57298,$1)', [tenantID])
        const rows = (
          await client.query<{ id: string; version: number }>(
            `SELECT id,version FROM platform_geo.creation_tasks
           WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL FOR UPDATE`,
            [tenantID, ids],
          )
        ).rows
        if (rows.length !== ids.length)
          throw new GeoError('NOT_FOUND', '部分任务不属于当前客户或已归档，请刷新列表。', 404)
        if (
          rows.some((row) => expectedVersions[row.id] && expectedVersions[row.id] !== row.version)
        )
          throw new GeoError('VERSION_CONFLICT', '任务已更新，请刷新列表后重试。', 409)
        const running = (
          await client.query<{ task_id: string }>(
            `SELECT task_id FROM platform_geo.generation_jobs
           WHERE tenant_id=$1 AND task_id=ANY($2::uuid[]) AND state IN ('queued','running') LIMIT 1`,
            [tenantID, ids],
          )
        ).rows[0]
        if (running)
          throw new GeoError(
            'TASK_RUNNING',
            '所选任务仍有文章生成中，请完成或等待生成后再删除。',
            409,
          )
        const scheduled = (
          await client.query<{ id: string }>(
            `SELECT p.id FROM platform_geo.publish_plans p
           WHERE p.tenant_id=$1 AND p.archived_at IS NULL AND (
             (p.config->>'sourceMode'='tasks' AND EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(p.config->'sourceIDs') AS source_ids(value)
               WHERE source_ids.value=ANY($2::text[])
             )) OR
             (p.config->>'sourceMode'='articles' AND EXISTS (
               SELECT 1 FROM platform_geo.articles a
               WHERE a.tenant_id=p.tenant_id AND a.task_id=ANY($2::uuid[])
                 AND (p.config->'sourceIDs') ? a.id::text
             ))
           ) LIMIT 1`,
            [tenantID, ids],
          )
        ).rows[0]
        if (scheduled)
          throw new GeoError('TASK_SCHEDULED', '所选任务仍被发布计划引用，请先归档相关计划。', 409)
        await client.query(
          `UPDATE platform_geo.creation_tasks SET archived_at=clock_timestamp(),
             version=version+1,updated_by=$3,updated_at=clock_timestamp()
           WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL`,
          [tenantID, ids, actorID],
        )
        await client.query('COMMIT')
        return { archived: rows.length }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async save(id: string, values: GeoTaskValues, version?: number) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        // Serializes same-tenant task saves and duplicate create retries before acquiring row locks.
        await client.query('SELECT pg_advisory_xact_lock(57298,$1)', [tenantID])
        const old = (
          await client.query<Row>(
            'SELECT * FROM platform_geo.creation_tasks WHERE tenant_id=$1 AND id=$2::uuid AND archived_at IS NULL FOR UPDATE',
            [tenantID, id],
          )
        ).rows[0]
        if (version !== undefined && !old)
          throw new GeoError('NOT_FOUND', '未找到当前客户的任务。', 404)
        if (old && version === undefined) {
          const equal = (
            await client.query<{ equal: boolean }>('SELECT $1::jsonb=$2::jsonb AS equal', [
              JSON.stringify(old.settings),
              JSON.stringify(values),
            ])
          ).rows[0].equal
          if (!equal)
            throw new GeoError(
              'IDEMPOTENCY_CONFLICT',
              '此保存请求已处理，内容不同，请读取已保存任务。',
              409,
            )
          await client.query('COMMIT')
          return dto(old)
        }
        if (old && old.version !== version)
          throw new GeoError('VERSION_CONFLICT', '任务已有新版本，请先读取最新版本。', 409)
        if (old) {
          const scheduled = (
            await client.query<{ id: string }>(
              `SELECT p.id FROM platform_geo.publish_plans p
               WHERE p.tenant_id=$1 AND p.archived_at IS NULL AND (
                 (p.config->>'sourceMode'='tasks' AND (p.config->'sourceIDs') ? $2::text) OR
                 (p.config->>'sourceMode'='articles' AND EXISTS (
                   SELECT 1 FROM platform_geo.articles a
                   WHERE a.tenant_id=p.tenant_id AND a.task_id=$2::uuid
                     AND (p.config->'sourceIDs') ? a.id::text
                 ))
               ) LIMIT 1`,
              [tenantID, id],
            )
          ).rows[0]
          if (scheduled)
            throw new GeoError('TASK_SCHEDULED', '任务仍被发布计划引用，暂时不能修改。', 409)
        }
        const config = (
          await client.query(
            `SELECT * FROM platform_geo.optimizations WHERE tenant_id=$1 AND id=$2::uuid FOR SHARE`,
            [tenantID, values.optimizationID],
          )
        ).rows[0]
        if (!config || config.version !== values.optimizationVersion)
          throw new GeoError('CONFIG_CHANGED', '优化词配置已更新或不可用，请重新选择。', 409)
        const configuredTerms = Array.isArray(config.terms) ? config.terms : []
        if (values.questions.some((q) => ![config.core, ...configuredTerms].includes(q.term)))
          throw new GeoError('INVALID_TERM', '搜索问题必须归属于当前优化词的核心词或细分词。')
        const group = (
          await client.query(
            `SELECT * FROM platform_geo.material_groups WHERE tenant_id=$1 AND id=$2::uuid FOR SHARE`,
            [tenantID, values.materialGroupID],
          )
        ).rows[0]
        if (
          !group ||
          group.entry_type !== 'group' ||
          group.archived ||
          group.version !== values.materialGroupVersion
        )
          throw new GeoError('GROUP_CHANGED', '素材组已变更或不可用，请重新选择。', 409)
        const images = (
          await client.query(
            `SELECT m.id,m.alt,m.filename,m.url,m.mime_type,m.filesize,i.sort_order
          FROM platform_geo.material_items i JOIN public.media m ON m.id=i.media_id AND m.tenant_id=i.tenant_id
          WHERE i.tenant_id=$1 AND i.group_id=$2::uuid AND m.mime_type=ANY($3::text[]) AND coalesce(m.filesize,0)<=512000
          ORDER BY i.sort_order,m.id FOR SHARE OF m`,
            [tenantID, group.id, geoImageTypes],
          )
        ).rows
        if (images.length < values.imagesPerArticle)
          throw new GeoError('INSUFFICIENT_IMAGES', '素材组可用图片少于每篇用图数量，请调整。')
        const snapshot = {
          optimization: {
            id: config.id,
            version: config.version,
            brand: config.brand,
            aliases: config.aliases,
            core: config.core,
            terms: config.terms,
            website: config.website,
            blog: config.blog,
            termLinks: Array.isArray(config.term_links) ? config.term_links : [],
          },
          materialGroup: { id: group.id, name: group.name, version: group.version, images },
          sources: [],
          missingTerms: [],
          writingMode: 'keyword',
          capturedAt: new Date().toISOString(),
        }
        const status = 'ready'
        const saved = (
          await client.query<Row>(
            old
              ? `UPDATE platform_geo.creation_tasks SET name=$4,
          settings=$5::jsonb,snapshot=$6::jsonb,status=$7,optimization_id=$8::uuid,material_group_id=$9::uuid,
          version=version+1,updated_by=$10,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND id=$2::uuid AND version=$3 RETURNING *`
              : `INSERT INTO platform_geo.creation_tasks(tenant_id,id,version,name,settings,snapshot,status,optimization_id,material_group_id,created_by,updated_by)
          VALUES($1,$2::uuid,$3,$4,$5::jsonb,$6::jsonb,$7,$8::uuid,$9::uuid,$10,$10) RETURNING *`,
            [
              tenantID,
              id,
              version ?? 1,
              values.name,
              JSON.stringify(values),
              JSON.stringify(snapshot),
              status,
              config.id,
              group.id,
              actorID,
            ],
          )
        ).rows[0]
        await client.query(
          `INSERT INTO platform_geo.task_revisions(tenant_id,task_id,version,settings,snapshot,status,actor_id)
          VALUES($1,$2::uuid,$3,$4::jsonb,$5::jsonb,$6,$7)`,
          [
            tenantID,
            id,
            saved.version,
            JSON.stringify(values),
            JSON.stringify(snapshot),
            status,
            actorID,
          ],
        )
        await client.query('COMMIT')
        return dto(saved)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
  }
}
