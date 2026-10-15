import { createHmac, randomUUID } from 'node:crypto'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { APIError, type Payload, type PayloadRequest } from 'payload'

export const inquiryPersistenceEnabled = () => process.env.INQUIRY_PERSISTENCE_ENABLED === 'true'
export const inquiryNotificationsEnabled = () => process.env.INQUIRY_NOTIFICATIONS_ENABLED === 'true'
export const inquiryPool = (payload: Payload) => (payload.db as unknown as PostgresAdapter).pool
export type InquiryData = {
  tenant: number; name: string; company: string; address: string; email: string;
  phone: string; country: string; product?: number; capacity: string; message: string;
  sourcePage: string; utmSource: string; utmCampaign: string; status: 'new'
}
const hmac = (value: string) => {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new APIError('Inquiry storage is temporarily unavailable.', 503)
  return createHmac('sha256', secret).update(value).digest('hex')
}
export async function inquiryStorageAvailable(payload: Payload) {
  const result = await inquiryPool(payload).query("SELECT to_regclass('platform_jobs.inquiry_requests') IS NOT NULL AND to_regclass('platform_jobs.inquiry_notifications') IS NOT NULL AS ready")
  return result.rows[0]?.ready === true
}

export async function persistInquiry({ payload, req, data, clientIP, requestKey }: {
  payload: Payload; req: PayloadRequest; data: InquiryData; clientIP: string; requestKey?: string
}) {
  const key = requestKey || randomUUID() // Backwards-compatible clients still get shared rate limits.
  if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(key)) throw new APIError('Invalid inquiry request identifier.', 400)
  const fingerprint = hmac(JSON.stringify(data))
  const clientHash = hmac(`${data.tenant}:${clientIP}`)
  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null) throw new APIError('Inquiry storage is temporarily unavailable.', 503)
  const transactionReq = { ...req, payload, transactionID } as PayloadRequest
  try {
    const session = payload.db.sessions?.[String(transactionID)]?.db
    if (!session) throw new APIError('Inquiry storage is temporarily unavailable.', 503)
    const db = session as Pick<PostgresAdapter['drizzle'], 'execute'>
    // One short tenant lock makes deduplication and rate counting atomic across
    // web replicas; it does not serialize AI translation or other tenant content.
    await db.execute(sql`SELECT pg_advisory_xact_lock(57293,${data.tenant})`)
    const found = await db.execute(sql`SELECT fingerprint FROM platform_jobs.inquiry_requests WHERE tenant_id=${data.tenant} AND request_key=${key}::uuid`) as { rows: Array<{ fingerprint: string }> }
    if (found.rows.length) {
      if (found.rows[0].fingerprint !== fingerprint) throw new APIError('This inquiry identifier belongs to different content.', 409)
      await payload.db.commitTransaction(transactionID)
      return { duplicate: true }
    }
    const window = await db.execute(sql`SELECT count(*)::int AS count FROM platform_jobs.inquiry_requests WHERE tenant_id=${data.tenant} AND client_hash=${clientHash} AND created_at>now()-interval '10 minutes'`) as { rows: Array<{ count: number }> }
    if (window.rows[0]?.count >= 5) throw new APIError('Too many inquiries. Please try again later.', 429)
    const lead = await payload.create({ collection: 'leads', data, overrideAccess: true, req: transactionReq })
    await db.execute(sql`INSERT INTO platform_jobs.inquiry_requests(tenant_id,request_key,fingerprint,client_hash,lead_id) VALUES (${data.tenant},${key}::uuid,${fingerprint},${clientHash},${lead.id})`)
    const notificationStatus = inquiryNotificationsEnabled() ? 'pending' : 'disabled'
    await db.execute(sql`INSERT INTO platform_jobs.inquiry_notifications(id,tenant_id,lead_id,status) VALUES (${randomUUID()}::uuid,${data.tenant},${lead.id},${notificationStatus})`)
    await payload.db.commitTransaction(transactionID)
    // The installed adapter can return after an unsuccessful commit. Confirm
    // the durable request before allowing the visitor form to clear its input.
    const confirmed = await inquiryPool(payload).query(
      'SELECT fingerprint FROM platform_jobs.inquiry_requests WHERE tenant_id=$1 AND request_key=$2::uuid',
      [data.tenant, key],
    )
    if (confirmed.rows[0]?.fingerprint !== fingerprint)
      throw new APIError('Inquiry storage has not been confirmed. Please retry.', 503)
    return { duplicate: false }
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    if (error instanceof APIError) throw error
    // Never silently fall back to non-durable writes after enabling persistence.
    throw new APIError('Inquiry storage is temporarily unavailable. Please retry.', 503)
  }
}
