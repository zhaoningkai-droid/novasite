import { createHash, randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError, normalizeGeoText } from './keywords'
import { buildArticleContext, assertArticleMedia } from './article-context'
import { parseGeoTask } from './tasks'
import {
  appendGeoPublicationLinks,
  cleanGeoArticleHTML,
  geoPublicationLinks,
  validateGeoArticle,
  type ArticleContent,
  type ArticleContext,
  type GeoArticle,
} from './articles'
import { isSourceInScope } from './source-policy'
type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
export type GeoArticlePublicationStatus = 'unused' | 'occupied' | 'published'
export type GeoArticleUseFilter = 'all' | GeoArticlePublicationStatus
export type GeoArticleListItem = {
  id: string
  title: string
  summary: string
  status: GeoArticle['status']
  version: number
  task_id: string | null
  task_version: number | null
  task_name: string
  created_at: string
  updated_at: string
  question: string
  locale: string
  direction: string
  publication_status: GeoArticlePublicationStatus
}
export const geoArticleFingerprint = (context: ArticleContext) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        config: context.optimization,
        question: normalizeGeoText(context.question.original),
        translated: context.question.translated,
        questionSource: context.settings.questionSource,
        intent: context.question.intent,
        locale: context.settings.locale,
        direction: context.direction,
        length: context.settings.length,
        images: context.settings.imagesPerArticle,
        group: [context.materialGroup.id, context.materialGroup.version],
        writingMode: context.writingMode,
        knowledge: context.knowledge || [],
        sources: context.writingMode ? [] : context.sources.map((s) => [s.url, s.excerpt]),
      }),
    )
    .digest('hex')
/** Enqueue inside the caller's transaction so an automatic plan and its AI jobs commit together. */
export async function enqueueGeoArticleJobs(
  client: Pick<Pool, 'query'>,
  tenantID: number,
  actorID: number,
  id: string,
  taskID: string,
  version: number,
  count: number,
  allowPartial = false,
) {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new GeoError('INVALID_COUNT', '请填写生成篇数，不能超过任务实际问题数。')
  const hash = createHash('sha256').update(JSON.stringify({ taskID, version, count })).digest('hex')
  await client.query('SELECT pg_advisory_xact_lock(57302,$1)', [tenantID])
  const old = (
    await client.query(
      'SELECT input_hash FROM platform_geo.generation_requests WHERE tenant_id=$1 AND id=$2::uuid',
      [tenantID, id],
    )
  ).rows[0]
  if (old) {
    if (old.input_hash !== hash)
      throw new GeoError('IDEMPOTENCY_CONFLICT', '同一生成请求不能用于不同任务、版本或数量。', 409)
    return { replayed: true, requestID: id }
  }
  const task = (
    await client.query(
      'SELECT * FROM platform_geo.creation_tasks WHERE tenant_id=$1 AND id=$2::uuid AND archived_at IS NULL FOR SHARE',
      [tenantID, taskID],
    )
  ).rows[0]
  if (!task) throw new GeoError('NOT_FOUND', '未找到当前客户任务。', 404)
  if (task.version !== version)
    throw new GeoError('VERSION_CONFLICT', '任务已修改，请重新读取任务配置。', 409)
  if (task.status !== 'ready' && task.status !== 'waiting_sources')
    throw new GeoError('MISSING_SOURCES', '任务不可用于生成，请重新保存任务。')
  const settings = parseGeoTask(task.settings)
  if (!allowPartial && count > settings.count)
    throw new GeoError('INVALID_COUNT', '不能超过本任务配置的本批篇数。')
  const eligible: { context: ArticleContext; key: string }[] = []
  const reasons: string[] = []
  for (const [index, question] of settings.questions.entries()) {
    try {
      const context = buildArticleContext(settings, task.snapshot, question, index)
      eligible.push({
        context,
        key: geoArticleFingerprint(context) + (settings.mode === 'repeat' ? `:${id}` : ''),
      })
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : '问题来源不足。')
    }
  }
  const used = (
    await client.query(
      'SELECT dedup_key FROM platform_geo.generation_jobs WHERE tenant_id=$1 AND dedup_key=ANY($2::text[])',
      [tenantID, eligible.map((e) => e.key)],
    )
  ).rows
  const candidates = eligible.filter((e) => !used.some((u) => u.dedup_key === e.key))
  if (!allowPartial && count > candidates.length)
    throw new GeoError(
      'INSUFFICIENT_QUESTIONS',
      `本次可用且未重复的问题有${candidates.length}个。${reasons[0] || '已生成或失败的问题请到生成记录查看，不重复创建。'}`,
      409,
    )
  if (allowPartial && !candidates.length) return { replayed: false, requestID: id, count: 0 }
  await client.query(
    'INSERT INTO platform_geo.generation_requests(id,tenant_id,task_id,task_version,input_hash,actor_id) VALUES($1::uuid,$2,$3::uuid,$4,$5,$6)',
    [id, tenantID, taskID, version, hash, actorID],
  )
  for (const candidate of candidates.slice(0, Math.min(count, settings.count)))
    await client.query(
      `INSERT INTO platform_geo.generation_jobs
    (id,tenant_id,request_id,task_id,task_version,question_id,dedup_key,context,actor_id)
    VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::uuid,$7,$8::jsonb,$9)`,
      [
        randomUUID(),
        tenantID,
        id,
        taskID,
        version,
        candidate.context.question.id,
        candidate.key,
        JSON.stringify(candidate.context),
        actorID,
      ],
    )
  return {
    replayed: false,
    requestID: id,
    count: Math.min(count, settings.count, candidates.length),
  }
}

export function createGeoArticleStore(pool: Pool, tenantID: number, actorID: number) {
  if (
    !Number.isSafeInteger(tenantID) ||
    tenantID < 1 ||
    !Number.isSafeInteger(actorID) ||
    actorID < 1
  )
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)
  const find = async (id: string): Promise<GeoArticle | null> =>
    (
      await pool.query<GeoArticle>(
        'SELECT * FROM platform_geo.articles WHERE tenant_id=$1 AND id=$2::uuid',
        [tenantID, id],
      )
    ).rows[0] || null
  return {
    find,
    async createManual(
      id: string,
      content: ArticleContent,
      context: ArticleContext,
      reviewNote: string,
    ) {
      content = {
        ...content,
        html: appendGeoPublicationLinks(content.html, context.publicationLinks),
      }
      if (reviewNote.length > 2000) throw new GeoError('REVIEW_REQUIRED', '核查说明最多2000字符。')
      const cleanReviewNote = reviewNote.trim()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const old = (
          await client.query<GeoArticle>(
            'SELECT * FROM platform_geo.articles WHERE tenant_id=$1 AND id=$2::uuid FOR UPDATE',
            [tenantID, id],
          )
        ).rows[0]
        if (old) {
          const same = (
            await client.query<{ same: boolean }>(
              `SELECT $1=$4 AND $2=$5 AND $3::jsonb=$6::jsonb AS same`,
              [
                old.title,
                old.summary,
                JSON.stringify(old.context),
                content.title,
                content.summary,
                JSON.stringify(context),
              ],
            )
          ).rows[0]?.same
          if (
            !same ||
            old.html !== content.html ||
            old.status !== 'ready' ||
            old.review_note !== cleanReviewNote
          )
            throw new GeoError(
              'IDEMPOTENCY_CONFLICT',
              '同一直接创作请求编号已保存不同内容，请重新读取。',
              409,
            )
          await client.query('COMMIT')
          return old
        }
        await assertArticleMedia(client, tenantID, context)
        const checked = validateGeoArticle(content, context)
        if (checked.issues.length)
          throw new GeoError('ARTICLE_INVALID', `正文仍需处理：${checked.issues.join(' ')}`)
        const row = (
          await client.query<GeoArticle>(
            `INSERT INTO platform_geo.articles
          (id,tenant_id,job_id,task_id,task_version,question_id,context,title,summary,html,status,validation,warnings,
            version,review_note,reviewed_by,reviewed_at,updated_by)
          VALUES($1::uuid,$2,NULL,NULL,NULL,NULL,$3::jsonb,$4,$5,$6,'ready','[]'::jsonb,'[]'::jsonb,1,$7,$8,now(),$8)
          RETURNING *`,
            [
              id,
              tenantID,
              JSON.stringify(context),
              content.title,
              content.summary,
              checked.html,
              cleanReviewNote,
              actorID,
            ],
          )
        ).rows[0]
        await client.query(
          `INSERT INTO platform_geo.article_revisions(tenant_id,article_id,version,snapshot,actor_id)
          VALUES($1,$2::uuid,$3,$4::jsonb,$5)`,
          [tenantID, id, row.version, JSON.stringify(row), actorID],
        )
        await client.query('COMMIT')
        return row
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async visibleArticle(item: GeoArticle) {
      const context: ArticleContext = {
        ...item.context,
        writingMode: item.context.knowledge?.length ? 'knowledge' : 'keyword',
        publicationLinks: geoPublicationLinks(
          item.context.optimization,
          item.context.question.term,
        ),
      }
      const available = (
        await pool.query(
          `SELECT m.id,m.url FROM public.media m WHERE m.tenant_id=$1 AND m.id=ANY($2::int[])`,
          [tenantID, item.context.materialGroup.images.map((i) => i.id)],
        )
      ).rows
      const images = item.context.materialGroup.images.filter((i) =>
        available.some((row) => row.id === i.id && row.url === i.url),
      )
      const safe = cleanGeoArticleHTML(
        item.html,
        item.context.sources,
        images,
        context.publicationLinks,
      )
      return {
        ...item,
        html: safe.html,
        context: { ...context, materialGroup: { ...context.materialGroup, images } },
        status: images.length < item.context.settings.imagesPerArticle ? 'needs_edit' : item.status,
      }
    },
    async history(id: string) {
      return (
        await pool.query(
          `SELECT version,created_at FROM platform_geo.article_revisions
        WHERE tenant_id=$1 AND article_id=$2::uuid ORDER BY version DESC LIMIT 50`,
          [tenantID, id],
        )
      ).rows
    },
    async revision(id: string, version: number) {
      const row = (
        await pool.query<{ snapshot: GeoArticle }>(
          `SELECT snapshot FROM platform_geo.article_revisions
        WHERE tenant_id=$1 AND article_id=$2::uuid AND version=$3`,
          [tenantID, id, version],
        )
      ).rows[0]
      return row?.snapshot || null
    },
    async list(
      q: string,
      page: number,
      taskID: string | null,
      filters: { use?: GeoArticleUseFilter; locale?: string; taskName?: string } = {},
      pageSize = 10,
    ) {
      if (![10, 20, 50].includes(pageSize)) throw new GeoError('INVALID_QUERY', '每页条数无效。')
      return (
        await pool.query<{ total: number; items: GeoArticleListItem[] }>(
          `WITH classified AS (
        SELECT a.id,a.title,a.summary,a.status,a.version,a.task_id,a.task_version,a.created_at,a.updated_at,
          coalesce(t.name,a.context->'settings'->>'name','') AS task_name,
          a.context->'question'->>'original' AS question,a.context->'settings'->>'locale' AS locale,
          a.context->>'direction' AS direction,
          CASE WHEN EXISTS(SELECT 1 FROM platform_geo.publish_intents p
            WHERE p.tenant_id=a.tenant_id AND p.article_id=a.id AND p.state='published') THEN 'published'
          WHEN EXISTS(SELECT 1 FROM platform_geo.publish_intents p
            WHERE p.tenant_id=a.tenant_id AND p.article_id=a.id AND p.state<>'cancelled') THEN 'occupied'
          ELSE 'unused' END AS publication_status
        FROM platform_geo.articles a LEFT JOIN platform_geo.creation_tasks t ON t.tenant_id=a.tenant_id AND t.id=a.task_id
        WHERE a.tenant_id=$1 AND position($2 in lower(a.title))>0 AND ($3::uuid IS NULL OR a.task_id=$3)
          AND ($5='' OR a.context->'settings'->>'locale'=$5)
          AND ($7='' OR position($7 in lower(coalesce(t.name,a.context->'settings'->>'name','')))>0)
      ), filtered AS (SELECT * FROM classified WHERE $6='all' OR publication_status=$6)
      SELECT (SELECT count(*)::int FROM filtered) AS total,
        coalesce((SELECT jsonb_agg(item ORDER BY item.updated_at DESC,item.id) FROM (
          SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT $8 OFFSET $4
        ) item),'[]'::jsonb) AS items`,
          [
            tenantID,
            normalizeGeoText(q),
            taskID,
            (page - 1) * pageSize,
            filters.locale || '',
            filters.use || 'all',
            normalizeGeoText(filters.taskName || ''),
            pageSize,
          ],
        )
      ).rows[0]
    },
    async jobs(taskID: string) {
      return (
        await pool.query(
          `SELECT j.id,j.request_id,j.task_version,j.question_id,j.context->'question'->>'original' AS question,
        j.state,j.message,j.error_code,j.updated_at,a.id AS article_id,
        (SELECT coalesce(jsonb_agg(t ORDER BY t.started_at),'[]'::jsonb) FROM (SELECT model,state,usage,error_code,started_at,finished_at
          FROM platform_geo.generation_attempts x WHERE x.tenant_id=j.tenant_id AND x.job_id=j.id) t) AS attempts
        FROM platform_geo.generation_jobs j LEFT JOIN platform_geo.articles a ON a.job_id=j.id AND a.tenant_id=j.tenant_id
        WHERE j.tenant_id=$1 AND j.task_id=$2::uuid ORDER BY j.created_at DESC,j.id LIMIT 100`,
          [tenantID, taskID],
        )
      ).rows
    },
    async enqueue(id: string, taskID: string, version: number, count: number) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await enqueueGeoArticleJobs(
          client,
          tenantID,
          actorID,
          id,
          taskID,
          version,
          count,
        )
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async retry(id: string, acknowledgeUnknown: boolean) {
      const result = await pool.query(
        `UPDATE platform_geo.generation_jobs j SET state='queued',lease_owner=NULL,lease_until=NULL,
        current_attempt=NULL,execution=NULL,error_code=NULL,message=NULL,actor_id=$4,updated_at=now()
        WHERE tenant_id=$1 AND id=$2::uuid AND (state='failed' OR (state='unknown' AND $3))
          AND NOT EXISTS(SELECT 1 FROM platform_geo.articles a WHERE a.tenant_id=j.tenant_id AND a.job_id=j.id) RETURNING id`,
        [tenantID, id, acknowledgeUnknown, actorID],
      )
      if (!result.rows[0])
        throw new GeoError(
          'RETRY_NOT_ALLOWED',
          '记录不属于当前客户、尚未失败，或未知结果尚未确认；已生成文章不能被重试覆盖。',
          409,
        )
    },
    async save(
      id: string,
      version: number,
      content: ArticleContent,
      context: ArticleContext,
      ready: boolean,
      reviewNote: string,
    ) {
      content = {
        ...content,
        html: appendGeoPublicationLinks(content.html, context.publicationLinks),
      }
      if (reviewNote.length > 2000)
        throw new GeoError('INVALID_REVIEW_NOTE', '文章备注不能超过2000字符。')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const old = (
          await client.query<GeoArticle>(
            'SELECT * FROM platform_geo.articles WHERE tenant_id=$1 AND id=$2::uuid FOR UPDATE',
            [tenantID, id],
          )
        ).rows[0]
        if (!old) throw new GeoError('NOT_FOUND', '未找到当前客户文章。', 404)
        if (old.version !== version)
          throw new GeoError('VERSION_CONFLICT', '文章已有新版本，请先读取最新版本。', 409)
        if (
          context.optimization.id !== old.context.optimization.id ||
          context.optimization.version !== old.context.optimization.version ||
          context.question.id !== old.context.question.id ||
          context.materialGroup.id !== old.context.materialGroup.id ||
          context.materialGroup.version !== old.context.materialGroup.version ||
          context.sources.some(
            (s) =>
              !isSourceInScope(
                s.url,
                s.kind === 'blog'
                  ? old.context.optimization.blog
                  : old.context.optimization.website,
                true,
              ),
          )
        )
          throw new GeoError('CONTEXT_MISMATCH', '文章不能改绑其他任务、素材或来源配置。')
        await assertArticleMedia(client, tenantID, context)
        const checked = validateGeoArticle(content, context)
        const status = ready && !checked.issues.length ? 'ready' : 'needs_edit'
        const row = (
          await client.query<GeoArticle>(
            `UPDATE platform_geo.articles SET title=$4,summary=$5,html=$6,context=$7::jsonb,
          validation=$8::jsonb,status=$9,review_note=$10,reviewed_by=$11,reviewed_at=CASE WHEN $9='ready' THEN now() ELSE NULL END,
          version=version+1,updated_by=$12,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2::uuid AND version=$3 RETURNING *`,
            [
              tenantID,
              id,
              version,
              content.title,
              content.summary,
              checked.html,
              JSON.stringify(context),
              JSON.stringify(checked.issues),
              status,
              ready ? reviewNote : '',
              status === 'ready' ? actorID : null,
              actorID,
            ],
          )
        ).rows[0]
        await client.query(
          `INSERT INTO platform_geo.article_revisions(tenant_id,article_id,version,snapshot,actor_id)
          VALUES($1,$2::uuid,$3,$4::jsonb,$5)`,
          [tenantID, id, row.version, JSON.stringify(row), actorID],
        )
        await client.query('COMMIT')
        return row
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
  }
}
