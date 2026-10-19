import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { userHasRole } from '@/access/roles'
import { settingsEditorRoles, workspaceSettingsScope } from '../workspace-settings-api'
import { assertGeoWriteRequest, geoAPIError, geoReply, readGeoBody } from './keyword-api'
import { GeoError, geoID, geoVersion } from './keywords'
import { parseMaterialFolderName, parseMaterialValues } from './materials'
import { createGeoMaterialStore } from './material-store'

export async function handleGeoMaterials(request: Request, companySlug: string, id?: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scoped = await workspaceSettingsScope(companySlug, settingsEditorRoles)
    if (scoped.error) {
      const body = await scoped.error.json()
      return geoReply(
        { code: `SCOPE_${scoped.error.status}`, message: body.message, requestId },
        scoped.error.status,
      )
    }
    const store = createGeoMaterialStore(
      (scoped.payload.db as unknown as PostgresAdapter).pool,
      scoped.company.id,
      scoped.user.id,
    )
    if (request.method === 'GET') {
      if (id) {
        const key = geoID(id)
        const item =
          new URL(request.url).searchParams.get('summary') === 'true'
            ? await store.findSummary(key)
            : await store.find(key)
        if (!item) throw new GeoError('NOT_FOUND', '未找到当前客户的素材组。', 404)
        return geoReply({ item, requestId })
      }
      const search = new URL(request.url).searchParams
      const page = Number(search.get('page') || 1),
        query = search.get('q') || ''
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || query.length > 100)
        throw new GeoError('INVALID_QUERY', '搜索或分页参数不正确。')
      if (search.get('tree') === 'true')
        return geoReply({ ...(await store.listTree(search.get('archived') === 'true')), requestId })
      return geoReply({
        ...(await store.list(query, page, search.get('archived') === 'true')),
        requestId,
      })
    }
    const body = await readGeoBody(request)
    let item
    if (request.method === 'PATCH' && id && 'archived' in body) {
      if (typeof body.archived !== 'boolean') throw new GeoError('INVALID_INPUT', '归档状态无效。')
      if (!userHasRole(scoped.user, ['super-admin', 'site-admin']))
        throw new GeoError('FORBIDDEN', '只有管理员可以归档或恢复素材组。', 403)
      item = await store.archive(geoID(id), geoVersion(body.version), body.archived)
    } else if (request.method === 'POST' && !id && body.kind === 'folder') {
      item = await store.createFolder(geoID(body.requestId), parseMaterialFolderName(body.name))
    } else if (request.method === 'POST' && !id) {
      const parentGroupID =
        body.parentGroupID === null || body.parentGroupID === undefined
          ? null
          : geoID(body.parentGroupID)
      item = await store.save(
        geoID(body.requestId),
        parseMaterialValues(body),
        undefined,
        undefined,
        parentGroupID,
      )
    } else if (request.method === 'PATCH' && id) {
      item = await store.save(geoID(id), parseMaterialValues(body), geoVersion(body.version))
    } else throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
    return geoReply(
      { item, message: '素材组已保存。', requestId },
      request.method === 'POST' ? 201 : 200,
    )
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
    if (code === '23505')
      return geoReply(
        { code: 'DUPLICATE_GROUP', message: '所选目录中已有同名目录或素材组。', requestId },
        409,
      )
    if (code === '23503' || code === '23514')
      return geoReply(
        {
          code: 'INVALID_MEDIA',
          message: '部分素材已不可用或不属于当前客户，请重新选择。',
          requestId,
        },
        422,
      )
    return geoAPIError(error, requestId)
  }
}
