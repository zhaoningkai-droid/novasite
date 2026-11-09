import { sql } from '@payloadcms/db-postgres'
import { APIError, type Payload, type PayloadRequest } from 'payload'
import type { Tenant, User } from '@/payload-types'
import { contentTargetLocales, contentTransaction, readContentSource } from '../content-translation/jobs'
import { contentTaskKey, isTranslationResource, translationResources, type TranslationResource } from '../content-translation/resources'
import { companyTranslationTargets, type SiteLocale } from '../site-locales'
import { translationUsageReady } from '../translation-usage/budget'
import type { LanguageTranslationState } from './job-view'
import { readTranslationSource, translationQueueAvailable } from './jobs'
import { canReviewTranslation, translationReview } from './recovery'

type ReviewInput = {
  resource: 'products' | TranslationResource
  documentID: number
  jobID: string
  revision: string
}
type ReviewRow = {
  id: string
  tenant_id: number
  lease_owner: string | null
  source_hash: string
  targets: SiteLocale[]
  states: Record<string, LanguageTranslationState>
  status: string
  actor_id: number
  review_revision: string
}

export function parseTranslationReview(value: unknown): ReviewInput {
  const data = value as Record<string, unknown> | null
  if (!data || data.acknowledged !== true
    || typeof data.resource !== 'string' || (data.resource !== 'products' && !isTranslationResource(data.resource))
    || typeof data.documentID !== 'number' || !Number.isSafeInteger(data.documentID) || data.documentID < 1 || data.documentID > 67108862
    || typeof data.jobID !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.jobID)
    || typeof data.revision !== 'string' || !/^\d{1,12}(?:\.\d{1,6})?$/.test(data.revision)) {
    throw new APIError('请核对当前翻译记录并确认后重试。', 422)
  }
  return { resource: data.resource, documentID: data.documentID, jobID: data.jobID, revision: data.revision }
}

export async function retryReviewedTranslation(payload: Payload, tenantID: number, user: User, input: ReviewInput) {
  if (!canReviewTranslation(user, tenantID)) throw new APIError('仅当前公司管理员可处理待确认翻译。', 403)
  if (!(await translationQueueAvailable(payload)) || !(await translationUsageReady(payload)) || !process.env.DEEPSEEK_API_KEY)
    throw new APIError('后台翻译暂不可用，请稍后重试。', 503)

  const key = input.resource === 'products' ? input.documentID : contentTaskKey(input.resource, input.documentID)
  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null) throw new APIError('暂时无法保存确认记录，请重试。', 503)
  const req = { payload, user, transactionID } as PayloadRequest
  let auditID: number
  let locales: SiteLocale[]
  try {
    const transaction = contentTransaction(req)
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(57291, ${tenantID})`)
    const actor = await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true, req })
    if (!canReviewTranslation(actor, tenantID)) throw new APIError('当前账号已失去此公司的处理权限。', 403)
    const { rows: [job] } = await transaction.execute(sql`
      SELECT id,tenant_id,lease_owner,source_hash,targets,states,status,actor_id,
        extract(epoch from updated_at)::text AS review_revision
      FROM platform_jobs.product_translation
      WHERE tenant_id=${tenantID} AND product_id=${key}
      ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE
    `) as { rows: ReviewRow[] }
    if (!job || job.id !== input.jobID || job.review_revision !== input.revision || !['failed', 'partial'].includes(job.status))
      throw new APIError('这条记录已处理或已变化，请刷新后查看。', 409)

    const company: Tenant = await payload.findByID({
      collection: 'tenants', id: tenantID, user: actor, depth: 0, overrideAccess: false, req,
      context: { skipContentTranslationOverlay: true },
    })
    const current = input.resource === 'products'
      ? await readTranslationSource(payload, company, actor, input.documentID, req)
      : await readContentSource(payload, company, actor, input.resource, input.documentID, req)
    const targets = input.resource === 'products' ? companyTranslationTargets(company) : contentTargetLocales(input.resource, company)
    const review = translationReview(job, current.fingerprint, targets, actor, tenantID)
    if (!review) throw new APIError('源内容、语言设置或任务状态已变化，请刷新后查看。', 409)
    locales = review.locales

    const states = { ...job.states }
    for (const locale of locales) {
      const state = states[locale]
      states[locale] = {
        ...state, status: 'queued', code: undefined, message: undefined, retryAt: undefined,
        retryCount: undefined, providerInFlight: undefined,
      }
    }
    const updated = await transaction.execute(sql`
      UPDATE platform_jobs.product_translation
      SET status='queued',states=${JSON.stringify(states)}::jsonb,actor_id=${actor.id},next_run_at=NULL,updated_at=clock_timestamp()
      WHERE id=${job.id}::uuid AND tenant_id=${tenantID} AND product_id=${key} AND lease_owner IS NULL
      RETURNING id
    `) as { rows: { id: string }[] }
    if (!updated.rows.length) throw new APIError('任务正在处理中，请刷新后查看。', 409)
    const audit = await payload.create({
      collection: 'audit-logs', overrideAccess: true, user: actor, req,
      data: {
        action: 'update',
        collection: input.resource === 'products' ? 'products' : translationResources[input.resource].collection,
        documentId: String(input.documentID),
        actorEmail: actor.email,
        summary: '管理员核对后确认重试结果不明的 AI 翻译',
        metadata: { companyID: tenantID, actorID: actor.id, originalActorID: job.actor_id,
          jobID: job.id, resource: input.resource, reviewRevision: input.revision, locales },
      },
    })
    auditID = audit.id
    await payload.db.commitTransaction(transactionID)
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    throw error
  }
  // The audit record and queue change share a transaction, so this also confirms durable enqueue.
  await payload.findByID({ collection: 'audit-logs', id: auditID, overrideAccess: true, depth: 0 })
  return { jobID: input.jobID, locales }
}
