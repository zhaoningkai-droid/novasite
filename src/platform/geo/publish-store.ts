import { randomUUID, createHash } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError, normalizeGeoText } from './keywords'
import type { GeoArticle } from './articles'
import type { GeoPublishInput, GeoPublishRecord, GeoPublishTarget } from './publishing'
type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
type Client = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>
}
type PlanLink = {
  run_id: string
  plan_id: string
  state: string
  article_id: string
  article_version: number
  target: GeoPublishTarget
}
async function linkPlanItem(
  client: Client,
  tenantID: number,
  itemID: string,
  plan: PlanLink,
  intent: GeoPublishRecord,
) {
  if (plan.state !== 'awaiting_review') return
  const state = intent.state === 'queued' || intent.state === 'running' ? 'queued' : intent.state
  const message =
    state === 'queued'
      ? '已审核并进入现有发布队列。'
      : state === 'published'
        ? '已确认此发布记录已完成。'
        : state === 'cancelled'
          ? '关联发布请求已取消。'
          : intent.message || '已关联现有发布记录。'
  const changed = await client.query(
    `UPDATE platform_geo.publish_plan_items SET state=$4,intent_id=$3::uuid,message=$5,
    updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2::uuid AND state='awaiting_review' RETURNING id`,
    [tenantID, itemID, intent.id, state, message],
  )
  if (!changed.rowCount) return
  await client.query(
    `INSERT INTO platform_geo.publish_plan_events(tenant_id,plan_id,run_id,item_id,actor_id,event,details)
    VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7::jsonb)`,
    [
      tenantID,
      plan.plan_id,
      plan.run_id,
      itemID,
      intent.actor_id,
      state === 'queued' ? 'approved' : 'publication_reconciled',
      JSON.stringify({ intentID: intent.id, state }),
    ],
  )
  await client.query(
    `WITH stats AS (SELECT run_id,count(*)::int AS total,
      count(*) FILTER(WHERE state='awaiting_review')::int AS review,count(*) FILTER(WHERE state='queued')::int AS queued,
      count(*) FILTER(WHERE state='published')::int AS published,count(*) FILTER(WHERE state IN ('failed','unknown'))::int AS failed,
      count(*) FILTER(WHERE state='cancelled')::int AS cancelled,count(*) FILTER(WHERE state='skipped')::int AS skipped
    FROM platform_geo.publish_plan_items WHERE tenant_id=$1 AND run_id=$2::uuid GROUP BY run_id)
    UPDATE platform_geo.publish_plan_runs r SET state=CASE WHEN s.review>0 THEN 'awaiting_review' WHEN s.queued>0 THEN 'queued'
      WHEN s.published=s.total THEN 'completed' WHEN s.published>0 THEN 'partial' WHEN s.failed>0 THEN 'failed'
      WHEN s.cancelled=s.total THEN 'cancelled' WHEN s.skipped=s.total OR s.skipped>0 OR s.cancelled>0 THEN 'skipped' ELSE 'empty' END,
      message=CASE WHEN s.review>0 THEN s.review||'条发布项等待人工审核。' WHEN s.queued>0 THEN s.queued||'条发布项仍在现有发布队列中。'
        WHEN s.published=s.total THEN '所有发布项均已完成。' WHEN s.published>0 THEN '部分发布项已完成，请查看执行记录。'
        WHEN s.failed>0 THEN '发布项失败或结果待核对，请查看发布记录。' WHEN s.cancelled=s.total THEN '所有发布项均已取消。'
        WHEN s.skipped>0 THEN '本次排期的文章已跳过，没有进入发布队列。' ELSE '本次计划没有可发布项。' END,
      updated_at=clock_timestamp() FROM stats s WHERE r.tenant_id=$1 AND r.id=s.run_id`,
    [tenantID, plan.run_id],
  )
}
async function refreshPlanRun(pool: Pool, tenantID: number, intentID: string) {
  await pool.query(
    `WITH target AS (SELECT run_id FROM platform_geo.publish_plan_items
      WHERE tenant_id=$1 AND intent_id=$2::uuid), stats AS (
      SELECT i.run_id,count(*)::int AS total,count(*) FILTER(WHERE i.state='awaiting_review')::int AS review,
        count(*) FILTER(WHERE i.state='queued')::int AS queued,count(*) FILTER(WHERE i.state='published')::int AS published,
        count(*) FILTER(WHERE i.state IN ('failed','unknown'))::int AS failed,
        count(*) FILTER(WHERE i.state='cancelled')::int AS cancelled,count(*) FILTER(WHERE i.state='skipped')::int AS skipped
      FROM platform_geo.publish_plan_items i JOIN target t ON t.run_id=i.run_id WHERE i.tenant_id=$1 GROUP BY i.run_id)
    UPDATE platform_geo.publish_plan_runs r SET state=CASE
      WHEN s.review>0 THEN 'awaiting_review' WHEN s.queued>0 THEN 'queued'
      WHEN s.published=s.total THEN 'completed' WHEN s.published>0 AND (s.failed>0 OR s.skipped>0 OR s.cancelled>0) THEN 'partial'
      WHEN s.failed>0 THEN 'failed' WHEN s.cancelled=s.total THEN 'cancelled'
      WHEN s.skipped=s.total THEN 'skipped' WHEN s.skipped>0 OR s.cancelled>0 THEN 'skipped' ELSE 'empty' END,
      message=CASE WHEN s.published=s.total THEN '所有发布项均已完成。'
        WHEN s.published>0 THEN '部分发布项已完成；请检查失败、跳过或取消记录。'
        WHEN s.failed>0 THEN '发布项失败或结果待核对，请查看发布记录。'
        WHEN s.cancelled=s.total THEN '所有发布项均已取消。' ELSE r.message END,updated_at=now()
    FROM stats s WHERE r.tenant_id=$1 AND r.id=s.run_id`,
    [tenantID, intentID],
  )
}
export const geoPublishHash = (
  input: GeoPublishInput,
  target: GeoPublishTarget,
  article: GeoArticle,
) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        input,
        target,
        title: article.title,
        summary: article.summary,
        html: article.html,
        review: article.review_note,
      }),
    )
    .digest('hex')

export type GeoPublishRecordFilters = {
  title: string
  account: string
  companyName: string
  plan: string
  platform: '' | 'news' | 'posts'
  startDate: string
  endDate: string
  tab: 'pending' | 'publishing' | 'published' | 'failed'
  pageSize: 10 | 20 | 50
}

export function createGeoPublishStore(pool: Pool, tenantID: number, actorID: number) {
  if (
    !Number.isSafeInteger(tenantID) ||
    tenantID < 1 ||
    !Number.isSafeInteger(actorID) ||
    actorID < 1
  )
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)
  const find = async (id: string) =>
    (
      await pool.query<GeoPublishRecord>(
        'SELECT * FROM platform_geo.publish_intents WHERE tenant_id=$1 AND id=$2::uuid',
        [tenantID, id],
      )
    ).rows[0] || null
  return {
    find,
    async list(page: number, filters: GeoPublishRecordFilters) {
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 100000 ||
        ![10, 20, 50].includes(filters.pageSize) ||
        !['pending', 'publishing', 'published', 'failed'].includes(filters.tab) ||
        !['', 'news', 'posts'].includes(filters.platform)
      )
        throw new GeoError('INVALID_QUERY', '发布记录搜索或分页参数无效。')
      const rows = await pool.query<{
        total: number
        items: Record<string, unknown>[]
        counts: Record<string, number> | null
      }>(
        `WITH records AS (
          SELECT p.id,'intent'::text AS kind,p.article_id,p.article_version,
            p.snapshot->>'title' AS title,p.target,p.publish_at,p.state,
            CASE WHEN p.state IN ('queued','running') THEN 'publishing'
              WHEN p.state='published' THEN 'published' ELSE 'failed' END AS status_tab,
            p.attempts,p.target_id,p.target_url,p.message,p.error_code,p.created_at,p.updated_at,
            plan.id AS plan_id,plan.name AS plan_name,run.id AS run_id,NULL::uuid AS item_id,
            coalesce(p.target->>'companySlug',p.target->>'origin','') AS account,
            p.target->>'collection' AS platform
          FROM platform_geo.publish_intents p
          LEFT JOIN platform_geo.publish_plan_items item
            ON item.tenant_id=p.tenant_id AND item.intent_id=p.id
          LEFT JOIN platform_geo.publish_plan_runs run
            ON run.tenant_id=item.tenant_id AND run.id=item.run_id
          LEFT JOIN platform_geo.publish_plans plan
            ON plan.tenant_id=run.tenant_id AND plan.id=run.plan_id
          WHERE p.tenant_id=$1
          UNION ALL
          SELECT item.id,'plan_item'::text AS kind,item.article_id,item.article_version,
            revision.snapshot->>'title' AS title,item.target,run.scheduled_at AS publish_at,
            item.state,CASE WHEN item.state='awaiting_review' THEN 'pending' WHEN item.state='queued' THEN 'publishing' ELSE 'failed' END AS status_tab,0::int AS attempts,NULL::bigint AS target_id,
            NULL::text AS target_url,item.message AS message,NULL::text AS error_code,
            item.created_at,item.updated_at,plan.id AS plan_id,plan.name AS plan_name,
            run.id AS run_id,item.id AS item_id,
            coalesce(item.target->>'companySlug',item.target->>'origin','') AS account,
            item.target->>'collection' AS platform
          FROM platform_geo.publish_plan_items item
          JOIN platform_geo.publish_plan_runs run
            ON run.tenant_id=item.tenant_id AND run.id=item.run_id
          JOIN platform_geo.publish_plans plan
            ON plan.tenant_id=run.tenant_id AND plan.id=run.plan_id
          JOIN platform_geo.article_revisions revision
            ON revision.tenant_id=item.tenant_id AND revision.article_id=item.article_id
              AND revision.version=item.article_version
          WHERE item.tenant_id=$1 AND item.intent_id IS NULL
          UNION ALL
          SELECT md5(plan.id::text || source.id || target.position::text || plan.next_run_at::text)::uuid,
            'scheduled'::text,article.id,coalesce(article.version,0),
            coalesce(article.title,task.name || '（待生成）',plan.name || '（待发布）'),
            target.data,plan.next_run_at,'scheduled'::text,'publishing'::text,0::int,
            NULL::bigint,NULL::text,'已排期，等待发布时间。'::text,NULL::text,
            plan.created_at,plan.updated_at,plan.id,plan.name,NULL::uuid,NULL::uuid,
            coalesce(target.data->>'companySlug',''),target.data->>'collection'
          FROM platform_geo.publish_plans plan
          CROSS JOIN LATERAL jsonb_array_elements_text(plan.config->'sourceIDs')
            WITH ORDINALITY source(id,position)
          CROSS JOIN LATERAL jsonb_array_elements(plan.config->'targets')
            WITH ORDINALITY target(data,position)
          LEFT JOIN platform_geo.articles article ON article.tenant_id=plan.tenant_id
            AND article.id=source.id::uuid AND plan.config->>'sourceMode'='articles'
          LEFT JOIN platform_geo.creation_tasks task ON task.tenant_id=plan.tenant_id
            AND task.id=source.id::uuid AND plan.config->>'sourceMode'='tasks'
          WHERE plan.tenant_id=$1 AND plan.state='active' AND plan.archived_at IS NULL
            AND plan.next_run_at IS NOT NULL
            AND source.position<=coalesce((plan.config->>'maxArticles')::int,1)
            AND NOT EXISTS(SELECT 1 FROM platform_geo.publish_plan_runs run
              WHERE run.tenant_id=plan.tenant_id AND run.plan_id=plan.id
                AND run.scheduled_at=plan.next_run_at)
          UNION ALL
          SELECT md5(run.id::text || target.position::text)::uuid,'plan_run'::text,
            NULL::uuid,0::int,plan.name,
            target.data,run.scheduled_at,
            CASE WHEN run.state='preparing' THEN 'preparing' ELSE 'failed' END,
            CASE WHEN run.state='preparing' THEN 'publishing' ELSE 'failed' END,
            0::int,NULL::bigint,NULL::text,run.message,NULL::text,
            run.created_at,run.updated_at,plan.id,plan.name,run.id,NULL::uuid,
            coalesce(target.data->>'companySlug',''),target.data->>'collection'
          FROM platform_geo.publish_plan_runs run
          JOIN platform_geo.publish_plans plan ON plan.tenant_id=run.tenant_id AND plan.id=run.plan_id
          CROSS JOIN LATERAL jsonb_array_elements(plan.config->'targets')
            WITH ORDINALITY target(data,position)
          WHERE run.tenant_id=$1 AND run.state IN ('preparing','failed','empty')
            AND NOT EXISTS(SELECT 1 FROM platform_geo.publish_plan_items item
              WHERE item.tenant_id=run.tenant_id AND item.run_id=run.id)
        ), filtered AS (
          SELECT * FROM records
          WHERE position($2 in lower(coalesce(title,'')))>0
            AND position($3 in lower(concat_ws(' ',coalesce(account,''),$11::text)))>0
            AND ($4='' OR position($4 in lower(coalesce(plan_name,'')))>0)
            AND ($5='' OR platform=$5)
            AND ($6='' OR publish_at >= NULLIF($6,'')::date)
            AND ($7='' OR publish_at < (NULLIF($7,'')::date + interval '1 day'))
        ), counts AS (
          SELECT status_tab,count(*)::int AS count FROM filtered GROUP BY status_tab
        ), visible AS (
          SELECT * FROM filtered WHERE status_tab=$8
        )
        SELECT (SELECT count(*)::int FROM visible) AS total,
          coalesce((SELECT jsonb_agg(to_jsonb(page_rows)) FROM (
            SELECT * FROM visible ORDER BY publish_at DESC,created_at DESC,id
            LIMIT $9 OFFSET $10
          ) page_rows),'[]'::jsonb) AS items,
          coalesce((SELECT jsonb_object_agg(status_tab,count) FROM counts),'{}'::jsonb) AS counts`,
        [
          tenantID,
          normalizeGeoText(filters.title),
          normalizeGeoText(filters.account),
          normalizeGeoText(filters.plan),
          filters.platform,
          filters.startDate,
          filters.endDate,
          filters.tab,
          filters.pageSize,
          (page - 1) * filters.pageSize,
          filters.companyName,
        ],
      )
      const result = rows.rows[0]
      return {
        ...result,
        counts: {
          pending: Number(result.counts?.pending || 0),
          publishing: Number(result.counts?.publishing || 0),
          published: Number(result.counts?.published || 0),
          failed: Number(result.counts?.failed || 0),
        },
      }
    },
    async events(id: string) {
      return (
        await pool.query(
          'SELECT event,actor_id,details,created_at FROM platform_geo.publish_events WHERE tenant_id=$1 AND intent_id=$2::uuid ORDER BY id',
          [tenantID, id],
        )
      ).rows
    },
    async enqueue(
      id: string,
      input: GeoPublishInput,
      target: GeoPublishTarget,
      article: GeoArticle,
    ) {
      const hash = geoPublishHash(input, target, article),
        client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57310,$1)', [tenantID])
        const planLink = (
          await client.query<PlanLink>(
            `SELECT i.run_id,r.plan_id,i.state,i.article_id,i.article_version,i.target FROM platform_geo.publish_plan_items i
          JOIN platform_geo.publish_plan_runs r ON r.tenant_id=i.tenant_id AND r.id=i.run_id
          WHERE i.tenant_id=$1 AND i.id=$2::uuid FOR UPDATE OF i`,
            [tenantID, id],
          )
        ).rows[0]
        if (
          planLink &&
          planLink.state === 'awaiting_review' &&
          (planLink.article_id !== input.articleID ||
            Number(planLink.article_version) !== input.version ||
            planLink.target.collection !== input.collection ||
            planLink.target.categoryID !== input.categoryID ||
            planLink.target.locale !== target.locale)
        )
          throw new GeoError('PLAN_ITEM_MISMATCH', '发布内容或目标与计划审核项不一致。', 409)
        const old = (
          await client.query<GeoPublishRecord>(
            'SELECT * FROM platform_geo.publish_intents WHERE tenant_id=$1 AND id=$2::uuid',
            [tenantID, id],
          )
        ).rows[0]
        if (old) {
          if (old.input_hash !== hash)
            throw new GeoError('IDEMPOTENCY_CONFLICT', '同一请求编号不能发布不同内容或目标。', 409)
          if (planLink) await linkPlanItem(client, tenantID, id, planLink, old)
          await client.query('COMMIT')
          return old
        }
        if (planLink && planLink.state !== 'awaiting_review')
          throw new GeoError('PLAN_ITEM_CHANGED', '此计划项已被处理，无法再次进入发布队列。', 409)
        const current = (
          await client.query(
            'SELECT version,status FROM platform_geo.articles WHERE tenant_id=$1 AND id=$2::uuid FOR SHARE',
            [tenantID, input.articleID],
          )
        ).rows[0]
        if (!current || current.version !== input.version || current.status !== 'ready')
          throw new GeoError('ARTICLE_CHANGED', '文章已修改或不再可发布，请重新核查。', 409)
        const prior = (
          await client.query<GeoPublishRecord>(
            `SELECT * FROM platform_geo.publish_intents WHERE tenant_id=$1 AND article_id=$2::uuid
          AND article_version=$3 AND collection=$4 AND locale=$5 AND state<>'cancelled'`,
            [tenantID, input.articleID, input.version, input.collection, target.locale],
          )
        ).rows[0]
        if (prior)
          throw new GeoError(
            'ALREADY_REQUESTED',
            '此文章修订在该站点栏目已有发布记录，请查看原记录；调整待发布任务请先取消。',
            409,
          )
        const item = (
          await client.query<GeoPublishRecord>(
            `INSERT INTO platform_geo.publish_intents
          (id,tenant_id,article_id,article_version,collection,locale,input_hash,snapshot,target,publish_at,state,actor_id)
          VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8::jsonb,$9::jsonb,coalesce($10::timestamptz,now()),'queued',$11) RETURNING *`,
            [
              id,
              tenantID,
              input.articleID,
              input.version,
              input.collection,
              target.locale,
              hash,
              JSON.stringify(article),
              JSON.stringify(target),
              input.publishAt,
              actorID,
            ],
          )
        ).rows[0]
        await client.query(
          `INSERT INTO platform_geo.publish_events(tenant_id,intent_id,event,actor_id) VALUES($1,$2::uuid,'confirmed',$3)`,
          [tenantID, id, actorID],
        )
        if (planLink) await linkPlanItem(client, tenantID, id, planLink, item)
        await client.query('COMMIT')
        return item
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
    async action(id: string, action: 'retry' | 'cancel', acknowledgeUnknown = false) {
      const state = action === 'retry' ? 'queued' : 'cancelled'
      const result = await pool.query(
        `WITH changed AS (UPDATE platform_geo.publish_intents SET state=$4,actor_id=$3,
        lease_owner=NULL,lease_until=NULL,error_code=NULL,message=NULL,updated_at=now()
        WHERE tenant_id=$1 AND id=$2::uuid AND (CASE WHEN $4='cancelled' THEN state IN ('queued','failed')
          ELSE state='failed' OR (state='unknown' AND $5) END) RETURNING *)
        INSERT INTO platform_geo.publish_events(tenant_id,intent_id,event,actor_id)
        SELECT tenant_id,id,$6,$3 FROM changed RETURNING intent_id`,
        [tenantID, id, actorID, state, acknowledgeUnknown, action],
      )
      if (!result.rows[0])
        throw new GeoError(
          'ACTION_NOT_ALLOWED',
          '当前记录不能取消或重试。已发布内容不能被此操作覆盖，未知结果需要先确认。',
          409,
        )
      await pool.query(
        `UPDATE platform_geo.publish_plan_items SET state=$3,message=$4,updated_at=now()
        WHERE tenant_id=$1 AND intent_id=$2::uuid AND state IN ('queued','failed','unknown')`,
        [
          tenantID,
          id,
          state,
          action === 'retry' ? '已从发布记录重新排队。' : '关联发布请求已取消。',
        ],
      )
      await refreshPlanRun(pool, tenantID, id)
      return find(id)
    },
  }
}
export function createGeoPublishQueue(pool: Pool) {
  return {
    async claim(): Promise<GeoPublishRecord | null> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57312,0)')
        await client.query(`WITH expired AS (UPDATE platform_geo.publish_intents SET state='unknown',lease_owner=NULL,lease_until=NULL,
          error_code='LEASE_EXPIRED',message='发布进程中断，请先核对原记录，未自动重发。',updated_at=now()
          WHERE state='running' AND lease_until<=clock_timestamp() RETURNING *),
        events AS (INSERT INTO platform_geo.publish_events(tenant_id,intent_id,event,actor_id)
          SELECT tenant_id,id,'unknown',actor_id FROM expired RETURNING tenant_id,intent_id),
        changed_items AS (UPDATE platform_geo.publish_plan_items i SET state='unknown',message='发布进程中断，结果待核对。',updated_at=now()
          FROM expired e WHERE i.tenant_id=e.tenant_id AND i.intent_id=e.id AND i.state='queued' RETURNING i.tenant_id,i.run_id),
        stats AS (SELECT i.tenant_id,i.run_id,count(*)::int AS total,count(*) FILTER(WHERE i.state='awaiting_review')::int AS review,
          count(*) FILTER(WHERE i.state='queued')::int AS queued,count(*) FILTER(WHERE i.state='published')::int AS published,
          count(*) FILTER(WHERE i.state IN ('failed','unknown'))::int AS failed,count(*) FILTER(WHERE i.state='cancelled')::int AS cancelled,
          count(*) FILTER(WHERE i.state='skipped')::int AS skipped FROM platform_geo.publish_plan_items i
          JOIN changed_items c ON c.tenant_id=i.tenant_id AND c.run_id=i.run_id GROUP BY i.tenant_id,i.run_id)
        UPDATE platform_geo.publish_plan_runs r SET state=CASE WHEN s.review>0 THEN 'awaiting_review' WHEN s.queued>0 THEN 'queued'
          WHEN s.published=s.total THEN 'completed' WHEN s.published>0 THEN 'partial' WHEN s.failed>0 THEN 'failed'
          WHEN s.cancelled=s.total THEN 'cancelled' WHEN s.skipped=s.total THEN 'skipped'
          WHEN s.skipped>0 OR s.cancelled>0 THEN 'skipped' ELSE 'empty' END,updated_at=now() FROM stats s WHERE r.tenant_id=s.tenant_id AND r.id=s.run_id`)
        if (
          (
            await client.query(
              "SELECT count(*)::int AS count FROM platform_geo.publish_intents WHERE state='running'",
            )
          ).rows[0].count >= 2
        ) {
          await client.query('COMMIT')
          return null
        }
        const item = (
          await client.query<GeoPublishRecord>(
            `WITH candidate AS(SELECT p.id FROM platform_geo.publish_intents p
          WHERE state='queued' AND publish_at<=now() AND NOT EXISTS(SELECT 1 FROM platform_geo.publish_intents r WHERE r.tenant_id=p.tenant_id AND r.state='running')
          ORDER BY publish_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
          UPDATE platform_geo.publish_intents p SET state='running',attempts=attempts+1,lease_owner=$1::uuid,
          lease_until=clock_timestamp()+interval '240 seconds',updated_at=now() FROM candidate c WHERE p.id=c.id RETURNING p.*`,
            [randomUUID()],
          )
        ).rows[0]
        if (item)
          await client.query(
            `INSERT INTO platform_geo.publish_events(tenant_id,intent_id,event,actor_id) VALUES($1,$2::uuid,'started',$3)`,
            [item.tenant_id, item.id, item.actor_id],
          )
        await client.query('COMMIT')
        return item || null
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
    async lease(item: GeoPublishRecord) {
      return (
        (
          await pool.query(
            `UPDATE platform_geo.publish_intents SET lease_until=clock_timestamp()+interval '240 seconds'
      WHERE tenant_id=$1 AND id=$2::uuid AND state='running' AND lease_owner=$3::uuid AND lease_until>clock_timestamp() RETURNING id`,
            [item.tenant_id, item.id, item.lease_owner],
          )
        ).rowCount === 1
      )
    },
    async fail(item: GeoPublishRecord, unknown: boolean, code: string, message: string) {
      const result = await pool.query(
        `WITH stopped AS (UPDATE platform_geo.publish_intents
      SET state=$4,error_code=$5,message=$6,lease_owner=NULL,lease_until=NULL,updated_at=now()
      WHERE tenant_id=$1 AND id=$2::uuid AND lease_owner=$3::uuid AND state='running' AND lease_until>clock_timestamp() RETURNING *)
      INSERT INTO platform_geo.publish_events(tenant_id,intent_id,event,actor_id,details)
      SELECT tenant_id,id,$4,actor_id,jsonb_build_object('code',$5::text,'message',$6::text) FROM stopped`,
        [item.tenant_id, item.id, item.lease_owner, unknown ? 'unknown' : 'failed', code, message],
      )
      if (result.rowCount)
        await pool
          .query(
            `UPDATE platform_geo.publish_plan_items SET state=$3,message=$4,updated_at=now()
        WHERE tenant_id=$1 AND intent_id=$2::uuid AND state='queued'`,
            [item.tenant_id, item.id, unknown ? 'unknown' : 'failed', message],
          )
          .then(() => refreshPlanRun(pool, item.tenant_id, item.id))
    },
  }
}
