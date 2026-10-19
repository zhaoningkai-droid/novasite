/** Local, GEO-only additive migration for manually authored articles. */
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createDatabasePoolOptions } from '../src/platform/adapters/database-pool'

const args = process.argv.slice(2)
const known = ['--apply', '--expected-database=', '--backup-file=']
const value = (name: string) =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
if (
  args.some(
    (arg) =>
      !known.some((option) => (option.endsWith('=') ? arg.startsWith(option) : arg === option)),
  ) ||
  known.some(
    (option) =>
      args.filter((arg) => (option.endsWith('=') ? arg.startsWith(option) : arg === option))
        .length > 1,
  )
)
  throw new Error('Unknown or duplicate installer argument.')
if (!args.includes('--apply')) {
  process.stdout.write(
    'Not applied. This local-only migration requires explicit target database and a current private backup.\n',
  )
  process.exit(0)
}

if (process.env.NODE_ENV === 'production')
  throw new Error('This installer is local-only; production uses the approved migrator.')
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not configured.')
let database: string
try {
  database = decodeURIComponent(new URL(connectionString).pathname.slice(1))
} catch {
  throw new Error('DATABASE_URL is not a valid database connection.')
}
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(connectionString).hostname))
  throw new Error('The local installer accepts a loopback database endpoint only.')
if (!database || value('--expected-database') !== database)
  throw new Error('Confirm the target database with --expected-database.')
const backup = value('--backup-file')
if (!backup || !path.isAbsolute(backup))
  throw new Error('An absolute private PostgreSQL backup path is required.')
const info = await lstat(backup)
const age = Date.now() - info.mtimeMs
if (
  !info.isFile() ||
  info.isSymbolicLink() ||
  info.size < 100 ||
  info.mode & 0o077 ||
  age < -60_000 ||
  age > 24 * 60 * 60 * 1000
)
  throw new Error('Backup must be a private regular file created within 24 hours.')
const actual = await realpath(backup)
const publicDirectory = await realpath(path.resolve(process.cwd(), 'public'))
if (actual === publicDirectory || actual.startsWith(`${publicDirectory}${path.sep}`))
  throw new Error('Backup cannot be stored in public.')
const file = await open(backup, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
try {
  const opened = await file.stat()
  if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size !== info.size)
    throw new Error('Backup changed during preparation.')
  const magic = Buffer.alloc(5)
  await file.read(magic, 0, magic.length, 0)
  if (magic.toString() !== 'PGDMP') throw new Error('Expected a pg_dump custom-format archive.')
} finally {
  await file.close()
}

const require = createRequire(import.meta.url)
const postgresRequire = createRequire(require.resolve('@payloadcms/db-postgres'))
const pg = postgresRequire('pg') as {
  Client: new (options: Record<string, unknown>) => {
    connect(): Promise<void>
    query(
      sql: string,
      values?: unknown[],
    ): Promise<{
      command: string
      rows: Record<string, unknown>[]
    }>
    end(): Promise<void>
  }
}
const columns = ['job_id', 'task_id', 'task_version', 'question_id']
const client = new pg.Client({ ...createDatabasePoolOptions(), connectionTimeoutMillis: 10_000 })
try {
  await client.connect()
  const identity = await client.query('SELECT current_database() AS database')
  if (identity.rows[0]?.database !== database)
    throw new Error('Connected database identity differs.')
  await client.query('BEGIN')
  await client.query("SET LOCAL lock_timeout='10s'")
  await client.query("SET LOCAL statement_timeout='45s'")
  await client.query('SELECT pg_advisory_xact_lock(57315,0)')
  const ready = await client.query(
    "SELECT to_regclass('platform_geo.articles') IS NOT NULL AS articles_ready",
  )
  if (ready.rows[0]?.articles_ready !== true)
    throw new Error('GEO article storage must already be installed.')
  await client.query('LOCK TABLE platform_geo.articles IN ACCESS EXCLUSIVE MODE')
  const beforeColumns = await client.query(
    `SELECT column_name,is_nullable FROM information_schema.columns
      WHERE table_schema='platform_geo' AND table_name='articles' AND column_name=ANY($1::text[])`,
    [columns],
  )
  if (beforeColumns.rows.length !== columns.length)
    throw new Error('GEO article schema does not match the expected columns.')
  const beforeRows = await client.query(
    `SELECT count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS fingerprint
      FROM platform_geo.articles t`,
  )
  await client.query(`
    ALTER TABLE platform_geo.articles ALTER COLUMN job_id DROP NOT NULL;
    ALTER TABLE platform_geo.articles ALTER COLUMN task_id DROP NOT NULL;
    ALTER TABLE platform_geo.articles ALTER COLUMN task_version DROP NOT NULL;
    ALTER TABLE platform_geo.articles ALTER COLUMN question_id DROP NOT NULL;
  `)
  const afterColumns = await client.query(
    `SELECT column_name,is_nullable FROM information_schema.columns
      WHERE table_schema='platform_geo' AND table_name='articles' AND column_name=ANY($1::text[])`,
    [columns],
  )
  if (
    afterColumns.rows.length !== columns.length ||
    afterColumns.rows.some((row) => row.is_nullable !== 'YES')
  )
    throw new Error('GEO article nullable-link verification failed.')
  const afterRows = await client.query(
    `SELECT count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS fingerprint
      FROM platform_geo.articles t`,
  )
  if (
    beforeRows.rows[0]?.count !== afterRows.rows[0]?.count ||
    beforeRows.rows[0]?.fingerprint !== afterRows.rows[0]?.fingerprint
  )
    throw new Error('Existing GEO article records changed during schema migration.')
  const committed = await client.query('COMMIT')
  if (committed.command !== 'COMMIT') throw new Error('Migration commit was not confirmed.')
  process.stdout.write(
    `Local GEO manual-article schema committed for ${database}; ${beforeRows.rows[0]?.count} article records preserved.\n`,
  )
} catch {
  await client.query('ROLLBACK').catch(() => {})
  throw new Error('GEO manual-article migration did not commit; the transaction was rolled back.')
} finally {
  await client.end().catch(() => {})
}
