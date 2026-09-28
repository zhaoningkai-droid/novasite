import { writeFileSync } from 'node:fs'
import pg from 'pg'
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const tables = await client.query<{ tablename: string }>(
  "select tablename from pg_tables where schemaname='public' order by tablename",
)
const result: Record<string, unknown> = { capturedAt: new Date().toISOString() }
for (const { tablename } of tables.rows) {
  const name = `"${tablename.replaceAll('"', '""')}"`
  const { rows } = await client.query(
    `select count(*)::int as count, md5(coalesce(string_agg(row_data, '' order by row_data), '')) as hash from (select row_to_json(t)::text as row_data from ${name} t) q`,
  )
  result[tablename] = rows[0]
}
result.tenantSelections = (
  await client.query('select id,slug,selected_template_id from tenants order by id')
).rows
result.templateRecords = (
  await client.query('select id,key,name,status from templates order by id')
).rows
writeFileSync(process.argv[2] || '/tmp/template-baseline.json', JSON.stringify(result, null, 2))
await client.end()
