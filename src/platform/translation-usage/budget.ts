import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { TranslationUsageError, type TranslationRequestInfo, type TranslationRequestMeter, type TranslationRequestUsage } from './types'

const pool = (payload: Payload) => (payload.db as unknown as PostgresAdapter).pool
type Scope = { groupID: string; tenantID: number; jobID: string | null; owner: string }

/** Usage accounting is required independently of any legacy budget configuration. */
export async function translationUsageReady(payload: Payload) {
  try {
    return (await pool(payload).query("SELECT to_regclass('platform_jobs.translation_usage') IS NOT NULL AS ready")).rows[0]?.ready === true
  } catch { return false }
}

const requestUnits = (info: TranslationRequestInfo) => {
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(info.model) || !Number.isSafeInteger(info.inputBytes) || info.inputBytes < 1 || info.inputBytes > 250_000 || !Number.isInteger(info.maxOutputTokens) || info.maxOutputTokens < 1 || info.maxOutputTokens > 8192) throw new TranslationUsageError('翻译请求超过用量限制。', 'COST_REQUEST_INVALID')
  // A conservative admission estimate, not an exact tokenizer or invoice guarantee.
  return info.inputBytes + info.maxOutputTokens + 2048
}

function makeMeter(payload: Payload, scope: Scope): TranslationRequestMeter {
  const connect = async () => {
    try { return await pool(payload).connect() } catch { throw new TranslationUsageError('翻译用量记录暂不可用，已停止 AI 调用。', 'COST_LEDGER_UNAVAILABLE') }
  }
  const reserve = async (info: TranslationRequestInfo) => {
    const units = requestUnits(info)
    const client = await connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      if (scope.jobID) {
        const job = (await client.query("SELECT id FROM platform_jobs.product_translation WHERE id=$1::uuid AND tenant_id=$2 AND lease_owner=$3::uuid AND status='running' AND lease_until>clock_timestamp() FOR UPDATE", [scope.jobID, scope.tenantID, scope.owner])).rows[0]
        if (!job) throw new TranslationUsageError('翻译任务已失去执行权限，未调用 AI。', 'COST_LEASE_LOST')
      }
      // Use the database clock for consistent reporting across processes.
      const clock = (await client.query("SELECT (instant AT TIME ZONE 'Asia/Shanghai')::date::text AS day,date_trunc('month',instant AT TIME ZONE 'Asia/Shanghai')::date::text AS month FROM (SELECT clock_timestamp() AS instant) AS accounting_clock")).rows[0] as { day: string; month: string }
      const id = randomUUID()
      await client.query("INSERT INTO platform_jobs.translation_usage(id,tenant_id,job_id,request_group,reservation_owner,model,accounting_day,accounting_month,reserved_units,charged_units,status) VALUES ($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::date,$8::date,$9,$9,'reserved')", [id, scope.tenantID, scope.jobID, scope.groupID, scope.owner, info.model, clock.day, clock.month, units])
      const committed = await client.query('COMMIT')
      if (committed.command !== 'COMMIT') throw new TranslationUsageError('翻译用量预留未确认，未调用 AI。', 'COST_LEDGER_UNAVAILABLE')
      return id
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (error instanceof TranslationUsageError) throw error
      throw new TranslationUsageError('翻译用量记录暂不可用，未调用 AI，请联系管理员。', 'COST_LEDGER_UNAVAILABLE')
    } finally { client.release() }
  }
  const settle = async (id: string, usage?: TranslationRequestUsage) => {
    const client = await connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      const row = (await client.query('SELECT id,status FROM platform_jobs.translation_usage WHERE id=$1::uuid AND tenant_id=$2 AND request_group=$3::uuid AND reservation_owner=$4::uuid FOR UPDATE', [id, scope.tenantID, scope.groupID, scope.owner])).rows[0] as { id: string; status: string } | undefined
      if (!row) throw new TranslationUsageError('翻译用量记录不匹配，停止后续 AI 调用。', 'COST_LEDGER_UNAVAILABLE')
      // Settlement is independent of the job lease, but bound to its original reservation.
      // A late provider response is still accounted for after another worker takes the job.
      if (row.status === 'reserved') {
        await client.query("UPDATE platform_jobs.translation_usage SET status=$2,charged_units=CASE WHEN $3::bigint IS NULL THEN reserved_units ELSE $3::bigint END,input_tokens=$4,output_tokens=$5,cache_hit_input_tokens=$6,cache_miss_input_tokens=$7,settled_at=clock_timestamp() WHERE id=$1::uuid", [id, usage ? 'known' : 'unknown', usage?.totalTokens ?? null, usage?.inputTokens ?? null, usage?.outputTokens ?? null, usage?.cacheHitInputTokens ?? null, usage?.cacheMissInputTokens ?? null])
      }
      const committed = await client.query('COMMIT')
      if (committed.command !== 'COMMIT') throw new TranslationUsageError('翻译用量结算未确认，停止后续 AI 调用。', 'COST_LEDGER_UNAVAILABLE')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if (error instanceof TranslationUsageError) throw error
      throw new TranslationUsageError('翻译用量记录暂不可用，已停止后续 AI 调用。', 'COST_LEDGER_UNAVAILABLE')
    } finally { client.release() }
  }
  return { reserve, settle }
}

export function translationJobMeter(payload: Payload, job: { id: string; tenant_id: number; lease_owner: string | null }) {
  if (!job.lease_owner) throw new TranslationUsageError('翻译任务没有有效执行权限。', 'COST_LEASE_LOST')
  return makeMeter(payload, { groupID: job.id, tenantID: job.tenant_id, jobID: job.id, owner: job.lease_owner })
}
export function standaloneTranslationMeter(payload: Payload, input: { tenantID: number; requestGroup?: string }) {
  const groupID = input.requestGroup || randomUUID()
  return makeMeter(payload, { groupID, tenantID: input.tenantID, jobID: null, owner: groupID })
}
