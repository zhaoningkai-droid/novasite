/** Local-only GEO visibility installer. Adds isolated GEO tables; does not alter customer content. */
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createDatabasePoolOptions } from '../src/platform/adapters/database-pool'
import { geoVisibilitySchemaSQL } from '../src/platform/geo/visibility-schema'

const args = process.argv.slice(2), known = ['--apply', '--expected-database=', '--backup-file=']
const value = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
if (args.some((arg) => !known.some((option) => option.endsWith('=') ? arg.startsWith(option) : arg === option)) ||
  known.some((option) => args.filter((arg) => option.endsWith('=') ? arg.startsWith(option) : arg === option).length > 1))
  throw new Error('Unknown or duplicate installer argument.')
if (!args.includes('--apply')) {
  process.stdout.write('Not applied. Use --apply with the confirmed local database name and a recent private backup.\n')
  process.exit(0)
}
if (process.env.NODE_ENV === 'production') throw new Error('This installer is local-only; production uses the approved migrator.')
const connection = process.env.DATABASE_URL
if (!connection) throw new Error('DATABASE_URL is not configured.')
const parsed = new URL(connection), database = decodeURIComponent(parsed.pathname.slice(1))
if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Loopback database required.')
if (!database || value('--expected-database') !== database) throw new Error('Confirm the target database with --expected-database.')
const backup = value('--backup-file')
if (!backup || !path.isAbsolute(backup)) throw new Error('An absolute private PostgreSQL backup path is required.')
const info = await lstat(backup), age = Date.now() - info.mtimeMs
if (!info.isFile() || info.isSymbolicLink() || info.size < 100 || (info.mode & 0o077) || age < -60_000 || age > 24 * 60 * 60 * 1000)
  throw new Error('Backup must be a private regular file created within 24 hours.')
const actual = await realpath(backup), publicDirectory = await realpath(path.resolve(process.cwd(), 'public'))
if (actual === publicDirectory || actual.startsWith(`${publicDirectory}${path.sep}`)) throw new Error('Backup cannot be stored in public.')
const file = await open(backup, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
try {
  const opened = await file.stat(), magic = Buffer.alloc(5)
  if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size !== info.size) throw new Error('Backup changed during preparation.')
  await file.read(magic, 0, magic.length, 0)
  if (magic.toString() !== 'PGDMP') throw new Error('Expected a pg_dump custom-format archive.')
} finally { await file.close() }
const require = createRequire(import.meta.url), postgresRequire = createRequire(require.resolve('@payloadcms/db-postgres'))
const pg = postgresRequire('pg') as { Client: new (options: Record<string, unknown>) => {
  connect(): Promise<void>; end(): Promise<void>; query(sql: string): Promise<{ command: string; rows: Record<string, unknown>[] }> } }
const client = new pg.Client({ ...createDatabasePoolOptions(), connectionTimeoutMillis: 10_000 })
try {
  await client.connect()
  const identity = await client.query('SELECT current_database() AS database')
  if (identity.rows[0]?.database !== database) throw new Error('Connected database identity differs.')
  await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='10s'"); await client.query("SET LOCAL statement_timeout='45s'")
  await client.query('SELECT pg_advisory_xact_lock(57316,0)')
  const prerequisite = await client.query(`SELECT to_regclass('platform_geo.optimizations') IS NOT NULL AS optimizations,
    to_regclass('platform_geo.source_pages') IS NOT NULL AS sources`)
  if (prerequisite.rows[0]?.optimizations !== true || prerequisite.rows[0]?.sources !== true)
    throw new Error('GEO optimization and source-page storage must already be installed.')
  await client.query(geoVisibilitySchemaSQL)
  const committed = await client.query('COMMIT')
  if (committed.command !== 'COMMIT') throw new Error('Installation commit was not confirmed.')
  process.stdout.write('Local GEO visibility tables installed. Existing customer and GEO rows were not updated.\n')
} catch {
  await client.query('ROLLBACK').catch(() => {})
  throw new Error('GEO visibility installation was not confirmed; inspect the local database before retrying.')
} finally { await client.end().catch(() => {}) }
