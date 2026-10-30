import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { settingsEditorRoles, workspaceSettingsScope } from '../workspace-settings-api'
import { assertGeoWriteRequest, geoAPIError, geoReply, readGeoBody } from './keyword-api'
import { GeoError, geoID } from './keywords'
import { createGeoKeywordStore } from './keyword-store'
import { assertLocalDetectionStorage, parseDetectionInput } from './detection'
import { createGeoDetectionStore } from './detection-store'

export async function handleGeoDetection(request: Request, company: string, artifactID?: string) {
  const requestId = randomUUID()
  try {
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error)
      return geoReply({ ...(await scope.error.json()), requestId }, scope.error.status)
    assertLocalDetectionStorage()
    const pool = (scope.payload.db as unknown as PostgresAdapter).pool
    const store = createGeoDetectionStore(pool, scope.company.id, scope.user.id)
    if (artifactID) {
      if (request.method !== 'GET')
        throw new GeoError('METHOD_NOT_ALLOWED', '证据文件只允许读取。', 405)
      const artifact = await store.artifact(geoID(artifactID))
      return new Response(new Uint8Array(artifact.payload), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="geo-${artifact.kind}-${artifact.id}.json"`,
          'Cache-Control': 'private, no-store',
          Vary: 'Cookie',
          'X-Content-Type-Options': 'nosniff',
          'X-Evidence-SHA256': artifact.sha256,
        },
      })
    }
    if (request.method === 'GET') {
      const query = new URL(request.url).searchParams
      if (query.has('runID'))
        return geoReply({ ...(await store.detail(geoID(query.get('runID')))), requestId })
      const page = Number(query.get('page') || 1)
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
        throw new GeoError('INVALID_QUERY', '分页参数无效。')
      const [list, configs] = await Promise.all([
        store.list(page),
        createGeoKeywordStore(pool, scope.company.id, scope.user.id).list('', 1, 100),
      ])
      return geoReply({
        ...list,
        configs: configs.items.map((config) => ({
          id: config.id,
          brand: config.brand,
          core: config.core,
          version: config.version,
        })),
        requestId,
      })
    }
    if (request.method !== 'POST') throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
    assertGeoWriteRequest(request)
    const body = await readGeoBody(request, 64000)
    if (body.action === 'create') {
      const result = await store.create(parseDetectionInput(body))
      return geoReply({ ...result, requestId }, result.replayed ? 200 : 201)
    }
    if (body.action === 'save_fixture') {
      const result = await store.saveFixture(geoID(body.jobID), geoID(body.requestID))
      return geoReply({ ...result, requestId }, result.replayed ? 200 : 201)
    }
    throw new GeoError('INVALID_ACTION', '请选择有效的存储验收操作。')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '42P01')
      return geoReply(
        {
          code: 'DETECTION_STORAGE_NOT_READY',
          message: '检测任务存储尚未安装，请先完成本地增量安装。',
          requestId,
        },
        503,
      )
    return geoAPIError(error, requestId)
  }
}
