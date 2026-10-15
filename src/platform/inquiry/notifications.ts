import { randomUUID } from 'node:crypto'
import nodemailer from 'nodemailer'
import type { Payload } from 'payload'
import { inquiryNotificationsEnabled, inquiryPersistenceEnabled, inquiryPool } from './persist'

type Notification = { id: string; tenant_id: number; lead_id: number; attempts: number }
type MailFailure = { code?: string; command?: string; responseCode?: number }
const validEmail = (value: string) => /^[^\s@<>,;\r\n]+@[^\s@<>,;\r\n]+\.[^\s@<>,;\r\n]+$/.test(value)
const headerText = (value: string) => value.replace(/[\r\n]/g, ' ').slice(0, 120)

export function inquirySMTPSettings() {
  const read = (name: string) => {
    const value = process.env[name]
    if (!value?.trim() || /REPLACE|example\.com/i.test(value)) throw new Error(`Missing notification setting: ${name}`)
    return name === 'SMTP_PASSWORD' ? value : value.trim()
  }
  const host = read('SMTP_HOST')
  if (!/^[a-z\d.-]+$/i.test(host)) throw new Error('Invalid notification setting: SMTP_HOST')
  const port = Number(process.env.SMTP_PORT || '465')
  if (![465, 587].includes(port)) throw new Error('SMTP_PORT must be 465 or 587 with verified TLS.')
  const from = read('SMTP_FROM_ADDRESS')
  if (!validEmail(from)) throw new Error('Invalid notification setting: SMTP_FROM_ADDRESS')
  // Never log or put credentials in browser bundles or worker error messages.
  return { host, port, from, user: read('SMTP_USER'), pass: read('SMTP_PASSWORD'), name: headerText(process.env.SMTP_FROM_NAME || 'NovaSite') }
}

function failureDisposition(error: unknown): { retry: boolean; ambiguous: boolean; code: string } {
  const failure = error && typeof error === 'object' ? error as MailFailure : {}
  const code = /^[A-Z0-9_]{1,40}$/i.test(failure.code || '') ? failure.code! : 'MAIL_ERROR'
  // A definite SMTP rejection means the message was not accepted; retry 4xx,
  // stop on 5xx/authentication failures. Do not store a provider's raw response.
  if (failure.responseCode && failure.responseCode >= 400 && failure.responseCode < 600) return { retry: failure.responseCode < 500, ambiguous: false, code: `SMTP_${failure.responseCode}` }
  if (['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(code)) return { retry: false, ambiguous: false, code }
  const command = (failure.command || '').toUpperCase()
  const beforeContent = ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO'].some((stage) => command === stage || command.startsWith(`${stage} `))
  if (beforeContent || ['EDNS', 'ECONNECTION'].includes(code)) return { retry: true, ambiguous: false, code }
  // A lost acknowledgement after DATA may mean the server already accepted it.
  // Retrying automatically here could notify twice. Require operator review.
  return { retry: false, ambiguous: true, code }
}

export async function runOneInquiryNotification(payload: Payload) {
  if (!inquiryPersistenceEnabled() || !inquiryNotificationsEnabled()) return false
  const settings = inquirySMTPSettings()
  const db = inquiryPool(payload)
  // An expired in-flight send has unknown delivery, not a safe automatic retry.
  await db.query("UPDATE platform_jobs.inquiry_notifications SET status='ambiguous',error_code='SEND_ACK_UNKNOWN',lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE status='sending' AND lease_until<now()")
  const owner = randomUUID()
  const claim = await db.query(`
    WITH candidate AS (
      SELECT id FROM platform_jobs.inquiry_notifications
      WHERE status IN ('pending','retry') AND attempts<5 AND next_attempt_at<=now()
      ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE platform_jobs.inquiry_notifications n
      SET status='sending',attempts=n.attempts+1,lease_owner=$1,lease_until=now()+interval '2 minutes',updated_at=now()
      FROM candidate WHERE n.id=candidate.id RETURNING n.id,n.tenant_id,n.lead_id,n.attempts
  `, [owner])
  const job = claim.rows[0] as Notification | undefined
  if (!job) return false
  const finish = async (status: string, code: string | null, delay = 0) => {
    await db.query(`UPDATE platform_jobs.inquiry_notifications SET status=$3,error_code=$4,next_attempt_at=now()+($5::int*interval '1 second'),accepted_at=CASE WHEN $3='accepted' THEN now() ELSE accepted_at END,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='sending'`, [job.id, owner, status, code, delay])
  }
  const transport = nodemailer.createTransport({
    host: settings.host, port: settings.port, secure: settings.port === 465,
    requireTLS: settings.port !== 465, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: settings.user, pass: settings.pass },
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 45_000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  })
  let leaseLost = false
  const heartbeat = setInterval(() => {
    void db.query("UPDATE platform_jobs.inquiry_notifications SET lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='sending'", [job.id, owner]).then((result) => {
      if (!result.rowCount) { leaseLost = true; transport.close() }
    }).catch(() => { leaseLost = true; transport.close() })
  }, 15000)
  heartbeat.unref()
  let sendStarted = false
  let acknowledged = false
  try {
    const [company, inquiries] = await Promise.all([
      payload.findByID({ collection: 'tenants', id: job.tenant_id, depth: 0, overrideAccess: true }),
      payload.find({ collection: 'leads', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ id: { equals: job.lead_id } }, { tenant: { equals: job.tenant_id } }] } }),
    ])
    const lead = inquiries.docs[0]
    if (!lead) { await finish('failed', 'INQUIRY_NOT_FOUND'); return true }
    // Recipient comes from this company's saved contact info, never request body.
    const recipient = company.contact?.email?.trim() || ''
    if (!validEmail(recipient)) { await finish('failed', 'RECIPIENT_NOT_CONFIGURED'); return true }
    if (leaseLost) return true
    const companyName = company.branding?.companyName || company.name
    const text = [
      `${companyName} 收到新询盘`, `询盘编号：${lead.id}`, `姓名：${lead.name}`,
      `邮箱：${lead.email}`, `WhatsApp / 电话：${lead.phone || '—'}`, `公司：${lead.company || '—'}`,
      `地址：${lead.address || '—'}`, `国家：${lead.country || '—'}`, '', lead.message,
      '', `来源页面：${lead.sourcePage || '—'}`,
    ].join('\n')
    sendStarted = true
    const result = await transport.sendMail({
      from: { address: settings.from, name: settings.name }, to: recipient,
      replyTo: lead.email, envelope: { from: settings.from, to: [recipient] },
      subject: `新询盘 · ${headerText(companyName)} · #${lead.id}`, text,
      messageId: `<inquiry-${job.id}@${settings.from.split('@')[1]}>`,
      disableFileAccess: true, disableUrlAccess: true,
    })
    acknowledged = result.accepted.some((item) => item.toLowerCase() === recipient.toLowerCase())
    if (!acknowledged) { await finish('ambiguous', 'SEND_ACK_UNKNOWN'); return true }
    await finish('accepted', null)
  } catch (error) {
    if (acknowledged || leaseLost) {
      // Leave it in-flight for expiry/review if persisting an SMTP acknowledgement
      // failed. Never call SMTP again from this catch or requeue blindly.
      return true
    }
    const disposition = sendStarted ? failureDisposition(error) : { retry: true, ambiguous: false, code: 'NOTIFICATION_READ_FAILED' }
    const retry = disposition.retry && job.attempts < 5
    const delay = [60, 300, 1800, 7200][Math.min(job.attempts - 1, 3)]
    await finish(disposition.ambiguous ? 'ambiguous' : retry ? 'retry' : 'failed', disposition.code, retry ? delay : 0)
  } finally {
    clearInterval(heartbeat)
    transport.close()
  }
  return true
}
