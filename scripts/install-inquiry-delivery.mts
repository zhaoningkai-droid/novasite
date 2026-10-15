/** Explicit internal-table installer. Never boots Payload's development schema push. */
import { open, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { inquiryDeliverySchemaSQL } from '../src/migrations/20261001_010000_inquiry_delivery'

const args = process.argv.slice(2)
const value = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
if (!args.includes('--apply')) {
  process.stdout.write('Not applied. Back up the database and obtain approval before --apply --expected-database=NAME --backup-file=PATH.\n')
  process.exit(0)
}
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not configured.')
const database = decodeURIComponent(new URL(connectionString).pathname.slice(1))
if (value('--expected-database') !== database) throw new Error('Confirm the database with --expected-database.')
const backup = value('--backup-file')
if (!backup) throw new Error('A recent pg_dump custom-format backup is required.')
const info = await stat(backup)
if (info.size < 100 || Date.now() - info.mtimeMs > 24 * 60 * 60 * 1000) throw new Error('Backup must be a nonempty file created within 24 hours.')
const file = await open(backup, 'r')
try {
  const magic = Buffer.alloc(5)
  await file.read(magic, 0, magic.length, 0)
  if (magic.toString() !== 'PGDMP') throw new Error('Expected a pg_dump -Fc backup, not a text export.')
} finally { await file.close() }
const require = createRequire(import.meta.url)
const postgresRequire = createRequire(require.resolve('@payloadcms/db-postgres'))
const pg = postgresRequire('pg') as { Client: new (options: { connectionString: string }) => { connect(): Promise<void>; query(sql: string): Promise<unknown>; end(): Promise<void> } }
const client = new pg.Client({ connectionString })
await client.connect()
try {
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(57294,0)')
  await client.query("SET LOCAL lock_timeout='10s'")
  await client.query(inquiryDeliverySchemaSQL)
  await client.query('COMMIT')
  process.stdout.write('Inquiry internal-table installation committed. No customer content was replaced. Flags and email remain unchanged.\n')
} catch {
  await client.query('ROLLBACK').catch(() => {})
  throw new Error('Installation failed and was rolled back. No feature flag was changed.')
} finally { await client.end() }
