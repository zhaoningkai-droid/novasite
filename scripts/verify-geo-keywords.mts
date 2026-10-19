/** Real SQL verification, only against a freshly created, explicitly named scratch database. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { geoKeywordsSchemaSQL } from '../src/platform/geo/schema'
import { createGeoKeywordStore } from '../src/platform/geo/keyword-store'
import { parseGeoValues } from '../src/platform/geo/keywords'

const database = process.env.GEO_TEST_DATABASE_NAME || ''
if (!/^novasite_geo_verify_[0-9]+$/u.test(database)) throw new Error('An explicit scratch database is required.')
const url = new URL(process.env.DATABASE_URL || '')
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Only local scratch storage is allowed.')
if (decodeURIComponent(url.pathname.slice(1)) === database) throw new Error('Scratch storage cannot be the application database.')
url.pathname = `/${database}`
const require = createRequire(import.meta.url)
const vendorRequire = createRequire(require.resolve('@payloadcms/db-postgres'))
const pg = vendorRequire('pg') as { Pool: new (options: Record<string, unknown>) => PostgresAdapter['pool'] }
const pool = new pg.Pool({ connectionString: url.toString(), max: 5 })
const checks: string[] = []
const rejectCode = (code: string) => (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === code
try {
  const empty = await pool.query("SELECT to_regclass('public.tenants') AS tenants")
  if (empty.rows[0].tenants) throw new Error('Scratch database is not empty; refusing to reuse it.')
  await pool.query('CREATE TABLE public.tenants(id integer PRIMARY KEY); INSERT INTO public.tenants VALUES(101),(202)')
  await pool.query(geoKeywordsSchemaSQL)
  await pool.query(geoKeywordsSchemaSQL)
  checks.push('增量建表脚本可重复执行，不重复创建对象')
  const a = createGeoKeywordStore(pool, 101, 1), b = createGeoKeywordStore(pool, 202, 2)
  const values = parseGeoValues({ brand: '隔离验证电气', aliases: 'Validation Electric', core: '配电柜',
    terms: Array.from({ length: 10 }, (_, i) => `测试${i + 1}配电柜`),
    website: 'https://fixture.example/', blog: '' })
  const id = randomUUID()
  const created = await a.create(id, values)
  assert.equal(created.item.version, 1)
  const replay = await a.create(id, values)
  assert.equal(replay.replayed, true)
  assert.equal((await a.list('', 1)).total, 1)
  checks.push('真实创建、重复请求幂等、列表读取与版本1持久化')
  await assert.rejects(() => a.create(randomUUID(), values), rejectCode('DUPLICATE_CONFIG'))
  await b.create(randomUUID(), values)
  assert.equal(await b.find(id), null)
  await assert.rejects(() => b.update(id, 1, values), rejectCode('NOT_FOUND'))
  assert.equal((await b.list('', 1)).total, 1)
  checks.push('同客户重复被拒绝、不同客户同词合法、跨客户读取和更新被拒绝')
  const raced = await Promise.allSettled([
    a.update(id, 1, { ...values, aliases: ['版本甲'] }),
    a.update(id, 1, { ...values, aliases: ['版本乙'] }),
  ])
  assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1)
  const rejected = raced.find((r) => r.status === 'rejected') as PromiseRejectedResult
  assert.equal(rejected.reason.code, 'VERSION_CONFLICT')
  assert.equal((await a.find(id))?.version, 2)
  const history = await pool.query('SELECT count(*)::int AS count FROM platform_geo.optimization_revisions WHERE tenant_id=$1 AND optimization_id=$2', [101, id])
  assert.equal(history.rows[0].count, 2)
  checks.push('两个并发旧版本保存仅一个成功，冲突不覆盖内容，版本快照原子新增')
  await pool.query('ALTER TABLE platform_geo.optimization_revisions ADD CONSTRAINT fixture_history_failure CHECK(actor_id<>999)')
  const faulty = createGeoKeywordStore(pool, 101, 999)
  await assert.rejects(() => faulty.update(id, 2, { ...values, aliases: ['不能保存'] }))
  assert.equal((await a.find(id))?.version, 2)
  const failedId = randomUUID()
  await assert.rejects(() => faulty.create(failedId, { ...values, brand: '失败创建' }))
  assert.equal(await a.find(failedId), null)
  checks.push('版本记录失败时配置更新与创建全部回滚，不留下半条记录')
  const duplicateRace = await Promise.allSettled([
    a.create(randomUUID(), { ...values, brand: '并发同词' }),
    a.create(randomUUID(), { ...values, brand: '并发同词' }),
  ])
  assert.equal(duplicateRace.filter((r) => r.status === 'fulfilled').length, 1)
  checks.push('数据库唯一约束拒绝并发创建同一品牌与核心词')
  assert.equal((await a.list("' OR true --", 1)).total, 0)
  assert.equal((await a.list('%', 1)).total, 0)
  assert.equal((await a.list('', 2, 1)).items.length, 1)
  checks.push('搜索参数化、百分号不扩大搜索范围、真实分页')
  const report = { status: 'passed', environment: 'isolated scratch PostgreSQL',
    applicationDatabaseChanged: false, checks }
  await writeFile('docs/geo/evidence/step-02/postgres-verification.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { await pool.end() }
