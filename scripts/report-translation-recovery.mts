/** Report from an isolated restore. Uses the worker's source fingerprint and permission checks. */
import { realpath, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { Tenant, User } from '../src/payload-types'
import type { TranslationResource } from '../src/platform/content-translation/resources'

const [database, output, snapshotAt, ...extra] = process.argv.slice(2)
const url = new URL(process.env.DATABASE_URL || '')
if (!/^novasite_recovery_audit_\d+$/.test(database || '') || url.hostname !== '127.0.0.1'
  || ['host', 'hostaddr', 'port', 'dbname', 'database'].some((key) => url.searchParams.has(key))
  || url.pathname === '/' + database || !output || !snapshotAt || !Number.isFinite(Date.parse(snapshotAt))
  || extra.length) {
  throw new Error('Usage: report-translation-recovery.mts SCRATCH_DB PRIVATE_OUTPUT_JSON SNAPSHOT_ISO_DATE')
}
const privateRoot = await realpath('.private')
const reportPath = resolve(output)
const outputDirectory = await realpath(dirname(reportPath))
if (!outputDirectory.startsWith(privateRoot + sep)) throw new Error('Use a directory under .private.')

url.pathname = '/' + database
url.searchParams.set('options', '-c default_transaction_read_only=on -c statement_timeout=10000')
process.env.DATABASE_URL = url.toString()
Object.assign(process.env, { NODE_ENV: 'production', PRODUCT_TRANSLATION_QUEUE_ENABLED: 'true' })

const { getPayload } = await import('payload')
const { default: config } = await import('../src/payload.config')
const { companyTranslationTargets, isSiteLocale } = await import('../src/platform/site-locales')
const { contentTaskKey, isTranslationResource } = await import('../src/platform/content-translation/resources')
const { canWork, contentSourceLocale, contentTargetLocales, readContentSource } =
  await import('../src/platform/content-translation/jobs')
const { actorCanWork, completedTranslationLocales, readTranslationSource } =
  await import('../src/platform/product-translation/jobs')
const payload = await getPayload({ config, disableOnInit: true, cron: false })
const pool = (payload.db as unknown as PostgresAdapter).pool

type FailedLanguage = {
  id: string
  tenant_id: number
  product_id: number
  actor_id: number
  source_locale: string
  source_hash: string
  source_kind: string | null
  resource: string | null
  document_id: string | null
  locale: string
  code: string | null
  updated_at: Date
  has_prepared: boolean
  has_checkpoint: boolean
  provider_in_flight: boolean
  current_job: boolean
  recorded_success: boolean
  failure_rank: number
}

const hasText = (value: unknown): boolean => {
  if (typeof value === 'string') return Boolean(value.trim())
  return value !== null && typeof value === 'object' && Object.values(value).some(hasText)
}

const companies = new Map<number, Tenant | null>()
const users = new Map<number, User | null>()
const statusOf = (error: unknown) => error && typeof error === 'object' && 'status' in error ? error.status : null

async function classify(row: FailedLanguage) {
  if (row.failure_rank > 1) return { decision: 'superseded_failure' }
  if (row.current_job) return { decision: 'active_job' }
  const product = row.product_id > 0
  const resource = row.resource || ''
  const documentID = product ? row.product_id : Number(row.document_id)
  if (!product && (row.source_kind !== 'workspace-content' || !isTranslationResource(resource) || !Number.isSafeInteger(documentID)
    || documentID < 1 || documentID > 67_108_862 || contentTaskKey(resource, documentID) !== row.product_id)) {
    return { decision: 'unsupported_resource' }
  }
  try {
    if (!companies.has(row.tenant_id)) companies.set(row.tenant_id, await payload.findByID({
      collection: 'tenants', id: row.tenant_id, depth: 0, overrideAccess: true, disableErrors: true,
      context: { skipContentTranslationOverlay: true },
    }))
    const company = companies.get(row.tenant_id)
    if (!company) return { decision: 'missing_company' }

    const contentResource = resource as TranslationResource
    const targets = product ? companyTranslationTargets(company) : contentTargetLocales(contentResource, company)
    const sourceLocale = product ? company.defaultLocale : contentSourceLocale(contentResource, company)
    if (row.source_locale !== sourceLocale || !isSiteLocale(row.locale) || !targets.includes(row.locale))
      return { decision: 'locale_changed' }

    if (!users.has(row.actor_id)) users.set(row.actor_id, await payload.findByID({
      collection: 'users', id: row.actor_id, depth: 0, overrideAccess: true, disableErrors: true,
    }))
    const actor = users.get(row.actor_id)
    if (!actor || !(product ? actorCanWork(actor, company.id) : canWork(actor, company.id, contentResource)))
      return { decision: 'actor_unavailable' }

    const current = product ? await readTranslationSource(payload, company, actor, documentID)
      : await readContentSource(payload, company, actor, contentResource, documentID)
    const document = 'product' in current ? current.product : current.document
    const details = {
      currentSourceHash: current.fingerprint,
      mayAffectPublishedContent: document._status !== 'draft',
    }
    if (current.fingerprint !== row.source_hash) return { ...details, decision: 'source_changed' }
    const hasSource = 'product' in current
      ? hasText(current.source.content) : current.snapshot.entries.some((entry) => entry.value.trim())
    if (!hasSource) return { ...details, decision: 'no_source' }
    if (row.recorded_success) return { ...details, decision: 'already_completed', successEvidence: 'job' }
    if (product && (await completedTranslationLocales(
      payload, company, documentID, current.fingerprint,
    )).has(row.locale)) return { ...details, decision: 'already_completed', successEvidence: 'audit' }

    if (row.provider_in_flight || row.code === 'PROVIDER_UNCERTAIN')
      return { ...details, decision: 'review_provider_result' }
    if (row.code === 'SAVE_FAILED') return { ...details, decision: 'review_save_failure' }
    if (!/^COST_(?:(?:GLOBAL|COMPANY)_(?:DAILY|MONTHLY)|JOB)_LIMIT$/.test(row.code || ''))
      return { ...details, decision: 'review_other_error' }

    if (resource === 'navigation' || resource === 'navigation-items')
      return { ...details, decision: 'review_target_content' }
    const targetCompany = { ...company, defaultLocale: row.locale }
    const target = product ? await readTranslationSource(payload, targetCompany, actor, documentID)
      : await readContentSource(payload, targetCompany, actor, contentResource, documentID)
    const targetHasText = 'product' in target
      ? hasText(target.source.content) : target.snapshot.entries.some((entry) => entry.value.trim())
    if (targetHasText) return { ...details, decision: 'review_target_content' }
    return { ...details, decision: 'candidate_after_release' }
  } catch (error) {
    if (statusOf(error) === 404) return { decision: 'missing_or_unreadable_document' }
    if (statusOf(error) === 403) return { decision: 'actor_unavailable' }
    return { decision: 'verification_error' }
  }
}

try {
  const { rows: [identity] } = await pool.query(
    "SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only",
  )
  if (identity?.database !== database || identity?.read_only !== 'on')
    throw new Error('Unexpected database identity or write capability.')

  const { rows } = await pool.query<FailedLanguage>(`
    SELECT j.id,j.tenant_id,j.product_id,j.actor_id,j.source_locale,j.source_hash,j.updated_at,
      j.source->>'kind' AS source_kind,j.source->>'resource' AS resource,j.source->>'documentID' AS document_id,
      s.key AS locale,s.value->>'code' AS code,
      coalesce(jsonb_typeof(s.value->'prepared')='object',false) AS has_prepared,
      coalesce(jsonb_typeof(s.value->'checkpoint')='object' AND s.value->'checkpoint'<>'{}'::jsonb,false) AS has_checkpoint,
      coalesce(s.value->>'providerInFlight'='true',false) AS provider_in_flight,
      row_number() OVER (PARTITION BY j.tenant_id,j.product_id,s.key ORDER BY j.created_at DESC,j.id DESC)::int AS failure_rank,
      EXISTS(SELECT 1 FROM platform_jobs.product_translation a WHERE a.tenant_id=j.tenant_id
        AND a.product_id=j.product_id AND a.status IN ('queued','running')) AS current_job,
      EXISTS(SELECT 1 FROM platform_jobs.product_translation a WHERE a.tenant_id=j.tenant_id
        AND a.product_id=j.product_id AND a.source_hash=j.source_hash AND a.source_locale=j.source_locale
        AND a.states->s.key->>'status'='succeeded') AS recorded_success
    FROM platform_jobs.product_translation j CROSS JOIN LATERAL jsonb_each(j.states) s
    WHERE j.status IN ('failed','partial') AND s.value->>'status'='failed'
    ORDER BY j.tenant_id,j.product_id,s.key,failure_rank
  `)
  const entries = []
  const totals: Record<string, number> = {}
  for (const row of rows) {
    const assessment = await classify(row)
    entries.push({
      companyID: row.tenant_id, resource: row.product_id > 0 ? 'products' : row.resource,
      documentID: row.product_id > 0 ? row.product_id : Number(row.document_id) || null,
      jobID: row.id, locale: row.locale, sourceLocale: row.source_locale, savedSourceHash: row.source_hash,
      errorCode: row.code, hasPrepared: row.has_prepared, hasCheckpoint: row.has_checkpoint,
      recordedSuccess: row.recorded_success, updatedAt: row.updated_at, ...assessment,
    })
    totals[assessment.decision] = (totals[assessment.decision] || 0) + 1
  }
  await writeFile(resolve(outputDirectory, reportPath.split(sep).at(-1)!), JSON.stringify({
    snapshotAt, generatedAt: new Date().toISOString(), failedLanguages: entries.length, totals, entries,
  }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify({ snapshotAt, failedLanguages: entries.length, totals }))
} finally {
  await payload.destroy()
}

// The standalone CLI has finished. Payload plugins can keep background timers alive.
process.exit(0)
