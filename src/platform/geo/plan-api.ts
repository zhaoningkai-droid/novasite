import { createHash, randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { userHasRole } from '@/access/roles'
import {
  settingsAdminRoles,
  settingsEditorRoles,
  workspaceSettingsScope,
} from '../workspace-settings-api'
import { assertGeoWriteRequest, geoAPIError, geoReply, readGeoBody } from './keyword-api'
import { GeoError, geoID } from './keywords'
import { createGeoArticleStore } from './article-store'
import { validateGeoArticle } from './articles'
import { geoArticleToLexical } from './publish-lexical'
import { loadGeoPublishTarget, sameGeoPublishTarget } from './publish-target'
import { createGeoPublishStore } from './publish-store'
import { createGeoPlanStore } from './plan-store'
import { parseGeoPlanConfig, type GeoPlanTarget } from './plans'

/** Replays use the existing primary key, scoped to the authenticated customer and actor. */
export function geoPlanCreateID(tenantID: number, actorID: number, requestID: string) {
  const bytes = createHash('sha256')
    .update(`geo-plan:${tenantID}:${actorID}:${geoID(requestID)}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function handleGeoPlans(request: Request, company: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error)
      return geoReply({ ...(await scope.error.json()), requestId }, scope.error.status)
    const pool = (scope.payload.db as unknown as PostgresAdapter).pool
    const store = createGeoPlanStore(pool, scope.company.id, scope.user.id)
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams
      const page = Number(params.get('page') || 1),
        pageSize = Number(params.get('pageSize') || 15)
      const sourceMode = params.get('sourceMode') || '',
        sourceID = params.get('sourceID') || ''
      return geoReply({
        ...(await store.list(
          page,
          params.get('q') || '',
          params.get('state') || '',
          pageSize,
          sourceMode,
          sourceID,
        )),
        requestId,
      })
    }
    const body = await readGeoBody(request)
    if (request.method === 'DELETE') {
      const ids = Array.isArray(body.ids) ? body.ids.map(geoID) : []
      const versions: Record<string, number> = {}
      if (body.versions && typeof body.versions === 'object' && !Array.isArray(body.versions)) {
        for (const [id, version] of Object.entries(body.versions))
          versions[geoID(id)] = planVersion(version)
      }
      const result = await store.archive(ids, versions)
      return geoReply({ ...result, requestId })
    }
    if (request.method !== 'POST') throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
    if (body.action === 'copy') {
      const source = await store.find(geoID(body.id))
      if (!source) throw new GeoError('NOT_FOUND', '未找到当前客户发布计划。', 404)
      const tenant = await scope.payload.findByID({
        collection: 'tenants',
        id: scope.company.id,
        depth: 0,
        overrideAccess: false,
        user: scope.user,
      })
      const config = parseGeoPlanConfig(source.config, tenant.defaultLocale)
      if (
        config.approvalMode === 'auto' &&
        config.schedule.cadence !== 'once' &&
        !userHasRole(scope.user, settingsAdminRoles)
      )
        throw new GeoError(
          'AUTO_PUBLISH_ADMIN_ONLY',
          '只有当前客户管理员可以复制自动确认发布计划。',
          403,
        )
      const targets: GeoPlanTarget[] = []
      for (const target of config.targets)
        targets.push(
          await loadGeoPublishTarget(
            scope.payload,
            scope.user,
            scope.company.id,
            target.collection,
            target.categoryID,
            tenant.defaultLocale,
            undefined,
            { allowUnpublished: true },
          ),
        )
      config.targets = targets
      const id = geoPlanCreateID(scope.company.id, scope.user.id, geoID(body.requestId))
      const item = await store.save(id, `${source.name.slice(0, 16)}-副本`, config)
      return geoReply({ item, message: '已复制为草稿计划。', requestId }, 201)
    }
    if (body.action === 'preview') {
      const tenant = await scope.payload.findByID({
        collection: 'tenants',
        id: scope.company.id,
        depth: 0,
        overrideAccess: false,
        user: scope.user,
      })
      const config = parseGeoPlanConfig(body.config, tenant.defaultLocale)
      if (
        config.approvalMode === 'auto' &&
        config.schedule.cadence !== 'once' &&
        !userHasRole(scope.user, settingsAdminRoles)
      )
        throw new GeoError(
          'AUTO_PUBLISH_ADMIN_ONLY',
          '只有当前客户管理员可以预览自动确认发布计划。',
          403,
        )
      const targets: GeoPlanTarget[] = []
      for (const target of config.targets)
        targets.push(
          await loadGeoPublishTarget(
            scope.payload,
            scope.user,
            scope.company.id,
            target.collection,
            target.categoryID,
            tenant.defaultLocale,
          ),
        )
      config.targets = targets
      return geoReply({ preview: await store.preview(config), requestId })
    }
    if (body.action === 'create' || body.action === 'update') {
      const tenant = await scope.payload.findByID({
        collection: 'tenants',
        id: scope.company.id,
        depth: 0,
        overrideAccess: false,
        user: scope.user,
      })
      const config = parseGeoPlanConfig(body.config, tenant.defaultLocale)
      if (
        config.approvalMode === 'auto' &&
        config.schedule.cadence !== 'once' &&
        !userHasRole(scope.user, settingsAdminRoles)
      )
        throw new GeoError(
          'AUTO_PUBLISH_ADMIN_ONLY',
          '只有当前客户管理员可以配置自动确认发布。',
          403,
        )
      const targets: GeoPlanTarget[] = []
      for (const target of config.targets)
        targets.push(
          await loadGeoPublishTarget(
            scope.payload,
            scope.user,
            scope.company.id,
            target.collection,
            target.categoryID,
            tenant.defaultLocale,
            undefined,
            { allowUnpublished: true },
          ),
        )
      config.targets = targets
      const name = typeof body.name === 'string' ? body.name : ''
      if (body.action === 'create') {
        const id = geoPlanCreateID(scope.company.id, scope.user.id, geoID(body.requestId))
        const item = await store.save(id, name, config)
        return geoReply({ item, message: '计划已保存为草稿；尚未开始调度。', requestId }, 201)
      }
      const item = await store.save(geoID(body.id), name, config, planVersion(body.version))
      return geoReply({ item, message: '计划配置已更新。', requestId })
    }
    if (body.action === 'activate' || body.action === 'pause' || body.action === 'end') {
      const id = geoID(body.id),
        version = planVersion(body.version),
        plan = await store.find(id)
      if (!plan) throw new GeoError('NOT_FOUND', '未找到当前客户发布计划。', 404)
      if (body.action === 'activate' && body.confirmed !== true)
        throw new GeoError('CONFIRMATION_REQUIRED', '请先检查计划预览，并明确确认启用。', 409)
      if (
        body.action === 'activate' &&
        (typeof body.previewNextRunAt !== 'string' ||
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(body.previewNextRunAt))
      )
        throw new GeoError('PLAN_PREVIEW_REQUIRED', '请先预览并确认首轮执行时间。', 409)
      if (
        body.action === 'activate' &&
        plan.config.approvalMode === 'auto' &&
        plan.config.schedule.cadence !== 'once' &&
        !userHasRole(scope.user, settingsAdminRoles)
      )
        throw new GeoError(
          'AUTO_PUBLISH_ADMIN_ONLY',
          '只有当前客户管理员可以启用自动确认发布计划。',
          403,
        )
      if (body.action === 'activate')
        for (const frozen of plan.config.targets) {
          const target = await loadGeoPublishTarget(
            scope.payload,
            scope.user,
            scope.company.id,
            frozen.collection,
            frozen.categoryID,
            frozen.locale,
          )
          if (!sameGeoPublishTarget(frozen, target))
            throw new GeoError(
              'TARGET_CHANGED',
              '目标站点或分类信息已变化，请重新修改并预览计划。',
              409,
            )
        }
      const item = await store.action(
        id,
        body.action,
        version,
        new Date(),
        body.action === 'activate' ? (body.previewNextRunAt as string) : undefined,
      )
      return geoReply({
        item,
        message:
          body.action === 'activate'
            ? '计划已按预览的首轮时间启用。'
            : body.action === 'pause'
              ? '计划已暂停；已进入发布队列的项目不受影响。'
              : '计划已结束；已进入发布队列的项目不受影响。',
        requestId,
      })
    }
    if (body.action === 'approve') {
      const runID = geoID(body.runID),
        itemID = geoID(body.itemID)
      const planItem = await store.item(runID, itemID)
      if (!planItem) throw new GeoError('NOT_FOUND', '未找到当前客户的待审核发布项。', 404)
      if (planItem.state !== 'awaiting_review')
        throw new GeoError('PLAN_ITEM_CHANGED', '此发布项已处理，请刷新状态。', 409)
      const articleStore = createGeoArticleStore(pool, scope.company.id, scope.user.id)
      const article = await articleStore.find(planItem.article_id)
      if (
        !article ||
        article.version !== planItem.article_version ||
        article.status !== 'ready' ||
        planItem.current_version !== planItem.article_version
      )
        throw new GeoError('ARTICLE_CHANGED', '文章已修改或撤销核查，请重新生成发布计划。', 409)
      const visible = await articleStore.visibleArticle(article),
        checked = validateGeoArticle(visible, visible.context)
      if (checked.issues.length)
        throw new GeoError('ARTICLE_INVALID', `文章仍需处理：${checked.issues.join(' ')}`)
      geoArticleToLexical(visible)
      const frozen = planItem.target
      const target = await loadGeoPublishTarget(
        scope.payload,
        scope.user,
        scope.company.id,
        frozen.collection,
        frozen.categoryID,
        frozen.locale,
      )
      if (!sameGeoPublishTarget(frozen, target))
        throw new GeoError(
          'TARGET_CHANGED',
          '站点、分类或目标信息已变化，请暂停并更新计划后再审核。',
          409,
        )
      const publisher = createGeoPublishStore(pool, scope.company.id, scope.user.id)
      await publisher.enqueue(
        itemID,
        {
          articleID: article.id,
          version: article.version,
          collection: target.collection,
          categoryID: target.categoryID,
          publishAt: null,
        },
        target,
        visible,
      )
      return geoReply(
        {
          item: { id: itemID, state: 'queued' },
          message: '已审核并进入现有发布队列；实际结果可在发布记录中查看。',
          requestId,
        },
        202,
      )
    }
    if (body.action === 'skip') {
      await store.skipItem(geoID(body.runID), geoID(body.itemID))
      return geoReply({
        item: { id: body.itemID, state: 'skipped' },
        message: '已跳过此文章，不会进入发布队列。',
        requestId,
      })
    }
    throw new GeoError('INVALID_ACTION', '请选择有效的计划操作。')
  } catch (error) {
    return geoAPIError(error, requestId)
  }
}

function planVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new GeoError('INVALID_VERSION', '计划版本无效。')
  return Number(value)
}
