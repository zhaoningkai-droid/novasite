import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError } from './keywords'
import { createGeoGenerationQueue } from './generation-queue'
import { refreshArticleContext } from './article-context'
import { generateGeoArticle } from './article-provider'
import { attachArticleKnowledge } from '../knowledge/article-knowledge'
import type { TranslationRequestUsage } from '../translation-usage/types'
export async function runOneGeoArticle(
  pool: Pick<PostgresAdapter['pool'], 'query' | 'connect'>,
  options: {
    key: string
    model: string
    authorize: (actorID: number, tenantID: number) => Promise<boolean>
    refresh?: typeof refreshArticleContext
    generate?: typeof generateGeoArticle
    knowledge?: typeof attachArticleKnowledge
  },
) {
  const queue = createGeoGenerationQueue(pool),
    job = await queue.claim()
  if (!job) return false
  const abort = new AbortController(),
    heartbeat = setInterval(() => {
      void queue
        .lease(job)
        .then((alive) => {
          if (!alive) abort.abort()
        })
        .catch(() => abort.abort())
    }, 20_000)
  let dispatched = false
  try {
    if (!options.key)
      throw new GeoError('AI_NOT_CONFIGURED', '正文服务尚未配置，没有调用模型。', 503)
    if (!(await options.authorize(job.actor_id, job.tenant_id)))
      throw new GeoError('ACTOR_REVOKED', '提交账号已失去本客户编辑权限。', 403)
    let context = await (options.refresh || refreshArticleContext)(pool, job.tenant_id, job.context)
    abort.signal.throwIfAborted()
    if (!(await options.authorize(job.actor_id, job.tenant_id)))
      throw new GeoError('ACTOR_REVOKED', '提交账号已失去本客户编辑权限。', 403)
    await queue.dispatch(job, context, options.model)
    dispatched = true
    const retrievalUsage: (TranslationRequestUsage | undefined)[] = []
    const combineUsage = (values: (TranslationRequestUsage | undefined)[]) => {
      if (!values.length || values.some((value) => !value)) return undefined
      return values.reduce<TranslationRequestUsage>(
        (sum, value) => ({
          inputTokens: sum.inputTokens + value!.inputTokens,
          outputTokens: sum.outputTokens + value!.outputTokens,
          totalTokens: sum.totalTokens + value!.totalTokens,
          cacheHitInputTokens:
            sum.cacheHitInputTokens == null || value!.cacheHitInputTokens == null
              ? null
              : sum.cacheHitInputTokens + value!.cacheHitInputTokens,
          cacheMissInputTokens:
            sum.cacheMissInputTokens == null || value!.cacheMissInputTokens == null
              ? null
              : sum.cacheMissInputTokens + value!.cacheMissInputTokens,
        }),
        {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cacheHitInputTokens: 0,
          cacheMissInputTokens: 0,
        },
      )
    }
    context = await (options.knowledge || attachArticleKnowledge)(pool, job.tenant_id, context, {
      key: options.key,
      model: options.model,
      signal: abort.signal,
      onUsage: async (usage) => {
        retrievalUsage.push(usage)
        await queue.usage(job, combineUsage(retrievalUsage))
      },
    })
    abort.signal.throwIfAborted()
    if (!(await options.authorize(job.actor_id, job.tenant_id)))
      throw new GeoError('ACTOR_REVOKED', '提交账号已失去本客户编辑权限。', 403)
    await queue.execution(job, context)
    const output = await (options.generate || generateGeoArticle)(context, {
      key: options.key,
      model: options.model,
      signal: abort.signal,
      onUsage: (usage) => queue.usage(job, combineUsage([...retrievalUsage, usage])),
    })
    abort.signal.throwIfAborted()
    if (output.direction) context.direction = output.direction
    await queue.complete(job, context, output)
  } catch (error) {
    const known = error instanceof GeoError
    await queue.fail(
      job,
      dispatched && !known,
      known ? error.code : 'GENERATION_UNCONFIRMED',
      known
        ? error.message
        : dispatched
          ? 'AI调用结果未确认，可能已产生用量；请查看记录并明确确认后重试。'
          : '准备阶段失败，没有自动发起正文模型调用。',
    )
  } finally {
    clearInterval(heartbeat)
  }
  return true
}
