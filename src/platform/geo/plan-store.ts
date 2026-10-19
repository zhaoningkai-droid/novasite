import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError, geoID, normalizeGeoText } from './keywords'
import type { GeoArticle } from './articles'
import { geoPublishHash } from './publish-store'
import { enqueueGeoArticleJobs } from './article-store'
import {
  geoPlanTargetKey,
  nextGeoPlanOccurrence,
  currentGeoPlanOccurrence,
  type GeoPlanConfig,
  type GeoPlanTarget,
} from './plans'

type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
type PlanRow = {
  id: string
  tenant_id: number
  name: string
  version: number
  config: GeoPlanConfig
  state: 'draft' | 'active' | 'paused' | 'ended'
  next_run_at: Date | string | null
  last_run_at: Date | string | null
  actor_id: number
  created_at: Date | string
  updated_at: Date | string
}
type ItemRow = {
  id: string
  run_id: string
  article_id: string
  article_version: number
  title: string
  target: GeoPlanTarget
  state: string
  intent_id: string | null
  message: string
  created_at: Date | string
  article_status?: string
  current_version?: number
}
type TargetSummaryRow = {
  plan_id: string
  collection: GeoPlanTarget['collection']
  category_id: number
  category_name: string
  published_count: number
  failed_count: number
  unknown_count: number
  awaiting_count: number
  queued_count: number
  last_published_at: Date | string | null
}
const time = (value: Date | string | null) => (value ? new Date(value).toISOString() : null)
const publicPlan = (row: PlanRow) => ({
  ...row,
  next_run_at: time(row.next_run_at),
  last_run_at: time(row.last_run_at),
  created_at: time(row.created_at),
  updated_at: time(row.updated_at),
})
const publicationKey = (target: Pick<GeoPlanTarget, 'collection' | 'locale'>) =>
  `${target.collection}:${target.locale}`

/** An initial activation may use the currently selected hour window, once per slot. */
export const previewGeoPlanOccurrence = (config: GeoPlanConfig, now: Date) =>
  config.schedule.cadence === 'once' && !config.schedule.runAt
    ? new Date(now.getTime() + 1000)
    : currentGeoPlanOccurrence(config.schedule, now) || nextGeoPlanOccurrence(config.schedule, now)

export function confirmedGeoPlanOccurrence(config: GeoPlanConfig, now: Date, value: string) {
  const instant = new Date(value)
  if (!Number.isFinite(instant.getTime()))
    throw new GeoError(
      'PLAN_PREVIEW_EXPIRED',
      '首轮预览时间已临近或已过去，请重新预览后启用。',
      409,
    )
  if (config.schedule.cadence === 'once' && !config.schedule.runAt) {
    if (instant.getTime() < now.getTime() - 30000 || instant.getTime() > now.getTime() + 120000)
      throw new GeoError('PLAN_PREVIEW_EXPIRED', '发布时间已失效，请重新提交。', 409)
    return new Date(Math.max(instant.getTime(), now.getTime()))
  }
  const current = currentGeoPlanOccurrence(config.schedule, now)
  if (current?.getTime() === instant.getTime()) return instant
  if (instant.getTime() < now.getTime())
    throw new GeoError('PLAN_PREVIEW_EXPIRED', '所选发布时间已过去，请重新选择。', 409)
  const occurrence = nextGeoPlanOccurrence(config.schedule, new Date(instant.getTime() - 1))
  if (!occurrence || occurrence.getTime() !== instant.getTime())
    throw new GeoError('PLAN_PREVIEW_CHANGED', '预览时间不符合当前计划，请重新预览后启用。', 409)
  return instant
}

export function createGeoPlanStore(pool: Pool, tenantID: number, actorID: number) {
  if (
    !Number.isSafeInteger(tenantID) ||
    tenantID < 1 ||
    !Number.isSafeInteger(actorID) ||
    actorID < 1
  )
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)
  const find = async (id: string) =>
    (
      await pool.query<PlanRow>(
        'SELECT * FROM platform_geo.publish_plans WHERE tenant_id=$1 AND id=$2::uuid AND archived_at IS NULL',
        [tenantID, id],
      )
    ).rows[0] || null
  return {
    find,
    async preview(config: GeoPlanConfig, now = new Date()) {
      const sourceCount =
        config.sourceMode === 'articles'
          ? Number(
              (
                await pool.query<{ count: number }>(
                  `SELECT count(*)::int AS count FROM platform_geo.articles
            WHERE tenant_id=$1 AND id=ANY($2::uuid[])`,
                  [tenantID, config.sourceIDs],
                )
              ).rows[0].count,
            )
          : Number(
              (
                await pool.query<{ count: number }>(
                  `SELECT count(*)::int AS count FROM platform_geo.creation_tasks
            WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL`,
                  [tenantID, config.sourceIDs],
                )
              ).rows[0].count,
            )
      if (sourceCount !== config.sourceIDs.length)
        throw new GeoError('INVALID_PLAN_SOURCE', '部分文章或任务不属于当前客户，或已不存在。', 403)
      const ready = (
        config.sourceMode === 'articles'
          ? await pool.query<GeoArticle>(
              `SELECT * FROM platform_geo.articles
            WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status='ready' AND version>0
              AND context->'settings'->>'locale'=$3
            ORDER BY array_position($2::uuid[],id) LIMIT 500`,
              [tenantID, config.sourceIDs, config.targets[0].locale],
            )
          : await pool.query<GeoArticle>(
              `SELECT * FROM platform_geo.articles
            WHERE tenant_id=$1 AND task_id=ANY($2::uuid[]) AND status='ready' AND version>0
              AND context->'settings'->>'locale'=$3
            ORDER BY array_position($2::uuid[],task_id),updated_at,id LIMIT 500`,
              [tenantID, config.sourceIDs, config.targets[0].locale],
            )
      ).rows
      const occurrence = previewGeoPlanOccurrence(config, now)
      const previous = ready.length
        ? (
            await pool.query(
              `SELECT article_id,article_version,
          (target->>'collection') || ':' || (target->>'locale') AS publication_key FROM platform_geo.publish_plan_items
          WHERE tenant_id=$1 AND article_id=ANY($2::uuid[]) AND state NOT IN ('cancelled','skipped')
        UNION ALL SELECT article_id,article_version,collection || ':' || locale AS publication_key
          FROM platform_geo.publish_intents WHERE tenant_id=$1 AND article_id=ANY($2::uuid[]) AND state<>'cancelled'`,
              [tenantID, ready.map((row) => row.id)],
            )
          ).rows
        : []
      const scheduledAt = occurrence?.toISOString() || null
      const items: {
        articleID: string
        articleVersion: number
        title: string
        target: GeoPlanTarget
        scheduledAt: string
      }[] = []
      const selected = new Set<string>()
      let skippedExistingTargets = 0
      ready.forEach((article, index) => {
        if (selected.has(article.id) || selected.size >= config.maxArticles) return
        const targets =
          config.distribution === 'all'
            ? config.targets
            : [config.targets[index % config.targets.length]]
        const eligible = targets.filter(
          (target) =>
            !previous.some(
              (item) =>
                item.article_id === article.id &&
                Number(item.article_version) === article.version &&
                item.publication_key === publicationKey(target),
            ),
        )
        skippedExistingTargets += targets.length - eligible.length
        if (!eligible.length || !scheduledAt) return
        selected.add(article.id)
        for (const target of eligible)
          items.push({
            articleID: article.id,
            articleVersion: article.version,
            title: article.title,
            target,
            scheduledAt,
          })
      })
      return {
        timezone: config.schedule.timezone,
        nextRunAt: scheduledAt,
        readyArticleCount: ready.length,
        articleCount: selected.size,
        itemCount: items.length,
        skippedExistingTargets,
        items,
      }
    },
    async list(
      page: number,
      query = '',
      state = '',
      pageSize = 15,
      sourceMode = '',
      sourceID = '',
    ) {
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
        throw new GeoError('INVALID_QUERY', '分页参数无效。')
      if (![15, 30, 50].includes(pageSize)) throw new GeoError('INVALID_QUERY', '每页条数无效。')
      if (
        query.length > 100 ||
        !['', 'draft', 'active', 'paused', 'ended'].includes(state) ||
        !['', 'articles', 'tasks'].includes(sourceMode) ||
        !!sourceID !== !!sourceMode
      )
        throw new GeoError('INVALID_QUERY', '计划名称或状态筛选无效。')
      if (sourceID) sourceID = geoID(sourceID)
      const search = normalizeGeoText(query)
      const plans = (
        await pool.query<PlanRow>(
          `SELECT * FROM platform_geo.publish_plans WHERE tenant_id=$1 AND archived_at IS NULL
        AND position($3 in lower(name))>0 AND ($4='' OR state=$4)
        AND ($5='' OR (config->>'sourceMode'=$5 AND config->'sourceIDs' ? $6))
        ORDER BY updated_at DESC,id LIMIT $7 OFFSET $2`,
          [tenantID, (page - 1) * pageSize, search, state, sourceMode, sourceID, pageSize],
        )
      ).rows
      const total = Number(
        (
          await pool.query<{ total: number }>(
            `SELECT count(*)::int AS total FROM platform_geo.publish_plans WHERE tenant_id=$1 AND archived_at IS NULL
          AND position($2 in lower(name))>0 AND ($3='' OR state=$3)
          AND ($4='' OR (config->>'sourceMode'=$4 AND config->'sourceIDs' ? $5))`,
            [tenantID, search, state, sourceMode, sourceID],
          )
        ).rows[0].total,
      )
      const ids = plans.map((plan) => plan.id)
      const taskIDs = plans
        .filter((plan) => plan.config.sourceMode === 'tasks')
        .flatMap((plan) => plan.config.sourceIDs)
      const articleIDs = plans
        .filter((plan) => plan.config.sourceMode === 'articles')
        .flatMap((plan) => plan.config.sourceIDs)
      const sources = ids.length
        ? (
            await pool.query<{ id: string; label: string; mode: string }>(
              `SELECT id,name AS label,'tasks' AS mode FROM platform_geo.creation_tasks
          WHERE tenant_id=$1 AND id=ANY($2::uuid[])
        UNION ALL SELECT id,title AS label,'articles' AS mode FROM platform_geo.articles
          WHERE tenant_id=$1 AND id=ANY($3::uuid[])`,
              [tenantID, taskIDs, articleIDs],
            )
          ).rows
        : []
      const runs = ids.length
        ? (
            await pool.query(
              `SELECT id,tenant_id,plan_id,plan_version,scheduled_at,state,message,created_at,updated_at
        FROM (SELECT r.*,row_number() OVER (PARTITION BY r.plan_id ORDER BY r.scheduled_at DESC,r.id DESC) AS position
          FROM platform_geo.publish_plan_runs r WHERE r.tenant_id=$1 AND r.plan_id=ANY($2::uuid[])) recent
        WHERE position<=10 OR EXISTS (SELECT 1 FROM platform_geo.publish_plan_items pending
          WHERE pending.tenant_id=recent.tenant_id AND pending.run_id=recent.id
            AND pending.state='awaiting_review')
        ORDER BY scheduled_at DESC,id`,
              [tenantID, ids],
            )
          ).rows
        : []
      const runIDs = runs.map((run) => run.id)
      const items: ItemRow[] = runIDs.length
        ? (
            await pool.query<ItemRow>(
              `SELECT i.*,a.title FROM platform_geo.publish_plan_items i
        JOIN platform_geo.articles a ON a.tenant_id=i.tenant_id AND a.id=i.article_id
        WHERE i.tenant_id=$1 AND i.run_id=ANY($2::uuid[]) ORDER BY i.created_at,i.id`,
              [tenantID, runIDs],
            )
          ).rows
        : []
      const targetSummaries = ids.length
        ? (
            await pool.query<TargetSummaryRow>(
              `SELECT r.plan_id,i.target->>'collection' AS collection,
                (i.target->>'categoryID')::int AS category_id,
                i.target->>'categoryName' AS category_name,
                count(*) FILTER(WHERE i.state='published')::int AS published_count,
                count(*) FILTER(WHERE i.state='failed')::int AS failed_count,
                count(*) FILTER(WHERE i.state='unknown')::int AS unknown_count,
                count(*) FILTER(WHERE i.state='awaiting_review')::int AS awaiting_count,
                count(*) FILTER(WHERE i.state='queued')::int AS queued_count,
                max(i.updated_at) FILTER(WHERE i.state='published') AS last_published_at
              FROM platform_geo.publish_plan_items i
              JOIN platform_geo.publish_plan_runs r
                ON r.tenant_id=i.tenant_id AND r.id=i.run_id
              WHERE i.tenant_id=$1 AND r.plan_id=ANY($2::uuid[])
              GROUP BY r.plan_id,i.target->>'collection',i.target->>'categoryID',i.target->>'categoryName'
              ORDER BY r.plan_id,collection,category_id`,
              [tenantID, ids],
            )
          ).rows
        : []
      const events = plans.length
        ? (
            await pool.query(
              `SELECT plan_id,run_id,item_id,event,details,created_at FROM platform_geo.publish_plan_events
        WHERE tenant_id=$1 AND plan_id=ANY($2::uuid[]) ORDER BY created_at DESC,id DESC LIMIT 200`,
              [tenantID, ids],
            )
          ).rows
        : []
      return {
        items: plans.map((plan) => ({
          ...publicPlan(plan),
          sources: plan.config.sourceIDs.map((id) => ({
            id,
            name:
              sources.find((source) => source.id === id && source.mode === plan.config.sourceMode)
                ?.label || '来源记录已移除',
          })),
          targetSummaries: targetSummaries
            .filter((summary) => summary.plan_id === plan.id)
            .map((summary) => ({
              collection: summary.collection,
              categoryID: Number(summary.category_id),
              categoryName: summary.category_name,
              publishedCount: Number(summary.published_count),
              failedCount: Number(summary.failed_count),
              unknownCount: Number(summary.unknown_count),
              awaitingCount: Number(summary.awaiting_count),
              queuedCount: Number(summary.queued_count),
              lastPublishedAt: time(summary.last_published_at),
            })),
          runs: runs
            .filter((run) => run.plan_id === plan.id)
            .map((run) => ({
              ...run,
              scheduled_at: time(run.scheduled_at),
              created_at: time(run.created_at),
              updated_at: time(run.updated_at),
              items: items
                .filter((item) => item.run_id === run.id)
                .map((item) => ({ ...item, created_at: time(item.created_at) })),
              events: events.filter((event) => event.run_id === run.id),
            })),
        })),
        total,
        page,
        pageSize,
      }
    },
    async archive(ids: string[], expectedVersions: Record<string, number> = {}) {
      if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length)
        throw new GeoError('INVALID_PLANS', '请选择1至50个不重复的发布计划。')
      ids.forEach(geoID)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57314,$1)', [tenantID])
        const plans = (
          await client.query<{ id: string; version: number; state: PlanRow['state'] }>(
            `SELECT id,version,state FROM platform_geo.publish_plans
           WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL FOR UPDATE`,
            [tenantID, ids],
          )
        ).rows
        if (plans.length !== ids.length)
          throw new GeoError('NOT_FOUND', '部分计划不属于当前客户或已归档，请刷新列表。', 404)
        if (
          plans.some(
            (plan) => expectedVersions[plan.id] && expectedVersions[plan.id] !== plan.version,
          )
        )
          throw new GeoError('VERSION_CONFLICT', '计划已更新，请刷新列表后重试。', 409)
        if (plans.some((plan) => plan.state === 'active'))
          throw new GeoError('PLAN_RUNNING', '运行中的计划不能删除，请先结束计划。', 409)
        const pending = (
          await client.query<{ plan_id: string }>(
            `SELECT r.plan_id FROM platform_geo.publish_plan_runs r
           JOIN platform_geo.publish_plan_items i
             ON i.tenant_id=r.tenant_id AND i.run_id=r.id
           WHERE r.tenant_id=$1 AND r.plan_id=ANY($2::uuid[])
             AND i.state IN ('awaiting_review','queued','unknown') LIMIT 1`,
            [tenantID, ids],
          )
        ).rows[0]
        if (pending)
          throw new GeoError(
            'PLAN_HAS_PENDING_ITEMS',
            '计划仍有待审核、待发布或待核对项目，处理完成后再删除。',
            409,
          )
        await client.query(
          `UPDATE platform_geo.publish_plans SET archived_at=clock_timestamp(),
             version=version+1,actor_id=$3,updated_at=clock_timestamp()
           WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL`,
          [tenantID, ids, actorID],
        )
        await client.query('COMMIT')
        return { archived: plans.length }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async save(id: string, name: string, config: GeoPlanConfig, version?: number) {
      const cleanName = name.trim()
      if (!cleanName || cleanName.length > 20)
        throw new GeoError('INVALID_PLAN_NAME', '计划名称为1至20个字符。')
      const exists =
        config.sourceMode === 'articles'
          ? Number(
              (
                await pool.query<{ count: number }>(
                  `SELECT count(*)::int AS count FROM platform_geo.articles
            WHERE tenant_id=$1 AND id=ANY($2::uuid[])`,
                  [tenantID, config.sourceIDs],
                )
              ).rows[0].count,
            )
          : Number(
              (
                await pool.query<{ count: number }>(
                  `SELECT count(*)::int AS count FROM platform_geo.creation_tasks
            WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL`,
                  [tenantID, config.sourceIDs],
                )
              ).rows[0].count,
            )
      if (exists !== config.sourceIDs.length)
        throw new GeoError('INVALID_PLAN_SOURCE', '部分文章或任务不属于当前客户，或已不存在。', 403)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57314,$1)', [tenantID])
        if (version === undefined) {
          const existing = (
            await client.query<PlanRow & { request_matches: boolean }>(
              `SELECT *,
            (name=$3 AND config=$4::jsonb AND actor_id=$5) AS request_matches FROM platform_geo.publish_plans
            WHERE tenant_id=$1 AND id=$2::uuid FOR UPDATE`,
              [tenantID, id, cleanName, JSON.stringify(config), actorID],
            )
          ).rows[0]
          if (existing) {
            if (!existing.request_matches)
              throw new GeoError(
                'IDEMPOTENCY_CONFLICT',
                '同一保存请求不能用于不同计划内容，请重新提交。',
                409,
              )
            const { request_matches: _matches, ...row } = existing
            await client.query('COMMIT')
            return { ...publicPlan(row), replayed: true }
          }
          const row = (
            await client.query<PlanRow>(
              `INSERT INTO platform_geo.publish_plans
            (id,tenant_id,name,version,config,state,actor_id) VALUES($1::uuid,$2,$3,1,$4::jsonb,'draft',$5) RETURNING *`,
              [id, tenantID, cleanName, JSON.stringify(config), actorID],
            )
          ).rows[0]
          await client.query(
            `INSERT INTO platform_geo.publish_plan_events(tenant_id,plan_id,actor_id,event,details)
            VALUES($1,$2::uuid,$3,'created',$4::jsonb)`,
            [tenantID, id, actorID, JSON.stringify({ approvalMode: config.approvalMode })],
          )
          await client.query('COMMIT')
          return publicPlan(row)
        }
        const old = (
          await client.query<PlanRow>(
            `SELECT * FROM platform_geo.publish_plans
          WHERE tenant_id=$1 AND id=$2::uuid AND archived_at IS NULL FOR UPDATE`,
            [tenantID, id],
          )
        ).rows[0]
        if (!old) throw new GeoError('NOT_FOUND', '未找到当前客户发布计划。', 404)
        if (old.version !== version)
          throw new GeoError('VERSION_CONFLICT', '发布计划已被其他人修改，请刷新后重试。', 409)
        if (!['draft', 'paused'].includes(old.state))
          throw new GeoError('PLAN_MUST_PAUSE', '请先暂停计划，再修改其来源、目标或调度规则。', 409)
        await client.query(
          `UPDATE platform_geo.publish_plan_runs SET state='cancelled',message='计划已修改，本次自动创作不再发布。',
           updated_at=clock_timestamp() WHERE tenant_id=$1 AND plan_id=$2::uuid AND state='preparing'`,
          [tenantID, id],
        )
        const row = (
          await client.query<PlanRow>(
            `UPDATE platform_geo.publish_plans SET name=$4,config=$5::jsonb,
          version=version+1,next_run_at=NULL,actor_id=$6,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND id=$2::uuid AND version=$3 RETURNING *`,
            [tenantID, id, version, cleanName, JSON.stringify(config), actorID],
          )
        ).rows[0]
        await client.query(
          `INSERT INTO platform_geo.publish_plan_events(tenant_id,plan_id,actor_id,event,details)
          VALUES($1,$2::uuid,$3,'updated',$4::jsonb)`,
          [tenantID, id, actorID, JSON.stringify({ version: row.version })],
        )
        await client.query('COMMIT')
        return publicPlan(row)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async action(
      id: string,
      action: 'activate' | 'pause' | 'end',
      version: number,
      now = new Date(),
      previewNextRunAt?: string,
    ) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const plan = (
          await client.query<PlanRow>(
            `SELECT * FROM platform_geo.publish_plans
          WHERE tenant_id=$1 AND id=$2::uuid AND archived_at IS NULL FOR UPDATE`,
            [tenantID, id],
          )
        ).rows[0]
        if (!plan) throw new GeoError('NOT_FOUND', '未找到当前客户发布计划。', 404)
        if (plan.version !== version)
          throw new GeoError('VERSION_CONFLICT', '发布计划已被其他人修改，请刷新后重试。', 409)
        let state: PlanRow['state'],
          next: Date | null = null
        if (action === 'pause') {
          if (plan.state !== 'active')
            throw new GeoError('ACTION_NOT_ALLOWED', '当前计划不能暂停。', 409)
          state = 'paused'
        } else if (action === 'end') {
          if (plan.state === 'ended')
            throw new GeoError('ACTION_NOT_ALLOWED', '当前计划已经结束。', 409)
          state = 'ended'
        } else {
          if (!['draft', 'paused'].includes(plan.state))
            throw new GeoError('ACTION_NOT_ALLOWED', '当前计划不能启用。', 409)
          next =
            previewNextRunAt === undefined
              ? previewGeoPlanOccurrence(plan.config, now)
              : confirmedGeoPlanOccurrence(plan.config, now, previewNextRunAt)
          const pending = (
            await client.query<{ scheduled_at: Date | string }>(
              `SELECT scheduled_at FROM platform_geo.publish_plan_runs
             WHERE tenant_id=$1 AND plan_id=$2::uuid AND state='preparing' ORDER BY scheduled_at LIMIT 1`,
              [tenantID, id],
            )
          ).rows[0]
          if (pending) next = new Date(pending.scheduled_at)
          if (next && next.getTime() <= now.getTime() && plan.config.schedule.cadence === 'daily') {
            const executed = await client.query(
              `SELECT id FROM platform_geo.publish_plan_runs
               WHERE tenant_id=$1 AND plan_id=$2::uuid AND scheduled_at=$3 AND state<>'preparing' LIMIT 1`,
              [tenantID, id, next.toISOString()],
            )
            if (executed.rows.length) next = nextGeoPlanOccurrence(plan.config.schedule, now)
          }
          if (!next)
            throw new GeoError(
              'SCHEDULE_ENDED',
              '计划日期范围内没有未来执行时间，请调整日期或时段。',
              409,
            )
          state = 'active'
        }
        const updated = (
          await client.query<PlanRow>(
            `UPDATE platform_geo.publish_plans SET state=$4,next_run_at=$5,
          version=version+1,actor_id=$3,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2::uuid RETURNING *`,
            [tenantID, id, actorID, state, next?.toISOString() || null],
          )
        ).rows[0]
        await client.query(
          `INSERT INTO platform_geo.publish_plan_events(tenant_id,plan_id,actor_id,event,details)
          VALUES($1,$2::uuid,$3,$4,$5::jsonb)`,
          [
            tenantID,
            id,
            actorID,
            action === 'activate' ? 'activated' : action === 'pause' ? 'paused' : 'ended',
            JSON.stringify({ nextRunAt: next?.toISOString() || null }),
          ],
        )
        await client.query('COMMIT')
        return publicPlan(updated)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async item(runID: string, itemID: string) {
      return (
        (
          await pool.query<ItemRow>(
            `SELECT i.*,a.title,a.status AS article_status,a.version AS current_version
        FROM platform_geo.publish_plan_items i JOIN platform_geo.articles a
          ON a.tenant_id=i.tenant_id AND a.id=i.article_id
        WHERE i.tenant_id=$1 AND i.run_id=$2::uuid AND i.id=$3::uuid`,
            [tenantID, runID, itemID],
          )
        ).rows[0] || null
      )
    },
    async skipItem(runID: string, itemID: string) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const changed = await client.query(
          `UPDATE platform_geo.publish_plan_items SET state='skipped',
          message='人工审核时跳过。',updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND run_id=$2::uuid AND id=$3::uuid AND state='awaiting_review' RETURNING id`,
          [tenantID, runID, itemID],
        )
        if (!changed.rowCount)
          throw new GeoError('PLAN_ITEM_CHANGED', '此发布项已处理或计划记录已变化，请刷新。', 409)
        const run = (
          await client.query<{ plan_id: string }>(
            `SELECT plan_id FROM platform_geo.publish_plan_runs
          WHERE tenant_id=$1 AND id=$2::uuid FOR UPDATE`,
            [tenantID, runID],
          )
        ).rows[0]
        if (!run) throw new GeoError('NOT_FOUND', '未找到当前客户的计划执行记录。', 404)
        const counts = (
          await client.query<{ state: string; count: number }>(
            `SELECT state,count(*)::int AS count
          FROM platform_geo.publish_plan_items WHERE tenant_id=$1 AND run_id=$2::uuid GROUP BY state`,
            [tenantID, runID],
          )
        ).rows
        const count = (state: string) =>
          Number(counts.find((row) => row.state === state)?.count || 0)
        const state = count('awaiting_review')
          ? 'awaiting_review'
          : count('queued')
            ? 'queued'
            : count('failed') || count('unknown') || count('published') || count('cancelled')
              ? 'partial'
              : count('skipped')
                ? 'skipped'
                : 'empty'
        const message =
          state === 'awaiting_review'
            ? `${count('awaiting_review')}条发布项等待人工审核。`
            : state === 'queued'
              ? `${count('queued')}条发布项仍在现有发布队列中。`
              : state === 'partial'
                ? '计划项已处理，部分文章已发布、取消或仍需核对。'
                : state === 'skipped'
                  ? '本次排期的文章已跳过，没有进入发布队列。'
                  : '本次计划没有可发布项。'
        await client.query(
          `UPDATE platform_geo.publish_plan_runs SET state=$3,message=$4,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND id=$2::uuid`,
          [tenantID, runID, state, message],
        )
        await client.query(
          `INSERT INTO platform_geo.publish_plan_events(tenant_id,plan_id,run_id,item_id,actor_id,event)
          VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5,'skipped')`,
          [tenantID, run.plan_id, runID, itemID, actorID],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
  }
}

type DuePlan = PlanRow & { scheduled_at: Date | string; pending_run_id?: string }
export async function dispatchOneGeoPlan(
  pool: Pool,
  options: {
    authorize: (actorID: number, tenantID: number) => Promise<unknown>
    canAuto: (user: unknown) => boolean
    now?: Date
  },
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const due = (
      await client.query<DuePlan>(`SELECT p.*,date_trunc('milliseconds',p.next_run_at) AS scheduled_at,r.id AS pending_run_id
      FROM platform_geo.publish_plans p
      LEFT JOIN platform_geo.publish_plan_runs r ON r.tenant_id=p.tenant_id AND r.plan_id=p.id
        AND r.scheduled_at=date_trunc('milliseconds',p.next_run_at) AND r.state='preparing'
      WHERE p.state='active' AND p.archived_at IS NULL AND p.next_run_at<=clock_timestamp()
        AND NOT EXISTS (SELECT 1 FROM platform_geo.publish_plan_events e
          JOIN platform_geo.generation_jobs j ON j.tenant_id=e.tenant_id
            AND e.details->'requestIDs' ? j.request_id::text
          WHERE e.tenant_id=p.tenant_id AND e.run_id=r.id AND e.event='generation_requested'
            AND j.state IN ('queued','running'))
      ORDER BY p.next_run_at,p.tenant_id,p.id FOR UPDATE OF p SKIP LOCKED LIMIT 1`)
    ).rows[0]
    if (!due) {
      await client.query('COMMIT')
      return false
    }
    // Match manual publication's customer lock before reserving article/channel pairs.
    await client.query('SELECT pg_advisory_xact_lock(57310,$1)', [due.tenant_id])
    const now = options.now || new Date()
    const user = await options.authorize(due.actor_id, due.tenant_id)
    const automatic = due.config.approvalMode === 'auto'
    if (!user || (automatic && !options.canAuto(user))) {
      const runID = due.pending_run_id || randomUUID()
      await client.query(
        `INSERT INTO platform_geo.publish_plan_runs(id,tenant_id,plan_id,plan_version,scheduled_at,state,message)
        VALUES($1::uuid,$2,$3::uuid,$4,$5,'failed',$6)
        ON CONFLICT (tenant_id,id) DO UPDATE SET state='failed',message=EXCLUDED.message,updated_at=clock_timestamp()`,
        [
          runID,
          due.tenant_id,
          due.id,
          due.version,
          due.scheduled_at,
          automatic
            ? '计划创建人已失去自动发布权限，计划已暂停。'
            : '计划创建人已失去当前客户内容权限，计划已暂停。',
        ],
      )
      await client.query(
        `UPDATE platform_geo.publish_plans SET state='paused',next_run_at=NULL,last_run_at=$3,
        version=version+1,updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2::uuid`,
        [due.tenant_id, due.id, due.scheduled_at],
      )
      await client.query(
        `INSERT INTO platform_geo.publish_plan_events(tenant_id,plan_id,run_id,actor_id,event,details)
        VALUES($1,$2::uuid,$3::uuid,$4,'actor_revoked',$5::jsonb)`,
        [
          due.tenant_id,
          due.id,
          runID,
          due.actor_id,
          JSON.stringify({ approvalMode: due.config.approvalMode }),
        ],
      )
      await client.query('COMMIT')
      return true
    }
    const scheduled = new Date(due.scheduled_at)
    const next = nextGeoPlanOccurrence(due.config.schedule, now)
    const runID = due.pending_run_id || randomUUID()
    const sources = due.config.sourceIDs
    const rows = (
      await client.query<GeoArticle>(
        `SELECT a.* FROM platform_geo.articles a
      WHERE a.tenant_id=$1 AND a.status='ready' AND a.version>0
        AND a.context->'settings'->>'locale'=$2
        AND (($3='articles' AND a.id=ANY($4::uuid[])) OR ($3='tasks' AND a.task_id=ANY($4::uuid[])))
      ORDER BY CASE WHEN $3='articles' THEN array_position($4::uuid[],a.id) END NULLS LAST,a.updated_at,a.id
      LIMIT 500`,
        [due.tenant_id, due.config.targets[0].locale, due.config.sourceMode, sources],
      )
    ).rows
    const articleIDs = rows.map((row) => row.id)
    const previous = articleIDs.length
      ? (
          await client.query(
            `SELECT article_id,article_version,
        (target->>'collection') || ':' || (target->>'locale') AS publication_key FROM platform_geo.publish_plan_items
        WHERE tenant_id=$1 AND article_id=ANY($2::uuid[]) AND state NOT IN ('cancelled','skipped')
      UNION ALL
      SELECT article_id,article_version,collection || ':' || locale AS publication_key
        FROM platform_geo.publish_intents WHERE tenant_id=$1 AND article_id=ANY($2::uuid[]) AND state<>'cancelled'`,
            [due.tenant_id, articleIDs],
          )
        ).rows
      : []
    const hasTarget = (articleID: string, version: number, key: string) =>
      previous.some(
        (p) =>
          p.article_id === articleID &&
          Number(p.article_version) === version &&
          p.publication_key === key,
      )
    const chosen: { article: GeoArticle; target: GeoPlanTarget }[] = []
    rows.forEach((article) => {
      if (chosen.filter((item) => item.article.id === article.id).length >= 1) return
      const eligible =
        due.config.distribution === 'all'
          ? due.config.targets.filter(
              (target) => !hasTarget(article.id, article.version, publicationKey(target)),
            )
          : [due.config.targets[rows.indexOf(article) % due.config.targets.length]].filter(
              (target) => !hasTarget(article.id, article.version, publicationKey(target)),
            )
      if (
        eligible.length &&
        chosen.filter((item) => item.article.id === article.id).length === 0 &&
        chosen.filter(
          (item, index) =>
            index === chosen.findIndex((other) => other.article.id === item.article.id),
        ).length < due.config.maxArticles
      )
        for (const target of eligible) chosen.push({ article, target })
    })
    const articleCount = new Set(chosen.map((item) => item.article.id)).size
    const skippedOccurrences = countMissedOccurrences(due.config.schedule, scheduled, now)
    if (!due.pending_run_id)
      await client.query(
        `INSERT INTO platform_geo.publish_plan_runs(id,tenant_id,plan_id,plan_version,scheduled_at,state,message)
      VALUES($1::uuid,$2,$3::uuid,$4,$5,'preparing','')`,
        [runID, due.tenant_id, due.id, due.version, scheduled],
      )
    let generationFailure = ''
    if (!chosen.length && due.config.sourceMode === 'tasks') {
      const requested = due.pending_run_id
        ? (
            await client.query(
              `SELECT details FROM platform_geo.publish_plan_events
             WHERE tenant_id=$1 AND run_id=$2::uuid AND event='generation_requested' LIMIT 1`,
              [due.tenant_id, runID],
            )
          ).rows[0]
        : null
      if (!requested) {
        const tasks = (
          await client.query(
            `SELECT id,version FROM platform_geo.creation_tasks
           WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL
             AND status IN ('ready','waiting_sources') AND settings->>'locale'=$3
           ORDER BY array_position($2::uuid[],id) FOR SHARE`,
            [due.tenant_id, sources, due.config.targets[0].locale],
          )
        ).rows
        const requestIDs: string[] = [],
          reasons: string[] = []
        let count = 0
        for (const task of tasks) {
          if (count >= due.config.maxArticles) break
          await client.query('SAVEPOINT geo_plan_generation')
          try {
            const requestID = randomUUID()
            const result = await enqueueGeoArticleJobs(
              client,
              due.tenant_id,
              due.actor_id,
              requestID,
              task.id,
              task.version,
              Math.min(10, due.config.maxArticles - count),
              true,
            )
            if (result.count) {
              requestIDs.push(requestID)
              count += result.count
            }
            await client.query('RELEASE SAVEPOINT geo_plan_generation')
          } catch (error) {
            await client.query('ROLLBACK TO SAVEPOINT geo_plan_generation')
            if (!(error instanceof GeoError)) throw error
            reasons.push(error.message)
          }
        }
        if (count) {
          await client.query(
            `INSERT INTO platform_geo.publish_plan_events(tenant_id,plan_id,run_id,actor_id,event,details)
             VALUES($1,$2::uuid,$3::uuid,$4,'generation_requested',$5::jsonb)`,
            [due.tenant_id, due.id, runID, due.actor_id, JSON.stringify({ requestIDs, count })],
          )
          await client.query(
            `UPDATE platform_geo.publish_plan_runs SET message=$3,updated_at=clock_timestamp()
             WHERE tenant_id=$1 AND id=$2::uuid`,
            [due.tenant_id, runID, `正在自动创作${count}篇文章，完成后继续本次发布。`],
          )
          await client.query('COMMIT')
          return true
        }
        generationFailure = reasons[0] || '所选创作任务没有可用的新问题，请补充搜索词并保存任务。'
      } else {
        const failures = (
          await client.query(
            `SELECT j.state,j.message,a.validation FROM platform_geo.generation_jobs j
           LEFT JOIN platform_geo.articles a ON a.tenant_id=j.tenant_id AND a.job_id=j.id
           WHERE j.tenant_id=$1 AND j.request_id=ANY($2::uuid[]) ORDER BY j.created_at,j.id`,
            [due.tenant_id, requested.details.requestIDs],
          )
        ).rows
        generationFailure =
          failures
            .map((job) => job.message || (job.validation?.length ? job.validation.join(' ') : ''))
            .filter(Boolean)
            .join(' ') || '自动创作未得到可发布文章，请到创作记录处理后续问题。'
      }
    }
    let queued = 0,
      awaiting = 0
    for (const candidate of chosen) {
      const itemID = randomUUID(),
        key = geoPlanTargetKey(candidate.target),
        state = 'awaiting_review'
      const inserted = await client.query(
        `INSERT INTO platform_geo.publish_plan_items
        (id,tenant_id,run_id,article_id,article_version,target,target_key,state)
        VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6::jsonb,$7,$8)
        ON CONFLICT DO NOTHING RETURNING id`,
        [
          itemID,
          due.tenant_id,
          runID,
          candidate.article.id,
          candidate.article.version,
          JSON.stringify(candidate.target),
          key,
          state,
        ],
      )
      if (!inserted.rowCount) continue
      if (automatic) {
        const input = {
          articleID: candidate.article.id,
          version: candidate.article.version,
          collection: candidate.target.collection,
          categoryID: candidate.target.categoryID,
          publishAt: null,
        }
        const hash = geoPublishHash(input, candidate.target, candidate.article)
        const intent = await client.query(
          `INSERT INTO platform_geo.publish_intents
          (id,tenant_id,article_id,article_version,collection,locale,input_hash,snapshot,target,publish_at,state,actor_id)
          VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8::jsonb,$9::jsonb,now(),'queued',$10)
          ON CONFLICT DO NOTHING RETURNING id`,
          [
            itemID,
            due.tenant_id,
            candidate.article.id,
            candidate.article.version,
            candidate.target.collection,
            candidate.target.locale,
            hash,
            JSON.stringify(candidate.article),
            JSON.stringify(candidate.target),
            due.actor_id,
          ],
        )
        if (!intent.rowCount) {
          await client.query(
            `UPDATE platform_geo.publish_plan_items SET state='skipped',message='该文章修订已存在相同发布目标，已跳过。'
            WHERE tenant_id=$1 AND id=$2::uuid`,
            [due.tenant_id, itemID],
          )
          continue
        }
        await client.query(
          `UPDATE platform_geo.publish_plan_items SET state='queued',intent_id=$3::uuid,
          message='计划自动确认，已进入现有发布队列。' WHERE tenant_id=$1 AND id=$2::uuid`,
          [due.tenant_id, itemID, itemID],
        )
        await client.query(
          `INSERT INTO platform_geo.publish_events(tenant_id,intent_id,event,actor_id,details)
          VALUES($1,$2::uuid,'confirmed',$3,$4::jsonb)`,
          [
            due.tenant_id,
            itemID,
            due.actor_id,
            JSON.stringify({ source: 'publish-plan', planID: due.id, runID, itemID }),
          ],
        )
        queued++
      } else awaiting++
    }
    const state = automatic
      ? queued
        ? 'queued'
        : generationFailure
          ? 'failed'
          : 'empty'
      : awaiting
        ? 'awaiting_review'
        : generationFailure
          ? 'failed'
          : 'empty'
    const message = generationFailure
      ? generationFailure
      : state === 'empty'
        ? '本次没有可发布的已核查文章，计划仍会按下次时间继续。'
        : automatic
          ? `${queued}条发布项已进入现有发布队列。`
          : `${awaiting}条发布项等待人工审核。`
    await client.query(
      `UPDATE platform_geo.publish_plan_runs SET state=$3,message=$4,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND id=$2::uuid`,
      [due.tenant_id, runID, state, message],
    )
    await client.query(
      `UPDATE platform_geo.publish_plans SET next_run_at=$3,state=$4,last_run_at=$5,
      dispatch_owner=NULL,dispatch_until=NULL,updated_at=clock_timestamp()
      WHERE tenant_id=$1 AND id=$2::uuid`,
      [due.tenant_id, due.id, next?.toISOString() || null, next ? 'active' : 'ended', scheduled],
    )
    await client.query(
      `INSERT INTO platform_geo.publish_plan_events(tenant_id,plan_id,run_id,actor_id,event,details)
      VALUES($1,$2::uuid,$3::uuid,$4,'dispatched',$5::jsonb)`,
      [
        due.tenant_id,
        due.id,
        runID,
        due.actor_id,
        JSON.stringify({
          scheduledAt: scheduled.toISOString(),
          nextRunAt: next?.toISOString() || null,
          articleCount,
          targetCount: queued + awaiting,
          skippedOccurrences,
          state,
        }),
      ],
    )
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function countMissedOccurrences(schedule: GeoPlanConfig['schedule'], scheduled: Date, now: Date) {
  if (scheduled >= now) return 0
  let cursor = scheduled,
    count = 0
  while (count < 10_000) {
    const next = nextGeoPlanOccurrence(schedule, cursor)
    if (!next || next > now) return count
    count++
    cursor = next
  }
  return count
}
