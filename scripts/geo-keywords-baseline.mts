/** Read-only local fingerprints: no content values, secrets, schema push or migration execution. */
import { createRequire } from 'node:module'
const connectionString = process.env.DATABASE_URL || ''
const url = new URL(connectionString)
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production')
  throw new Error('This baseline command is local-only.')
const require = createRequire(import.meta.url)
const vendorRequire = createRequire(require.resolve('@payloadcms/db-postgres'))
const pg = vendorRequire('pg') as { Client: new (config: object) => {
  connect(): Promise<void>; end(): Promise<void>
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>
} }
const client = new pg.Client({ connectionString })
await client.connect()
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  const tables = ['tenants', 'pages', 'products', 'news', 'cases', 'posts', 'media', 'leads',
    'categories', 'product_categories', 'news_categories', 'case_categories', 'site_navigation']
  const content: Record<string, unknown> = {}
  for (const table of tables) {
    // Names are a fixed allowlist, never request input.
    const result = await client.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) AS fingerprint
      FROM public."${table}" t`)
    content[table] = result.rows[0]
  }
  const storage = await client.query(`SELECT
    to_regclass('platform_geo.optimizations') IS NOT NULL AS configurations,
    to_regclass('platform_geo.optimization_revisions') IS NOT NULL AS revisions`)
  await client.query('COMMIT')
  console.log(JSON.stringify({ content, geoStorage: storage.rows[0] }, null, 2))
} finally { await client.end() }
