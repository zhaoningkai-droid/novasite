import { createHash, randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { APIError, type Payload } from 'payload'
import { userHasRole } from '@/access/roles'
import type { User } from '@/payload-types'
import { isSiteLocale, type SiteLocale } from '../site-locales'
import { standaloneTranslationMeter, translationUsageReady } from '../translation-usage/budget'
import { translationQueueAvailable } from './jobs'
import { translateProductContent, TranslationProviderError } from './provider'

type Scope = {
  sourceLocale: SiteLocale
  targetLocale: SiteLocale
  text: string
}
type PreviewScope =
  | { productID: number; field: 'title' | 'summary' }
  | { productID: null; field: 'assistant' }
type RequestInput = { action: 'latest'; field: 'assistant'; productID: null } | (Scope & PreviewScope & (
  | { action: 'find' | 'generate'; previousID?: string }
  | { action: 'retry-unknown'; previousID: string }
))
type Status = 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown'
type PreviewRow = {
  id: string
  tenant_id: number
  actor_id: number
  product_id: number | null
  field: PreviewScope['field']
  source_locale: SiteLocale
  target_locale: SiteLocale
  source_text: string
  input_hash: string
  result: string | null
  status: Status
  message: string | null
  expires_at: Date
  lease_owner: string
  checkpoint: Record<string, string> | null
  provider_in_flight: boolean
}
const pool = (payload: Payload) => (payload.db as unknown as PostgresAdapter).pool
const uncertainMessage = '本次模型结果待确认，后台已暂停。'
const previewLease = "id=$1::uuid AND lease_owner=$2::uuid AND status='running' AND lease_until>clock_timestamp()"

export function parseFieldPreview(value: unknown): RequestInput {
  const input = value as Record<string, unknown> | null
  if (input?.field === 'assistant' && input.productID === undefined && input.action === 'latest')
    return { action: 'latest', field: 'assistant', productID: null }
  let previewScope: PreviewScope
  if (input?.field === 'assistant' && input.productID === undefined) {
    previewScope = { field: 'assistant', productID: null }
  } else if (input && (input.field === 'title' || input.field === 'summary')
    && typeof input.productID === 'number' && Number.isSafeInteger(input.productID)
    && input.productID > 0 && input.productID <= 2147483647) {
    previewScope = { field: input.field, productID: input.productID }
  } else {
    throw new APIError('请选择有效的翻译入口。', 422)
  }
  if (!input || (input.action !== 'find' && input.action !== 'generate' && input.action !== 'retry-unknown')
    || typeof input.sourceLocale !== 'string' || !isSiteLocale(input.sourceLocale)
    || typeof input.targetLocale !== 'string' || !isSiteLocale(input.targetLocale)
    || input.sourceLocale === input.targetLocale || typeof input.text !== 'string' || input.text.length > 8000 || input.text.includes('\0')
    || (input.previousID !== undefined && (typeof input.previousID !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.previousID)))) {
    throw new APIError('请选择有效的字段和语言，原文最多 8000 字符。', 422)
  }
  const text = input.text.trim()
  if (!text && input.action !== 'find') throw new APIError('原文为空。', 422)
  const scope = { ...previewScope, text,
    sourceLocale: input.sourceLocale, targetLocale: input.targetLocale } satisfies Scope
  if (input.action === 'retry-unknown') {
    if (input.acknowledged !== true || typeof input.previousID !== 'string')
      throw new APIError('请核对待确认的预览并确认后重试。', 422)
    return { ...scope, action: input.action, previousID: input.previousID }
  }
  return { ...scope, action: input.action, previousID: input.previousID }
}

export async function fieldPreviewReady(payload: Payload) {
  const { rows } = await pool(payload).query("SELECT to_regclass('platform_jobs.field_translation_preview') IS NOT NULL AS ready")
  return rows[0]?.ready === true
}

async function assertPreviewAccess(payload: Payload, tenantID: number, user: User, productID: number | null) {
  if ((user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now())
    || !(userHasRole(user, ['super-admin']) || (
      userHasRole(user, ['site-admin', 'editor'])
      && user.tenants?.some(({ tenant }) => (typeof tenant === 'object' ? tenant?.id : tenant) === tenantID)
    ))) throw new APIError('当前账号没有此公司的翻译权限。', 403)
  if (productID === null) return
  const found = await payload.find({
    collection: 'products', depth: 0, draft: true, limit: 1, select: { title: true }, user, overrideAccess: false,
    where: { and: [{ id: { equals: productID } }, { tenant: { equals: tenantID } }] },
  })
  if (!found.docs.length) throw new APIError('找不到当前公司的产品。', 404)
}

const view = (row: PreviewRow, hash: string) => ({
  id: row.id,
  status: row.status,
  translation: row.status === 'succeeded' ? row.result : null,
  matchesSource: row.input_hash === hash,
  original: row.input_hash !== hash && row.status === 'succeeded' ? row.source_text : undefined,
  message: row.message,
  expiresAt: row.expires_at.toISOString(),
  ...(row.field === 'assistant' ? {
    text: row.source_text, sourceLocale: row.source_locale, targetLocale: row.target_locale,
  } : {}),
})

export async function fieldTranslationPreview(payload: Payload, tenantID: number, user: User, input: RequestInput) {
  await assertPreviewAccess(payload, tenantID, user, input.productID)
  if (!(await fieldPreviewReady(payload))) throw new APIError('后台翻译预览暂未启用。', 503)
  if (input.action === 'latest') {
    const { rows: [row] } = await pool(payload).query<PreviewRow>(
      `SELECT * FROM platform_jobs.field_translation_preview
       WHERE tenant_id=$1 AND actor_id=$2 AND field='assistant' AND expires_at>clock_timestamp()
       ORDER BY created_at DESC,id DESC LIMIT 1`, [tenantID, user.id],
    )
    return row ? view(row, row.input_hash) : null
  }
  const hash = createHash('sha256').update(input.text).digest('hex')
  const args = [tenantID, user.id, input.productID, input.field, input.sourceLocale, input.targetLocale, hash]
  const sameField = `tenant_id=$1 AND actor_id=$2 AND product_id IS NOT DISTINCT FROM $3::integer AND field=$4
    AND source_locale=$5 AND target_locale=$6 AND expires_at>clock_timestamp()`
  if (input.action === 'find') {
    const { rows: [row] } = await pool(payload).query<PreviewRow>(
      `SELECT * FROM platform_jobs.field_translation_preview WHERE ${sameField}
       ORDER BY (input_hash=$7) DESC,created_at DESC,id DESC LIMIT 1`, args,
    )
    return row ? view(row, hash) : null
  }
  if (!process.env.DEEPSEEK_API_KEY || !(await translationQueueAvailable(payload)) || !(await translationUsageReady(payload)))
    throw new APIError('后台翻译服务暂不可用，请稍后重试。', 503)
  const client = await pool(payload).connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(57341,$1)', [tenantID])
    const { rows: [current] } = await client.query<PreviewRow>(
      `SELECT * FROM platform_jobs.field_translation_preview WHERE ${sameField} AND input_hash=$7
       ORDER BY created_at DESC,id DESC LIMIT 1`, args,
    )
    const retryUnknown = input.action === 'retry-unknown'
    if (retryUnknown && (!current || input.previousID !== current.id || current.status !== 'unknown'))
      throw new APIError('待确认的预览已变化或已处理，请刷新后查看。', 409)
    if (!retryUnknown && current && !(input.previousID === current.id && ['succeeded', 'failed'].includes(current.status))) {
      await client.query('COMMIT')
      return view(current, hash)
    }
    if (input.field === 'assistant') {
      const pending = await client.query(
        `SELECT 1 FROM platform_jobs.field_translation_preview
         WHERE tenant_id=$1 AND actor_id=$2 AND field='assistant' AND status IN ('queued','running')
         AND expires_at>clock_timestamp() LIMIT 1`, [tenantID, user.id],
      )
      if (pending.rowCount) throw new APIError('翻译助手还有一条任务正在处理，请等完成后再提交。', 409)
    }
    if (!current && input.previousID) throw new APIError('原预览已过期，请刷新后重新生成。', 409)
    const { rows: [created] } = await client.query<PreviewRow>(
      `INSERT INTO platform_jobs.field_translation_preview
        (tenant_id,actor_id,product_id,field,source_locale,target_locale,input_hash,id,source_text,checkpoint)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid,$9,$10::jsonb) RETURNING *`,
      [...args, randomUUID(), input.text, retryUnknown && current?.checkpoint ? JSON.stringify(current.checkpoint) : null],
    )
    if ((await client.query('COMMIT')).command !== 'COMMIT') throw new Error('Preview submission not confirmed')
    return view(created, hash)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

export async function pruneFieldTranslationPreviews(payload: Payload) {
  await pool(payload).query(`DELETE FROM platform_jobs.field_translation_preview WHERE id IN (
    SELECT id FROM platform_jobs.field_translation_preview
    WHERE expires_at<=clock_timestamp() AND (status<>'running' OR lease_until<=clock_timestamp())
    ORDER BY expires_at LIMIT 1000
  )`)
}

async function claimFieldPreview(payload: Payload) {
  const client = await pool(payload).connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(57292,0)')
    // A previous worker may have sent the request before dying.
    await client.query(`UPDATE platform_jobs.field_translation_preview
      SET status='unknown',message=$1,lease_owner=NULL,lease_until=NULL
      WHERE status='running' AND provider_in_flight AND lease_until<=clock_timestamp()`, [uncertainMessage])
    const { rows: [job] } = await client.query<PreviewRow>(`
      WITH candidate AS (
        SELECT q.id FROM platform_jobs.field_translation_preview q
        WHERE q.expires_at>clock_timestamp()
          AND (q.status='queued' OR (q.status='running' AND NOT q.provider_in_flight AND q.lease_until<=clock_timestamp()))
          AND NOT EXISTS (
            SELECT 1 FROM platform_jobs.field_translation_preview r
            WHERE r.tenant_id=q.tenant_id AND r.id<>q.id AND r.status='running'
          )
          AND NOT EXISTS (
            SELECT 1 FROM platform_jobs.product_translation r
            WHERE r.tenant_id=q.tenant_id AND r.status='running' AND r.lease_until>clock_timestamp()
          )
          AND (
            (SELECT count(*) FROM platform_jobs.field_translation_preview WHERE status='running' AND lease_until>clock_timestamp()) +
            (SELECT count(*) FROM platform_jobs.product_translation WHERE status='running' AND lease_until>clock_timestamp())
          ) < 2
        ORDER BY q.created_at,q.id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE platform_jobs.field_translation_preview q SET status='running',lease_owner=$1::uuid,
        lease_until=clock_timestamp()+interval '90 seconds'
      FROM candidate WHERE q.id=candidate.id RETURNING q.*
    `, [randomUUID()])
    if ((await client.query('COMMIT')).command !== 'COMMIT') throw new Error('Preview claim not confirmed')
    return job
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

export async function runOneFieldTranslationPreview(payload: Payload) {
  const db = pool(payload)
  const job = await claimFieldPreview(payload)
  if (!job) return false
  const lease = [job.id, job.lease_owner]
  const abort = new AbortController()
  const persist = async (statement: string, values: unknown[] = []) => {
    const result = await db.query(`UPDATE platform_jobs.field_translation_preview SET ${statement} WHERE ${previewLease}`, [...lease, ...values])
    if (!result.rowCount) { abort.abort(); throw new Error('Preview lease lost') }
  }
  const heartbeat = setInterval(() => {
    void persist("lease_until=clock_timestamp()+interval '90 seconds'").catch(() => abort.abort())
  }, 20_000)
  let inFlight = false
  let generated = false
  try {
    const user = await payload.findByID({ collection: 'users', id: job.actor_id, depth: 0, overrideAccess: true })
    await assertPreviewAccess(payload, job.tenant_id, user, job.product_id)
    const output = await translateProductContent({
      title: '', summary: '', keywords: '', tags: [], imageAlts: [], legacySpecifications: [],
      specificationSet: null, detailSegments: [job.source_text],
    }, job.source_locale, job.target_locale, process.env.DEEPSEEK_API_KEY || '', process.env.DEEPSEEK_MODEL || 'deepseek-flash', {
      signal: abort.signal,
      checkpoint: job.checkpoint || undefined,
      meter: standaloneTranslationMeter(payload, { tenantID: job.tenant_id, requestGroup: job.id }),
      deferProviderRetries: true,
      onDispatch: async () => {
        await persist('provider_in_flight=true')
        inFlight = true
      },
      onKnownFailure: () => { inFlight = false },
      onProgress: async (checkpoint) => {
        await persist('checkpoint=$3::jsonb,provider_in_flight=false', [JSON.stringify(checkpoint)])
        inFlight = false
      },
    })
    const result = output.detailSegments[0]
    if (!result?.trim() || result.length > 32000) throw new TranslationProviderError('译文为空或过长，请缩短原文后重试。', 'INVALID_PREVIEW')
    generated = true
    await persist("status='succeeded',result=$3,checkpoint=NULL,provider_in_flight=false,lease_owner=NULL,lease_until=NULL", [result])
  } catch (error) {
    if (!abort.signal.aborted) {
      if (generated) throw error // A replacement worker can reconstruct the saved checkpoint.
      const unknown = inFlight || (error instanceof TranslationProviderError && error.code === 'PROVIDER_UNCERTAIN')
      const message = unknown ? uncertainMessage : error instanceof APIError || error instanceof TranslationProviderError
        ? error.message : '预览暂时无法生成，请稍后重试。'
      await persist('status=$3,message=$4,provider_in_flight=false,lease_owner=NULL,lease_until=NULL', [unknown ? 'unknown' : 'failed', message])
    }
  } finally { clearInterval(heartbeat) }
  return true
}
