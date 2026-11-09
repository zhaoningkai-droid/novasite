import { randomUUID } from 'node:crypto'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import {
  APIError,
  type Payload,
  type PayloadRequest,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
} from 'payload'
import { NextResponse } from 'next/server'

import type { Tenant, User } from '@/payload-types'
import { userHasRole } from '@/access/roles'
import { companyTranslationTargets, isSiteLocale, type SiteLocale } from '../site-locales'
import {
  productTranslationFingerprint,
  productTranslationMarker,
  fingerprintFromProductTranslationMarker,
} from '../product-translation'
import { sourceFrom, mergeHTML, localizedProductData, localizedSpecificationData } from './content'
import { translateProductContent } from './provider'
import type { LanguageTranslationState, ProductTranslationView } from './job-view'
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
} from './recovery'
import { translationUsageReady, translationJobMeter } from '../translation-usage/budget'
import type { TranslationAdmission, TranslationSubmission } from './submission'

export const translationQueueEnabled = () =>
  process.env.PRODUCT_TRANSLATION_QUEUE_ENABLED === 'true'
const db = (payload: Payload) => (payload.db as unknown as PostgresAdapter).pool
const transactionDB = (req: Pick<PayloadRequest, 'payload' | 'transactionID'>) => {
  const session = req.transactionID && req.payload.db.sessions?.[String(req.transactionID)]?.db
  if (!session) throw new APIError('产品保存事务暂不可用，请稍后重试。', 503)
  return session as Pick<PostgresAdapter['drizzle'], 'execute'>
}
export async function translationQueueAvailable(payload: Payload) {
  if (!translationQueueEnabled()) return false
  const result = await db(payload).query(
    "SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('platform_jobs.product_translation') AND attname='next_run_at' AND NOT attisdropped) AS ready",
  )
  return result.rows[0]?.ready === true
}

export async function readTranslationSource(
  payload: Payload,
  company: Tenant,
  user: User,
  productID: number,
  req?: Partial<PayloadRequest>,
) {
  const sourceLocale = company.defaultLocale
  const [products, specs] = await Promise.all([
    payload.find({
      collection: 'products',
      depth: 0,
      draft: true,
      fallbackLocale: false,
      limit: 1,
      locale: sourceLocale,
      overrideAccess: false,
      user,
      req,
      where: { and: [{ id: { equals: productID } }, { tenant: { equals: company.id } }] },
    }),
    payload.find({
      collection: 'product-specifications',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      user,
      req,
      where: {
        and: [
          { product: { equals: productID } },
          { tenant: { equals: company.id } },
          { localeCode: { equals: sourceLocale } },
        ],
      },
    }),
  ])
  const product = products.docs[0]
  if (!product) throw new APIError('未找到当前公司的产品。', 404)
  const specification = specs.docs[0]
  const source = sourceFrom(
    product as unknown as Record<string, unknown>,
    (specification as unknown as Record<string, unknown>) || null,
  )
  return {
    product,
    specification,
    source,
    fingerprint: productTranslationFingerprint(sourceLocale, source.fingerprintSource),
  }
}

export async function completedTranslationLocales(
  payload: Payload,
  company: Tenant,
  productID: number,
  fingerprint: string,
  req?: Partial<PayloadRequest>,
) {
  const marker = productTranslationMarker(company.id, company.defaultLocale, fingerprint)
  const audits = await payload.find({
    collection: 'audit-logs',
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
    where: {
      and: [
        { collection: { equals: 'products' } },
        { documentId: { equals: String(productID) } },
        { summary: { equals: marker } },
      ],
    },
  })
  const completed = new Set<SiteLocale>()
  for (const audit of audits.docs) {
    if (fingerprintFromProductTranslationMarker(audit.summary) !== fingerprint) continue
    const metadata = audit.metadata as { companyID?: number; targets?: unknown } | null
    if (metadata?.companyID !== company.id || !Array.isArray(metadata.targets)) continue
    metadata.targets.forEach((locale) => {
      if (typeof locale === 'string' && isSiteLocale(locale)) completed.add(locale)
    })
  }
  return completed
}

type JobRow = {
  id: string
  tenant_id: number
  product_id: number
  actor_id: number
  source_locale: SiteLocale
  source_hash: string
  targets: SiteLocale[]
  source: ReturnType<typeof sourceFrom>
  states: Record<string, LanguageTranslationState>
  status: string
  lease_owner: string | null
  next_run_at?: Date | string | null
  review_revision?: string
  admission_revision?: string
}

export async function queueProductTranslations({
  company,
  payload,
  user,
  productIDs,
}: {
  company: Tenant
  payload: Payload
  user: User
  productIDs: number[]
}) {
  if (!(await translationQueueAvailable(payload)))
    return NextResponse.json(
      { message: '后台翻译任务尚未启用，请联系管理员完成配置。' },
      { status: 503 },
    )
  if (!process.env.DEEPSEEK_API_KEY)
    return NextResponse.json({ message: 'AI翻译服务尚未配置。' }, { status: 503 })
  if (!(await translationUsageReady(payload)))
    return NextResponse.json({ message: '翻译用量记录暂不可用，请联系管理员。' }, { status: 503 })
  const targets = companyTranslationTargets(company)
  if (!targets.length)
    return NextResponse.json(
      { message: '请先在站点与模板中启用至少一个目标语言站点。' },
      { status: 422 },
    )
  const transactionID = await payload.db.beginTransaction()
  if (transactionID === null)
    return NextResponse.json({ message: '任务保存事务暂不可用，请重试。' }, { status: 503 })
  const req = { payload, transactionID, user } as PayloadRequest
  const accepted: TranslationAdmission[] = []
  const skipped: number[] = []
  const skipReasons: TranslationSubmission['skipReasons'] = {}
  const previousRevisions: Record<string, string> = {}
  try {
    const transaction = transactionDB(req)
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(57291, ${company.id})`)
    for (const productID of [...new Set(productIDs)].sort((a, b) => a - b)) {
      const active = (await transaction.execute(
        sql`SELECT id FROM platform_jobs.product_translation WHERE tenant_id=${company.id} AND product_id=${productID} AND status IN ('queued','running') LIMIT 1`,
      )) as { rows: Array<{ id: string }> }
      if (active.rows[0]) {
        accepted.push({ productID, jobID: active.rows[0].id, existing: true })
        continue
      }
      const snapshot = await readTranslationSource(payload, company, user, productID, req)
      if (JSON.stringify(snapshot.source.content).length > 250_000)
        throw new APIError('所选产品文字超过任务处理上限，请联系管理员处理。', 422)
      const completed = await completedTranslationLocales(
        payload,
        company,
        productID,
        snapshot.fingerprint,
        req,
      )
      const pending = targets.filter((locale) => !completed.has(locale))
      if (!pending.length) {
        skipped.push(productID)
        skipReasons[productID] = 'completed'
        continue
      }
      const previous = (await transaction.execute(sql`
        SELECT id,tenant_id,lease_owner,status,source_hash,source_locale,targets,states,updated_at::text AS admission_revision FROM platform_jobs.product_translation
        WHERE tenant_id=${company.id} AND product_id=${productID} AND source_hash=${snapshot.fingerprint}
          AND status IN ('failed','partial') ORDER BY created_at DESC LIMIT 1
      `)) as { rows: JobRow[] }
      if (previous.rows.some((job) => uncertainTranslation(job, snapshot.fingerprint, pending)))
        throw new APIError(uncertainTranslationMessage, 409)
      const resume = resumableTranslationJob(previous.rows, snapshot.fingerprint, company.defaultLocale, pending)
      if (resume) {
        await transaction.execute(sql`UPDATE platform_jobs.product_translation SET status='queued',actor_id=${user.id},next_run_at=NULL,states=${JSON.stringify(resetTranslationFailures(resume))}::jsonb,updated_at=clock_timestamp() WHERE id=${resume.id}::uuid AND tenant_id=${company.id}`)
        previousRevisions[resume.id] = resume.admission_revision!
        accepted.push({ productID, jobID: resume.id })
        continue
      }
      const states = Object.fromEntries(pending.map((locale) => [locale, { status: 'queued' }]))
      const id = randomUUID()
      await transaction.execute(
        sql`INSERT INTO platform_jobs.product_translation(id,tenant_id,product_id,actor_id,source_locale,source_hash,targets,source,states,status) VALUES (${id}::uuid,${company.id},${productID},${user.id},${company.defaultLocale},${snapshot.fingerprint},${JSON.stringify(pending)}::jsonb,${JSON.stringify(snapshot.source)}::jsonb,${JSON.stringify(states)}::jsonb,'queued')`,
      )
      accepted.push({ productID, jobID: id })
    }
    await payload.db.commitTransaction(transactionID)
    // The adapter may return after a transaction failure. Only acknowledge
    // durable task IDs; the browser can safely retry the same source revision.
    if (accepted.length) {
      const confirmed = await db(payload).query(
        `SELECT id FROM platform_jobs.product_translation WHERE tenant_id=$1 AND id=ANY($2::uuid[])
         AND updated_at IS DISTINCT FROM ($3::jsonb ->> id::text)::timestamptz`,
        [company.id, accepted.map((item) => item.jobID), JSON.stringify(previousRevisions)],
      )
      if (confirmed.rowCount !== accepted.length)
        throw new APIError('翻译任务保存尚未确认，请刷新后重试。', 503)
    }
    return NextResponse.json(
      {
        accepted,
        skipped,
        skipReasons,
        message: accepted.length
          ? `已提交 ${accepted.length} 个产品，后台会继续翻译；其他产品可正常操作。`
          : '所选产品的当前语言站点已经完成翻译，源内容没有变化。',
      },
      { status: accepted.length ? 202 : 200 },
    )
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID)
    if (error instanceof APIError)
      return NextResponse.json({ message: error.message }, { status: error.status })
    return NextResponse.json({ message: '任务提交未完成，请刷新后重试。' }, { status: 500 })
  }
}

export async function productTranslationViews(
  payload: Payload,
  company: Tenant,
  user: User,
  productIDs: number[],
) {
  const available = await translationQueueAvailable(payload)
  const targets = companyTranslationTargets(company)
  const views: ProductTranslationView[] = []
  const jobs: JobRow[] = available
    ? (
        await db(payload).query(
          'SELECT id,product_id,source_hash,states,status,next_run_at,targets,extract(epoch from updated_at)::text AS review_revision FROM platform_jobs.product_translation WHERE tenant_id=$1 AND product_id=ANY($2::int[]) ORDER BY created_at DESC',
          [company.id, productIDs],
        )
      ).rows
    : []
  for (const productID of productIDs) {
    const snapshot = await readTranslationSource(payload, company, user, productID)
    const completed = await completedTranslationLocales(
      payload,
      company,
      productID,
      snapshot.fingerprint,
    )
    const active = jobs.find(
      (job) => job.product_id === productID && ['queued', 'running'].includes(job.status),
    )
    const last =
      active ||
      jobs.find((job) => job.product_id === productID && job.source_hash === snapshot.fingerprint)
    const languages = targets.map((locale) => ({
      locale,
      status: completed.has(locale)
        ? ('succeeded' as const)
        : last?.states[locale]?.status || ('queued' as const),
      message: last?.states[locale]?.message,
    }))
    const count = languages.filter((item) => item.status === 'succeeded').length
    const failed = languages.some((item) => item.status === 'failed')
    const needsAction = Boolean(last && uncertainTranslation(last, snapshot.fingerprint, targets.filter((locale) => !completed.has(locale))))
    views.push({
      productID,
      jobID: last?.id,
      locked: Boolean(active),
      retryAt: active?.next_run_at ? new Date(active.next_run_at).toISOString() : undefined,
      needsAction,
      review: active ? undefined : translationReview(last, snapshot.fingerprint, targets, user, company.id),
      canTranslate: Boolean(targets.length && !active && count < targets.length && !needsAction),
      completed: count,
      total: targets.length,
      languages,
      status: active
        ? (active.status as 'queued' | 'running')
        : targets.length && count === targets.length
          ? 'completed'
          : failed
            ? count
              ? 'partial'
              : 'failed'
            : 'pending',
    })
  }
  const activeCount = available
    ? Number(
        (
          await db(payload).query(
            "SELECT count(*) FROM platform_jobs.product_translation WHERE tenant_id=$1 AND status IN ('queued','running')",
            [company.id],
          )
        ).rows[0].count,
      )
    : 0
  return { enabled: available, views, activeCount }
}

/** Enqueue and every product write share a short transaction lock, never an AI request lock. */
async function assertUnlocked(
  req: PayloadRequest,
  productID: number,
  tenantID: number,
  context?: Record<string, unknown>,
) {
  if (!translationQueueEnabled()) return
  const transaction = transactionDB(req)
  await transaction.execute(sql`SELECT pg_advisory_xact_lock(57291, ${tenantID})`)
  const active = (await transaction.execute(
    sql`SELECT id,lease_owner FROM platform_jobs.product_translation WHERE tenant_id=${tenantID} AND product_id=${productID} AND status IN ('queued','running') LIMIT 1`,
  )) as { rows: Array<{ id: string; lease_owner: string | null }> }
  const job = active.rows[0]
  if (
    job &&
    !(
      job.lease_owner &&
      job.id === context?.productTranslationJobID &&
      job.lease_owner === context?.productTranslationLease
    )
  )
    throw new APIError(
      '这个产品正在排队或翻译中，请完成后再编辑、删除或重复翻译。其他产品不受影响。',
      409,
    )
}
const relationID = (value: unknown): number =>
  Number(value && typeof value === 'object' ? (value as { id?: unknown }).id : value)
export const guardProductTranslationChange: CollectionBeforeChangeHook = async ({
  req,
  data,
  originalDoc,
  operation,
  context,
}) => {
  if (operation === 'update' && originalDoc)
    await assertUnlocked(req, Number(originalDoc.id), relationID(originalDoc.tenant), context)
  return data
}
export const guardProductTranslationDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  if (!translationQueueEnabled()) return
  const product = await req.payload.findByID({
    collection: 'products',
    id,
    depth: 0,
    overrideAccess: false,
    req,
  })
  await assertUnlocked(req, Number(id), relationID(product.tenant), req.context)
}
export const guardSpecificationTranslationChange: CollectionBeforeChangeHook = async ({
  req,
  data,
  originalDoc,
  context,
  operation,
}) => {
  if (!translationQueueEnabled()) return data
  const productID = relationID(data.product || originalDoc?.product)
  if (Number.isSafeInteger(productID) && productID > 0) {
    const product = await req.payload.findByID({
      collection: 'products',
      id: productID,
      depth: 0,
      overrideAccess: false,
      req,
    })
    const tenantID = relationID(product.tenant)
    const suppliedTenant = relationID(data.tenant || originalDoc?.tenant)
    if (Number.isSafeInteger(suppliedTenant) && suppliedTenant !== tenantID)
      throw new APIError('参数关联的产品不属于当前公司。', 403)
    await assertUnlocked(req, productID, tenantID, context)
  }
  if (operation === 'update' && originalDoc?.id && relationID(originalDoc.product) !== productID)
    await assertUnlocked(
      req,
      relationID(originalDoc.product),
      relationID(originalDoc.tenant),
      context,
    )
  return data
}
export const guardSpecificationTranslationDelete: CollectionBeforeDeleteHook = async ({
  req,
  id,
}) => {
  if (!translationQueueEnabled()) return
  const specification = await req.payload.findByID({
    collection: 'product-specifications',
    id,
    depth: 0,
    overrideAccess: false,
    req,
  })
  await assertUnlocked(
    req,
    relationID(specification.product),
    relationID(specification.tenant),
    req.context,
  )
}

export function actorCanWork(user: User, companyID: number) {
  if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) return false
  return (
    userHasRole(user, ['super-admin']) ||
    (userHasRole(user, ['site-admin', 'editor']) &&
      Boolean(user.tenants?.some((item) => relationID(item.tenant) === companyID)))
  )
}
async function claimJob(payload: Payload): Promise<JobRow | null> {
  const client = await db(payload).connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(57292,0)')
    const previewTable = (await client.query(
      "SELECT to_regclass('platform_jobs.field_translation_preview') IS NOT NULL AS ready",
    )).rows[0]?.ready
    const previewRunning = previewTable
      ? " + (SELECT count(*) FROM platform_jobs.field_translation_preview WHERE status='running' AND lease_until>clock_timestamp())"
      : ''
    const active = Number(
      (
        await client.query(
          "SELECT count(*)" + previewRunning + " AS count FROM platform_jobs.product_translation WHERE status='running' AND lease_until>clock_timestamp()",
        )
      ).rows[0].count,
    )
    if (active >= 2) {
      await client.query('COMMIT')
      return null
    }
    const claimed = await client.query(
      `WITH candidate AS (
      SELECT q.id FROM platform_jobs.product_translation q
      WHERE ((q.status='queued' AND (q.next_run_at IS NULL OR q.next_run_at<=clock_timestamp())) OR (q.status='running' AND (q.lease_until IS NULL OR q.lease_until<=clock_timestamp())))
      AND NOT EXISTS (SELECT 1 FROM platform_jobs.product_translation r WHERE r.tenant_id=q.tenant_id AND r.status='running' AND r.lease_until>clock_timestamp())
      ${previewTable ? "AND NOT EXISTS (SELECT 1 FROM platform_jobs.field_translation_preview p WHERE p.tenant_id=q.tenant_id AND p.status='running' AND p.lease_until>clock_timestamp())" : ''}
      ORDER BY q.created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE platform_jobs.product_translation q SET status='running',lease_owner=$1::uuid,lease_until=clock_timestamp()+interval '90 seconds',updated_at=now()
      FROM candidate WHERE q.id=candidate.id RETURNING q.*`,
      [randomUUID()],
    )
    await client.query('COMMIT')
    return claimed.rows[0] || null
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function runOneProductTranslation(payload: Payload) {
  if (!(await translationQueueAvailable(payload))) return false
  const job = await claimJob(payload)
  if (!job) return false
  if ((job.source as unknown as { kind?: string }).kind === 'workspace-content') {
    const { runContentTranslationJob } = await import('../content-translation/jobs')
    return runContentTranslationJob(payload, job as unknown as import('../content-translation/jobs').ContentJob)
  }
  const owner = job.lease_owner!
  const abort = new AbortController()
  const heartbeat = setInterval(() => {
    void db(payload)
      .query(
        // An expired worker cannot revive its lease while a successor is claiming work.
        "UPDATE platform_jobs.product_translation SET lease_until=clock_timestamp()+interval '90 seconds',updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_until>clock_timestamp()",
        [job.id, owner],
      )
      .then((result) => {
        if (!result.rowCount) abort.abort()
      })
      .catch(() => abort.abort())
  }, 20_000)
  const saveStates = async () => {
    const result = await db(payload).query(
      "UPDATE platform_jobs.product_translation SET states=$3::jsonb,updated_at=now() WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_until>clock_timestamp()",
      [job.id, owner, JSON.stringify(job.states)],
    )
    if (!result.rowCount) {
      abort.abort()
      throw new Error('LEASE_LOST')
    }
  }
  try {
    for (const locale of job.targets) {
      abort.signal.throwIfAborted()
      if (!shouldWorkOnTranslation(job.states[locale])) continue
      let stage: TranslationStage = 'prepare'
      try {
        if (job.states[locale]?.providerInFlight) {
          stage = 'provider'
          throw new Error('Unconfirmed provider dispatch')
        }
        const currentCompany = await payload.findByID({
          collection: 'tenants',
          id: job.tenant_id,
          depth: 0,
          overrideAccess: true,
        })
        if (
          currentCompany.defaultLocale !== job.source_locale ||
          !companyTranslationTargets(currentCompany).includes(locale)
        )
          throw new APIError('站点语言设置已改变，本次未覆盖译文。', 409)
        const currentActor = await payload.findByID({
          collection: 'users',
          id: job.actor_id,
          depth: 0,
          overrideAccess: true,
        })
        const company = currentCompany
        if (!actorCanWork(currentActor, company.id))
          throw new APIError('账号已失去当前公司的编辑权限。', 403)
        job.states[locale] = {
          ...job.states[locale],
          status: 'running',
          retryAt: undefined,
          message: undefined,
          code: undefined,
        }
        await saveStates()
        const currentSource = await readTranslationSource(payload, currentCompany, currentActor, job.product_id)
        if (currentSource.fingerprint !== job.source_hash)
          throw new APIError('源内容已修改，请重新提交翻译。', 409)
        stage = 'provider'
        const translated = job.states[locale].prepared || await translateProductContent(
          job.source.content,
          job.source_locale,
          locale,
          process.env.DEEPSEEK_API_KEY || '',
          process.env.DEEPSEEK_MODEL || 'deepseek-flash',
          {
            signal: abort.signal,
            checkpoint: job.states[locale].checkpoint,
            meter: translationJobMeter(payload, job),
            context: `Company: ${company.name}`,
            ...durableTranslationProgress(job.states, locale, saveStates),
          },
        )
        stage = 'save'
        job.states[locale] = { ...job.states[locale], prepared: translated, stage }
        await saveStates()
        const transactionID = await payload.db.beginTransaction()
        if (transactionID === null) throw new APIError('译文保存事务暂不可用。', 503)
        const req = { payload, transactionID, user: currentActor } as PayloadRequest
        try {
          const transaction = transactionDB(req)
          await transaction.execute(sql`SELECT pg_advisory_xact_lock(57291, ${company.id})`)
          const lease = (await transaction.execute(
            sql`SELECT id FROM platform_jobs.product_translation WHERE id=${job.id}::uuid AND lease_owner=${owner}::uuid AND status='running' AND lease_until>clock_timestamp() FOR UPDATE`,
          )) as { rows: unknown[] }
          if (!lease.rows.length) throw new Error('LEASE_LOST')
          const savingActor = await payload.findByID({
            collection: 'users',
            id: currentActor.id,
            depth: 0,
            overrideAccess: true,
            req,
          })
          if (!actorCanWork(savingActor, company.id))
            throw new APIError('账号已失去当前公司的编辑权限，本次未覆盖译文。', 403)
          req.user = savingActor
          const freshCompany = await payload.findByID({
            collection: 'tenants',
            id: company.id,
            depth: 0,
            overrideAccess: true,
            req,
          })
          if (
            freshCompany.defaultLocale !== job.source_locale ||
            !companyTranslationTargets(freshCompany).includes(locale)
          )
            throw new APIError('站点语言设置已经改变，本次未覆盖译文。', 409)
          const fresh = await readTranslationSource(
            payload,
            freshCompany,
            savingActor,
            job.product_id,
            req,
          )
          if (fresh.fingerprint !== job.source_hash)
            throw new APIError('产品源内容已经改变，本次未覆盖译文。', 409)
          const html = mergeHTML(
            job.source.html.parts,
            job.source.html.edges,
            translated.detailSegments,
          )
          const context = {
            workspaceProductTranslation: true,
            productTranslationJobID: job.id,
            productTranslationLease: owner,
          }
          await payload.update({
            collection: 'products',
            id: job.product_id,
            locale,
            draft: fresh.product._status !== 'published',
            data: localizedProductData(
              fresh.product as unknown as Record<string, unknown>,
              translated,
              html,
            ),
            context,
            overrideAccess: false,
            user: savingActor,
            req,
          })
          if (translated.specificationSet && fresh.specification) {
            const existing = await payload.find({
              collection: 'product-specifications',
              depth: 0,
              limit: 1,
              overrideAccess: false,
              user: savingActor,
              req,
              where: {
                and: [
                  { tenant: { equals: company.id } },
                  { product: { equals: job.product_id } },
                  { localeCode: { equals: locale } },
                ],
              },
            })
            const data = localizedSpecificationData(
              (existing.docs[0] as unknown as Record<string, unknown>) || null,
              translated.specificationSet,
              job.product_id,
              company.id,
              locale,
            )
            if (existing.docs[0])
              await payload.update({
                collection: 'product-specifications',
                id: existing.docs[0].id,
                data,
                context,
                overrideAccess: false,
                user: savingActor,
                req,
              })
            else
              await payload.create({
                collection: 'product-specifications',
                data,
                context,
                overrideAccess: false,
                user: savingActor,
                req,
              })
          }
          await payload.create({
            collection: 'audit-logs',
            data: {
              action: 'update',
              collection: 'products',
              documentId: String(job.product_id),
              actorEmail: savingActor.email,
              summary: productTranslationMarker(company.id, job.source_locale, job.source_hash),
              metadata: {
                companyID: company.id,
                targets: [locale],
                sourceLocale: job.source_locale,
                jobID: job.id,
              },
            },
            overrideAccess: true,
            user: savingActor,
            req,
          })
          const savedStates = { ...job.states, [locale]: { status: 'succeeded' as const } }
          await transaction.execute(
            sql`UPDATE platform_jobs.product_translation SET states=${JSON.stringify(savedStates)}::jsonb,updated_at=now() WHERE id=${job.id}::uuid AND lease_owner=${owner}::uuid`,
          )
          try {
            await payload.db.commitTransaction(transactionID)
            const confirmed = await db(payload).query(
              "SELECT id FROM platform_jobs.product_translation WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_until>clock_timestamp() AND states->($3::text)->>'status'='succeeded'",
              [job.id, owner, locale],
            )
            if (!confirmed.rowCount) throw new Error('SAVE_NOT_CONFIRMED')
          } catch (error) {
            // Preserve the database checkpoint on an ambiguous commit. The next
            // lease owner reads whether the atomic content/state save committed.
            abort.abort()
            throw error
          }
          job.states = savedStates
        } catch (error) {
          await payload.db.rollbackTransaction(transactionID)
          throw error
        }
      } catch (error) {
        if (abort.signal.aborted || (error instanceof Error && error.message === 'LEASE_LOST'))
          throw error
        job.states[locale] = {
          ...job.states[locale],
          ...translationFailure(payload, error, stage, job.id, job.tenant_id, locale, job.states[locale] || { status: 'queued' }),
        }
        await saveStates()
      }
    }
    await finishTranslationJob(db(payload), job)
  } catch (error) {
    if (!abort.signal.aborted && !(error instanceof Error && error.message === 'LEASE_LOST'))
      throw error // A failed queue write leaves the last durable state for the next lease owner.

  } finally {
    clearInterval(heartbeat)
  }
  return true
}
