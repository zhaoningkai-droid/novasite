import { APIError, type Payload, type PayloadRequest } from 'payload'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Tenant, User } from '@/payload-types'
import { inquiryNotificationsEnabled, inquiryPersistenceEnabled, inquiryPool } from './persist'
import type { InquiryDetail, InquiryNotification, InquiryStatus } from './inbox-model'

export const inquiryReaderRoles = ['super-admin', 'site-admin', 'sales'] as const
export const inquiryOperatorRoles = ['super-admin', 'site-admin'] as const
type Scope = { payload: Payload; user: User; company: Pick<Tenant, 'id' | 'defaultLocale'> }

export async function readWorkspaceInquiry(scope: Scope, id: number,
  req?: Partial<PayloadRequest>): Promise<InquiryDetail> {
  const found = await scope.payload.find({
    collection: 'leads', depth: 0, limit: 1, overrideAccess: false, user: scope.user, req,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: scope.company.id } }] },
  })
  const lead = found.docs[0]
  if (!lead) throw new APIError('未找到当前公司的询盘。', 404)
  const productID = typeof lead.product === 'number' ? lead.product : lead.product?.id
  let product: InquiryDetail['product'] = null
  if (productID) {
    const result = await scope.payload.find({
      collection: 'products', depth: 0, limit: 1, overrideAccess: false, user: scope.user, req,
      locale: scope.company.defaultLocale, fallbackLocale: false,
      select: { title: true },
      where: { and: [{ id: { equals: productID } }, { tenant: { equals: scope.company.id } }] },
    }).catch((error: unknown) => {
      const status = error && typeof error === 'object' && 'status' in error ? error.status : null
      if (status === 403 || status === 404) return null
      throw error
    })
    const item = result?.docs[0]
    if (item) product = { id: item.id, title: item.title || '未命名产品' }
  }
  return {
    id: lead.id, name: lead.name, email: lead.email, phone: lead.phone,
    company: lead.company, country: lead.country, status: lead.status,
    createdAt: lead.createdAt, updatedAt: lead.updatedAt,
    summary: lead.message.slice(0, 140), address: lead.address, capacity: lead.capacity,
    message: lead.message, sourcePage: lead.sourcePage, utmSource: lead.utmSource,
    utmCampaign: lead.utmCampaign, internalNotes: lead.internalNotes, product,
  }
}

/** Read notification metadata without replacing a user's unsaved follow-up notes. */
export async function readWorkspaceInquiryNotification(scope: Scope, id: number) {
  const found = await scope.payload.find({
    collection: 'leads', depth: 0, limit: 1, overrideAccess: false, user: scope.user,
    select: { status: true },
    where: { and: [{ id: { equals: id } }, { tenant: { equals: scope.company.id } }] },
  })
  if (!found.docs.length) throw new APIError('未找到当前公司的询盘。', 404)
  return readInquiryNotification(scope.payload, scope.company.id, id)
}

export async function readInquiryNotification(payload: Payload, companyID: number,
  leadID: number): Promise<InquiryNotification> {
  const enabled = inquiryNotificationsEnabled()
  if (!inquiryPersistenceEnabled()) return { enabled: false, status: 'disabled' }
  try {
    const result = await inquiryPool(payload).query(
      'SELECT status,attempts,next_attempt_at,accepted_at FROM platform_jobs.inquiry_notifications WHERE tenant_id=$1 AND lead_id=$2',
      [companyID, leadID],
    )
    const job = result.rows[0]
    if (!job) return { enabled, status: 'disabled' }
    return {
      enabled, status: job.status as InquiryNotification['status'], attempts: job.attempts,
      nextAttemptAt: job.next_attempt_at?.toISOString() || null,
      acceptedAt: job.accepted_at?.toISOString() || null,
    }
  } catch { return { enabled, status: 'unavailable' } }
}

export async function updateWorkspaceInquiry(scope: Scope, id: number, input: {
  status: InquiryStatus; internalNotes?: string; expectedUpdatedAt: string
}) {
  const transactionID = await scope.payload.db.beginTransaction()
  if (transactionID === null) throw new APIError('保存暂不可用，请稍后重试。', 503)
  const req = { payload: scope.payload, user: scope.user, transactionID } as PayloadRequest
  try {
    const session = scope.payload.db.sessions?.[String(transactionID)]?.db
    if (!session) throw new APIError('保存暂不可用，请稍后重试。', 503)
    const db = session as Pick<PostgresAdapter['drizzle'], 'execute'>
    // Lock the actual row before reading the version; simultaneous inbox saves
    // cannot both pass the same expectedUpdatedAt and overwrite each other's notes.
    await db.execute(sql`SELECT id FROM public.leads WHERE id=${id}
      AND tenant_id=${scope.company.id} FOR UPDATE`)
    const current = await readWorkspaceInquiry(scope, id, req)
    if (Date.parse(current.updatedAt) !== Date.parse(input.expectedUpdatedAt)) {
      throw new APIError('这条询盘已被更新。你的输入已保留，请重新载入最新记录后再保存。', 409)
    }
    await scope.payload.update({
      collection: 'leads', id, overrideAccess: false, user: scope.user, req,
      data: { status: input.status,
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}) },
    })
    const saved = await readWorkspaceInquiry(scope, id, req)
    await scope.payload.db.commitTransaction(transactionID)
    return saved
  } catch (error) {
    await scope.payload.db.rollbackTransaction(transactionID)
    throw error
  }
}

export async function retryInquiryNotification(scope: Scope, id: number,
  acknowledgePossibleDuplicate: boolean) {
  await readWorkspaceInquiry(scope, id)
  if (!inquiryPersistenceEnabled() || !inquiryNotificationsEnabled()) {
    throw new APIError('平台尚未启用邮件通知，询盘已保存。', 422)
  }
  const result = await inquiryPool(scope.payload).query(`
    UPDATE platform_jobs.inquiry_notifications
      SET status='pending',attempts=0,error_code=NULL,next_attempt_at=now(),updated_at=now()
    WHERE tenant_id=$1 AND lead_id=$2
      AND (status IN ('failed','disabled') OR (status='ambiguous' AND $3))
    RETURNING id
  `, [scope.company.id, id, acknowledgePossibleDuplicate])
  if (!result.rowCount) {
    throw new APIError('未调度：任务已发送、正在处理，或发送结果待确认。请刷新通知状态。', 409)
  }
  return readInquiryNotification(scope.payload, scope.company.id, id)
}
