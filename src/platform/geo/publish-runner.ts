import type { Payload } from 'payload'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { User } from '@/payload-types'
import { GeoError } from './keywords'
import { validateGeoArticle } from './articles'
import { refreshArticleContext } from './article-context'
import { createGeoPublishQueue } from './publish-store'
import { commitGeoPublication } from './publish-adapter'
export async function runOneGeoPublication(
  payload: Payload,
  options: {
    authorize: (actor: number, tenant: number) => Promise<User | null>
    refresh?: typeof refreshArticleContext
    commit?: typeof commitGeoPublication
  },
) {
  const pool = (payload.db as unknown as PostgresAdapter).pool,
    queue = createGeoPublishQueue(pool),
    item = await queue.claim()
  if (!item) return false
  const abort = new AbortController(),
    timer = setInterval(() => {
      void queue
        .lease(item)
        .then((ok) => {
          if (!ok) abort.abort()
        })
        .catch(() => abort.abort())
    }, 20000)
  try {
    let user = await options.authorize(item.actor_id, item.tenant_id)
    if (!user)
      throw new GeoError('ACTOR_REVOKED', '提交人已失去当前客户发布权限，未写入站点。', 403)
    const context = await (options.refresh || refreshArticleContext)(
      pool,
      item.tenant_id,
      item.snapshot.context,
    )
    const checked = validateGeoArticle(item.snapshot, context)
    if (checked.issues.length)
      throw new GeoError('CONTENT_INVALID', `文章未通过发布复查：${checked.issues.join(' ')}`)
    abort.signal.throwIfAborted()
    user = await options.authorize(item.actor_id, item.tenant_id)
    if (!user)
      throw new GeoError('ACTOR_REVOKED', '提交人已失去当前客户发布权限，未写入站点。', 403)
    await (options.commit || commitGeoPublication)(payload, user, item, {
      ...item.snapshot,
      html: checked.html,
      context,
    })
  } catch (e) {
    const known = e instanceof GeoError
    await queue.fail(
      item,
      !known,
      known ? e.code : 'PUBLICATION_UNCONFIRMED',
      known
        ? e.code.startsWith('SOURCE')
          ? '引用来源复查未通过，尚未写入站点。'
          : e.message
        : '发布结果尚未确认，请先读取原记录核对，未自动重发。',
    )
  } finally {
    clearInterval(timer)
  }
  return true
}
