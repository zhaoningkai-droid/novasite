/** Actual Payload/PostgreSQL verification in a fresh local schema-only scratch database. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { geoVisibilitySchemaSQL } from '../src/platform/geo/visibility-schema'
import { createGeoKeywordStore } from '../src/platform/geo/keyword-store'
import { GeoError, parseGeoValues } from '../src/platform/geo/keywords'
import { createGeoSourceStore } from '../src/platform/geo/source-store'
import { createGeoVisibilityStore } from '../src/platform/geo/visibility-store'
import { parseGeoObservation, parseGeoQuestions } from '../src/platform/geo/visibility'

const database = process.env.GEO_TEST_DATABASE_NAME || '', url = new URL(process.env.DATABASE_URL || '')
if (!/^novasite_geo_verify_[0-9]+$/u.test(database) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  decodeURIComponent(url.pathname.slice(1)) === database || process.env.NODE_ENV === 'production')
  throw new Error('An explicit local scratch database is required; production and the application database are prohibited.')
url.pathname = `/${database}`
process.env.DATABASE_URL = url.toString()
const { getPayload } = await import('payload'), { default: config } = await import('../src/payload.config')
const payload = await getPayload({ config }), pool = (payload.db as unknown as PostgresAdapter).pool
const checks: string[] = []
const rejectCode = (code: string) => (error: unknown) => error instanceof GeoError && error.code === code
try {
  const tenantCount = Number((await pool.query('SELECT count(*)::int AS count FROM public.tenants')).rows[0].count)
  if (tenantCount !== 0) throw new Error('Scratch database must contain no tenants before fixtures are created.')
  await pool.query(geoVisibilitySchemaSQL); await pool.query(geoVisibilitySchemaSQL)
  checks.push('可见性表结构在空白schema-only库中可重复安装；仅新增GEO表')
  const user = await payload.create({ collection: 'users', data: { email: `geo-visibility-${randomUUID()}@example.invalid`,
    password: randomUUID(), roles: ['super-admin'], name: 'GEO visibility fixture' }, overrideAccess: true })
  const tenant = async (label: string) => payload.create({ collection: 'tenants', locale: 'zh', overrideAccess: true,
    data: { name: label, slug: `${label}-${randomUUID().slice(0, 8)}`, status: 'published', defaultLocale: 'zh',
      enabledLocales: ['zh', 'en'], branding: { companyName: label } } })
  const a = await tenant('geo-visibility-a'), b = await tenant('geo-visibility-b')
  const values = parseGeoValues({ brand: '测试电气', aliases: '测试电气/测试设备', core: '配电柜',
    terms: ['低压成套配电柜', '不锈钢户外配电柜', '光伏并网配电柜', '消防动力配电柜', '工地临时一级配电柜',
      '双电源自动切换配电柜', '防雨型工业配电柜', '三相动力配电柜', '智能控制配电柜', '防爆型低压配电柜'],
    website: 'https://fixture.example/', blog: '' })
  const configA = (await createGeoKeywordStore(pool, Number(a.id), Number(user.id)).create(randomUUID(), values)).item
  const storeA = createGeoVisibilityStore(pool, Number(a.id), Number(user.id))
  const storeB = createGeoVisibilityStore(pool, Number(b.id), Number(user.id))
  const questions = parseGeoQuestions([
    { queryType: 'brand_self', question: '测试电气的配电柜有哪些产品？', language: 'zh' },
    { queryType: 'discovery', question: '哪些厂家提供低压成套配电柜？', language: 'zh' },
  ])
  const set = await storeA.saveQuestions(configA.id, 0, questions)
  assert.equal(set.version, 1)
  assert.equal((await storeB.list(configA.id)).observations.length, 0)
  assert.equal((await storeB.list(configA.id)).questionSet.version, 0)
  await assert.rejects(() => storeB.saveQuestions(configA.id, 0, questions), rejectCode('NOT_FOUND'))
  await assert.rejects(() => storeB.record(configA.id, randomUUID(), parseGeoObservation({ questionID: questions[0].id,
    optimizationVersion: configA.version, questionSetVersion: 1, platform: 'fixture', browsingMode: 'connected',
    language: 'zh', region: 'CN', outcome: 'answered', rawAnswer: '测试电气', recommendationContext: 'recommended' })), rejectCode('NOT_FOUND'))
  checks.push('两租户隔离：乙客户读取不到甲客户问题/样本，也不能写入甲客户优化词下的记录')

  await createGeoSourceStore(pool, Number(a.id)).replace(configA, [{ url: 'https://fixture.example/products/panel',
    kind: 'site', title: '配电柜产品页', excerpt: '配电柜产品资料与配置说明。'.repeat(8), terms: [values.terms[0]],
    status: 'available', reason: '' }])
  const detectedRequestID = randomUUID()
  const detectedInput = parseGeoObservation({ questionID: questions[0].id,
    optimizationVersion: configA.version, questionSetVersion: set.version, platform: '测试平台', model: 'fixture-model',
    browsingMode: 'connected', language: 'zh', region: 'CN', outcome: 'answered',
    rawAnswer: '测试电气（测试设备）提供配电柜产品。', groundingQueries: '配电柜供应商',
    citationURLs: 'https://fixture.example/products/panel/', recommendationContext: 'recommended' })
  const recorded = await storeA.record(configA.id, detectedRequestID, detectedInput), detected = recorded.observation
  assert.equal(recorded.replayed, false)
  assert.equal(detected.resultState, 'detected'); assert.deepEqual(detected.matchedAliases.sort(), ['测试电气', '测试设备'])
  assert.equal(detected.citations[0]?.status, 'known_available'); assert.equal(detected.rawAnswer, '测试电气（测试设备）提供配电柜产品。')
  const replay = await storeA.record(configA.id, detectedRequestID, detectedInput)
  assert.equal(replay.replayed, true); assert.equal(replay.observation.id, detected.id)
  await assert.rejects(() => storeA.record(configA.id, detectedRequestID, { ...detectedInput, rawAnswer: '不同内容' }), rejectCode('IDEMPOTENCY_CONFLICT'))
  const notMentioned = await storeA.record(configA.id, randomUUID(), parseGeoObservation({ questionID: questions[1].id,
    optimizationVersion: configA.version, questionSetVersion: set.version, platform: '测试平台', browsingMode: 'unknown',
    language: 'zh', region: 'GLOBAL', outcome: 'answered', rawAnswer: '本次答案提到行业产品，但没有提到任何公司。' }))
  assert.equal(notMentioned.observation.resultState, 'not_mentioned')
  const failed = await storeA.record(configA.id, randomUUID(), parseGeoObservation({ questionID: questions[1].id,
    optimizationVersion: configA.version, questionSetVersion: set.version, platform: '测试平台', browsingMode: 'unknown',
    language: 'zh', region: 'GLOBAL', outcome: 'failed', failureMessage: '测试超时' }))
  assert.equal(failed.observation.resultState, 'failed')
  const result = await storeA.list(configA.id)
  assert.deepEqual(new Set(result.observations.map((item) => item.resultState)), new Set(['failed', 'not_mentioned', 'detected']))
  const detectedHistory = result.observations.find((item) => item.resultState === 'detected')
  assert.equal(detectedHistory?.optimizationSnapshot.brand, '测试电气')
  assert.equal(detectedHistory?.questionSetVersion, 1)
  checks.push('原始答案/内部检索词/采样语境/引用及配置版本真实落库；命中、未提及、失败三种状态分离；请求重放幂等')

  const raced = await Promise.allSettled([
    storeA.saveQuestions(configA.id, 1, [...questions, { id: randomUUID(), queryType: 'discovery', question: '厂家有哪些？', language: 'zh' }]),
    storeA.saveQuestions(configA.id, 1, questions.slice(0, 1)),
  ])
  assert.equal(raced.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal((raced.find((item) => item.status === 'rejected') as PromiseRejectedResult).reason.code, 'VERSION_CONFLICT')
  assert.equal((await storeA.list(configA.id)).observations.length, 3)
  checks.push('问题集版本竞争仅允许一个旧版本写入；历史采样保留原样不随问题集更新')
  const report = { status: 'passed', database, environment: 'isolated Payload + PostgreSQL scratch database',
    applicationDatabaseChanged: false, actualAIRequests: 0, actualCustomerRowsChanged: false, checks }
  await mkdir('docs/geo/evidence/step-08', { recursive: true })
  await writeFile('docs/geo/evidence/step-08/postgres-verification.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { await payload.destroy() }
process.exit(0)
