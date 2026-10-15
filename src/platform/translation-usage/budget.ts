import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { TranslationUsageError, type TranslationRequestInfo, type TranslationRequestMeter, type TranslationRequestUsage } from './types'

export const translationBudgetEnabled = () => process.env.TRANSLATION_BUDGET_ENABLED === 'true'
const pool = (payload: Payload) => (payload.db as unknown as PostgresAdapter).pool
type Scope = { groupID: string; tenantID: number; jobID: string | null; owner: string }

export function translationBudgetPolicy() {
  const integer = (name: string, maximum: number) => {
    const value = process.env[name] || ''
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) throw new TranslationUsageError('翻译用量限制尚未正确配置，请联系管理员。', 'COST_CONFIGURATION')
    return Number(value)
  }
  const policy = {
    globalDay: integer('TRANSLATION_GLOBAL_DAILY_UNITS', 1_000_000_000),
    globalMonth: integer('TRANSLATION_GLOBAL_MONTHLY_UNITS', 10_000_000_000),
    companyDay: integer('TRANSLATION_COMPANY_DAILY_UNITS', 1_000_000_000),
    companyMonth: integer('TRANSLATION_COMPANY_MONTHLY_UNITS', 10_000_000_000),
    perJobRequests: integer('TRANSLATION_MAX_REQUESTS_PER_JOB', 1000),
  }
  if (policy.globalDay > policy.globalMonth || policy.companyDay > policy.companyMonth || policy.companyDay > policy.globalDay || policy.companyMonth > policy.globalMonth) throw new TranslationUsageError('翻译每日、每月和公司额度关系不正确，请联系管理员。', 'COST_CONFIGURATION')
  return policy
}

/** Fail closed without reading or changing customer content. No automatic migration. */
export async function translationBudgetReady(payload: Payload) {
  if (!translationBudgetEnabled()) return true
  try {
    translationBudgetPolicy()
    if (process.env.PRODUCT_TRANSLATION_QUEUE_ENABLED !== 'true') return false
    return (await pool(payload).query("SELECT to_regclass('platform_jobs.translation_usage') IS NOT NULL AS ready")).rows[0]?.ready === true
  } catch { return false }
}

const requestUnits = (info: TranslationRequestInfo) => {
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(info.model) || !Number.isSafeInteger(info.inputBytes) || info.inputBytes < 1 || info.inputBytes > 250_000 || !Number.isInteger(info.maxOutputTokens) || info.maxOutputTokens < 1 || info.maxOutputTokens > 8192) throw new TranslationUsageError('翻译请求超过用量限制。', 'COST_REQUEST_INVALID')
  // A conservative admission estimate, not an exact tokenizer or invoice guarantee.
  return info.inputBytes + info.maxOutputTokens + 2048
}

/** Only accounting values are selected; source and translated text are never stored here. */
export const translationUsageAggregateSQL = `
  SELECT
    COALESCE(sum(charged_units) FILTER (WHERE accounting_day=$1::date),0)::text AS global_day,
    COALESCE(sum(charged_units),0)::text AS global_month,
    COALESCE(sum(charged_units) FILTER (WHERE tenant_id=$3 AND accounting_day=$1::date),0)::text AS company_day,
    COALESCE(sum(charged_units) FILTER (WHERE tenant_id=$3),0)::text AS company_month
  FROM platform_jobs.translation_usage WHERE accounting_month=$2::date`

function budgetError(code: string): never {
  throw new TranslationUsageError('本期翻译用量已达到限制，已停止新增 AI 请求；已保存译文保留，请联系管理员调整额度或等待下期。', code, 429)
}

function makeMeter(payload: Payload, scope: Scope): TranslationRequestMeter {
  const connect = async () => {
    try { return await pool(payload).connect() } catch { throw new TranslationUsageError('翻译用量记录暂不可用，已停止 AI 调用。', 'COST_LEDGER_UNAVAILABLE') }
  }
  const reserve = async (info: TranslationRequestInfo) => {
    const policy = translationBudgetPolicy()
    const units = requestUnits(info)
    const client = await connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
      // Shared across all app and worker processes; no lock is held during AI calls.
      await client.query('SELECT pg_advisory_xact_lock(57294,0)')
      if (scope.jobID) {
        const job = (await client.query("SELECT id FROM platform_jobs.product_translation WHERE id=$1::uuid AND tenant_id=$2 AND lease_owner=$3::uuid AND status='running' AND lease_until>clock_timestamp() FOR UPDATE", [scope.jobID, scope.tenantID, scope.owner])).rows[0]
        if (!job) throw new TranslationUsageError('翻译任务已失去执行权限，未调用 AI。', 'COST_LEASE_LOST')
      }
      // Compute the period after acquiring the shared lock, using the current
      // database clock rather than the transaction's earlier start time.
      const clock = (await client.query("SELECT (instant AT TIME ZONE 'Asia/Shanghai')::date::text AS day,date_trunc('month',instant AT TIME ZONE 'Asia/Shanghai')::date::text AS month FROM (SELECT clock_timestamp() AS instant) AS accounting_clock")).rows[0] as { day: string; month: string }
      const requests = Number((await client.query('SELECT count(*) FROM platform_jobs.translation_usage WHERE request_group=$1::uuid', [scope.groupID])).rows[0].count)
      if (requests >= policy.perJobRequests) budgetError('COST_JOB_LIMIT')
      const totals = (await client.query(translationUsageAggregateSQL, [clock.day, clock.month, scope.tenantID])).rows[0] as Record<string, string>
      if (Number(totals.global_day) + units > policy.globalDay) budgetError('COST_GLOBAL_DAILY_LIMIT')
      if (Number(totals.global_month) + units > policy.globalMonth) budgetError('COST_GLOBAL_MONTHLY_LIMIT')
      if (Number(totals.company_day) + units > policy.companyDay) budgetError('COST_COMPANY_DAILY_LIMIT')
      if (Number(totals.company_month) + units > policy.companyMonth) budgetError('COST_COMPANY_MONTHLY_LIMIT')
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
      await client.query('SELECT pg_advisory_xact_lock(57294,0)')
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
  if (!translationBudgetEnabled()) return undefined
  if (!job.lease_owner) throw new TranslationUsageError('翻译任务没有有效执行权限。', 'COST_LEASE_LOST')
  return makeMeter(payload, { groupID: job.id, tenantID: job.tenant_id, jobID: job.id, owner: job.lease_owner })
}
export function standaloneTranslationMeter(payload: Payload, input: { tenantID: number }) {
  if (!translationBudgetEnabled()) return undefined
  if (process.env.PRODUCT_TRANSLATION_QUEUE_ENABLED !== 'true') throw new TranslationUsageError('用量保护需要已启用的任务存储；未调用 AI。', 'COST_QUEUE_REQUIRED')
  const groupID = randomUUID()
  return makeMeter(payload, { groupID, tenantID: input.tenantID, jobID: null, owner: groupID })
}
