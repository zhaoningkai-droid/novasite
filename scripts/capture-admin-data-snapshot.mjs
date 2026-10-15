import pg from 'pg'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// Read-only evidence helper for the admin redesign. It never initializes Payload or writes to the DB.
const outputPath = resolve(process.argv[2] || 'docs/evidence/admin-redesign/v3-step-01/data-snapshot.json')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
const identifier = (value) => `"${value.replaceAll('"', '""')}"`
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const businessTable = /^(tenants|products|product_categories|product_specifications|posts|categories|news|news_categories|cases|case_categories|pages|faqs|media|leads|site_navigation|deployments)(_|$)/
const countedTables = ['products', 'news', 'cases', 'posts', 'leads', 'pages', 'media', 'faqs', 'product_categories', 'news_categories', 'case_categories', 'categories', 'product_specifications', 'site_navigation']

await client.connect()
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"))
    .rows.map(({ table_name }) => table_name).filter((table) => businessTable.test(table))
  const tableHashes = {}
  for (const table of tables) {
    const rows = (await client.query(`SELECT to_jsonb(row_data) AS doc FROM ${identifier(table)} row_data ORDER BY to_jsonb(row_data)::text`)).rows.map(({ doc }) => doc)
    tableHashes[table] = { count: rows.length, sha256: hash(rows) }
  }
  const tenants = (await client.query('SELECT id, slug FROM tenants ORDER BY id')).rows
  for (const tenant of tenants) {
    tenant.counts = {}
    for (const table of countedTables) {
      if (!tables.includes(table)) continue
      tenant.counts[table] = Number((await client.query(`SELECT count(*) FROM ${identifier(table)} WHERE tenant_id=$1`, [tenant.id])).rows[0].count)
    }
  }
  await client.query('ROLLBACK')
  const snapshot = { capturedAt: new Date().toISOString(), method: 'PostgreSQL REPEATABLE READ READ ONLY; row values are represented only by SHA-256 hashes', tenants, tables: tableHashes }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2))
  process.stdout.write(JSON.stringify({ outputPath, tenants: tenants.length, businessTables: tables.length, rowCount: Object.values(tableHashes).reduce((sum, table) => sum + table.count, 0) }) + '\n')
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  await client.end()
}
