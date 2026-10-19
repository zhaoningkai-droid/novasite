import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { workspaceSettingsScope, settingsEditorRoles } from '../workspace-settings-api'
import { assertGeoWriteRequest, geoAPIError, geoReply, readGeoBody } from './keyword-api'
import { GeoError, geoID } from './keywords'
import { createGeoArticleStore } from './article-store'
import { cleanGeoArticleHTML, validateGeoArticle } from './articles'
import { parseGeoPublishInput, geoPublishURL, type GeoPublishRecord } from './publishing'
import { geoPublishHash, createGeoPublishStore } from './publish-store'
import { loadGeoPublishTarget } from './publish-target'
import { geoArticleToLexical } from './publish-lexical'
import { geoPublishSummary } from './publish-adapter'
export function signGeoPublishPreview(
  hash: string,
  expires: number,
  tenant: number,
  actor: number,
  secret: string,
) {
  return createHmac('sha256', secret).update(`${hash}:${expires}:${tenant}:${actor}`).digest('hex')
}
export function verifyGeoPublishPreview(
  signature: unknown,
  hash: string,
  expires: unknown,
  tenant: number,
  actor: number,
  secret: string,
  now = Date.now(),
) {
  if (
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(signature) ||
    typeof expires !== 'number' ||
    expires < now ||
    expires > now + 300000
  )
    return false
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(signGeoPublishPreview(hash, expires, tenant, actor, secret)),
  )
}
const publicRecord = (r: GeoPublishRecord, includeContent = false) => ({
  id: r.id,
  article_id: r.article_id,
  article_version: r.article_version,
  title: r.snapshot.title,
  target: r.target,
  publish_at: r.publish_at,
  state: r.state,
  attempts: r.attempts,
  target_id: r.target_id,
  target_url: r.target_url,
  message: r.message,
  error_code: r.error_code,
  updated_at: r.updated_at,
  ...(includeContent
    ? {
        html: cleanGeoArticleHTML(
          r.snapshot.html,
          r.snapshot.context.sources,
          r.snapshot.context.materialGroup.images,
          r.snapshot.context.publicationLinks,
        ).html,
      }
    : {}),
})
export async function geoPublishWorkerReady() {
  try {
    return (
      Date.now() -
        (await stat(path.join(process.cwd(), '.codex-runtime/geo-publish-worker.heartbeat')))
          .mtimeMs <
      35000
    )
  } catch {
    return false
  }
}
const isDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export async function handleGeoPublishing(request: Request, company: string, id?: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error)
      return geoReply({ ...(await scope.error.json()), requestId }, scope.error.status)
    const pool = (scope.payload.db as unknown as PostgresAdapter).pool,
      store = createGeoPublishStore(pool, scope.company.id, scope.user.id),
      params = new URL(request.url).searchParams
    if (request.method === 'GET') {
      if (id) {
        const item = await store.find(geoID(id))
        if (!item) throw new GeoError('NOT_FOUND', '未找到当前客户发布记录。', 404)
        return geoReply({
          item: publicRecord(item, true),
          events: await store.events(item.id),
          requestId,
        })
      }
      const page = Number(params.get('page') || 1)
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
        throw new GeoError('INVALID_QUERY', '分页参数无效。')
      if (params.get('view') === 'options') {
        const collection =
          params.get('collection') === 'news'
            ? 'news-categories'
            : params.get('collection') === 'posts'
              ? 'categories'
              : null
        if (!collection) throw new GeoError('INVALID_TARGET', '请选择新闻或Blog。')
        const q = params.get('q') || ''
        if (q.length > 100) throw new GeoError('INVALID_QUERY', '分类搜索内容过长。')
        const tenant = await scope.payload.findByID({
          collection: 'tenants',
          id: scope.company.id,
          depth: 0,
          overrideAccess: false,
          user: scope.user,
        })
        const field = collection === 'news-categories' ? 'name' : 'title'
        const categories = await scope.payload.find({
          collection,
          depth: 0,
          limit: 40,
          page,
          locale: tenant.defaultLocale,
          overrideAccess: false,
          user: scope.user,
          where: {
            and: [{ tenant: { equals: tenant.id } }, ...(q ? [{ [field]: { contains: q } }] : [])],
          },
        })
        return geoReply({
          items: categories.docs.map((c) => ({ id: c.id, name: 'name' in c ? c.name : c.title })),
          total: categories.totalDocs,
          page,
          pageSize: 40,
          companyName: tenant.name,
          defaultLocale: tenant.defaultLocale,
          siteStatus: tenant.status,
          workerReady: await geoPublishWorkerReady(),
          requestId,
        })
      }
      const title = params.get('title') || params.get('q') || '',
        account = params.get('account') || '',
        plan = params.get('plan') || '',
        platform = params.get('platform') || '',
        startDate = params.get('startDate') || '',
        endDate = params.get('endDate') || '',
        tab = params.get('tab') || 'pending',
        pageSize = Number(params.get('pageSize') || 10)
      if (
        title.length > 100 ||
        account.length > 100 ||
        plan.length > 100 ||
        !['', 'news', 'posts'].includes(platform) ||
        !['pending', 'publishing', 'published', 'failed'].includes(tab) ||
        ![10, 20, 50].includes(pageSize) ||
        (startDate !== '' && !isDateOnly(startDate)) ||
        (endDate !== '' && !isDateOnly(endDate)) ||
        (startDate !== '' && endDate !== '' && startDate > endDate)
      )
        throw new GeoError('INVALID_QUERY', '发布记录筛选条件无效。')
      return geoReply({
        ...(await store.list(page, {
          title,
          account,
          companyName: scope.company.name || '',
          plan,
          platform: platform as '' | 'news' | 'posts',
          startDate,
          endDate,
          tab: tab as 'pending' | 'publishing' | 'published' | 'failed',
          pageSize: pageSize as 10 | 20 | 50,
        })),
        page,
        pageSize,
        workerReady: await geoPublishWorkerReady(),
        requestId,
      })
    }
    if (request.method !== 'POST') throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
    const b = await readGeoBody(request)
    if (b.action === 'retry' || b.action === 'cancel')
      return geoReply({
        item: publicRecord(
          (await store.action(geoID(b.id), b.action, b.acknowledgeUnknown === true))!,
        ),
        requestId,
      })
    if (!['preview', 'confirm', 'submit'].includes(String(b.action)))
      throw new GeoError('INVALID_ACTION', '请选择有效的发布操作。')
    const input = parseGeoPublishInput(b),
      articleStore = createGeoArticleStore(pool, scope.company.id, scope.user.id)
    const raw = await articleStore.find(input.articleID)
    if (!raw || raw.version !== input.version || raw.status !== 'ready')
      throw new GeoError('ARTICLE_NOT_READY', '请选择当前客户已核查为可发布的最新文章修订。', 409)
    const article = await articleStore.visibleArticle(raw),
      checked = validateGeoArticle(article, article.context)
    if (article.status !== 'ready' || checked.issues.length)
      throw new GeoError('ARTICLE_INVALID', `文章仍需处理：${checked.issues.join(' ')}`)
    geoArticleToLexical(article)
    const target = await loadGeoPublishTarget(
      scope.payload,
      scope.user,
      scope.company.id,
      input.collection,
      input.categoryID,
      article.context.settings.locale,
    )
    const hash = geoPublishHash(input, target, raw),
      secret = process.env.PAYLOAD_SECRET
    if (!secret)
      throw new GeoError('PREVIEW_UNAVAILABLE', '发布确认服务未配置，请联系管理员。', 503)
    if (b.action === 'preview') {
      const expires = Date.now() + 300000
      return geoReply({
        preview: {
          articleID: raw.id,
          version: raw.version,
          title: raw.title,
          summary: geoPublishSummary(article),
          target,
          url: geoPublishURL(target, raw.id, raw.version),
          publishAt: input.publishAt,
          expires,
          signature: signGeoPublishPreview(hash, expires, scope.company.id, scope.user.id, secret),
        },
        requestId,
      })
    }
    if (b.action === 'submit') {
      const item = await store.enqueue(geoID(b.requestId), input, target, raw)
      return geoReply(
        {
          item: publicRecord(item),
          message: '发布请求已登记，尚未表示已发布；请查看真实发布记录。',
          requestId,
        },
        202,
      )
    }
    if (
      b.confirmed !== true ||
      !verifyGeoPublishPreview(
        b.signature,
        hash,
        b.expires,
        scope.company.id,
        scope.user.id,
        secret,
      )
    )
      throw new GeoError('PREVIEW_CHANGED', '预览已过期或文章/目标已改变，请重新预览并确认。', 409)
    const item = await store.enqueue(geoID(b.requestId), input, target, raw)
    return geoReply(
      {
        item: publicRecord(item),
        message: '发布请求已登记，尚未表示已发布；请查看真实发布记录。',
        requestId,
      },
      202,
    )
  } catch (e) {
    return geoAPIError(e, requestId)
  }
}
