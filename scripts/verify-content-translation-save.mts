/** Reproduce partial tenant localization using real Payload and a disposable PostgreSQL database. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const database = process.env.NOVASITE_CONTENT_TEST_DB || ''
const originalDatabaseURL = process.env.DATABASE_URL || ''
const url = new URL(originalDatabaseURL)
const previewWorker = process.argv.includes('--preview-worker')
const resumeWorker = process.argv.includes('--resume-worker') || previewWorker
const liveKey = process.argv.includes('--live-assistant') ? process.env.DEEPSEEK_API_KEY : undefined
if (process.argv.includes('--live-assistant') && !liveKey) throw new Error('Live assistant check requires a configured provider.')
if (url.hostname !== '127.0.0.1' || !/^novasite_content_verify_[0-9]+$/.test(database) || url.pathname === '/' + database)
  throw new Error('Use an explicitly named, empty local scratch database.')
url.pathname = '/' + database
process.env.DATABASE_URL = url.toString()
process.env.NODE_ENV = resumeWorker ? 'production' : 'development'
process.env.PRODUCT_TRANSLATION_QUEUE_ENABLED = resumeWorker ? 'true' : 'false'
process.env.DEEPSEEK_API_KEY = 'fixture-only'

const { getPayload, ValidationError } = await import('payload')
const { default: config } = await import('../src/payload.config')
const payload = await getPayload({ config })
const { pool } = payload.db as unknown as import('@payloadcms/db-postgres').PostgresAdapter
const { productTranslationSchemaSQL } = await import('../src/migrations/20260930_030000_product_translation_jobs')
const { translationRetryScheduleSQL } = await import('../src/migrations/20261108_020000_translation_retry_schedule')
const { translationUsageSchemaSQL } = await import('../src/migrations/20261001_020000_translation_usage')
const { queueContentTranslations, contentTranslationViews } = await import('../src/platform/content-translation/jobs')
const { contentTaskKey } = await import('../src/platform/content-translation/resources')
const { runOneProductTranslation, queueProductTranslations, productTranslationViews } = await import('../src/platform/product-translation/jobs')
const { parseTranslationReview, retryReviewedTranslation } = await import('../src/platform/product-translation/review')
const { fieldTranslationPreview, parseFieldPreview, pruneFieldTranslationPreviews, runOneFieldTranslationPreview } =
  await import('../src/platform/product-translation/field-preview')
const { fieldTranslationPreviewsSQL } = await import('../src/migrations/20261108_030000_field_translation_previews')
const { translationAssistantSQL } = await import('../src/migrations/20261109_010000_translation_assistant')
if (resumeWorker) {
  let calls = 0
  globalThis.fetch = async (input, init) => {
    if (!String(input).startsWith('https://api.deepseek.com/')) return new Response(null, { status: 204 })
    calls++
    if (!previewWorker) throw new Error('Unexpected provider call in replacement worker')
    const { messages } = JSON.parse(String(init?.body))
    const { fields } = JSON.parse(messages[1].content)
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        translations: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, 'English ' + value])),
      }) } }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    })
  }
  try {
    assert.equal(await (previewWorker ? runOneFieldTranslationPreview(payload) : runOneProductTranslation(payload)), true)
    assert.equal(calls, previewWorker ? 1 : 0)
  } finally { await payload.destroy() }
  process.exit(0)
}
try {
  const tenant = await payload.create({ collection: 'tenants', locale: 'zh', data: {
    name: '测试公司', slug: 'fixture-' + randomUUID(), defaultLocale: 'zh', enabledLocales: ['zh','en'],
    branding: { companyName: '中文公司', tagline: '源标语' },
    fixedPages: {
      homepage: { strengthItems: [{ value: '12', label: '能力' }] },
      about: { title: '关于我们', modules: [{ title: '企业', description: '介绍' }] },
    },
  } })
  await assert.rejects(() => payload.update({
    collection: 'tenants', id: tenant.id, locale: 'en', fallbackLocale: false,
    data: { fixedPages: { about: { title: 'About us' } } },
  }), (error: unknown) => {
    assert.ok(error instanceof ValidationError)
    console.log('字段校验基线', error.data?.errors.map(({ path }) => path))
    assert.ok(error.data?.errors.some(({ path }) => path === 'branding.companyName'))
    assert.ok(error.data?.errors.some(({ path }) => path === 'fixedPages.homepage.strengthItems.0.label'))
    return true
  })
  await pool.query(productTranslationSchemaSQL)
  await pool.query(translationRetryScheduleSQL)
  await pool.query(translationUsageSchemaSQL)
  const user = await payload.create({ collection: 'users', data: {
    email: 'translation-review@example.test', password: randomUUID(), roles: ['super-admin'],
  } })
  // Confirm worker scope cannot waive a required field in the translated module.
  const { withTenantTranslationWrite } = await import('../src/platform/content-translation/tenant-validation')
  const seedReq = {} as import('payload').PayloadRequest
  const english = await payload.findByID({ collection: 'tenants', id: tenant.id, locale: 'en', fallbackLocale: false })
  await assert.rejects(() => withTenantTranslationWrite(seedReq, { tenantID: tenant.id, resource: 'about', locale: 'en' }, () =>
    payload.update({ collection: 'tenants', id: tenant.id, locale: 'en', fallbackLocale: false, req: seedReq,
      data: { fixedPages: { about: { title: 'Human title', modules: english.fixedPages?.about?.modules?.map((row) => ({ ...row, title: 'Human module', description: '' })) } } } }),
  ), (error: unknown) => {
    assert.ok(error instanceof ValidationError)
    assert.deepEqual(error.data?.errors.map(({ path }) => path), ['fixedPages.about.modules.0.description'])
    return true
  })
  // Recreate the production column constraints and apply the actual migration.
  await pool.query(`
    ALTER TABLE public.tenants_locales ALTER COLUMN branding_company_name SET NOT NULL;
    ALTER TABLE public.tenants_fixed_pages_homepage_strength_items_locales ALTER COLUMN label SET NOT NULL;
    ALTER TABLE public.tenants_fixed_pages_about_modules_locales ALTER COLUMN title SET NOT NULL, ALTER COLUMN description SET NOT NULL;
  `)
  const tenantBefore = await pool.query("SELECT to_jsonb(t) AS row FROM public.tenants_locales t ORDER BY id")
  const migration = await import('../src/migrations/20261108_010000_partial_tenant_locales')
  const { drizzle } = payload.db as unknown as import('@payloadcms/db-postgres').PostgresAdapter
  await drizzle.transaction(async (db) => migration.up({ db } as Parameters<typeof migration.up>[0]))
  assert.deepEqual((await pool.query("SELECT to_jsonb(t) AS row FROM public.tenants_locales t ORDER BY id")).rows, tenantBefore.rows)
  const readTarget = () => payload.findByID({ collection: 'tenants', id: tenant.id, locale: 'en', fallbackLocale: false,
    context: { skipContentTranslationOverlay: true } })
  const prior = await readTarget()
  assert.equal(prior.fixedPages?.about?.title ?? null, null)
  process.env.PRODUCT_TRANSLATION_QUEUE_ENABLED = 'true'
  const fetchOriginal = globalThis.fetch
  let modelCalls = 0
  let providerResponse: 'success' | 'timeout' | 'busy' | 'spanish-timeout' = 'success'
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /^https:\/\/api\.deepseek\.com\//)
    modelCalls++
    if (providerResponse === 'timeout') throw new Error('fixture connection reset')
    if (providerResponse === 'busy') return Response.json({}, { status: 429, headers: { 'Retry-After': '120' } })
    const { messages } = JSON.parse(String(init?.body))
    const { fields, targetLanguage } = JSON.parse(messages[1].content)
    if (providerResponse === 'spanish-timeout' && targetLanguage === 'Spanish') throw new Error('fixture connection reset')
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        translations: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, 'English ' + value])),
      }) } }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    })
  }
  try {
    const enqueue = async (resource: 'about' | 'settings' | 'homepage') => {
      const response = await queueContentTranslations({ payload, company: tenant, user, resource, ids: [tenant.id] })
      const result = await response.json()
      assert.equal(response.status, 202, JSON.stringify(result))
      return result.accepted[0].jobID as string
    }
    const jobID = await enqueue('about')
    // Fail the audit insert after the content write. Content and success must both roll back.
    await pool.query(`CREATE FUNCTION reject_fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='fixture save failure'; END $$;
      CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fixture_audit();`)
    assert.equal(await runOneProductTranslation(payload), true)
    assert.equal(modelCalls, 1)
    const failed = (await contentTranslationViews(payload, tenant, user, 'about', [tenant.id])).views[0]
    assert.equal(failed.status, 'failed')
    assert.equal(failed.jobID, jobID)
    assert.match(failed.languages[0].message || '', /保存失败/)
    assert.equal((await readTarget()).fixedPages?.about?.title ?? null, null)
    await pool.query('DROP TRIGGER reject_fixture_audit ON public.audit_logs')
    assert.equal(await enqueue('about'), jobID)
    assert.equal(await runOneProductTranslation(payload), true)
    assert.equal(modelCalls, 1, 'Saved translation must be reused without another call')
    const result = await readTarget()
    assert.match(result.fixedPages?.about?.title || '', /^English /)
    assert.equal(result.branding?.companyName ?? null, null)
    assert.equal(result.fixedPages?.homepage?.strengthItems?.[0]?.label ?? null, null)
    assert.equal(result.fixedPages?.about?.modules?.[0]?.id, prior.fixedPages?.about?.modules?.[0]?.id)
    assert.equal((await contentTranslationViews(payload, tenant, user, 'about', [tenant.id])).views[0].status, 'completed')
    const source = await payload.findByID({ collection: 'tenants', id: tenant.id, locale: 'zh', fallbackLocale: false })
    assert.equal(source.fixedPages?.about?.title, '关于我们')
    const humanReq = {} as import('payload').PayloadRequest
    await withTenantTranslationWrite(humanReq, { tenantID: tenant.id, resource: 'settings', locale: 'en' }, () =>
      payload.update({ collection: 'tenants', id: tenant.id, locale: 'en', fallbackLocale: false, req: humanReq,
        data: { branding: { companyName: 'Manual brand' } } }),
    )
    await enqueue('settings')
    assert.equal(await runOneProductTranslation(payload), true)
    await enqueue('homepage')
    assert.equal(await runOneProductTranslation(payload), true)
    const completed = await readTarget()
    assert.equal(completed.branding?.companyName, 'Manual brand')
    assert.match(completed.branding?.tagline || '', /^English /)
    assert.match(completed.fixedPages?.homepage?.strengthItems?.[0]?.label || '', /^English /)
    assert.equal(completed.fixedPages?.about?.title, result.fixedPages?.about?.title)
    const category = await payload.create({ collection: 'product-categories', locale: 'zh', data: {
      name: '设备', slug: 'fixture-category', tenant: tenant.id,
    } })
    const product = await payload.create({ collection: 'products', locale: 'zh', draft: true, data: {
      tenant: tenant.id, category: category.id, title: '配电设备', slug: 'fixture-product', summary: '用于工厂',
    } })
    const enqueueProduct = async () => {
      const response = await queueProductTranslations({ payload, company: tenant, user, productIDs: [product.id] })
      const result = await response.json()
      assert.equal(response.status, 202, JSON.stringify(result))
      return result.accepted[0].jobID as string
    }
    const productJobID = await enqueueProduct()
    await pool.query('CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fixture_audit()')
    const callsBeforeProduct = modelCalls
    assert.equal(await runOneProductTranslation(payload), true)
    assert.ok(modelCalls > callsBeforeProduct)
    const callsAfterProduct = modelCalls
    assert.equal((await pool.query('SELECT status FROM platform_jobs.product_translation WHERE id=$1', [productJobID])).rows[0].status, 'failed')
    await pool.query('DROP TRIGGER reject_fixture_audit ON public.audit_logs')
    assert.equal(await enqueueProduct(), productJobID)
    assert.equal(await runOneProductTranslation(payload), true)
    assert.equal(modelCalls, callsAfterProduct)
    assert.equal((await pool.query('SELECT status FROM platform_jobs.product_translation WHERE id=$1', [productJobID])).rows[0].status, 'completed')
    const makeDraft = (slug: string) => payload.create({ collection: 'products', locale: 'zh', draft: true, data: {
      tenant: tenant.id, category: category.id, title: '配电设备', slug, summary: '用于工厂',
    } })
    const submit = (id: number) => queueProductTranslations({ payload, company: tenant, user, productIDs: [id] })
    const accepted = async (id: number) => {
      const response = await submit(id)
      assert.equal(response.status, 202)
      return (await response.json()).accepted[0].jobID as string
    }
    const getJob = async (id: string) => (await pool.query(
      'SELECT status,next_run_at,states FROM platform_jobs.product_translation WHERE id=$1', [id],
    )).rows[0]
    const makeDue = (id: string) => pool.query(`
      UPDATE platform_jobs.product_translation SET next_run_at=now()-interval '1 second',
        states=jsonb_set(states,'{en,retryAt}',to_jsonb(now()-interval '1 second'))
      WHERE id=$1`, [id])

    const transientDraft = await makeDraft('fixture-transient')
    const transientID = await accepted(transientDraft.id)
    await pool.query(`CREATE OR REPLACE FUNCTION reject_fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION USING ERRCODE='55P03', MESSAGE='fixture temporary lock error'; END $$;
      CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fixture_audit();`)
    await runOneProductTranslation(payload)
    const scheduled = await getJob(transientID)
    assert.equal(scheduled.status, 'queued')
    assert.ok(new Date(scheduled.next_run_at).getTime() - Date.now() > 25_000)
    assert.equal(scheduled.states.en.retryCount, 1)
    const scheduledModelCalls = modelCalls
    assert.equal(await runOneProductTranslation(payload), false)
    assert.equal(modelCalls, scheduledModelCalls)
    await pool.query('DROP TRIGGER reject_fixture_audit ON public.audit_logs')
    await makeDue(transientID)
    await promisify(execFile)(process.execPath, [
      ...process.execArgv, 'scripts/verify-content-translation-save.mts', '--resume-worker',
    ], { env: { ...process.env, DATABASE_URL: originalDatabaseURL }, timeout: 45_000 })
    assert.equal((await getJob(transientID)).status, 'completed')
    assert.equal(modelCalls, scheduledModelCalls)
    console.log('自动恢复：保存锁超时后延时入队，到期前不领取，到期后复用译文保存。')

    const busyDraft = await makeDraft('fixture-provider-busy')
    const busyID = await accepted(busyDraft.id)
    providerResponse = 'busy'
    const initialBusyCalls = modelCalls
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await makeDue(busyID)
      assert.equal(await runOneProductTranslation(payload), true)
      assert.equal(modelCalls, initialBusyCalls + attempt + 1)
      const job = await getJob(busyID)
      assert.equal(job.states.en.retryCount, Math.min(attempt + 1, 3))
      if (attempt < 3) {
        assert.equal(job.status, 'queued')
        assert.ok(new Date(job.next_run_at).getTime() - Date.now() > 115_000)
      } else {
        assert.equal(job.status, 'failed')
        assert.equal(job.next_run_at, null)
      }
    }
    assert.equal(await runOneProductTranslation(payload), false)
    console.log('AI 繁忙：遵守 Retry-After，同一错误三次后台重试用尽后停下。')

    const uncertainDraft = await makeDraft('fixture-uncertain')
    const uncertainID = await accepted(uncertainDraft.id)
    providerResponse = 'timeout'
    const callsBeforeTimeout = modelCalls
    assert.equal(await runOneProductTranslation(payload), true)
    assert.equal(modelCalls, callsBeforeTimeout + 1)
    const uncertain = await getJob(uncertainID)
    assert.equal(uncertain.states.en.code, 'PROVIDER_UNCERTAIN')
    assert.equal(uncertain.next_run_at, null)
    assert.equal((await submit(uncertainDraft.id)).status, 409)

    const crashDraft = await makeDraft('fixture-crash')
    const crashID = await accepted(crashDraft.id)
    await pool.query(`UPDATE platform_jobs.product_translation SET status='running',lease_until=now()-interval '1 second',
      lease_owner=$2,states='{"en":{"status":"running","providerInFlight":true}}'::jsonb WHERE id=$1`, [crashID, randomUUID()])
    providerResponse = 'success'
    assert.equal(await runOneProductTranslation(payload), true)
    assert.equal((await getJob(crashID)).states.en.code, 'PROVIDER_UNCERTAIN')
    assert.equal(modelCalls, callsBeforeTimeout + 1)
    console.log('结果待确认：发出后连接中断及派发中断租约回收均不重复调用。')
    const editor = await payload.create({ collection: 'users', data: {
      email: 'fixture-editor@example.test', password: randomUUID(), roles: ['editor'], tenants: [{ tenant: tenant.id }],
    } })
    const reviewer = await payload.create({ collection: 'users', data: {
      email: 'fixture-site-admin@example.test', password: randomUUID(), roles: ['site-admin'], tenants: [{ tenant: tenant.id }],
    } })
    const draftReview = (await productTranslationViews(payload, tenant, reviewer, [uncertainDraft.id])).views[0].review
    assert.ok(draftReview)
    assert.equal((await productTranslationViews(payload, tenant, editor, [uncertainDraft.id])).views[0].review, undefined)
    const form = { resource: 'products', documentID: uncertainDraft.id, ...draftReview }
    assert.throws(() => parseTranslationReview(form), { status: 422 })
    const input = parseTranslationReview({ ...form, acknowledged: true })
    await assert.rejects(() => retryReviewedTranslation(payload, tenant.id, editor, input), { status: 403 })
    await assert.rejects(() => retryReviewedTranslation(payload, tenant.id + 1, reviewer, input), { status: 403 })
    await assert.rejects(() => retryReviewedTranslation(payload, tenant.id + 1, user, input), { status: 409 })
    await assert.rejects(() => retryReviewedTranslation(payload, tenant.id, user, { ...input, documentID: crashDraft.id }), { status: 409 })
    await pool.query('CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION reject_fixture_audit()')
    await assert.rejects(() => retryReviewedTranslation(payload, tenant.id, reviewer, input))
    assert.equal((await getJob(uncertainID)).states.en.code, 'PROVIDER_UNCERTAIN')
    assert.equal((await getJob(uncertainID)).status, 'failed')
    await pool.query('DROP TRIGGER reject_fixture_audit ON public.audit_logs')
    const requests = await Promise.allSettled([
      retryReviewedTranslation(payload, tenant.id, reviewer, input),
      retryReviewedTranslation(payload, tenant.id, reviewer, input),
    ])
    assert.equal(requests.filter((result) => result.status === 'fulfilled').length, 1)
    const duplicate = requests.find((result) => result.status === 'rejected')
    assert.equal(duplicate?.reason.status, 409)
    assert.equal((await getJob(uncertainID)).status, 'queued')
    assert.equal(modelCalls, callsBeforeTimeout + 1, 'Confirmation queues work without calling the model')
    const audits = await pool.query(`SELECT metadata FROM public.audit_logs
      WHERE metadata->>'jobID'=$1 AND metadata->>'reviewRevision'=$2`, [uncertainID, input.revision])
    assert.equal(audits.rowCount, 1)
    assert.equal(audits.rows[0].metadata.actorID, reviewer.id)
    assert.deepEqual(audits.rows[0].metadata.locales, ['en'])
    assert.equal(await runOneProductTranslation(payload), true)
    assert.equal((await getJob(uncertainID)).status, 'completed')
    assert.equal(modelCalls, callsBeforeTimeout + 2)

    const oldReview = (await productTranslationViews(payload, tenant, user, [crashDraft.id])).views[0].review
    assert.ok(oldReview)
    await payload.update({ collection: 'products', id: crashDraft.id, locale: 'zh', draft: true, data: { title: '更新后的配电设备' } })
    await assert.rejects(() => retryReviewedTranslation(payload, tenant.id, user, {
      resource: 'products', documentID: crashDraft.id, ...oldReview,
    }), { status: 409 })
    assert.equal((await getJob(crashID)).status, 'failed')

    await payload.update({ collection: 'tenants', id: tenant.id, locale: 'zh', data: { fixedPages: { about: { title: '更新的公司介绍' } } } })
    const contentID = await enqueue('about')
    providerResponse = 'timeout'
    assert.equal(await runOneProductTranslation(payload), true)
    const contentReview = (await contentTranslationViews(payload, tenant, reviewer, 'about', [tenant.id])).views[0].review
    assert.equal(contentReview?.jobID, contentID)
    assert.ok(contentReview)
    await assert.rejects(() => retryReviewedTranslation(payload, tenant.id, reviewer, {
      resource: 'homepage', documentID: tenant.id, ...contentReview,
    }), { status: 409 })
    await retryReviewedTranslation(payload, tenant.id, reviewer, { resource: 'about', documentID: tenant.id, ...contentReview })
    providerResponse = 'success'
    assert.equal(await runOneProductTranslation(payload), true)
    assert.equal((await getJob(contentID)).status, 'completed')
    const multilingualTenant = await payload.update({ collection: 'tenants', id: tenant.id, locale: 'zh',
      data: { enabledLocales: ['zh', 'en', 'es'] } })
    const mixedDraft = await makeDraft('fixture-mixed-review')
    const mixedSubmit = await queueProductTranslations({ payload, company: multilingualTenant, user, productIDs: [mixedDraft.id] })
    assert.equal(mixedSubmit.status, 202)
    const mixedID = (await mixedSubmit.json()).accepted[0].jobID
    providerResponse = 'spanish-timeout'
    await runOneProductTranslation(payload)
    const mixedBefore = await getJob(mixedID)
    assert.equal(mixedBefore.status, 'partial')
    assert.equal(mixedBefore.states.en.status, 'succeeded')
    const mixedReview = (await productTranslationViews(payload, multilingualTenant, reviewer, [mixedDraft.id])).views[0].review
    assert.ok(mixedReview)
    assert.deepEqual(mixedReview.locales, ['es'])
    await retryReviewedTranslation(payload, tenant.id, reviewer, { resource: 'products', documentID: mixedDraft.id, ...mixedReview })
    assert.deepEqual((await getJob(mixedID)).states.en, mixedBefore.states.en)
    const mixedCalls = modelCalls
    providerResponse = 'success'
    await runOneProductTranslation(payload)
    assert.equal(modelCalls, mixedCalls + 1)
    assert.equal((await getJob(mixedID)).status, 'completed')
    console.log('部分完成：英语成功、西语结果不明时只重试西语，英语结果保留。')
    console.log('管理员确认：站点管理员可处理本公司任务；编辑员、跨公司、错误资源和过期源内容均被拒绝；并发仅一笔确认和审计。')
    await pool.query(fieldTranslationPreviewsSQL)
    const previewDraft = await makeDraft('fixture-field-preview')
    const fieldInput = { productID: previewDraft.id, field: 'title', sourceLocale: 'zh', targetLocale: 'en', text: '未保存的产品名称' }
    const lookup = (options = {}) => parseFieldPreview({ action: 'find', ...fieldInput, ...options })
    const generate = (options = {}) => parseFieldPreview({ action: 'generate', ...fieldInput, ...options })
    assert.equal(await fieldTranslationPreview(payload, tenant.id, user, lookup()), null)
    const previewRequests = await Promise.all([
      fieldTranslationPreview(payload, tenant.id, user, generate()),
      fieldTranslationPreview(payload, tenant.id, user, generate()),
    ])
    const previewID = previewRequests[0]?.id
    assert.ok(previewID)
    assert.equal(previewRequests[1]?.id, previewID)
    assert.equal(previewRequests[0]?.status, 'queued')
    assert.equal((await fieldTranslationPreview(payload, tenant.id, user, lookup({ text: '已保存的原文' })))?.status, 'queued')
    assert.equal(await fieldTranslationPreview(payload, tenant.id, editor, lookup()), null)
    await assert.rejects(() => fieldTranslationPreview(payload, tenant.id + 1, reviewer, lookup()), { status: 403 })
    await assert.rejects(() => fieldTranslationPreview(payload, tenant.id + 1, user, lookup()), { status: 404 })
    const otherDraft = await makeDraft('fixture-concurrency')
    const otherJob = await accepted(otherDraft.id)
    await pool.query(`UPDATE platform_jobs.product_translation SET status='running',lease_owner=$2,
      lease_until=now()+interval '90 seconds' WHERE id=$1`, [otherJob, randomUUID()])
    assert.equal(await runOneFieldTranslationPreview(payload), false)
    await pool.query("UPDATE platform_jobs.product_translation SET status='queued',lease_owner=NULL,lease_until=NULL WHERE id=$1", [otherJob])
    await pool.query(`UPDATE platform_jobs.field_translation_preview SET status='running',lease_owner=$2,
      lease_until=now()+interval '90 seconds' WHERE id=$1`, [previewID, randomUUID()])
    assert.equal(await runOneProductTranslation(payload), false)
    await pool.query("UPDATE platform_jobs.field_translation_preview SET status='queued',lease_owner=NULL,lease_until=NULL WHERE id=$1", [previewID])
    await promisify(execFile)(process.execPath, [
      ...process.execArgv, 'scripts/verify-content-translation-save.mts', '--preview-worker',
    ], { env: { ...process.env, DATABASE_URL: originalDatabaseURL }, timeout: 45_000 })
    const recoveredPreview = await fieldTranslationPreview(payload, tenant.id, user, lookup())
    assert.equal(recoveredPreview?.id, previewID)
    assert.equal(recoveredPreview?.status, 'succeeded')
    assert.equal(recoveredPreview?.translation, 'English 未保存的产品名称')
    const oldSourcePreview = await fieldTranslationPreview(payload, tenant.id, user, lookup({ text: '已保存的原文' }))
    assert.equal(oldSourcePreview?.matchesSource, false)
    assert.equal(oldSourcePreview?.original, fieldInput.text)
    assert.equal(await fieldTranslationPreview(payload, tenant.id, user, lookup({ field: 'summary' })), null)
    assert.equal((await payload.findByID({
      collection: 'products', id: previewDraft.id, locale: 'zh', draft: true, fallbackLocale: false,
    })).title, previewDraft.title)
    assert.equal((await payload.findByID({
      collection: 'products', id: previewDraft.id, locale: 'en', draft: true, fallbackLocale: false,
    })).title ?? null, null)
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM platform_jobs.translation_usage WHERE request_group=$1 AND tenant_id=$2', [previewID, tenant.id])).rows[0].total, 1)

    const regenerated = await fieldTranslationPreview(payload, tenant.id, user, generate({ previousID: previewID }))
    assert.notEqual(regenerated?.id, previewID)
    assert.equal((await fieldTranslationPreview(payload, tenant.id, user, generate({ previousID: previewID })))?.id, regenerated?.id)
    await pool.query(`UPDATE platform_jobs.field_translation_preview SET status='running',lease_owner=$2,
      lease_until=now()-interval '1 second',provider_in_flight=true WHERE id=$1`, [regenerated?.id, randomUUID()])
    const callsBeforePreviewRecovery = modelCalls
    assert.equal(await runOneFieldTranslationPreview(payload), false)
    assert.equal((await fieldTranslationPreview(payload, tenant.id, user, lookup()))?.status, 'unknown')
    assert.equal((await fieldTranslationPreview(payload, tenant.id, user, generate()))?.status, 'unknown')
    assert.equal(modelCalls, callsBeforePreviewRecovery)

    const retryInput = { ...fieldInput, action: 'retry-unknown', previousID: regenerated?.id, acknowledged: true }
    assert.throws(() => parseFieldPreview({ ...retryInput, acknowledged: false }), { status: 422 })
    await assert.rejects(() => fieldTranslationPreview(payload, tenant.id, editor, parseFieldPreview(retryInput)), { status: 409 })
    await assert.rejects(() => fieldTranslationPreview(payload, tenant.id, user,
      parseFieldPreview({ ...retryInput, text: '另一份原文' })), { status: 409 })
    const checkpoint = { 'detailSegments.0#0': 'Saved product title' }
    await pool.query("UPDATE platform_jobs.field_translation_preview SET checkpoint=$2::jsonb WHERE id=$1",
      [regenerated?.id, JSON.stringify(checkpoint)])
    const retries = await Promise.allSettled([0, 1].map(() =>
      fieldTranslationPreview(payload, tenant.id, user, parseFieldPreview(retryInput))))
    const acceptedRetries = retries.filter((result) => result.status === 'fulfilled')
    assert.equal(acceptedRetries.length, 1)
    assert.equal(retries.filter((result) => result.status === 'rejected' && result.reason.status === 409).length, 1)
    const retry = acceptedRetries[0].value
    assert.equal(retry?.status, 'queued')
    assert.notEqual(retry?.id, regenerated?.id)
    const previewRows = await pool.query(
      'SELECT id,status,checkpoint FROM platform_jobs.field_translation_preview WHERE id=ANY($1::uuid[])',
      [[regenerated?.id, retry?.id]],
    )
    assert.equal(previewRows.rows.find(({ id }) => id === regenerated?.id)?.status, 'unknown')
    assert.deepEqual(previewRows.rows.find(({ id }) => id === retry?.id)?.checkpoint, checkpoint)
    assert.equal(await runOneFieldTranslationPreview(payload), true)
    const resumedPreview = await fieldTranslationPreview(payload, tenant.id, user, lookup())
    assert.equal(resumedPreview?.status, 'succeeded')
    assert.equal(resumedPreview?.translation, 'Saved product title')
    assert.equal(modelCalls, callsBeforePreviewRecovery)

    await pool.query(translationAssistantSQL)
    assert.deepEqual(await fieldTranslationPreview(payload, tenant.id, user, lookup()), resumedPreview)
    const latestAssistant = parseFieldPreview({ field: 'assistant', action: 'latest' })
    const assistantInput = { field: 'assistant', action: 'generate', text: '本地测试：螺栓尺寸为 12 mm。', sourceLocale: 'zh', targetLocale: 'en' }
    const queueAssistant = (text = assistantInput.text) =>
      fieldTranslationPreview(payload, tenant.id, user, parseFieldPreview({ ...assistantInput, text }))
    assert.equal(await fieldTranslationPreview(payload, tenant.id, user, latestAssistant), null)
    const [assistant, duplicateAssistant] = await Promise.all([queueAssistant(), queueAssistant()])
    assert.equal(assistant?.status, 'queued')
    assert.equal(duplicateAssistant?.id, assistant?.id)
    assert.equal((await fieldTranslationPreview(payload, tenant.id, user, latestAssistant))?.id, assistant?.id)
    assert.equal(await fieldTranslationPreview(payload, tenant.id, editor, latestAssistant), null)
    assert.equal(await fieldTranslationPreview(payload, tenant.id + 1, user, latestAssistant), null)
    await assert.rejects(() => queueAssistant('另一段待译文字'), { status: 409 })
    if (liveKey) {
      process.env.DEEPSEEK_API_KEY = liveKey
      globalThis.fetch = fetchOriginal
    }
    assert.equal(await runOneFieldTranslationPreview(payload), true)
    const assistantResult = await fieldTranslationPreview(payload, tenant.id, user, latestAssistant)
    assert.equal(assistantResult?.id, assistant?.id)
    assert.equal(assistantResult?.status, 'succeeded', assistantResult?.message ?? undefined)
    assert.match(assistantResult?.translation ?? '', /12 mm/)
    console.log(`顶部助手：${liveKey ? '真实模型' : '模拟模型'}后台生成成功，重新读取找到同一任务和译文。`)
    await pool.query('DELETE FROM platform_jobs.field_translation_preview WHERE id=$1', [assistant?.id])

    await pool.query("UPDATE platform_jobs.field_translation_preview SET expires_at=now()-interval '1 second' WHERE id=ANY($1::uuid[])", [[previewID, regenerated?.id, retry?.id]])
    assert.equal(await fieldTranslationPreview(payload, tenant.id, user, lookup()), null)
    await pruneFieldTranslationPreviews(payload)
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM platform_jobs.field_translation_preview')).rows[0].total, 0)
    console.log('单字段预览：独立进程完成，刷新可找回；按账号、公司、字段和原文隔离；未改产品，调用用量可查，过期记录已清理。')
    console.log('单字段预览待确认：仅原账号和原文可确认；并发只入队一次，保留原记录和暂存进度。')
    console.log('通过：产品保存失败后复用原任务及译文，完成时不再调用模型。')
    console.log('通过：迁移保留既有记录；三个模块分开保存；手工译文、源语言及行 ID 保留；审计失败回滚内容，重新入队后不重复调用模型。')

    const resource = 'product-categories'
    const ids: number[] = []
    for (let index = 0; index < 51; index++) {
      const item = await payload.create({ collection: resource, locale: 'zh',
        data: { tenant: tenant.id, name: `分类 ${index + 1}`, slug: `bulk-fixture-${index + 1}` } })
      ids.push(item.id)
    }
    const keys = ids.map((id) => contentTaskKey(resource, id))
    const rows = async () => (await pool.query(
      'SELECT id,product_id,status FROM platform_jobs.product_translation WHERE tenant_id=$1 AND product_id=ANY($2::int[]) ORDER BY product_id',
      [tenant.id, keys],
    )).rows
    const batch = (selected: number[]) => queueContentTranslations({ payload, company: tenant, user, resource, ids: selected })
    assert.equal((await rows()).length, 0)
    assert.equal((await batch([...ids, 60_000_000])).status, 404)
    assert.equal((await rows()).length, 0, 'Failure on the last item rolls back the whole batch')
    const response = await batch(ids)
    assert.equal(response.status, 202)
    const firstReceipt = await response.json()
    const committed = await rows()
    assert.equal(committed.length, 51)
    assert.deepEqual(new Set(committed.map((row) => row.id)), new Set(firstReceipt.accepted.map((item: { jobID: string }) => item.jobID)))
    const replay = await (await batch(ids)).json()
    assert.deepEqual(replay.accepted, firstReceipt.accepted.map((item: object) => ({ ...item, existing: true })))
    assert.deepEqual(await rows(), committed)
    assert.equal((await contentTranslationViews(payload, tenant, user, resource, [ids[50]])).views[0].locked, true)
    console.log('批量入队：末尾无效项使整批回滚 0/51；一次确认 51/51，重复提交复用原任务；第 51 项可重新查到。')
  } finally { globalThis.fetch = fetchOriginal }
} finally { await payload.destroy() }

process.exit(0)
