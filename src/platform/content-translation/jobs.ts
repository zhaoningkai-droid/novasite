import { randomUUID } from 'node:crypto'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { APIError, type Payload, type PayloadRequest } from 'payload'
import { NextResponse } from 'next/server'
import { userHasRole } from '@/access/roles'
import type { Tenant, User } from '@/payload-types'
import { companyTranslationTargets, isSiteLocale, type SiteLocale } from '../site-locales'
import type { LanguageTranslationState, ProductTranslationView } from '../product-translation/job-view'
import { translateProductContent } from '../product-translation/provider'
import { buildContentSnapshot, contentFingerprint, objectValue, setValueAt, tenantTranslationWrite, translatedContentPatch, type ContentSnapshot } from './content'
import { contentTaskKey, translationResources, type TranslationResource } from './resources'
import { syncNavigationItems } from '../navigation-sync'
import { sortedNavigation } from '../navigation-model'
import {
  durableTranslationProgress,
  finishTranslationJob,
  resetTranslationFailures,
  resumableTranslationJob,
  shouldWorkOnTranslation,
  translationFailure,
  translationReview,
  uncertainTranslation,
  uncertainTranslationMessage,
  type TranslationStage,
} from '../product-translation/recovery'
import { withTenantTranslationWrite } from './tenant-validation'
import { translationUsageReady, translationJobMeter } from '../translation-usage/budget'
import type { TranslationAdmission, TranslationSubmission } from '../product-translation/submission'

const pool = (payload: Payload) => (payload.db as unknown as PostgresAdapter).pool
export const contentQueueEnabled = () => process.env.PRODUCT_TRANSLATION_QUEUE_ENABLED === 'true'
export const relationID = (value: unknown) => Number(typeof value === 'object' && value ? objectValue(value).id : value)
export function contentTransaction(req: Partial<PayloadRequest> & { payload: Payload }) {
  const session = req.transactionID && req.payload.db.sessions?.[String(req.transactionID)]?.db
  if (!session) throw new APIError('内容保存事务暂不可用，请稍后重试。', 503)
  return session as Pick<PostgresAdapter['drizzle'], 'execute'>
}
type State = LanguageTranslationState & { overlay?: Array<{ path: Array<string | number>; value: unknown }> }
export type ContentJob = {
  id: string; tenant_id: number; product_id: number; actor_id: number
  source_locale: SiteLocale; source_hash: string; targets: SiteLocale[]
  source: ContentSnapshot; states: Record<string, State>; status: string; lease_owner: string | null; next_run_at?: Date | string | null; review_revision?: string; admission_revision?: string
}
export async function contentQueueAvailable(payload: Payload) {
  if (!contentQueueEnabled()) return false
  return (await pool(payload).query("SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('platform_jobs.product_translation') AND attname='next_run_at' AND NOT attisdropped) AS ready")).rows[0]?.ready === true
}

export const contentSourceLocale = (resource: TranslationResource, company: Tenant): SiteLocale => resource === 'navigation-items' ? 'zh' : company.defaultLocale
export const contentTargetLocales = (resource: TranslationResource, company: Tenant): SiteLocale[] => resource === 'navigation-items'
  ? [...new Set(company.enabledLocales || [])].filter((locale) => isSiteLocale(locale) && locale !== 'zh') as SiteLocale[]
  : companyTranslationTargets(company)

export async function readContentSource(payload: Payload, company: Tenant, user: User, resource: TranslationResource, id: number, req?: Partial<PayloadRequest>) {
  const definition = translationResources[resource]
  let document: Record<string, unknown> | undefined
  if (definition.collection === 'tenants') {
    if (id !== company.id) throw new APIError('内容不属于当前公司。', 403)
    document = await payload.findByID({ collection: 'tenants', id, depth: 0, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, user, req, context: { skipContentTranslationOverlay: true } }) as unknown as Record<string, unknown>
  } else if (resource === 'navigation-items') {
    const result = await payload.find({ collection: 'site-navigation', depth: 0, limit: 1, overrideAccess: false, user, req,
      where: { and: [{ tenant: { equals: company.id } }, { localeCode: { equals: 'zh' } }] } })
    const matches = (result.docs[0]?.items || []).filter((item) => item.translationKey === id)
    if (matches.length !== 1) throw new APIError('未找到当前公司的导航栏目，请先保存。', 404)
    document = matches[0] as unknown as Record<string, unknown>
  } else if (resource === 'navigation') {
    if (id !== company.id) throw new APIError('导航不属于当前公司。', 403)
    const result = await payload.find({ collection: 'site-navigation', depth: 0, locale: company.defaultLocale, fallbackLocale: false, limit: 1, sort: '-updatedAt', overrideAccess: false, user, req, context: { skipContentTranslationOverlay: true }, where: { and: [{ tenant: { equals: company.id } }, { localeCode: { equals: company.defaultLocale } }] } })
    document = result.docs[0] as unknown as Record<string, unknown> | undefined
    if (document) document = { ...document, title: document.title || '主导航' }
    else {
      const tenant = await payload.findByID({ collection: 'tenants', id: company.id, depth: 0, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, user, req, context: { skipContentTranslationOverlay: true } })
      const footer = objectValue(tenant.fixedPages?.footer)
      document = { title: '主导航', tenant: company.id, localeCode: company.defaultLocale, items: tenant.siteNavigation || [], quickLinks: footer.quickLinks || [], footerIntro: footer.intro || '' }
    }
  } else {
    const result = await payload.find({ collection: definition.collection, depth: 0, draft: true, locale: company.defaultLocale, fallbackLocale: false, limit: 1, overrideAccess: false, user, req, context: { skipContentTranslationOverlay: true }, where: { and: [{ id: { equals: id } }, { tenant: { equals: company.id } }] } })
    document = result.docs[0] as unknown as Record<string, unknown> | undefined
  }
  if (!document) throw new APIError(`未找到当前公司的${definition.label}源内容，请先保存默认语言内容。`, 404)
  if (resource !== 'navigation' && resource !== 'navigation-items' && contentQueueEnabled()) {
    const overlays = await contentOverlays(payload, company.id, definition.collection, id, company.defaultLocale, document._status === 'draft')
    for (const item of overlays) {
      let current: unknown = document
      for (const key of item.path) current = current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined
      if (current === item.sourceValue) {
        setValueAt(document, item.path, item.value)
      }
    }
  }
  const snapshot = buildContentSnapshot(resource, id, document, payload.collections[definition.collection].config.fields)
  return { document, snapshot, fingerprint: contentFingerprint(snapshot, contentSourceLocale(resource, company)) }
}

async function jobsFor(payload: Payload, companyID: number, resource: TranslationResource, ids: number[], req?: Partial<PayloadRequest>) {
  const keys = ids.map((id) => contentTaskKey(resource, id))
  if (req?.transactionID) {
    const result = await contentTransaction({ ...req, payload }).execute(sql`SELECT *,updated_at::text AS admission_revision FROM platform_jobs.product_translation WHERE tenant_id=${companyID} AND product_id IN (${sql.join(keys.map((key) => sql`${key}`), sql`,`)}) ORDER BY created_at DESC`) as { rows: ContentJob[] }
    return result.rows
  }
  return (await pool(payload).query('SELECT *,extract(epoch from updated_at)::text AS review_revision FROM platform_jobs.product_translation WHERE tenant_id=$1 AND product_id=ANY($2::int[]) ORDER BY created_at DESC', [companyID, keys])).rows as ContentJob[]
}
function successfulLocales(jobs: ContentJob[], fingerprint: string, sourceLocale: SiteLocale) {
  const completed = new Set<SiteLocale>()
  for (const job of jobs) if (job.source_hash === fingerprint && job.source_locale === sourceLocale)
    for (const locale of job.targets) if (job.states[locale]?.status === 'succeeded') completed.add(locale)
  return completed
}
export async function contentTranslationViews(payload: Payload, company: Tenant, user: User, resource: TranslationResource, ids: number[]) {
  const enabled = await contentQueueAvailable(payload)
  const targets = contentTargetLocales(resource, company)
  if (!ids.length) return { enabled, views: [] as ProductTranslationView[], activeCount: 0 }
  const jobs = enabled ? await jobsFor(payload, company.id, resource, ids) : []
  const views: ProductTranslationView[] = []
  for (const id of ids) {
    const fresh = await readContentSource(payload, company, user, resource, id)
    const own = jobs.filter((job) => job.product_id === contentTaskKey(resource, id))
    const completed = successfulLocales(own, fresh.fingerprint, contentSourceLocale(resource, company))
    const active = own.find((job) => job.status === 'queued' || job.status === 'running')
    const last = active || own.find((job) => job.source_hash === fresh.fingerprint)
    const languages = targets.map((locale) => ({ locale, status: completed.has(locale) ? 'succeeded' as const : last?.states[locale]?.status || 'queued' as const, message: last?.states[locale]?.message }))
    const count = languages.filter((item) => item.status === 'succeeded').length
    const failed = languages.some((item) => item.status === 'failed')
    const needsAction = Boolean(last && uncertainTranslation(last, fresh.fingerprint, targets.filter((locale) => !completed.has(locale))))
    const retryAt = active?.next_run_at ? new Date(active.next_run_at).toISOString() : undefined
    const review = active ? undefined : translationReview(last, fresh.fingerprint, targets, user, company.id)
    views.push({ productID: id, jobID: last?.id, locked: Boolean(active), retryAt, needsAction, review, canTranslate: Boolean(targets.length && !active && !needsAction && count < targets.length && fresh.snapshot.entries.some((item) => item.value.trim())), completed: count, total: targets.length, languages, status: active ? active.status as 'queued' | 'running' : targets.length && count === targets.length ? 'completed' : failed ? count ? 'partial' : 'failed' : 'pending' })
  }
  return { enabled, views, activeCount: views.filter((view) => view.locked).length }
}

export async function queueContentTranslations({ payload, company, user, resource, ids }: { payload: Payload; company: Tenant; user: User; resource: TranslationResource; ids: number[] }) {
  if (!canWork(user, company.id, resource)) return NextResponse.json({ message: '当前账号没有修改这个模块的权限，未提交翻译任务。' }, { status: 403 })
  if (!(await contentQueueAvailable(payload))) return NextResponse.json({ message: '后台翻译任务尚未启用。' }, { status: 503 })
  if (!process.env.DEEPSEEK_API_KEY) return NextResponse.json({ message: 'AI翻译服务尚未配置。' }, { status: 503 })
  if (!(await translationUsageReady(payload))) return NextResponse.json({ message: '翻译用量记录暂不可用，请联系管理员。' }, { status: 503 })
  const targets = contentTargetLocales(resource, company)
  if (!targets.length) return NextResponse.json({ message: '请先在站点与模板中启用目标语言站点。' }, { status: 422 })
  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null) return NextResponse.json({ message: '任务保存事务暂不可用。' }, { status: 503 })
  const req = { payload, transactionID, user } as PayloadRequest
  const accepted: TranslationAdmission[] = []
  const skipped: number[] = []
  const skipReasons: TranslationSubmission['skipReasons'] = {}
  const previousRevisions: Record<string, string> = {}
  try {
    const transaction = contentTransaction(req)
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(57291, ${company.id})`)
    for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
      const own = await jobsFor(payload, company.id, resource, [id], req)
      const active = own.find((job) => job.status === 'queued' || job.status === 'running')
      if (active) { accepted.push({ productID: id, jobID: active.id, existing: true }); continue }
      const fresh = await readContentSource(payload, company, user, resource, id, req)
      if (!fresh.snapshot.entries.some((item) => item.value.trim())) { skipped.push(id); skipReasons[id] = 'no_source'; continue }
      if (JSON.stringify(fresh.snapshot.content).length > 250_000) throw new APIError('文字内容超过任务处理上限。', 422)
      const completed = successfulLocales(own, fresh.fingerprint, contentSourceLocale(resource, company))
      const pending = targets.filter((locale) => !completed.has(locale))
      if (!pending.length) { skipped.push(id); skipReasons[id] = 'completed'; continue }
      if (own.some((job) => uncertainTranslation(job, fresh.fingerprint, pending)))
        throw new APIError(uncertainTranslationMessage, 409)
      const resume = resumableTranslationJob(own, fresh.fingerprint, contentSourceLocale(resource, company), pending)
      if (resume) {
        await transaction.execute(sql`UPDATE platform_jobs.product_translation SET status='queued',actor_id=${user.id},next_run_at=NULL,states=${JSON.stringify(resetTranslationFailures(resume))}::jsonb,updated_at=clock_timestamp() WHERE id=${resume.id}::uuid AND tenant_id=${company.id}`)
        previousRevisions[resume.id] = resume.admission_revision!
        accepted.push({ productID: id, jobID: resume.id })
        continue
      }
      const jobID = randomUUID()
      const states = Object.fromEntries(pending.map((locale) => [locale, { status: 'queued' }]))
      await transaction.execute(sql`INSERT INTO platform_jobs.product_translation(id,tenant_id,product_id,actor_id,source_locale,source_hash,targets,source,states,status) VALUES (${jobID}::uuid,${company.id},${contentTaskKey(resource, id)},${user.id},${contentSourceLocale(resource, company)},${fresh.fingerprint},${JSON.stringify(pending)}::jsonb,${JSON.stringify(fresh.snapshot)}::jsonb,${JSON.stringify(states)}::jsonb,'queued')`)
      accepted.push({ productID: id, jobID: jobID })
    }
    await payload.db.commitTransaction(transactionID)
    if (accepted.length) {
      const confirmed = await pool(payload).query(`SELECT id FROM platform_jobs.product_translation WHERE tenant_id=$1 AND id=ANY($2::uuid[])
         AND updated_at IS DISTINCT FROM ($3::jsonb ->> id::text)::timestamptz`, [company.id, accepted.map((item) => item.jobID), JSON.stringify(previousRevisions)])
      if (confirmed.rowCount !== accepted.length) throw new APIError('翻译任务保存尚未确认，请刷新后重试。', 503)
    }
    return NextResponse.json({ accepted, skipped, skipReasons }, { status: accepted.length ? 202 : 200 })
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    return NextResponse.json({ message: error instanceof APIError ? error.message : '翻译任务提交失败，请稍后重试。' }, { status: error instanceof APIError ? error.status : 500 })
  }
}

export function canWork(user: User, companyID: number, resource: TranslationResource) {
  if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) return false
  // Tenant settings already require siteAdmins. Do not spend AI credits on a
  // task whose actor cannot save its result under the existing collection ACL.
  if (['tenants', 'site-navigation'].includes(translationResources[resource].collection)
    && !userHasRole(user, ['super-admin', 'site-admin'])) return false
  return userHasRole(user, ['super-admin']) || (userHasRole(user, ['site-admin', 'editor']) && Boolean(user.tenants?.some((item) => relationID(item.tenant) === companyID)))
}
async function saveNavigation(payload: Payload, company: Tenant, user: User, locale: SiteLocale, write: Record<string, unknown>, req: PayloadRequest, context: Record<string, unknown>) {
  const existing = await payload.find({ collection: 'site-navigation', depth: 0, limit: 1, sort: '-updatedAt', overrideAccess: false, user, req, where: { and: [{ tenant: { equals: company.id } }, { localeCode: { equals: locale } }] } })
  const source = await payload.find({ collection: 'site-navigation', depth: 0, limit: 1, sort: '-updatedAt', overrideAccess: false, user, req, where: { and: [{ tenant: { equals: company.id } }, { localeCode: { equals: company.defaultLocale } }] } })
  const document = objectValue(source.docs[0])
  const data = { title: String(write.title || document.title || '主导航'), tenant: company.id, localeCode: locale, footerIntro: String(write.footerIntro || ''), items: (write.items || document.items || []) as NonNullable<import('@/payload-types').SiteNavigation['items']>, quickLinks: (write.quickLinks || document.quickLinks || []) as NonNullable<import('@/payload-types').SiteNavigation['quickLinks']> }
  // Array row IDs belong to a language document, so preserve link values but generate new IDs.
  const stripIDs = (value: unknown): unknown => Array.isArray(value) ? value.map(stripIDs) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id').map(([key, item]) => [key, stripIDs(item)])) : value
  const clean = stripIDs(data) as typeof data
  if (existing.docs[0]) await payload.update({ collection: 'site-navigation', id: existing.docs[0].id, data: clean, context, overrideAccess: false, user, req })
  else await payload.create({ collection: 'site-navigation', data: clean, context, overrideAccess: false, user, req })
}

async function saveNavigationItem(payload: Payload, company: Tenant, user: User, locale: SiteLocale, id: number,
  write: Record<string, unknown>, req: PayloadRequest, context: Record<string, unknown>) {
  const result = await payload.find({ collection: 'site-navigation', depth: 0, pagination: false,
    overrideAccess: false, user, req, where: { tenant: { equals: company.id } } })
  const source = result.docs.find((doc) => doc.localeCode === 'zh')
  const target = result.docs.find((doc) => doc.localeCode === locale)
  if (!source) throw new APIError('中文导航已不存在，未覆盖译文。', 409)
  const synced = syncNavigationItems(source.items || [], target?.items || [])
  const index = synced.findIndex((item) => Number(item.translationKey) === id)
  if (index < 0) throw new APIError('导航栏目已不存在，未覆盖译文。', 409)
  const old = synced[index]
  const children = Array.isArray(write.children) ? write.children.map((raw, at) => {
    const item = objectValue(raw)
    const previous = (Array.isArray(old.children) ? old.children : []).map(objectValue)[at]
    return { label: String(item.label || ''), href: String(item.href || ''), ...(previous?.id ? { id: previous.id } : {}) }
  }) : []
  synced[index] = { ...old, label: String(write.label || old.label), children }
  const items = sortedNavigation(synced.map((item) => ({ ...item, sortOrder: Number(item.sortOrder || 0) }))) as NonNullable<import('@/payload-types').SiteNavigation['items']>
  const data = { title: target?.title || '主导航', tenant: company.id, localeCode: locale,
    footerIntro: target?.footerIntro || '', quickLinks: target?.quickLinks || [], items }
  if (target) await payload.update({ collection: 'site-navigation', id: target.id, data, context, overrideAccess: false, user, req })
  else await payload.create({ collection: 'site-navigation', data, context, overrideAccess: false, user, req })
}

/** Uses the same global/per-company lease scheduler as products. */
export async function runContentTranslationJob(payload: Payload, job: ContentJob) {
  const owner = job.lease_owner!
  const abort = new AbortController()
  // Never renew an expired lease; otherwise a delayed heartbeat can revive an
  // old worker after the scheduler has allowed another task for this company.
  const heartbeat = setInterval(() => { void pool(payload).query("UPDATE platform_jobs.product_translation SET lease_until=clock_timestamp()+interval '90 seconds',updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_until>clock_timestamp()", [job.id, owner]).then((result) => { if (!result.rowCount) abort.abort() }).catch(() => abort.abort()) }, 20_000)
  const saveStates = async () => {
    const result = await pool(payload).query("UPDATE platform_jobs.product_translation SET states=$3::jsonb,updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_until>clock_timestamp()", [job.id, owner, JSON.stringify(job.states)])
    if (!result.rowCount) { abort.abort(); throw new Error('LEASE_LOST') }
  }
  try {
    const resource = job.source.resource
    const definition = translationResources[resource]
    if (!definition) {
      for (const locale of job.targets) job.states[locale] = { status: 'failed', code: 'INVALID_RESOURCE', message: '翻译任务内容类型无效。' }
      await finishTranslationJob(pool(payload), job)
      return true
    }
    for (const locale of job.targets) {
      abort.signal.throwIfAborted()
      if (!shouldWorkOnTranslation(job.states[locale])) continue
      let stage: TranslationStage = 'prepare'
      try {
        if (job.states[locale]?.providerInFlight) {
          stage = 'provider'
          throw new Error('Unconfirmed provider dispatch')
        }
        const [company, user] = await Promise.all([
          payload.findByID({ collection: 'tenants', id: job.tenant_id, depth: 0, overrideAccess: true, context: { skipContentTranslationOverlay: true } }),
          payload.findByID({ collection: 'users', id: job.actor_id, depth: 0, overrideAccess: true }),
        ])
        if (!canWork(user, company.id, resource)) throw new APIError('账号已失去当前公司的编辑权限。', 403)
        if (contentSourceLocale(resource, company) !== job.source_locale || !contentTargetLocales(resource, company).includes(locale)) throw new APIError('站点语言设置已改变，本次没有覆盖译文。', 409)
        job.states[locale] = { ...job.states[locale], status: 'running', retryAt: undefined, message: undefined, code: undefined }; await saveStates()
        const currentSource = await readContentSource(payload, company, user, resource, job.source.documentID)
        if (currentSource.fingerprint !== job.source_hash) throw new APIError('源内容已修改，请重新提交翻译。', 409)
        stage = 'provider'
        const translated = job.states[locale].prepared || await translateProductContent(job.source.content, job.source_locale, locale, process.env.DEEPSEEK_API_KEY || '', process.env.DEEPSEEK_MODEL || 'deepseek-flash', { signal: abort.signal, checkpoint: job.states[locale].checkpoint, meter: translationJobMeter(payload, job), context: `${definition.label}; Company: ${company.name}; ${job.source.entries.filter((entry) => ['title', 'summary', 'question', 'intro'].includes(String(entry.path.at(-1)))).map((entry) => entry.value).join(' ').slice(0, 1200)}`, ...durableTranslationProgress(job.states, locale, saveStates) })
        stage = 'save'
        job.states[locale] = { ...job.states[locale], prepared: translated, stage }
        await saveStates()
        const transactionID = await payload.db.beginTransaction()
        if (transactionID === null) throw new APIError('译文保存事务暂不可用。', 503)
        const req = { payload, transactionID, user } as PayloadRequest
        try {
          const transaction = contentTransaction(req)
          await transaction.execute(sql`SELECT pg_advisory_xact_lock(57291, ${company.id})`)
          const lease = await transaction.execute(sql`SELECT id FROM platform_jobs.product_translation WHERE id=${job.id}::uuid AND lease_owner=${owner}::uuid AND status='running' AND lease_until>clock_timestamp() FOR UPDATE`) as { rows: unknown[] }
          if (!lease.rows.length) throw new Error('LEASE_LOST')
          const actor = await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true, req })
          const currentCompany = await payload.findByID({ collection: 'tenants', id: company.id, depth: 0, overrideAccess: true, req, context: { skipContentTranslationOverlay: true } })
          if (!canWork(actor, company.id, resource)) throw new APIError('账号已失去编辑权限。', 403)
          if (contentSourceLocale(resource, currentCompany) !== job.source_locale || !contentTargetLocales(resource, currentCompany).includes(locale)) throw new APIError('站点语言设置已改变。', 409)
          req.user = actor
          const fresh = await readContentSource(payload, currentCompany, actor, resource, job.source.documentID, req)
          if (fresh.fingerprint !== job.source_hash) throw new APIError('源内容已修改，本次没有覆盖译文。', 409)
          const patch = translatedContentPatch(job.source, translated)
          const context = { disableRevalidate: true, workspaceContentTranslationJobID: job.id, workspaceContentTranslationLease: owner, skipContentTranslationOverlay: true }
          if (resource === 'navigation-items') await saveNavigationItem(payload, currentCompany, actor, locale, job.source.documentID, patch.write, req, context)
          else if (resource === 'navigation') await saveNavigation(payload, currentCompany, actor, locale, patch.write, req, context)
          else if (resource === 'homepage' || resource === 'about' || resource === 'settings') {
            const target = await payload.findByID({ collection: 'tenants', id: company.id, locale, fallbackLocale: false, depth: 0, overrideAccess: false, user: actor, req, context })
            const write = tenantTranslationWrite(job.source, patch.write, objectValue(target))
            if (!write) throw new APIError('目标语言的模块结构已变化，请检查模块后重试。', 409)
            if (Object.keys(write).length) {
              await withTenantTranslationWrite(req, { tenantID: company.id, resource, locale }, () =>
                payload.update({ collection: 'tenants', id: company.id, data: write, locale, fallbackLocale: false, context, overrideAccess: false, user: actor, req }),
              )
            }
          }
          else if (Object.keys(patch.write).length) await payload.update({ collection: definition.collection, id: job.source.documentID, data: patch.write, locale, ...(payload.collections[definition.collection].config.versions && (payload.collections[definition.collection].config.versions as { drafts?: unknown }).drafts ? { draft: fresh.document._status !== 'published' } : {}), context, overrideAccess: false, user: actor, req })
          await payload.create({ collection: 'audit-logs', data: { action: 'update', collection: definition.collection, documentId: String(job.source.documentID), actorEmail: actor.email, summary: `content-translation:v1:${company.id}:${resource}:${job.source_locale}:${job.source_hash}`, metadata: { companyID: company.id, resource, targets: [locale], sourceLocale: job.source_locale, jobID: job.id } }, overrideAccess: true, user: actor, req })
          const savedStates = { ...job.states, [locale]: { status: 'succeeded' as const, overlay: patch.overlay } }
          await transaction.execute(sql`UPDATE platform_jobs.product_translation SET states=${JSON.stringify(savedStates)}::jsonb,updated_at=now() WHERE id=${job.id}::uuid AND lease_owner=${owner}::uuid`)
          try {
            await payload.db.commitTransaction(transactionID)
            const confirmed = await pool(payload).query("SELECT id FROM platform_jobs.product_translation WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_until>clock_timestamp() AND states->($3::text)->>'status'='succeeded'", [job.id, owner, locale])
            if (!confirmed.rowCount) throw new Error('SAVE_NOT_CONFIRMED')
          } catch (error) {
            // The database state, not a speculative in-memory success, decides
            // whether a replacement worker resumes or skips this locale.
            abort.abort()
            throw error
          }
          job.states = savedStates
        } catch (error) { await payload.db.rollbackTransaction(transactionID); throw error }
      } catch (error) {
        if (abort.signal.aborted || (error instanceof Error && error.message === 'LEASE_LOST')) throw error
        job.states[locale] = { ...job.states[locale], ...translationFailure(payload, error, stage, job.id, job.tenant_id, locale, job.states[locale] || { status: 'queued' }) }
        await saveStates()
      }
    }
    await finishTranslationJob(pool(payload), job)
  } catch (error) {
    if (!abort.signal.aborted && !(error instanceof Error && error.message === 'LEASE_LOST')) throw error
  } finally { clearInterval(heartbeat) }
  return true
}

export async function activeContentJobs(payload: Payload, tenantID: number, req: PayloadRequest) {
  const result = await contentTransaction(req).execute(sql`SELECT * FROM platform_jobs.product_translation WHERE tenant_id=${tenantID} AND product_id<0 AND status IN ('queued','running')`) as { rows: ContentJob[] }
  return result.rows
}
export async function contentOverlays(payload: Payload, tenantID: number, collection: string, documentID: number, locale: SiteLocale, includeDraft = false) {
  const resources = Object.entries(translationResources).filter(([, value]) => value.collection === collection).map(([resource]) => resource as TranslationResource)
  if (!resources.length) return []
  const jobs = await pool(payload).query("SELECT source,states FROM platform_jobs.product_translation WHERE tenant_id=$1 AND product_id=ANY($2::int[]) AND states->($3::text)->>'status'='succeeded' AND ($4::boolean OR COALESCE(source->>'draft','false')!='true') ORDER BY created_at DESC", [tenantID, resources.map((resource) => contentTaskKey(resource, documentID)), locale, includeDraft])
  const seen = new Set<string>()
  const overlays: Array<{ path: Array<string | number>; value: unknown; sourceValue: unknown }> = []
  for (const job of jobs.rows) {
    const resource = String(job.source?.resource || '')
    if (seen.has(resource)) continue
    seen.add(resource)
    for (const item of job.states?.[locale]?.overlay || []) if (Array.isArray(item.path)) {
      const source = job.source.entries?.find((entry: { path: Array<string | number> }) => JSON.stringify(entry.path) === JSON.stringify(item.path))
      if (source) overlays.push({ ...item, sourceValue: source.value })
    }
  }
  return overlays
}
