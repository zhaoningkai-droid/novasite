/** Real list SQL in one disposable schema-only database; never imports Payload or dispatches providers. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { createGeoKeywordStore } from '../src/platform/geo/keyword-store'
import { createGeoMaterialStore } from '../src/platform/geo/material-store'
import { createGeoSourceStore } from '../src/platform/geo/source-store'
import { createGeoTaskStore } from '../src/platform/geo/task-store'
import { createGeoArticleStore } from '../src/platform/geo/article-store'
import { parseGeoValues } from '../src/platform/geo/keywords'
import { parseGeoTask, type GeoTaskValues } from '../src/platform/geo/tasks'
import type { GeoArticle } from '../src/platform/geo/articles'

const database = process.env.GEO_TEST_DATABASE_NAME || ''
let sourceURL: URL
try { sourceURL = new URL(process.env.DATABASE_URL || '') } catch { throw new Error('A local DATABASE_URL is required.') }
const sourceDatabase = decodeURIComponent(sourceURL.pathname.slice(1)), user = decodeURIComponent(sourceURL.username)
if (!/^novasite_geo_verify_[0-9]+$/u.test(database) || sourceDatabase !== 'novasite' || database === sourceDatabase ||
    !['localhost', '127.0.0.1', '[::1]'].includes(sourceURL.hostname))
  throw new Error('Only a new explicitly named local scratch database cloned from the known local novasite schema is allowed.')
const container = process.env.GEO_POSTGRES_CONTAINER || 'novasite-platform-postgres-1'
if (!/^[a-zA-Z0-9_.-]+$/u.test(container)) throw new Error('Invalid local PostgreSQL container name.')
const require = createRequire(import.meta.url)
const { Pool } = createRequire(require.resolve('@payloadcms/db-postgres'))('pg') as { Pool: new (options: object) => PostgresAdapter['pool'] }
const adminURL = new URL(sourceURL); adminURL.pathname = '/postgres'
const scratchURL = new URL(sourceURL); scratchURL.pathname = `/${database}`
const admin = new Pool({ connectionString: adminURL.toString(), max: 1 })
const source = new Pool({ connectionString: sourceURL.toString(), max: 1, options: '-c default_transaction_read_only=on' })
let scratch: PostgresAdapter['pool'] | null = null, created = false, dropped = false, absent = false
const evidence = 'docs/geo/evidence/ui-correction-20261017'
const checks: string[] = [], statistics: Record<string, unknown>[] = []
let before: unknown, after: unknown, failure: Error | null = null
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`
const baseline = async () => {
  const tables = (await source.query<{ schemaname: string; tablename: string }>(
    "SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','platform_geo') ORDER BY schemaname,tablename")).rows
  const result = []
  for (const table of tables) {
    const row = (await source.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS fingerprint
      FROM ${identifier(table.schemaname)}.${identifier(table.tablename)} t`)).rows[0]
    result.push({ schema: table.schemaname, table: table.tablename, ...row })
  }
  return result
}

try {
  assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount, 0,
    'Scratch database already exists; refusing to reuse or drop it.')
  before = await baseline()
  const dump = spawnSync('docker', ['exec', container, 'pg_dump', '-U', user, '-d', sourceDatabase,
    '--schema-only', '--no-owner', '--no-privileges', '--lock-wait-timeout=5s'], { maxBuffer: 16 * 1024 * 1024, timeout: 30_000 })
  assert.equal(dump.status, 0, 'Read-only local schema export failed.')
  await admin.query(`CREATE DATABASE ${identifier(database)} TEMPLATE template0`); created = true
  const restore = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1'],
    { input: dump.stdout, maxBuffer: 8 * 1024 * 1024, timeout: 30_000 })
  assert.equal(restore.status, 0, 'Schema-only scratch restore failed.')
  scratch = new Pool({ connectionString: scratchURL.toString(), max: 3 })
  assert.equal((await scratch.query('SELECT current_database() AS name')).rows[0].name, database)
  for (const table of ['public.tenants', 'public.media', 'platform_geo.creation_tasks', 'platform_geo.articles', 'platform_geo.publish_intents'])
    assert.equal((await scratch.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0, 'Schema-only clone unexpectedly contains rows.')
  checks.push('Exported schema only from a read-only application connection; scratch starts with no tenant/media/GEO rows; Payload is never imported.')

  const terms = Array.from({ length: 10 }, (_, index) => `类型${index}配电柜`)
  const fixtures: { tenantID: number; label: string; taskID: string; englishTaskID: string; articles: GeoArticle[]; jobs: { id: string; context: GeoArticle['context']; question_id: string }[] }[] = []
  for (const [tenantID, label] of [[101, '甲客户'], [202, '乙客户'], [303, '丙客户']] as const) {
    await scratch.query("INSERT INTO public.tenants(id,name,slug,status,default_locale) VALUES($1,$2,$3,'published','zh')", [tenantID, label, `geo-list-fixture-${tenantID}`])
    const media = (await scratch.query(`INSERT INTO public.media(tenant_id,alt,filename,url,mime_type,filesize)
      VALUES($1,'配电柜示意图',$2,$3,'image/jpeg',100) RETURNING id`, [tenantID, `fixture-${tenantID}.jpg`, `/api/media/file/fixture-${tenantID}.jpg`])).rows[0]
    const config = (await createGeoKeywordStore(scratch, tenantID, 1).create(randomUUID(), parseGeoValues({
      brand: '测试电气', aliases: 'Fixture', core: '配电柜', terms, website: 'https://fixture.example/', blog: '' }))).item
    const group = await createGeoMaterialStore(scratch, tenantID, 1).save(randomUUID(), { name: '配电柜组', description: '', mediaIds: [media.id] })
    assert.ok(group)
    await createGeoSourceStore(scratch, tenantID).replace(config, [{ url: 'https://fixture.example/products/cabinet', kind: 'site',
      title: '配电柜产品说明', excerpt: '配电柜安装前核对现场条件、产品资料与维护要求。'.repeat(10), terms: [terms[0]], status: 'available', reason: '' }])
    const settings: GeoTaskValues = parseGeoTask({ name: `${label} 生产任务`, optimizationID: config.id, optimizationVersion: 1, locale: 'zh',
      questions: Array.from({ length: 30 }, (_, index) => ({ id: randomUUID(), term: terms[0], intent: 'default', original: `配电柜如何核对选型条件 ${index}？` })),
      materialGroupID: group.id, materialGroupVersion: group.version, imagesPerArticle: 1, direction: '产品介绍', length: 'short', mode: 'deduplicate', count: 30 })
    const taskStore = createGeoTaskStore(scratch, tenantID, 1), articleStore = createGeoArticleStore(scratch, tenantID, 1)
    const task = await taskStore.save(randomUUID(), settings)
    const initial = (await taskStore.list('', 1)).items.find((item) => item.id === task.id)
    assert.equal(initial?.available_count, 10); assert.equal(initial.generation_state, 'idle')
    for (let index = 0; index < 3; index++) await articleStore.enqueue(randomUUID(), task.id, task.version, 10)
    assert.equal((await taskStore.list('', 1)).items.find((item) => item.id === task.id)?.available_count, 0)
    const jobs = (await scratch.query<{ id: string; context: GeoArticle['context']; question_id: string }>(
      'SELECT id,context,question_id FROM platform_geo.generation_jobs WHERE tenant_id=$1 AND task_id=$2 ORDER BY created_at,id', [tenantID, task.id])).rows
    const articles: GeoArticle[] = []
    for (const [index, job] of jobs.slice(0, 21).entries()) {
      const article = (await scratch.query<GeoArticle>(`INSERT INTO platform_geo.articles
        (id,tenant_id,job_id,task_id,task_version,question_id,context,title,summary,html,status,validation,warnings,updated_by,created_at,updated_at)
        VALUES($1,$2,$1,$3,1,$4,$5::jsonb,$6,$7,'<p>Fixture only</p>','needs_edit','[]'::jsonb,'[]'::jsonb,1,now()-$8*interval '1 second',now()-$8*interval '1 second') RETURNING *`,
      [job.id, tenantID, task.id, job.question_id, JSON.stringify(job.context), index === 20 ? 'Sparse Match cabinet' : `${label} 配电柜文章 ${index}`,
        `${label} 摘要 ${index}`, index])).rows[0]
      await scratch.query('INSERT INTO platform_geo.article_revisions(tenant_id,article_id,version,snapshot,actor_id) VALUES($1,$2,1,$3::jsonb,1)', [tenantID, article.id, JSON.stringify(article)])
      await scratch.query("UPDATE platform_geo.generation_jobs SET state='succeeded' WHERE tenant_id=$1 AND id=$2", [tenantID, job.id])
      articles.push(article)
    }
    const english = await taskStore.save(randomUUID(), { ...settings, name: `${label} EnglishTask`, locale: 'en', count: 1,
      questions: [{ ...settings.questions[0], id: randomUUID(), original: '配电柜如何安装？', translated: 'How should a cabinet be installed?',
        translatedFrom: '配电柜如何安装？', translatedLocale: 'en' }] })
    await articleStore.enqueue(randomUUID(), english.id, english.version, 1)
    const englishJob = (await scratch.query('SELECT * FROM platform_geo.generation_jobs WHERE tenant_id=$1 AND task_id=$2', [tenantID, english.id])).rows[0]
    const englishArticle = (await scratch.query<GeoArticle>(`INSERT INTO platform_geo.articles
      (id,tenant_id,job_id,task_id,task_version,question_id,context,title,summary,html,status,validation,warnings,updated_by)
      VALUES($1,$2,$1,$3,1,$4,$5::jsonb,'English cabinet article','English summary','<p>Fixture only</p>','needs_edit','[]'::jsonb,'[]'::jsonb,1) RETURNING *`,
    [englishJob.id, tenantID, english.id, englishJob.question_id, JSON.stringify(englishJob.context)])).rows[0]
    await scratch.query('INSERT INTO platform_geo.article_revisions(tenant_id,article_id,version,snapshot,actor_id) VALUES($1,$2,1,$3::jsonb,1)', [tenantID, englishArticle.id, JSON.stringify(englishArticle)])
    await scratch.query("UPDATE platform_geo.generation_jobs SET state='succeeded' WHERE tenant_id=$1 AND id=$2", [tenantID, englishJob.id])
    const states = ['published', 'queued', 'failed', 'unknown', 'cancelled', 'running']
    for (const [index, state] of states.entries()) await scratch.query(`INSERT INTO platform_geo.publish_intents
      (id,tenant_id,article_id,article_version,collection,locale,input_hash,snapshot,target,publish_at,state,actor_id)
      VALUES($1,$2,$3,1,'news','zh','fixture',$4::jsonb,'{}'::jsonb,now(),$5,1)`, [randomUUID(), tenantID, articles[index].id, JSON.stringify(articles[index]), state])
    await scratch.query(`INSERT INTO platform_geo.publish_intents
      (id,tenant_id,article_id,article_version,collection,locale,input_hash,snapshot,target,publish_at,state,actor_id)
      VALUES($1,$2,$3,1,'posts','zh','fixture',$4::jsonb,'{}'::jsonb,now(),'published',1)`, [randomUUID(), tenantID, articles[0].id, JSON.stringify(articles[0])])
    for (const [mode, ids] of [['tasks', [task.id]], ['articles', [articles[0].id, articles[1].id]]] as const)
      await scratch.query(`INSERT INTO platform_geo.publish_plans(id,tenant_id,name,config,state,actor_id)
        VALUES($1,$2,$3,$4::jsonb,'draft',1)`, [randomUUID(), tenantID, `${label} ${mode} plan`, JSON.stringify({ sourceMode: mode, sourceIDs: ids })])
    const row = (await taskStore.list('', 1, 'zh')).items.find((item) => item.id === task.id)
    assert.ok(row); assert.equal(row.count, 30); assert.equal(row.generated_count, 21); assert.equal(row.used_count, 1)
    assert.equal(row.related_plan_count, 2); assert.equal(row.available_count, 0)
    assert.ok(!('settings' in row)); assert.ok(!('snapshot' in row))
    statistics.push({ tenantID, taskCount: 2, articleCount: 22, count: row.count, generated_count: row.generated_count,
      used_count: row.used_count, related_plan_count: row.related_plan_count, available_count: row.available_count })
    const all = await articleStore.list('', 1, null)
    assert.equal(all.total, 22); assert.equal(all.items.length, 20)
    const secondPage = await articleStore.list('', 2, null)
    assert.equal(secondPage.total, 22); assert.equal(secondPage.items.length, 2)
    const sparse = await articleStore.list('sparse match', 1, null, { taskName: '生产任务', locale: 'zh' })
    assert.equal(sparse.total, 1); assert.equal(sparse.items[0].id, articles[20].id)
    assert.equal(sparse.items[0].task_name, settings.name); assert.equal(sparse.items[0].summary, `${label} 摘要 20`)
    assert.ok(sparse.items[0].created_at)
    assert.equal((await articleStore.list('', 1, null, { taskName: 'englishtask', locale: 'en' })).total, 1)
    assert.equal((await articleStore.list('', 1, null, { taskName: '生产任务', locale: 'en' })).total, 0)
    for (const [use, total] of [['unused', 16], ['occupied', 4], ['published', 1]] as const) {
      const filtered = await articleStore.list('', 1, null, { use, locale: 'zh', taskName: '生产任务' })
      assert.equal(filtered.total, total); assert.equal(filtered.items.length, total)
      assert.ok(filtered.items.every((article) => article.publication_status === use && article.task_name === settings.name))
    }
    const taskSecond = await articleStore.list('', 2, null, { taskName: '生产任务' })
    assert.equal(taskSecond.total, 21); assert.equal(taskSecond.items.length, 1)
    assert.equal((await taskStore.list('', 1, 'en')).total, 1)
    fixtures.push({ tenantID, label, taskID: task.id, englishTaskID: english.id, articles, jobs })
  }
  checks.push('All three tenants: actual task totals, generated article count, distinct published use count and direct/article-based plan counts are correct; two publications for one article count as one use.')
  checks.push('Saved-snapshot capacity starts at ten and reaches zero after thirty distinct enqueue fingerprints; settings/snapshot remain internal.')
  checks.push('Actual title + taskName + locale + publication filters run before pagination: a sparse match outside the first twenty rows still returns; filtered totals and second pages agree.')
  checks.push('Actual publication classification: published wins, queued/running/failed/unknown occupy an article, cancelled-only returns unused; generated task metadata and timestamps are returned.')

  for (const fixture of fixtures) {
    const tasks = createGeoTaskStore(scratch, fixture.tenantID, 1), articles = createGeoArticleStore(scratch, fixture.tenantID, 1)
    for (const foreign of fixtures.filter((item) => item.tenantID !== fixture.tenantID)) {
      assert.equal(await tasks.find(foreign.taskID), null)
      assert.equal(await articles.find(foreign.articles[0].id), null)
      assert.deepEqual(await articles.jobs(foreign.taskID), [])
      assert.equal((await articles.list('', 1, foreign.taskID)).total, 0)
      assert.equal((await articles.list('', 1, null, { taskName: foreign.label })).total, 0)
      await scratch.query(`INSERT INTO platform_geo.publish_plans(id,tenant_id,name,config,state,actor_id)
        VALUES($1,$2,'Cross-tenant JSON fixture',$3::jsonb,'draft',1)`, [randomUUID(), foreign.tenantID,
        JSON.stringify({ sourceMode: 'tasks', sourceIDs: [fixture.taskID] })])
    }
    assert.equal((await tasks.list(fixture.label, 1)).items.find((item) => item.id === fixture.taskID)?.related_plan_count, 2)
    const pending = fixture.jobs.slice(21)
    await scratch.query("UPDATE platform_geo.generation_jobs SET state='failed' WHERE tenant_id=$1 AND task_id=$2 AND state<>'succeeded'", [fixture.tenantID, fixture.taskID])
    for (const [state, index] of [['unknown', 0], ['queued', 1], ['running', 2]] as const)
      await scratch.query('UPDATE platform_geo.generation_jobs SET state=$3 WHERE tenant_id=$1 AND id=$2', [fixture.tenantID, pending[index].id, state])
    const status = async () => (await tasks.list('', 1)).items.find((item) => item.id === fixture.taskID)?.generation_state
    assert.equal(await status(), 'running')
    await scratch.query("UPDATE platform_geo.generation_jobs SET state='failed' WHERE tenant_id=$1 AND id=$2", [fixture.tenantID, pending[2].id])
    assert.equal(await status(), 'queued')
    await scratch.query("UPDATE platform_geo.generation_jobs SET state='failed' WHERE tenant_id=$1 AND id=$2", [fixture.tenantID, pending[1].id])
    assert.equal(await status(), 'unknown')
    await scratch.query("UPDATE platform_geo.generation_jobs SET state='failed' WHERE tenant_id=$1 AND id=$2", [fixture.tenantID, pending[0].id])
    assert.equal(await status(), 'failed')
    assert.equal((await tasks.list('', 1)).items.find((item) => item.id === fixture.englishTaskID)?.generation_state, 'succeeded')
  }
  checks.push('Three-way tenant isolation: foreign task/article/job reads and task-name filters are empty, and foreign JSON plan references do not inflate the owning tenant plan count.')
  checks.push('Actual job aggregation prioritizes running, queued, unknown, failed, then succeeded; newly saved tasks initially report idle.')
} catch (error) { failure = error instanceof Error ? error : new Error('Unexpected verification failure.') }
finally {
  await scratch?.end()
  if (created) { await admin.query(`DROP DATABASE ${identifier(database)} WITH (FORCE)`); dropped = true }
  absent = (await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount === 0
  after = await baseline()
  await source.end(); await admin.end()
  await mkdir(evidence, { recursive: true })
  const unchanged = JSON.stringify(before) === JSON.stringify(after)
  const report = { passed: !failure && created && dropped && absent && unchanged, database, schemaOnlyClone: true,
    actualAIRequests: 0, actualSourceRequests: 0, actualCustomerPublications: 0, payloadImported: false, schemaPush: false,
    applicationReadOnlyConnection: true, applicationTablesUnchanged: unchanged, fixtureTenants: statistics, checks,
    baselineBefore: before, baselineAfter: after, ...(failure ? { failure: { name: failure.name, message: failure.message } } : {}), verifiedAt: new Date().toISOString() }
  await writeFile(`${evidence}/list-postgres-verification.json`, JSON.stringify(report, null, 2))
  await writeFile(`${evidence}/list-scratch-cleanup.json`, JSON.stringify({ database, created, dropped, confirmedAbsent: absent,
    applicationTablesUnchanged: unchanged, verifiedAt: new Date().toISOString() }, null, 2))
  console.log(JSON.stringify({ passed: report.passed, database, checks, dropped, confirmedAbsent: absent,
    applicationTablesUnchanged: unchanged, ...(failure ? { failure: failure.message } : {}) }, null, 2))
}
if (failure) throw new Error(`GEO list SQL verification failed: ${failure.message}`)
assert.ok(created && dropped && absent, 'Scratch database cleanup is incomplete.')
assert.deepEqual(after, before, 'Application table counts/fingerprints changed during verification.')
