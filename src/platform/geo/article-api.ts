import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { workspaceSettingsScope, settingsEditorRoles } from '../workspace-settings-api'
import { assertGeoWriteRequest, readGeoBody, geoAPIError, geoReply } from './keyword-api'
import { GeoError, geoID, geoVersion } from './keywords'
import { createGeoArticleStore, type GeoArticleUseFilter } from './article-store'
import { geoPublicationLinks, parseArticleContent, type ArticleContext } from './articles'
import { refreshArticleContext } from './article-context'
import { isSiteLocale } from '../site-locales'
import { geoTaskText, type GeoQuestion } from './tasks'

async function manualArticleContext(
  pool: PostgresAdapter['pool'],
  tenantID: number,
  locale: string,
  input: Record<string, unknown>,
): Promise<ArticleContext> {
  if (!isSiteLocale(locale)) throw new GeoError('INVALID_LANGUAGE', '当前客户默认语言配置无效。')
  const optimizationID = geoID(input.optimizationID),
    optimizationVersion = geoVersion(input.optimizationVersion)
  const rawGroupID = typeof input.materialGroupID === 'string' ? input.materialGroupID.trim() : ''
  const groupID = rawGroupID ? geoID(rawGroupID) : ''
  let groupVersion = 0
  const term = geoTaskText(input.term, '文章关键词', 100)
  const topic = geoTaskText(input.question ?? input.title, '文章标题', 180)
  const config = (
    await pool.query(
      `SELECT id,version,brand,aliases,core,terms,website,blog,term_links FROM platform_geo.optimizations
    WHERE tenant_id=$1 AND id=$2::uuid FOR SHARE`,
      [tenantID, optimizationID],
    )
  ).rows[0]
  if (!config || config.version !== optimizationVersion)
    throw new GeoError('CONFIG_CHANGED', '优化词配置已变更，请重新选择。', 409)
  const aliases = Array.isArray(config.aliases) ? config.aliases : []
  const terms = Array.isArray(config.terms) ? config.terms : []
  const termLinks = Array.isArray(config.term_links) ? config.term_links : []
  if (term !== config.core && !terms.includes(term))
    throw new GeoError('INVALID_TERM', '请选择当前优化词下的核心词或细分词。')
  let group: { id: string; version: number } = { id: '', version: 0 }
  if (groupID) {
    const ownedGroup = (
      await pool.query(
        `SELECT id,name,version FROM platform_geo.material_groups
    WHERE tenant_id=$1 AND id=$2::uuid AND entry_type='group' AND NOT archived FOR SHARE`,
        [tenantID, groupID],
      )
    ).rows[0]
    if (!ownedGroup) throw new GeoError('GROUP_CHANGED', '素材组已变更或已归档，请重新选择。', 409)
    group = ownedGroup
    groupVersion = geoVersion(input.materialGroupVersion)
    if (group.version !== groupVersion)
      throw new GeoError('GROUP_CHANGED', '素材组已变更或已归档，请重新选择。', 409)
  }
  const rawImageID = input.imageID == null || input.imageID === '' ? 0 : Number(input.imageID)
  let image: { id: number; url: string; alt: string; filename: string } | undefined
  if (rawImageID) {
    if (!groupID || !Number.isSafeInteger(rawImageID) || rawImageID < 1)
      throw new GeoError('INVALID_IMAGE', '请从当前客户的素材组中选择图片。')
    image = (
      await pool.query(
        `SELECT m.id,m.url,m.alt,m.filename FROM platform_geo.material_items i
    JOIN public.media m ON m.id=i.media_id AND m.tenant_id=i.tenant_id
    WHERE i.tenant_id=$1 AND i.group_id=$2::uuid AND m.id=$3 AND m.mime_type=ANY($4::text[])
      AND coalesce(m.filesize,0)<=512000`,
        [tenantID, groupID, rawImageID, ['image/jpeg', 'image/png', 'image/webp']],
      )
    ).rows[0]
    if (!image) throw new GeoError('INVALID_IMAGE', '请选择当前客户素材组中可用的图片。')
  }
  const question: GeoQuestion = {
    id: geoID(input.requestId),
    term,
    intent: 'default',
    original: topic,
    translated: '',
    translatedFrom: '',
    translatedLocale: '',
  }
  const settings: ArticleContext['settings'] = {
    name: '手动创作',
    optimizationID,
    optimizationVersion,
    locale: locale as ArticleContext['settings']['locale'],
    questions: [question],
    questionSource: 'original',
    materialGroupID: groupID,
    materialGroupVersion: groupVersion,
    imagesPerArticle: 0,
    direction: '产品介绍',
    length: 'short',
    mode: 'repeat',
    count: 1,
  }
  const context: ArticleContext = {
    settings,
    question,
    writingMode: 'keyword',
    optimization: {
      id: config.id,
      version: config.version,
      brand: config.brand,
      aliases,
      core: config.core,
      terms,
      website: config.website,
      blog: config.blog,
      termLinks,
    },
    materialGroup: {
      id: group.id,
      version: group.version,
      images: image
        ? [{ id: image.id, url: image.url, alt: image.alt || '', filename: image.filename }]
        : [],
    },
    sources: [],
    direction: settings.direction,
  }
  context.publicationLinks = geoPublicationLinks(context.optimization, term)
  return context
}
export async function geoArticleWorkerReady() {
  try {
    return (
      Date.now() -
        (await stat(path.join(process.cwd(), '.codex-runtime/geo-article-worker.heartbeat')))
          .mtimeMs <
      35000
    )
  } catch {
    return false
  }
}
export async function handleGeoGeneration(request: Request, company: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error)
      return geoReply({ ...(await scope.error.json()), requestId }, scope.error.status)
    const store = createGeoArticleStore(
      (scope.payload.db as unknown as PostgresAdapter).pool,
      scope.company.id,
      scope.user.id,
    )
    if (request.method === 'GET')
      return geoReply({
        items: await store.jobs(geoID(new URL(request.url).searchParams.get('taskID'))),
        workerReady: await geoArticleWorkerReady(),
        requestId,
      })
    if (request.method !== 'POST') throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
    const b = await readGeoBody(request)
    if (b.action === 'retry') {
      await store.retry(geoID(b.jobID), b.acknowledgeUnknown === true)
      return geoReply({ message: '该条记录已重新排队，不覆盖已生成文章。', requestId })
    }
    if (!process.env.DEEPSEEK_API_KEY)
      throw new GeoError('AI_NOT_CONFIGURED', '正文生成服务尚未配置。', 503)
    const result = await store.enqueue(
      geoID(b.requestId),
      geoID(b.taskID),
      geoVersion(b.version),
      Number(b.count),
    )
    return geoReply(
      {
        ...result,
        workerReady: await geoArticleWorkerReady(),
        message: '生成任务已排队，可在生成记录查看进度。',
        requestId,
      },
      202,
    )
  } catch (error) {
    return geoAPIError(error, requestId)
  }
}
export async function handleGeoArticles(request: Request, company: string, id?: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error)
      return geoReply({ ...(await scope.error.json()), requestId }, scope.error.status)
    const pool = (scope.payload.db as unknown as PostgresAdapter).pool
    const store = createGeoArticleStore(pool, scope.company.id, scope.user.id),
      params = new URL(request.url).searchParams
    if (request.method === 'GET') {
      if (id) {
        const key = geoID(id),
          version = params.get('version')
        const item = version
          ? await store.revision(key, geoVersion(Number(version)))
          : await store.find(key)
        if (!item) throw new GeoError('NOT_FOUND', '未找到当前客户的文章或修订。', 404)
        return geoReply({
          item: await store.visibleArticle(item),
          revisions: await store.history(key),
          requestId,
        })
      }
      const page = Number(params.get('page') || 1),
        pageSize = Number(params.get('pageSize') || 10),
        q = params.get('q') || '',
        task = params.get('taskID')
      const use = params.get('use') || 'all',
        locale = params.get('locale') || '',
        taskName = params.get('taskName') || ''
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 100000 ||
        ![10, 20, 50].includes(pageSize) ||
        q.length > 100 ||
        taskName.length > 100 ||
        !['all', 'unused', 'occupied', 'published'].includes(use) ||
        (locale && !isSiteLocale(locale))
      )
        throw new GeoError('INVALID_QUERY', '搜索、使用状态、语言或分页参数无效。')
      return geoReply({
        ...(await store.list(
          q,
          page,
          task ? geoID(task) : null,
          {
            use: use as GeoArticleUseFilter,
            locale,
            taskName,
          },
          pageSize,
        )),
        page,
        pageSize,
        requestId,
      })
    }
    if (request.method === 'POST' && !id) {
      const b = await readGeoBody(request, 262144)
      const parsed = parseArticleContent(b)
      const content = {
        ...parsed,
        summary:
          parsed.summary ||
          parsed.html
            .replace(/<[^>]*>/gu, ' ')
            .replace(/\s+/gu, ' ')
            .trim()
            .slice(0, 160),
      }
      const context = await manualArticleContext(
        pool,
        scope.company.id,
        scope.company.defaultLocale,
        b,
      )
      const reviewNote = typeof b.reviewNote === 'string' ? b.reviewNote : ''
      const item = await store.createManual(geoID(b.requestId), content, context, reviewNote)
      return geoReply(
        {
          item: await store.visibleArticle(item),
          message: '保存成功',
          requestId,
        },
        201,
      )
    }
    if (request.method !== 'PATCH' || !id)
      throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
    const b = await readGeoBody(request, 262144),
      key = geoID(id),
      version = geoVersion(b.version)
    if ('context' in b || 'snapshot' in b || 'status' in b)
      throw new GeoError('INVALID_CONTEXT', '任务快照、引用来源和状态由服务端核查，不能直接改绑。')
    if (typeof b.ready !== 'boolean')
      throw new GeoError('INVALID_STATUS', '请选择保存草稿或核查为可发布。')
    const content = parseArticleContent(b),
      old = await store.find(key)
    if (!old) throw new GeoError('NOT_FOUND', '未找到当前客户文章。', 404)
    if (old.version !== version)
      throw new GeoError('VERSION_CONFLICT', '文章已有新版本，输入已保留，请先读取最新版本。', 409)
    const note = typeof b.reviewNote === 'string' ? b.reviewNote.trim() : ''
    if (note.length > 2000) throw new GeoError('INVALID_REVIEW_NOTE', '文章备注不能超过2000字符。')
    const context = b.ready
      ? await refreshArticleContext(pool, scope.company.id, old.context)
      : old.context
    context.publicationLinks = geoPublicationLinks(context.optimization, context.question.term)
    const item = await store.save(key, version, content, context, b.ready, note)
    return geoReply({
      item,
      revisions: await store.history(key),
      message: '保存成功',
      requestId,
    })
  } catch (error) {
    return geoAPIError(error, requestId)
  }
}
