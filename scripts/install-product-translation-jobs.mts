/** Explicit queue-only installer. Defaults to read-only; never initializes Payload schema push. */
import { open, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { productTranslationSchemaSQL } from '../src/migrations/20260930_030000_product_translation_jobs'

const require = createRequire(import.meta.url)
const pg = require('pg') as {
  Client: new (options: { connectionString: string }) => {
    connect(): Promise<void>
    end(): Promise<void>
    query(query: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  }
}
const args = process.argv.slice(2)
const value = (name: string) =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
const apply = args.includes('--apply')
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not configured.')
const database = decodeURIComponent(new URL(connectionString).pathname.slice(1))
if (apply) {
  if (value('--expected-database') !== database)
    throw new Error('Use --expected-database to confirm the target database name.')
  const backup = value('--backup-file')
  if (!backup || (await stat(backup)).size < 100)
    throw new Error('A recent PostgreSQL custom-format backup is required before --apply.')
  const file = await open(backup, 'r')
  try {
    const header = Buffer.alloc(5)
    await file.read(header, 0, 5, 0)
    if (header.toString() !== 'PGDMP') throw new Error('Expected a pg_dump -Fc backup.')
  } finally {
    await file.close()
  }
}
const client = new pg.Client({ connectionString })
await client.connect()
try {
  if (apply) {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(57293,0)')
    await client.query(productTranslationSchemaSQL)
    await client.query('COMMIT')
  }
  const result = await client.query(
    "SELECT to_regclass('platform_jobs.product_translation') IS NOT NULL AS installed",
  )
  process.stdout.write(
    JSON.stringify({
      database,
      mode: apply ? 'queue-only-install' : 'read-only-check',
      installed: result.rows[0].installed,
    }) + '\n',
  )
} catch (error) {
  if (apply) await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  await client.end()
}
