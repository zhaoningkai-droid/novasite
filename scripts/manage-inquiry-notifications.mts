/** Operator-only metadata and explicit single-job retry. Does not send email itself. */
import { createRequire } from 'node:module'
import { inquiryNotificationsEnabled, inquiryPersistenceEnabled } from '../src/platform/inquiry/persist'

const args = process.argv.slice(2)
const value = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
const operation = args[0]
const tenant = value('--tenant')
if (!['list', 'retry'].includes(operation) || !tenant || !/^[a-z0-9-]{1,80}$/.test(tenant)) throw new Error('Use list|retry --tenant=COMPANY_SLUG. No operation was performed.')
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not configured.')
if (operation === 'retry' && (!args.includes('--confirm') || !inquiryPersistenceEnabled() || !inquiryNotificationsEnabled())) throw new Error('Enable the approved notification configuration and add --confirm before scheduling one retry.')
const require = createRequire(import.meta.url)
const postgresRequire = createRequire(require.resolve('@payloadcms/db-postgres'))
const pg = postgresRequire('pg') as { Client: new (options: { connectionString: string }) => { connect(): Promise<void>; query(query: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>; end(): Promise<void> } }
const client = new pg.Client({ connectionString })
await client.connect()
try {
  const company = (await client.query('SELECT id FROM public.tenants WHERE slug=$1', [tenant])).rows[0]
  if (!company) throw new Error('Company not found.')
  if (operation === 'list') {
    const result = await client.query('SELECT id,lead_id,status,attempts,error_code,created_at,accepted_at FROM platform_jobs.inquiry_notifications WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50', [company.id])
    process.stdout.write(JSON.stringify(result.rows, null, 2) + '\n')
  } else {
    const id = value('--job')
    if (!id || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)) throw new Error('Select one valid --job=UUID.')
    const ambiguousAllowed = args.includes('--acknowledge-possible-duplicate')
    const result = await client.query(`UPDATE platform_jobs.inquiry_notifications SET status='pending',attempts=0,error_code=NULL,next_attempt_at=now(),updated_at=now() WHERE id=$1 AND tenant_id=$2 AND (status IN ('failed','disabled') OR (status='ambiguous' AND $3)) RETURNING id,status`, [id, company.id, ambiguousAllowed])
    if (!result.rowCount) throw new Error('Not scheduled: wrong company, active/accepted job, or ambiguous delivery needs --acknowledge-possible-duplicate.')
    process.stdout.write('One notification retry scheduled. No inquiry was recreated. No email was sent by this command.\n')
  }
} finally { await client.end() }
