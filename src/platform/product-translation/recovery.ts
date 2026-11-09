import { APIError, ValidationError, type Payload } from 'payload'
import type { SiteLocale } from '../site-locales'
import type { LanguageTranslationState, TranslationReview } from './job-view'
import { userHasRole } from '@/access/roles'
import type { User } from '@/payload-types'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { TranslationProviderError, type TranslationOptions } from './provider'

export type TranslationStage = 'prepare' | 'provider' | 'save'

export function translationFailure(
  payload: Payload,
  error: unknown,
  stage: TranslationStage,
  jobID: string,
  tenantID: number,
  locale: SiteLocale,
  state: LanguageTranslationState,
): LanguageTranslationState {
  const fields = error instanceof ValidationError
    ? error.data?.errors.map(({ path }) => path).filter((path) => /^[a-zA-Z0-9_.-]{1,160}$/.test(path)).slice(0, 12)
    : undefined
  const unknown = state.providerInFlight || (error instanceof TranslationProviderError && error.code === 'PROVIDER_UNCERTAIN')
  const code = unknown ? 'PROVIDER_UNCERTAIN' : error instanceof TranslationProviderError ? error.code
    : error instanceof ValidationError ? 'FIELD_VALIDATION'
      : error instanceof APIError && error.status === 403 ? 'ACTOR_FORBIDDEN'
        : error instanceof APIError && error.status === 409 ? 'CONTENT_CONFLICT'
          : stage === 'save' ? 'SAVE_FAILED' : stage === 'prepare' ? 'PREPARE_FAILED' : 'PROVIDER_FAILED'
  const databaseCode = (cause: unknown) => {
    const value = (cause as { code?: unknown } | null)?.code
    return typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value) ? value : undefined
  }
  const sqlState = databaseCode(error) || databaseCode(error instanceof Error ? error.cause : undefined)
  const databaseTransient = stage !== 'provider' && (
    Boolean(sqlState && /^(08[0-9A-Z]{3}|40001|40P01|55P03|57P01|53300)$/.test(sqlState))
    || (error instanceof APIError && error.status === 503)
  )
  const providerTransient = error instanceof TranslationProviderError
    && (/^PROVIDER_(429|5[0-9]{2})$/.test(error.code) || ['COST_LEDGER_UNAVAILABLE', 'DISPATCH_CHECKPOINT_UNAVAILABLE'].includes(error.code))
  const delay = [30_000, 120_000, 600_000][state.retryCount ?? 0]
  const retryAt = !unknown && delay && (databaseTransient || providerTransient)
    ? new Date(Math.max(Date.now() + delay + Math.floor(Math.random() * 5000),
      error instanceof TranslationProviderError ? error.retryAfterAt ?? 0 : 0)).toISOString()
    : undefined
  payload.logger.warn({
    msg: 'Translation step failed',
    jobID, tenantID, locale, stage, code, fields,
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    sqlState, retryAt,
  })
  const message = unknown ? uncertainTranslationMessage
    : retryAt ? '暂时无法完成，后台会自动重试。'
    : providerTransient ? 'AI 服务暂时不可用，自动重试已结束。'
    : error instanceof TranslationProviderError || (error instanceof APIError && [403, 404, 409].includes(error.status))
    ? error.message
    : error instanceof ValidationError
      ? '译文已生成，但字段校验未通过。请检查内容后继续翻译。'
      : stage === 'save'
        ? '译文已生成，但保存失败。重新提交时会优先使用已保存的翻译进度。'
        : '翻译任务暂时未完成，请重试。'
  return {
    ...state, status: retryAt ? 'queued' : 'failed', code, stage, message, retryAt,
    retryCount: (state.retryCount ?? 0) + (retryAt ? 1 : 0),
    providerInFlight: undefined,
  }
}

/** Reuse an exact source revision and its existing job ID when all unfinished languages still match. */
export function resumableTranslationJob<T extends {
  status: string
  source_hash: string
  source_locale: SiteLocale
  targets: SiteLocale[]
  states: Record<string, LanguageTranslationState>
}>(jobs: T[], sourceHash: string, sourceLocale: SiteLocale, pending: SiteLocale[]) {
  return jobs.find((job) => {
    if (!['failed', 'partial'].includes(job.status)
      || job.source_hash !== sourceHash || job.source_locale !== sourceLocale) return false
    const unfinished = job.targets.filter((locale) => job.states[locale]?.status !== 'succeeded')
    return unfinished.length === pending.length && pending.every((locale) => unfinished.includes(locale))
      && pending.some((locale) => {
        const state = job.states[locale]
        return state?.prepared || state?.checkpoint || state?.retryCount
      })
  })
}

export const uncertainTranslationMessage = 'AI 调用结果待确认。请联系管理员核对用量和任务记录。'

type RecoverableJob = {
  id: string
  tenant_id: number
  lease_owner: string | null
  source_hash: string
  targets: SiteLocale[]
  states: Record<string, LanguageTranslationState>
}

export function uncertainTranslationLocales(job: RecoverableJob, sourceHash: string, pending: SiteLocale[]) {
  if (job.source_hash !== sourceHash) return []
  return pending.filter((locale) => {
    const state = job.states[locale]
    return state?.providerInFlight || state?.code === 'PROVIDER_UNCERTAIN'
  })
}

export function uncertainTranslation(job: RecoverableJob, sourceHash: string, pending: SiteLocale[]) {
  return uncertainTranslationLocales(job, sourceHash, pending).length > 0
}

export function canReviewTranslation(user: User, tenantID: number) {
  if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) return false
  return userHasRole(user, ['super-admin']) || (
    userHasRole(user, ['site-admin'])
    && Boolean(user.tenants?.some(({ tenant }) => (typeof tenant === 'object' ? tenant?.id : tenant) === tenantID))
  )
}

export function translationReview(
  job: (RecoverableJob & { status: string; review_revision?: string }) | undefined,
  sourceHash: string,
  targets: SiteLocale[],
  user: User,
  tenantID: number,
): TranslationReview | undefined {
  if (!job?.review_revision || !['failed', 'partial'].includes(job.status) || !canReviewTranslation(user, tenantID)) return
  const remaining = job.targets.filter((locale) => job.states[locale]?.status !== 'succeeded')
  if (remaining.some((locale) => !targets.includes(locale))) return
  const locales = uncertainTranslationLocales(job, sourceHash, remaining)
  if (locales.length) return { jobID: job.id, revision: job.review_revision, locales }
}

export function resetTranslationFailures(job: RecoverableJob) {
  return Object.fromEntries(Object.entries(job.states).map(([locale, state]) => [
    locale,
    state.status === 'succeeded' ? state : { ...state, status: 'queued', retryAt: undefined, retryCount: undefined },
  ]))
}

export function shouldWorkOnTranslation(state?: LanguageTranslationState) {
  if (!state) return true
  if (state.status === 'succeeded') return false
  if (state.retryAt) return Date.parse(state.retryAt) <= Date.now()
  return state.status !== 'failed'
}

export function durableTranslationProgress(
  states: Record<string, LanguageTranslationState>,
  locale: SiteLocale,
  persist: () => Promise<void>,
): Pick<TranslationOptions, 'onDispatch' | 'onKnownFailure' | 'onProgress' | 'deferProviderRetries'> {
  return {
    deferProviderRetries: true,
    onDispatch: async () => {
      states[locale].providerInFlight = true
      try {
        await persist()
      } catch {
        states[locale].providerInFlight = false
        throw new TranslationProviderError('调用状态暂时无法保存，请稍后重试。', 'DISPATCH_CHECKPOINT_UNAVAILABLE')
      }
    },
    onKnownFailure: () => {
      // The worker persists this together with its retry decision.
      states[locale].providerInFlight = false
    },
    onProgress: async (checkpoint, done, total) => {
      states[locale] = { ...states[locale], checkpoint, done, total, providerInFlight: false }
      await persist()
    },
  }
}

export async function finishTranslationJob(pool: Pick<PostgresAdapter['pool'], 'query'>, job: RecoverableJob) {
  const states = job.targets.map((locale) => job.states[locale])
  const retryAt = states.flatMap((state) => state?.retryAt ? [state.retryAt] : []).sort()[0]
  const succeeded = states.filter((state) => state?.status === 'succeeded').length
  const status = retryAt ? 'queued' : succeeded === states.length ? 'completed' : succeeded ? 'partial' : 'failed'
  await pool.query(
    `UPDATE platform_jobs.product_translation
     SET status=$3,states=$4::jsonb,next_run_at=$5::timestamptz,lease_owner=NULL,lease_until=NULL,updated_at=now()
     WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_until>clock_timestamp()`,
    [job.id, job.lease_owner, status, JSON.stringify(job.states), retryAt || null],
  )
}
