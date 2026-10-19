import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { settingsEditorRoles, workspaceSettingsScope } from '../workspace-settings-api'
import { assertGeoWriteRequest, geoAPIError, geoReply, readGeoBody } from './keyword-api'
import { GeoError, geoID, geoVersion } from './keywords'
import { parseGeoTask } from './tasks'
import { createGeoTaskStore } from './task-store'
import { isSiteLocale } from '../site-locales'
export async function handleGeoTasks(request: Request, company: string, id?: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error)
      return geoReply({ ...(await scope.error.json()), requestId }, scope.error.status)
    const store = createGeoTaskStore(
      (scope.payload.db as unknown as PostgresAdapter).pool,
      scope.company.id,
      scope.user.id,
    )
    if (request.method === 'GET') {
      if (id) {
        const item = await store.find(geoID(id))
        if (!item) throw new GeoError('NOT_FOUND', '未找到当前客户的任务。', 404)
        return geoReply({ item, requestId })
      }
      const params = new URL(request.url).searchParams,
        page = Number(params.get('page') || 1),
        pageSize = Number(params.get('pageSize') || 10),
        q = params.get('q') || '',
        type = params.get('type') || '',
        locale = params.get('locale') || ''
      if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > 100000 ||
        q.length > 100 ||
        !['', 'search'].includes(type) ||
        ![10, 15, 20, 50].includes(pageSize) ||
        (locale && !isSiteLocale(locale))
      )
        throw new GeoError('INVALID_QUERY', '搜索、语言或分页参数不正确。')
      return geoReply({ ...(await store.list(q, page, locale, pageSize)), requestId })
    }
    const body = await readGeoBody(request, 2_097_152)
    if (request.method === 'DELETE') {
      const ids = id ? [geoID(id)] : Array.isArray(body.ids) ? body.ids.map(geoID) : []
      const versions = id
        ? { [ids[0]]: geoVersion(body.version) }
        : body.versions && typeof body.versions === 'object' && !Array.isArray(body.versions)
          ? (body.versions as Record<string, number>)
          : {}
      const result = await store.archive(ids, versions)
      return geoReply({ ...result, requestId })
    }
    if (request.method === 'POST' && id && body.action === 'copy') {
      const source = await store.find(geoID(id))
      if (!source) throw new GeoError('NOT_FOUND', '未找到当前客户的任务。', 404)
      const {
        id: _id,
        version: _version,
        status: _status,
        updatedAt: _updatedAt,
        snapshot: _snapshot,
        ...values
      } = source
      const copyValues = parseGeoTask({
        ...values,
        name: `${source.name.slice(0, 17)}-副本`,
      })
      return geoReply({ item: await store.save(geoID(body.requestId), copyValues), requestId }, 201)
    }
    const values = parseGeoTask(body)
    if (request.method === 'POST' && !id)
      return geoReply({ item: await store.save(geoID(body.requestId), values), requestId }, 201)
    if (request.method === 'PATCH' && id)
      return geoReply({
        item: await store.save(geoID(id), values, geoVersion(body.version)),
        requestId,
      })
    throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
  } catch (error) {
    return geoAPIError(error, requestId)
  }
}
