/** 用户第一步验收场景；仅在新建隔离数据库运行，不写应用客户记录。 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createDatabasePoolOptions } from '../src/platform/adapters/database-pool'
import { geoKeywordsSchemaSQL } from '../src/platform/geo/schema'
import { geoDetectionSchemaSQL } from '../src/platform/geo/detection-schema'
import { createGeoKeywordStore } from '../src/platform/geo/keyword-store'
import { parseGeoValues, GeoError } from '../src/platform/geo/keywords'
import { parseDetectionInput } from '../src/platform/geo/detection'
import { createGeoDetectionStore } from '../src/platform/geo/detection-store'

const original = new URL(process.env.DATABASE_URL || '')
if (
  process.env.NODE_ENV === 'production' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(original.hostname)
)
  throw Error('Local only')
const database = `novasite_geo_detection_verify_${Date.now()}`
const require = createRequire(import.meta.url)
const pg = createRequire(require.resolve('@payloadcms/db-postgres'))('pg')
const admin = new pg.Client(createDatabasePoolOptions())
await admin.connect()
await admin.query(`CREATE DATABASE "${database}"`)
const target = new URL(original)
target.pathname = `/${database}`
const pool = new pg.Pool({ connectionString: target.toString(), max: 5 })
const checks: string[] = []
const reject = (code: string) => (e: unknown) => e instanceof GeoError && e.code === code
try {
  await pool.query('CREATE TABLE public.tenants(id integer PRIMARY KEY)')
  await pool.query('INSERT INTO public.tenants(id) VALUES(101),(202)')
  await pool.query(geoKeywordsSchemaSQL)
  await pool.query(`CREATE TABLE platform_geo.source_pages(tenant_id integer,optimization_id uuid,
    optimization_version integer,url text,kind text,title text,status text)`)
  await pool.query(geoDetectionSchemaSQL)
  await pool.query(geoDetectionSchemaSQL)
  checks.push('在新隔离数据库重复安装成功；未执行应用客户表迁移')
  const values = parseGeoValues({
    brand: '华东紧固件验收品牌',
    aliases: '华东测试',
    core: '螺栓',
    terms: Array.from({ length: 10 }, (_, i) => `螺栓类型${i + 1}`),
    website: 'https://fixture.invalid/',
    blog: '',
  })
  const configStore = createGeoKeywordStore(pool, 101, 42)
  const config = (await configStore.create(randomUUID(), values)).item
  const a = createGeoDetectionStore(pool, 101, 42),
    b = createGeoDetectionStore(pool, 202, 42)
  const body = {
    requestID: randomUUID(),
    name: '华东存储隔离验收',
    optimizationID: config.id,
    optimizationVersion: 1,
    questions: [
      { question: '哪些厂家提供六角头螺栓？', queryType: 'discovery', language: 'zh' },
      { question: '高强度螺栓供应商如何选择？', queryType: 'discovery', language: 'zh' },
    ],
  }
  const raced = await Promise.all([
    a.create(parseDetectionInput(body)),
    a.create(parseDetectionInput(body)),
  ])
  assert.equal(raced[0].id, raced[1].id)
  assert.equal(raced.filter((r) => !r.replayed).length, 1)
  await assert.rejects(
    a.create(parseDetectionInput({ ...body, name: '不同内容' })),
    reject('IDEMPOTENCY_CONFLICT'),
  )
  const runID = raced[0].id
  assert.equal((await a.list()).total, 1)
  const before = await a.detail(runID)
  assert.equal(before.jobs.length, 2)
  assert.equal((await b.list()).total, 0)
  await assert.rejects(b.detail(runID), reject('NOT_FOUND'))
  await assert.rejects(b.saveFixture(before.jobs[0].id, randomUUID()), reject('NOT_FOUND'))
  checks.push('并发重复请求仅产生一个任务；不同内容复用请求编号被拒绝；跨公司读写被拒绝')

  await configStore.update(config.id, 1, { ...values, brand: '修改后的配置' })
  const requestID = randomUUID(),
    jobID = before.jobs[0].id
  const results = await Promise.all([
    a.saveFixture(jobID, requestID),
    a.saveFixture(jobID, requestID),
  ])
  assert.equal(results[0].id, results[1].id)
  const detail = await a.detail(runID),
    attempt = detail.jobs.find((j) => j.id === jobID)!.attempt!
  assert.equal(detail.run.optimizationVersion, 1)
  assert.ok(attempt.rawAnswer.includes('华东紧固件验收品牌'))
  assert.ok(!attempt.rawAnswer.includes('修改后的配置'))
  assert.equal(attempt.artifacts.length, 2)
  assert.equal(attempt.citations.length, 1)
  assert.equal(
    attempt.rawAnswer.slice(attempt.citations[0].start, attempt.citations[0].end),
    attempt.citations[0].quotedSegment,
  )
  for (const artifact of attempt.artifacts) {
    const stored = await a.artifact(artifact.id)
    assert.equal(createHash('sha256').update(stored.payload).digest('hex'), artifact.sha256)
    const raw = JSON.parse(stored.payload.toString())
    assert.equal(raw.evidenceOrigin, 'synthetic_fixture')
    if (artifact.kind === 'response') assert.equal(raw.rawAnswer, attempt.rawAnswer)
    await assert.rejects(b.artifact(artifact.id), reject('NOT_FOUND'))
  }
  await assert.rejects(a.saveFixture(jobID, randomUUID()), reject('ALREADY_RECORDED'))
  await assert.rejects(
    pool.query('UPDATE platform_geo.detection_evidence SET payload=payload'),
    (e: unknown) => (e as { code?: string }).code === '55000',
  )
  checks.push(
    '配置改变后仍使用旧快照；原文/引用片段/请求响应字节和SHA256一致；重复保存不覆盖；私有证据跨公司拒绝',
  )

  const secondJob = before.jobs[1].id
  await pool.query(`ALTER TABLE platform_geo.detection_citations
    ADD CONSTRAINT verification_fail CHECK(false) NOT VALID`)
  await assert.rejects(a.saveFixture(secondJob, randomUUID()))
  const rolledBack = await a.detail(runID)
  assert.equal(rolledBack.jobs.find((j) => j.id === secondJob)!.state, 'pending')
  assert.equal(rolledBack.jobs.find((j) => j.id === secondJob)!.attempt, null)
  assert.equal(
    (await pool.query('SELECT count(*)::int AS n FROM platform_geo.detection_evidence')).rows[0].n,
    2,
  )
  await pool.query('ALTER TABLE platform_geo.detection_citations DROP CONSTRAINT verification_fail')
  await a.saveFixture(secondJob, randomUUID())
  assert.equal((await a.detail(runID)).run.saved, 2)
  checks.push('引用插入失败时整次尝试/证据/状态一并回滚，恢复后可保存；无半成品记录')

  const report = {
    status: 'passed',
    checks,
    database,
    actualAIRequests: 0,
    applicationDatabaseChanged: false,
    testDataOrigin: 'synthetic_fixture',
  }
  await mkdir('.private/geo-detection-step1-20261023', { recursive: true })
  await writeFile(
    '.private/geo-detection-step1-20261023/postgres-verification.json',
    JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 },
  )
  console.log(JSON.stringify(report))
} finally {
  await pool.end()
  await admin.query(`DROP DATABASE "${database}"`)
  await admin.end()
}
