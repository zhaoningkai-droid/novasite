/** Additive local-only installer: no Payload initialization, no CMS schema push. */
import pg from 'pg'
import fs from 'node:fs/promises'
import { knowledgeSchemaSQL } from '../src/platform/knowledge/schema'
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw Error('Missing DATABASE_URL')
const target = new URL(connectionString),
  database = decodeURIComponent(target.pathname.slice(1))
if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
)
  throw Error('Local database required')
if (!process.argv.includes('--apply') || !process.argv.includes(`--expected-database=${database}`))
  throw Error('Use --apply and --expected-database=NAME to confirm local additive installation')
const pool = new pg.Pool({ connectionString })
const evidence = '.private/geo-knowledge-20261019'
await fs.mkdir(evidence, { recursive: true })
const snapshot = async () => {
  const tables = (
    await pool.query(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','platform_geo') ORDER BY schemaname,tablename",
    )
  ).rows
  const result = []
  for (const table of tables) {
    const relation = `"${table.schemaname.replaceAll('"', '""')}"."${table.tablename.replaceAll('"', '""')}"`
    const data = (
      await pool.query(
        `SELECT count(*)::int AS count,md5(coalesce(string_agg(value,'|' ORDER BY value),'')) AS digest FROM (SELECT row_to_json(t)::text AS value FROM ${relation} t) rows`,
      )
    ).rows[0]
    result.push({ ...table, ...data })
  }
  return result
}
try {
  const before = await snapshot()
  await fs.writeFile(`${evidence}/database-before.json`, JSON.stringify(before, null, 2))
  await pool.query('BEGIN')
  await pool.query("SET LOCAL lock_timeout='5s'")
  await pool.query('SELECT pg_advisory_xact_lock(57400,0)')
  await pool.query(knowledgeSchemaSQL)
  await pool.query('COMMIT')
  const after = await snapshot()
  await fs.writeFile(`${evidence}/database-after.json`, JSON.stringify(after, null, 2))
  const unchanged = JSON.stringify(before) === JSON.stringify(after)
  console.log(
    JSON.stringify({
      applied: true,
      newSchema: 'platform_knowledge',
      tables: ['bases', 'documents', 'chunks'],
      existingTables: before.length,
      existingCustomerDataUnchanged: unchanged,
    }),
  )
  if (!unchanged)
    throw Error(
      'Existing data changed during installation; compare evidence, do not overwrite customer data',
    )
} catch (error) {
  await pool.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  await pool.end()
}
