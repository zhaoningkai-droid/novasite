import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError } from './keywords'
import type { ArticleContext } from './articles'
import { assertArticleMedia } from './article-context'
import type { generateGeoArticle } from './article-provider'
import type { TranslationRequestUsage } from '../translation-usage/types'
type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
export type GeoGenerationJob = {
  id: string
  tenant_id: number
  actor_id: number
  task_id: string
  task_version: number
  question_id: string
  context: ArticleContext
  lease_owner: string
  current_attempt: string | null
}
export function createGeoGenerationQueue(pool: Pool) {
  const lease = async (job: GeoGenerationJob) =>
    (
      await pool.query(
        `UPDATE platform_geo.generation_jobs
    SET lease_until=clock_timestamp()+interval '240 seconds',updated_at=now()
    WHERE tenant_id=$1 AND id=$2::uuid AND lease_owner=$3::uuid AND state='running' AND lease_until>clock_timestamp() RETURNING id`,
        [job.tenant_id, job.id, job.lease_owner],
      )
    ).rowCount === 1
  return {
    lease,
    async claim(): Promise<GeoGenerationJob | null> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57303,0)')
        await client.query(`WITH expired AS (UPDATE platform_geo.generation_jobs SET
          state=CASE WHEN current_attempt IS NULL THEN 'queued' ELSE 'unknown' END,
          message=CASE WHEN current_attempt IS NULL THEN NULL ELSE '工作进程中断，前次AI调用可能已产生用量，请人工确认后重试。' END,
          error_code=CASE WHEN current_attempt IS NULL THEN NULL ELSE 'LEASE_EXPIRED' END,
          lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE state='running' AND lease_until<=clock_timestamp()
          RETURNING tenant_id,id,current_attempt)
          UPDATE platform_geo.generation_attempts a SET state='unknown',error_code='LEASE_EXPIRED',finished_at=now()
          FROM expired e WHERE a.tenant_id=e.tenant_id AND a.id=e.current_attempt AND a.state='running'`)
        const active = (
          await client.query(
            "SELECT count(*)::int AS count FROM platform_geo.generation_jobs WHERE state='running'",
          )
        ).rows[0].count
        if (active >= 2) {
          await client.query('COMMIT')
          return null
        }
        const row = (
          await client.query<GeoGenerationJob>(
            `WITH candidate AS (SELECT j.id FROM platform_geo.generation_jobs j
          WHERE j.state='queued' AND NOT EXISTS(SELECT 1 FROM platform_geo.generation_jobs r WHERE r.tenant_id=j.tenant_id AND r.state='running')
          ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
          UPDATE platform_geo.generation_jobs j SET state='running',lease_owner=$1::uuid,
          lease_until=clock_timestamp()+interval '240 seconds',updated_at=now() FROM candidate c WHERE j.id=c.id RETURNING j.*`,
            [randomUUID()],
          )
        ).rows[0]
        await client.query('COMMIT')
        return row || null
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async dispatch(job: GeoGenerationJob, context: ArticleContext, model: string) {
      const client = await pool.connect(),
        attempt = randomUUID()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57304,$1)', [job.tenant_id])
        const row = (
          await client.query(
            `SELECT id FROM platform_geo.generation_jobs WHERE tenant_id=$1 AND id=$2::uuid
          AND lease_owner=$3::uuid AND state='running' AND lease_until>clock_timestamp() AND current_attempt IS NULL FOR UPDATE`,
            [job.tenant_id, job.id, job.lease_owner],
          )
        ).rows[0]
        if (!row) throw new GeoError('LEASE_LOST', '生成执行权已失效，未重复调用。', 409)
        await assertArticleMedia(client, job.tenant_id, context)
        await client.query(
          `INSERT INTO platform_geo.generation_attempts(id,tenant_id,job_id,actor_id,model,state) VALUES($1::uuid,$2,$3::uuid,$4,$5,'running')`,
          [attempt, job.tenant_id, job.id, job.actor_id, model],
        )
        await client.query(
          `UPDATE platform_geo.generation_jobs SET execution=$4::jsonb,current_attempt=$5::uuid
          WHERE tenant_id=$1 AND id=$2::uuid AND lease_owner=$3::uuid`,
          [job.tenant_id, job.id, job.lease_owner, JSON.stringify(context), attempt],
        )
        await client.query('COMMIT')
        job.current_attempt = attempt
        return attempt
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async usage(job: GeoGenerationJob, usage?: TranslationRequestUsage) {
      const r = await pool.query(
        `UPDATE platform_geo.generation_attempts a SET usage=$4::jsonb FROM platform_geo.generation_jobs j
        WHERE j.tenant_id=$1 AND j.id=$2::uuid AND j.lease_owner=$3::uuid AND j.state='running' AND j.lease_until>clock_timestamp()
          AND a.tenant_id=j.tenant_id AND a.id=j.current_attempt RETURNING a.id`,
        [job.tenant_id, job.id, job.lease_owner, usage ? JSON.stringify(usage) : null],
      )
      if (!r.rows[0]) throw new GeoError('LEASE_LOST', '调用用量状态未确认，请勿重复提交。', 503)
    },
    async complete(
      job: GeoGenerationJob,
      context: ArticleContext,
      output: Awaited<ReturnType<typeof generateGeoArticle>>,
    ) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const row = (
          await client.query(
            `SELECT id FROM platform_geo.generation_jobs WHERE tenant_id=$1 AND id=$2::uuid
          AND lease_owner=$3::uuid AND current_attempt=$4::uuid AND state='running' AND lease_until>clock_timestamp() FOR UPDATE`,
            [job.tenant_id, job.id, job.lease_owner, job.current_attempt],
          )
        ).rows[0]
        if (!row) throw new GeoError('LEASE_LOST', '旧工作进程不能保存或覆盖文章。', 409)
        await assertArticleMedia(client, job.tenant_id, context)
        const article = (
          await client.query(
            `INSERT INTO platform_geo.articles
          (id,tenant_id,job_id,task_id,task_version,question_id,context,title,summary,html,status,validation,warnings,updated_by)
          VALUES($1::uuid,$2,$1::uuid,$3::uuid,$4,$5::uuid,$6::jsonb,$7,$8,$9,$13,$10::jsonb,$11::jsonb,$12) RETURNING *`,
            [
              job.id,
              job.tenant_id,
              job.task_id,
              job.task_version,
              job.question_id,
              JSON.stringify(context),
              output.content.title,
              output.content.summary,
              output.content.html,
              JSON.stringify(output.content.issues),
              JSON.stringify(output.warnings),
              job.actor_id,
              output.content.issues.length ? 'needs_edit' : 'ready',
            ],
          )
        ).rows[0]
        await client.query(
          'INSERT INTO platform_geo.article_revisions(tenant_id,article_id,version,snapshot,actor_id) VALUES($1,$2::uuid,1,$3::jsonb,$4)',
          [job.tenant_id, job.id, JSON.stringify(article), job.actor_id],
        )
        await client.query(
          `UPDATE platform_geo.generation_attempts SET state='succeeded',finished_at=now()
          WHERE tenant_id=$1 AND id=$2::uuid AND state='running'`,
          [job.tenant_id, job.current_attempt],
        )
        await client.query(
          `UPDATE platform_geo.generation_jobs SET state='succeeded',lease_owner=NULL,lease_until=NULL,message=NULL,error_code=NULL,updated_at=now()
          WHERE tenant_id=$1 AND id=$2::uuid AND lease_owner=$3::uuid`,
          [job.tenant_id, job.id, job.lease_owner],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async fail(job: GeoGenerationJob, unknown: boolean, code: string, message: string) {
      await pool.query(
        `WITH stopped AS (UPDATE platform_geo.generation_jobs SET state=$4,error_code=$5,message=$6,
        lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND id=$2::uuid AND lease_owner=$3::uuid
          AND state='running' AND lease_until>clock_timestamp() RETURNING tenant_id,current_attempt)
        UPDATE platform_geo.generation_attempts a SET state=$4,error_code=$5,finished_at=now() FROM stopped s
          WHERE a.tenant_id=s.tenant_id AND a.id=s.current_attempt AND a.state='running'`,
        [job.tenant_id, job.id, job.lease_owner, unknown ? 'unknown' : 'failed', code, message],
      )
    },
  }
}
