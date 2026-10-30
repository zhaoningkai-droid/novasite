import { createHash, randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError } from './keywords'
import {
  buildStorageFixture,
  detectionInputHash,
  evidenceBytes,
  type DetectionInput,
  type DetectionJob,
  type DetectionRun,
} from './detection'

type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
type RunRow = {
  id: string
  name: string
  config_snapshot: { brand: string; core: string }
  optimization_version: number
  created_at: Date
  total: number
  saved: number
}
const mapRun = (row: RunRow): DetectionRun => ({
  id: row.id,
  name: row.name,
  brand: row.config_snapshot.brand,
  core: row.config_snapshot.core,
  optimizationVersion: row.optimization_version,
  createdAt: new Date(row.created_at).toISOString(),
  total: row.total,
  saved: row.saved,
  mode: 'storage_test',
})
const summarySQL = `SELECT r.id,r.name,r.config_snapshot,r.optimization_version,r.created_at,
 (SELECT count(*)::int FROM platform_geo.detection_jobs j
  WHERE j.tenant_id=r.tenant_id AND j.run_id=r.id) AS total,
 (SELECT count(*)::int FROM platform_geo.detection_jobs j
  WHERE j.tenant_id=r.tenant_id AND j.run_id=r.id AND j.state='evidence_saved') AS saved
 FROM platform_geo.detection_runs r`

export function createGeoDetectionStore(pool: Pool, tenantID: number, actorID: number) {
  if (![tenantID, actorID].every((id) => Number.isSafeInteger(id) && id > 0))
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)
  return {
    async create(input: DetectionInput) {
      const client = await pool.connect(),
        hash = detectionInputHash(input)
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57330,$1)', [tenantID])
        const old = (
          await client.query<{ id: string; input_hash: string }>(
            'SELECT id,input_hash FROM platform_geo.detection_runs WHERE tenant_id=$1 AND request_id=$2',
            [tenantID, input.requestID],
          )
        ).rows[0]
        if (old) {
          if (old.input_hash !== hash)
            throw new GeoError('IDEMPOTENCY_CONFLICT', '同一请求编号不能保存不同的检测任务。', 409)
          await client.query('COMMIT')
          return { id: old.id, replayed: true }
        }
        const config = (
          await client.query<{
            id: string
            version: number
            brand: string
            core: string
            aliases: string[]
            terms: string[]
            website: string
            blog: string
          }>(
            `SELECT id,version,brand,core,aliases,terms,website,blog
          FROM platform_geo.optimizations WHERE tenant_id=$1 AND id=$2 FOR SHARE`,
            [tenantID, input.optimizationID],
          )
        ).rows[0]
        if (!config) throw new GeoError('NOT_FOUND', '未找到当前公司的优化词配置。', 404)
        if (config.version !== input.optimizationVersion)
          throw new GeoError('VERSION_CONFLICT', '优化词配置已更新，请刷新后重新创建任务。', 409)
        const sources = (
          await client.query(
            `SELECT url,kind,title,status FROM platform_geo.source_pages
          WHERE tenant_id=$1 AND optimization_id=$2 AND optimization_version=$3 ORDER BY url`,
            [tenantID, config.id, config.version],
          )
        ).rows
        const id = randomUUID()
        await client.query(
          `INSERT INTO platform_geo.detection_runs
          (id,tenant_id,actor_id,request_id,input_hash,name,optimization_id,optimization_version,
           config_snapshot,questions_snapshot,source_snapshot)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb)`,
          [
            id,
            tenantID,
            actorID,
            input.requestID,
            hash,
            input.name,
            config.id,
            config.version,
            JSON.stringify(config),
            JSON.stringify(input.questions),
            JSON.stringify(sources),
          ],
        )
        for (const question of input.questions)
          await client.query(
            `INSERT INTO platform_geo.detection_jobs
            (id,tenant_id,run_id,question_id,question_snapshot) VALUES($1,$2,$3,$4,$5::jsonb)`,
            [randomUUID(), tenantID, id, question.id, JSON.stringify(question)],
          )
        await client.query('COMMIT')
        return { id, replayed: false }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async list(page = 1) {
      const [rows, total] = await Promise.all([
        pool.query<RunRow>(
          `${summarySQL} WHERE r.tenant_id=$1
          ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET $2`,
          [tenantID, (page - 1) * 20],
        ),
        pool.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM platform_geo.detection_runs WHERE tenant_id=$1',
          [tenantID],
        ),
      ])
      return { items: rows.rows.map(mapRun), total: total.rows[0].count, page }
    },
    async detail(id: string) {
      const row = (
        await pool.query<RunRow>(`${summarySQL} WHERE r.tenant_id=$1 AND r.id=$2`, [tenantID, id])
      ).rows[0]
      if (!row) throw new GeoError('NOT_FOUND', '未找到当前公司的检测任务。', 404)
      const jobs = (
        await pool.query<{
          id: string
          question_snapshot: DetectionJob['question']
          state: DetectionJob['state']
          attempt_id: string | null
          raw_answer: string | null
          sampled_at: Date | null
        }>(
          `SELECT j.id,j.question_snapshot,j.state,a.id AS attempt_id,a.raw_answer,
        a.created_at AS sampled_at FROM platform_geo.detection_jobs j
        LEFT JOIN platform_geo.detection_attempts a ON a.tenant_id=j.tenant_id AND a.job_id=j.id
        WHERE j.tenant_id=$1 AND j.run_id=$2 ORDER BY j.created_at,j.id`,
          [tenantID, id],
        )
      ).rows
      const attempts = jobs.flatMap((job) => (job.attempt_id ? [job.attempt_id] : []))
      const [artifacts, citations] = await Promise.all([
        pool.query<{
          id: string
          attempt_id: string
          kind: 'request' | 'response'
          byte_length: number
          sha256: string
        }>(
          `SELECT id,attempt_id,kind,byte_length,sha256
          FROM platform_geo.detection_evidence WHERE tenant_id=$1 AND attempt_id=ANY($2::uuid[])
          ORDER BY kind`,
          [tenantID, attempts],
        ),
        pool.query<{
          id: string
          attempt_id: string
          original_url: string
          title: string
          answer_start: number
          answer_end: number
          quoted_segment: string
          provider_pointer: string
        }>(
          `SELECT id,attempt_id,original_url,title,answer_start,answer_end,quoted_segment,provider_pointer
          FROM platform_geo.detection_citations WHERE tenant_id=$1 AND attempt_id=ANY($2::uuid[])
          ORDER BY ordinal`,
          [tenantID, attempts],
        ),
      ])
      return {
        run: mapRun(row),
        jobs: jobs.map((job): DetectionJob => ({
          id: job.id,
          question: job.question_snapshot,
          state: job.state,
          attempt: job.attempt_id
            ? {
                id: job.attempt_id,
                rawAnswer: job.raw_answer || '',
                createdAt: new Date(job.sampled_at!).toISOString(),
                provider: 'local_fixture',
                evidenceOrigin: 'synthetic_fixture',
                artifacts: artifacts.rows
                  .filter((x) => x.attempt_id === job.attempt_id)
                  .map((x) => ({
                    id: x.id,
                    kind: x.kind,
                    byteLength: x.byte_length,
                    sha256: x.sha256,
                  })),
                citations: citations.rows
                  .filter((x) => x.attempt_id === job.attempt_id)
                  .map((x) => ({
                    id: x.id,
                    url: x.original_url,
                    title: x.title,
                    start: x.answer_start,
                    end: x.answer_end,
                    quotedSegment: x.quoted_segment,
                    providerPointer: x.provider_pointer,
                  })),
              }
            : null,
        })),
      }
    },
    /** 仅供本地存储验收，API不接受任意供应商回答或“真实收录”状态。 */
    async saveFixture(jobID: string, requestID: string) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(57331,$1)', [tenantID])
        const replay = (
          await client.query<{ id: string; job_id: string }>(
            'SELECT id,job_id FROM platform_geo.detection_attempts WHERE tenant_id=$1 AND request_id=$2',
            [tenantID, requestID],
          )
        ).rows[0]
        if (replay) {
          if (replay.job_id !== jobID)
            throw new GeoError('IDEMPOTENCY_CONFLICT', '该证据请求编号已用于其他问题。', 409)
          await client.query('COMMIT')
          return { id: replay.id, replayed: true }
        }
        const job = (
          await client.query<{
            question_snapshot: DetectionJob['question']
            state: string
            config_snapshot: { brand: string }
          }>(
            `SELECT j.question_snapshot,j.state,r.config_snapshot
          FROM platform_geo.detection_jobs j JOIN platform_geo.detection_runs r
          ON r.tenant_id=j.tenant_id AND r.id=j.run_id
          WHERE j.tenant_id=$1 AND j.id=$2 FOR UPDATE OF j`,
            [tenantID, jobID],
          )
        ).rows[0]
        if (!job) throw new GeoError('NOT_FOUND', '未找到当前公司的问题执行项。', 404)
        if (job.state !== 'pending')
          throw new GeoError('ALREADY_RECORDED', '该问题已保存验收证据，原始记录不会覆盖。', 409)
        const fixture = buildStorageFixture(job.question_snapshot, job.config_snapshot.brand)
        const attemptID = randomUUID()
        await client.query(
          `INSERT INTO platform_geo.detection_attempts
          (id,tenant_id,job_id,request_id,actor_id,provider,surface,evidence_origin,raw_answer)
          VALUES($1,$2,$3,$4,$5,'local_fixture','local_test','synthetic_fixture',$6)`,
          [attemptID, tenantID, jobID, requestID, actorID, fixture.rawAnswer],
        )
        for (const [kind, value] of [
          ['request', fixture.request],
          ['response', fixture.response],
        ] as const) {
          const artifact = evidenceBytes(value)
          await client.query(
            `INSERT INTO platform_geo.detection_evidence
            (id,tenant_id,attempt_id,kind,payload,byte_length,sha256) VALUES($1,$2,$3,$4,$5,$6,$7)`,
            [
              randomUUID(),
              tenantID,
              attemptID,
              kind,
              artifact.bytes,
              artifact.bytes.length,
              artifact.sha256,
            ],
          )
        }
        const citation = fixture.citation
        await client.query(
          `INSERT INTO platform_geo.detection_citations
          (id,tenant_id,attempt_id,ordinal,original_url,title,answer_start,answer_end,
           quoted_segment,provider_pointer,evidence_origin)
          VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,'synthetic_fixture')`,
          [
            randomUUID(),
            tenantID,
            attemptID,
            citation.url,
            citation.title,
            citation.start,
            citation.end,
            citation.quotedSegment,
            citation.providerPointer,
          ],
        )
        await client.query(
          `UPDATE platform_geo.detection_jobs SET state='evidence_saved'
          WHERE tenant_id=$1 AND id=$2 AND state='pending'`,
          [tenantID, jobID],
        )
        await client.query('COMMIT')
        return { id: attemptID, replayed: false }
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async artifact(id: string) {
      const artifact = (
        await pool.query<{
          id: string
          kind: string
          payload: Buffer
          sha256: string
          byte_length: number
        }>(
          `SELECT id,kind,payload,sha256,byte_length FROM platform_geo.detection_evidence
        WHERE tenant_id=$1 AND id=$2`,
          [tenantID, id],
        )
      ).rows[0]
      if (!artifact) throw new GeoError('NOT_FOUND', '未找到当前公司的证据文件。', 404)
      if (
        artifact.payload.length !== artifact.byte_length ||
        createHash('sha256').update(artifact.payload).digest('hex') !== artifact.sha256
      )
        throw new GeoError('EVIDENCE_INTEGRITY', '证据完整性校验失败，未提供文件。', 409)
      return artifact
    },
  }
}
