import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { PgDialect } from 'drizzle-orm/pg-core'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { migrations } from '../src/migrations'
import { legacyTemplates } from '../src/platform/legacy-template-catalog'
if (process.env.NODE_ENV !== 'production') throw new Error('NODE_ENV=production required')
const backupPath = `/private/tmp/novasite-library-contact-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}.dump`
const databaseURL = process.env.DATABASE_URL
if (!databaseURL) throw new Error('DATABASE_URL is required.')

const makeBackup = async () => {
  const file = createWriteStream(backupPath, { flags: 'wx', mode: 0o600 })
  const dump = spawn('docker', [
    'compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'novasite', '-d', 'novasite', '--format=custom',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const errors: Buffer[] = []
  dump.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
  const exit = new Promise<number>((resolve, reject) => {
    dump.once('error', reject)
    dump.once('close', (code) => resolve(code ?? 1))
  })
  try {
    await pipeline(dump.stdout, file)
    const code = await exit
    if (code !== 0) throw new Error(`Database backup failed: ${Buffer.concat(errors).toString('utf8').slice(0, 500)}`)
  } catch (error) {
    dump.kill()
    await rm(backupPath, { force: true })
    throw error
  }
}


const hash = (rows: unknown) => createHash('sha256').update(JSON.stringify(rows)).digest('hex')
const pool = new Pool({ connectionString: databaseURL })
const baseline = async () => {
  const tenants = await pool.query(`SELECT to_jsonb(t) - 'contact_wechat_international_q_r_code_id' AS row FROM tenants t ORDER BY id`)
  const templates = await pool.query('SELECT * FROM templates ORDER BY id')
  const counts = await pool.query(`SELECT 'media' AS name, count(*)::int AS count FROM media UNION ALL SELECT 'products', count(*)::int FROM products UNION ALL SELECT 'leads', count(*)::int FROM leads`)
  return { tenants: tenants.rows, templates: templates.rows, counts: counts.rows }
}
let payload: Awaited<ReturnType<typeof getPayload>> | undefined
try {
  await makeBackup()
  const before = await baseline()
  await mkdir('docs/evidence/template-upgrade/implementation-03', { recursive: true })
  await writeFile('docs/evidence/template-upgrade/implementation-03/before.json', JSON.stringify({
    capturedAt: new Date().toISOString(), backupPath,
    tenantCount: before.tenants.length, tenantHash: hash(before.tenants),
    templates: before.templates.map(({id, key, name}) => ({id, key, name})), counts: before.counts,
  }, null, 2))
  payload = await getPayload({ config })
  const name = '20260927_020000_contact_third_qr'
  const installed = await pool.query('SELECT id FROM payload_migrations WHERE name = $1', [name])
  if (!installed.rowCount) {
    const migration = migrations.find((item) => item.name === name)
    assert.ok(migration)
    // The existing development database has a schema-push marker. Execute only
    // this additive migration, without invoking Payload's historical queue/reset.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const dialect = new PgDialect()
      const db = { execute: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
        const query = dialect.sqlToQuery(statement)
        return client.query(query.sql, query.params)
      } }
      await migration.up({ db } as Parameters<typeof migration.up>[0])
      await client.query(`INSERT INTO payload_migrations (name, batch, created_at, updated_at)
        SELECT $1, GREATEST(COALESCE(MAX(batch), 0), 0) + 1, now(), now() FROM payload_migrations`, [name])
      await client.query('COMMIT')
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const item of legacyTemplates) {
      const result = await client.query('UPDATE templates SET name = $1, description = $2, updated_at = now() WHERE key = $3 RETURNING id', [item.name, item.description, item.key])
      assert.equal(result.rowCount, 1, `Existing template ${item.key}`)
    }
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
  const after = await baseline()
  assert.deepEqual(after.tenants, before.tenants, 'Existing tenant data stays intact')
  assert.deepEqual(after.counts, before.counts)
  assert.equal(after.templates.length, before.templates.length)
  for (const template of before.templates) {
    const actual = after.templates.find((item) => item.id === template.id)
    const legacy = legacyTemplates.find((item) => item.key === template.key)
    if (!legacy) assert.deepEqual(actual, template, 'New five templates stay intact')
    else {
      assert.equal(actual.name, legacy.name)
      assert.equal(actual.description, legacy.description)
      const omit = ({ name: _name, description: _description, updated_at: _updated, ...row }: Record<string, unknown>) => row
      assert.deepEqual(omit(actual), omit(template), 'Only legacy display metadata changes')
    }
  }
  const evidence = { verifiedAt: new Date().toISOString(), backupPath,
    migration: name, tenantCount: after.tenants.length, tenantHash: hash(after.tenants),
    tenantsUnchanged: true, templateCount: after.templates.length,
    templates: after.templates.map(({id, key, name}) => ({id, key, name})), counts: after.counts,
  }
  await writeFile('docs/evidence/template-upgrade/implementation-03/install.json', JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await payload?.destroy()
  if (payload) await Promise.race([payload.db.pool.end(), new Promise<void>((resolve) => setTimeout(resolve, 2000))])
  await pool.end()
}
process.exit(0)
