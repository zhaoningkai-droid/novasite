/** G01–04 and T09–10 from the November 8 incident. Empty local database and synthetic data. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { productTranslationSchemaSQL } from '../src/migrations/20260930_030000_product_translation_jobs'
import { translationUsageSchemaSQL } from '../src/migrations/20261001_020000_translation_usage'
import { geoKeywordsSchemaSQL } from '../src/platform/geo/schema'
import { geoMaterialSchemaSQL } from '../src/platform/geo/material-schema'
import { geoTaskSchemaSQL } from '../src/platform/geo/task-schema'
import { geoArticleSchemaSQL, geoGenerationRecoverySQL } from '../src/platform/geo/article-schema'
import { geoPlanSchemaSQL } from '../src/platform/geo/plan-schema'
import { geoPublishSchemaSQL } from '../src/platform/geo/publish-schema'
import { createGeoKeywordStore } from '../src/platform/geo/keyword-store'
import { createGeoMaterialStore } from '../src/platform/geo/material-store'
import { createGeoTaskStore } from '../src/platform/geo/task-store'
import { createGeoArticleStore } from '../src/platform/geo/article-store'
import { createGeoGenerationQueue } from '../src/platform/geo/generation-queue'
import { geoGenerationHealth, recordGeoGenerationHeartbeat } from '../src/platform/geo/generation-health'
import { runOneGeoArticle } from '../src/platform/geo/article-runner'
import { knowledgeSchemaSQL } from '../src/platform/knowledge/schema'
import { GeoError, parseGeoValues } from '../src/platform/geo/keywords'
import { parseGeoTask } from '../src/platform/geo/tasks'
import { translationJobMeter, translationUsageReady } from '../src/platform/translation-usage/budget'

const url = new URL(process.env.DATABASE_URL || '')
const database = process.env.NOVASITE_READINESS_TEST_DB || ''
if (url.hostname !== '127.0.0.1' || !/^novasite_readiness_verify_[0-9]+$/.test(database) || url.pathname === '/' + database)
  throw new Error('Use an explicitly named, empty local scratch database.')
url.pathname = '/' + database
const require = createRequire(import.meta.url)
const { Pool } = createRequire(require.resolve('@payloadcms/db-postgres'))('pg') as { Pool: new (options: object) => PostgresAdapter['pool'] }
const pool = new Pool({ connectionString: url.toString(), max: 4 })
const geoCode = (code: string) => (error: unknown) => error instanceof GeoError && error.code === code
try {
  const tables = await pool.query("SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")
  assert.equal(tables.rowCount, 0, 'Scratch database must be empty')
  await pool.query(`CREATE TABLE public.tenants(id integer PRIMARY KEY);
    INSERT INTO public.tenants VALUES (101),(202);
    CREATE TABLE public.media(id integer PRIMARY KEY,tenant_id integer NOT NULL REFERENCES public.tenants(id),
      alt text,filename text,url text,thumbnail_u_r_l text,mime_type text,filesize integer);
    INSERT INTO public.media VALUES(1001,101,'测试图片','fixture.jpg','/fixture.jpg','','image/jpeg',100);`)
  for (const ddl of [productTranslationSchemaSQL, translationUsageSchemaSQL, geoKeywordsSchemaSQL,
    geoMaterialSchemaSQL, geoTaskSchemaSQL, geoArticleSchemaSQL, geoPublishSchemaSQL, geoPlanSchemaSQL]) await pool.query(ddl)
  const payload = { db: { pool } } as unknown as Payload
  assert.equal(await translationUsageReady(payload), true)
  // Enforce each obsolete limit at a value lower than fixture usage; none should affect admissions.
  process.env.TRANSLATION_BUDGET_ENABLED = 'true'
  for (const key of ['GLOBAL_DAILY_UNITS','GLOBAL_MONTHLY_UNITS','COMPANY_DAILY_UNITS','COMPANY_MONTHLY_UNITS','MAX_REQUESTS_PER_JOB']) {
    process.env['TRANSLATION_' + key] = '1'
  }
  for (const tenantID of [101, 202]) {
    const jobID = randomUUID(), owner = randomUUID()
    await pool.query(`INSERT INTO platform_jobs.product_translation
      (id,tenant_id,product_id,actor_id,source_locale,source_hash,targets,source,status,lease_owner,lease_until)
      VALUES($1,$2,1,1,'zh','fixture','[]','{}','running',$3,now()+interval '60 seconds')`, [jobID, tenantID, owner])
    const meter = translationJobMeter(payload, { id: jobID, tenant_id: tenantID, lease_owner: owner })
    const usage = { inputTokens: 3, outputTokens: 4, totalTokens: 7, cacheHitInputTokens: null, cacheMissInputTokens: null }
    for (let attempt = 0; attempt < 2; attempt++) {
      const id = await meter.reserve({ model: 'fixture', inputBytes: 20, maxOutputTokens: 20 })
      await meter.settle(id, attempt === 0 ? usage : undefined)
    }
    const { rows } = await pool.query('SELECT status,charged_units::int FROM platform_jobs.translation_usage WHERE tenant_id=$1 ORDER BY status', [tenantID])
    assert.deepEqual(rows, [{ status: 'known', charged_units: 7 }, { status: 'unknown', charged_units: 2088 }])
    const wrong = translationJobMeter(payload, { id: jobID, tenant_id: tenantID, lease_owner: randomUUID() })
    await assert.rejects(() => wrong.reserve({ model: 'fixture', inputBytes: 20, maxOutputTokens: 20 }), { code: 'COST_LEASE_LOST' })
  }
  console.log('用量：两个公司均可超过旧平台、客户和单任务额度；实际与未知用量照常入账；无租约的执行者仍被拒绝。')

  const keywordStore = createGeoKeywordStore(pool, 101, 1)
  const values = parseGeoValues({ brand: '样本公司', core: '配电柜', aliases: '', terms: Array.from({ length: 10 }, (_, index) => `类型${index}配电柜`), website: 'https://fixture.example/', blog: '' })
  const config = (await keywordStore.create(randomUUID(), values)).item
  const group = await createGeoMaterialStore(pool, 101, 1).save(randomUUID(), { name: '样本图片', description: '', mediaIds: [1001] })
  assert.ok(group)
  const taskID = randomUUID(), requestID = randomUUID()
  const tasks = createGeoTaskStore(pool, 101, 1), articles = createGeoArticleStore(pool, 101, 1)
  const settings = parseGeoTask({ name: '样本任务', optimizationID: config.id, optimizationVersion: 1,
    locale: 'zh', questions: [{ id: randomUUID(), term: values.core, intent: 'default', original: '配电柜如何选型？' }],
    materialGroupID: group.id, materialGroupVersion: 1, imagesPerArticle: 1, direction: '产品介绍',
    length: 'short', mode: 'repeat', count: 1 })
  await tasks.save(taskID, settings)
  assert.equal((await tasks.list('', 1)).items[0].available_count, 1)
  assert.deepEqual(await articles.enqueue(requestID, taskID, 1, 1), { replayed: false, requestID, count: 1 })
  const beforeMigration = (await pool.query('SELECT id,context,state FROM platform_geo.generation_jobs ORDER BY id')).rows
  assert.equal(beforeMigration.length, 1)
  await pool.query(geoGenerationRecoverySQL)
  await pool.query(geoGenerationRecoverySQL)
  assert.deepEqual((await pool.query('SELECT id,context,state FROM platform_geo.generation_jobs ORDER BY id')).rows, beforeMigration)
  await keywordStore.update(config.id, 1, values)
  const stale = (await tasks.list('', 1)).items[0]
  assert.equal(stale.available_count, 0)
  assert.equal(stale.generation_blocker?.code, 'OPTIMIZATION_VERSION_CHANGED')
  await assert.rejects(() => articles.enqueue(randomUUID(), taskID, 1, 1), geoCode('OPTIMIZATION_VERSION_CHANGED'))
  assert.deepEqual(await articles.enqueue(requestID, taskID, 1, 1), { replayed: true, requestID, count: 1 })
  const total = await pool.query('SELECT count(*)::int AS count FROM platform_geo.generation_requests')
  assert.equal(total.rows[0].count, 1)
  assert.equal((await articles.jobs(taskID)).length, 1)
  let calls = 0
  await runOneGeoArticle(pool, { key: 'fixture', model: 'fixture', authorize: async () => true, generate: async () => {
    calls++
    throw new Error('Stale job must not call model')
  } })
  const [failed] = await articles.jobs(taskID)
  assert.equal(calls, 0)
  assert.equal(failed.error_code, 'OPTIMIZATION_VERSION_CHANGED')
  assert.deepEqual(failed.attempts, [])
  await assert.rejects(() => articles.retry(failed.id, false), geoCode('RETRY_NOT_ALLOWED'))
  const revised = await tasks.save(taskID, { ...settings, optimizationVersion: 2 }, 1)
  assert.equal(revised.version, 2)
  assert.equal((await tasks.list('', 1)).items[0].available_count, 1)
  await pool.query("UPDATE public.media SET url='/new-fixture.jpg' WHERE id=1001")
  assert.equal((await tasks.list('', 1)).items[0].generation_blocker?.code, 'MEDIA_CHANGED')
  await assert.rejects(() => articles.enqueue(randomUUID(), taskID, 2, 1), geoCode('MEDIA_CHANGED'))
  await pool.query("UPDATE public.media SET url='/fixture.jpg' WHERE id=1001")
  assert.equal((await articles.enqueue(randomUUID(), taskID, 2, 1)).count, 1)
  assert.equal((await articles.jobs(taskID)).length, 2)
  const queue = createGeoGenerationQueue(pool)
  const job = await queue.claim()
  assert.ok(job)
  await keywordStore.update(config.id, 2, values)
  await assert.rejects(() => queue.dispatch(job, job.context, 'fixture'), geoCode('OPTIMIZATION_VERSION_CHANGED'))
  const blocked = (await articles.jobs(taskID)).find((item) => item.id === job.id)
  assert.deepEqual(blocked?.attempts, [])
  await queue.fail(job, false, 'OPTIMIZATION_VERSION_CHANGED', '配置已更新')
  await tasks.save(taskID, { ...settings, optimizationVersion: 3 }, 2)
  await articles.enqueue(randomUUID(), taskID, 3, 1)
  await runOneGeoArticle(pool, { key: 'fixture', model: 'fixture', authorize: async () => true, generate: async () => {
    calls++
    return { content: { title: '样本草稿', summary: '', html: '<p>样本草稿。</p>', issues: ['待检查'] }, warnings: [] }
  } })
  assert.equal(calls, 1)
  const history = await articles.jobs(taskID)
  assert.equal(history.length, 3)
  assert.equal(history.filter((item) => item.state === 'failed').length, 2)
  const succeeded = history.find((item) => item.state === 'succeeded')
  assert.ok(succeeded?.article_id)
  assert.equal((await articles.find(succeeded.article_id))?.title, '样本草稿')
  assert.equal((await tasks.list('', 1)).items[0].generation_state, 'succeeded')
  console.log('GEO：旧配置不再入队；提交后配置变化不触发模型；旧请求重放仍返回真实数量；失效图片被拦截；更新配置后可重新提交并保存草稿，历史保留。')

  const readJob = async (batchID: string) => {
    const found = (await articles.jobs(taskID)).find((item) => item.request_id === batchID)
    assert.ok(found)
    return found
  }
  const submit = async () => {
    const id = randomUUID()
    await articles.enqueue(id, taskID, 3, 1)
    return id
  }
  const noModel = {
    key: 'fixture', model: 'fixture',
    knowledge: (async (_pool, _tenant, context) => context) satisfies NonNullable<Parameters<typeof runOneGeoArticle>[1]['knowledge']>,
    generate: async () => { calls++; throw new Error('Unexpected model call') },
  }
  const authUnavailable = async () => { throw new Error('test DB timeout') }
  assert.equal((await geoGenerationHealth(pool, 101))?.workerReady, null)
  await recordGeoGenerationHeartbeat(pool)
  const delayed = await submit()
  for (const delay of [30, 120, 600]) {
    assert.equal(await runOneGeoArticle(pool, { ...noModel, authorize: authUnavailable }), true)
    const pending = await readJob(delayed)
    assert.equal(pending.state, 'queued')
    assert.deepEqual(pending.attempts, [])
    const remaining = (new Date(pending.next_run_at).getTime() - Date.now()) / 1000
    assert.ok(remaining > delay - 5 && remaining <= delay + 1, `Expected roughly ${delay}s, got ${remaining}`)
    assert.equal(await queue.claim(), null)
    assert.deepEqual(await articles.batch(taskID, delayed), { succeeded: 0, pending: 1, failed: 0, unknown: 0 })
    const health = await geoGenerationHealth(pool, 101)
    assert.equal(health?.workerReady, true)
    assert.ok(health?.oldestQueuedAt && health.lastClaimedAt && health.lastSucceededAt)
    await pool.query("UPDATE platform_geo.generation_jobs SET next_run_at=now()-interval '1 second' WHERE id=$1", [pending.id])
  }
  await runOneGeoArticle(pool, { ...noModel, authorize: authUnavailable })
  const exhausted = await readJob(delayed)
  assert.equal(exhausted.state, 'failed')
  assert.equal(exhausted.error_code, 'AUTH_LOOKUP_UNAVAILABLE')
  assert.deepEqual(exhausted.attempts, [])
  assert.deepEqual(await articles.batch(taskID, delayed), { succeeded: 0, pending: 0, failed: 1, unknown: 0 })
  await assert.rejects(() => createGeoArticleStore(pool, 202, 1).retry(exhausted.id, false), geoCode('RETRY_NOT_ALLOWED'))
  await articles.retry(exhausted.id, false)
  await runOneGeoArticle(pool, { ...noModel, authorize: async () => false })
  const revoked = await readJob(delayed)
  assert.equal(revoked.error_code, 'ACTOR_REVOKED')
  assert.deepEqual(revoked.attempts, [])

  const uncertain = await submit()
  let checks = 0
  await runOneGeoArticle(pool, { ...noModel, authorize: async () => ++checks < 3 ? true : authUnavailable() })
  const unknown = await readJob(uncertain)
  assert.equal(unknown.state, 'unknown')
  assert.equal(unknown.error_code, 'AUTH_LOOKUP_AFTER_DISPATCH')
  assert.equal(unknown.attempts[0]?.state, 'unknown')
  assert.equal(await queue.claim(), null)
  assert.deepEqual(await articles.batch(taskID, uncertain), { succeeded: 0, pending: 0, failed: 0, unknown: 1 })
  await assert.rejects(() => articles.retry(unknown.id, false), geoCode('RETRY_NOT_ALLOWED'))
  await assert.rejects(() => articles.retry(succeeded.id, true), geoCode('RETRY_NOT_ALLOWED'))
  await articles.retry(unknown.id, true)
  const resumed = await readJob(uncertain)
  assert.equal(resumed.state, 'queued')
  assert.equal(resumed.attempts.length, 1, 'Explicit retry retains the original attempt')
  await runOneGeoArticle(pool, { ...noModel, authorize: authUnavailable })
  const resumedDelay = (new Date((await readJob(uncertain)).next_run_at).getTime() - Date.now()) / 1000
  assert.ok(resumedDelay > 25 && resumedDelay <= 31)
  await pool.query("UPDATE platform_geo.generation_worker_heartbeat SET last_seen=now()-interval '1 minute'")
  const staleWorker = await geoGenerationHealth(pool, 101)
  assert.equal(staleWorker?.workerReady, false)
  assert.ok(staleWorker.failures.some((failure) => failure.code === 'ACTOR_REVOKED' && failure.count === 1))
  assert.deepEqual(await geoGenerationHealth(pool, 202), {
    workerReady: false, oldestQueuedAt: null, lastClaimedAt: null, lastSucceededAt: null, failures: [],
  })
  await keywordStore.update(config.id, 3, values)
  await assert.rejects(() => articles.retry(revoked.id, false), geoCode('OPTIMIZATION_VERSION_CHANGED'))
  assert.equal(calls, 1, 'Only the original successful generation reached the injected model')
  await tasks.save(taskID, { ...settings, optimizationVersion: 4 }, 3)
  const retried = randomUUID()
  await articles.enqueue(retried, taskID, 4, 1)
  await runOneGeoArticle(pool, { ...noModel, authorize: async () => false })
  await articles.retry((await readJob(retried)).id, false)
  await runOneGeoArticle(pool, { ...noModel, authorize: async () => true, generate: async () => ({
    content: { title: '重试生成的草稿', summary: '', html: '<p>等待审核。</p>', issues: [] },
    warnings: [],
  }) })
  const retryArticle = await articles.find((await readJob(retried)).article_id)
  assert.equal(retryArticle?.status, 'needs_edit', 'An explicit retry must not become eligible for automatic publishing')
  console.log('GEO 生成恢复：权限查询按退避重试、真实撤权不重试、派发后保留未知记录、显式重试保留旧尝试、队列状态按公司隔离。')
  if (process.argv.includes('--live-geo')) {
    const key = process.env.DEEPSEEK_API_KEY
    assert.ok(key, 'Live GEO check requires a configured provider.')
    await pool.query(knowledgeSchemaSQL)
    const liveID = randomUUID()
    await articles.enqueue(liveID, taskID, 4, 1)
    assert.equal(await runOneGeoArticle(pool, {
      key, model: process.env.DEEPSEEK_MODEL || 'deepseek-flash', authorize: async () => true,
    }), true)
    const job = await readJob(liveID)
    assert.equal(job.state, 'succeeded', job.error_code || undefined)
    assert.ok(job.article_id)
    assert.ok((await articles.find(job.article_id))?.html)
    console.log('GEO 真实模型：样本任务已生成并保存文章；临时库没有启动发布进程。')
  }
} finally {
  await pool.end()
}
