import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { settingsEditorRoles, workspaceSettingsScope } from '../workspace-settings-api'
import { assertGeoWriteRequest, geoAPIError, geoReply, readGeoBody } from './keyword-api'
import { GeoError, geoID, geoObject } from './keywords'
import { createGeoKeywordStore } from './keyword-store'
import { createGeoVisibilityStore } from './visibility-store'
import { createGeoSourceStore } from './source-store'
import { parseGeoObservation, parseGeoQuestions } from './visibility'

export async function handleGeoVisibility(request: Request, company: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error)
      return geoReply({ ...(await scope.error.json()), requestId }, scope.error.status)
    const pool = (scope.payload.db as unknown as PostgresAdapter).pool
    const store = createGeoVisibilityStore(pool, scope.company.id, scope.user.id)
    if (request.method === 'GET') {
      const optimizationID = geoID(new URL(request.url).searchParams.get('optimizationID'))
      const config = await createGeoKeywordStore(pool, scope.company.id, scope.user.id).find(
        optimizationID,
      )
      if (!config) throw new GeoError('NOT_FOUND', '未找到当前客户的GEO优化词。', 404)
      return geoReply({
        config: {
          id: config.id,
          brand: config.brand,
          aliases: config.aliases,
          core: config.core,
          terms: config.terms,
          version: config.version,
        },
        ...(await store.list(optimizationID)),
        sourcePages: await createGeoSourceStore(pool, scope.company.id).list(
          config.id,
          config.version,
        ),
        requestId,
      })
    }
    if (request.method !== 'POST') throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
    const body = await readGeoBody(request, 256000)
    if (body.action === 'save_questions') {
      const optimizationID = geoID(body.optimizationID)
      if (!Number.isSafeInteger(body.version) || Number(body.version) < 0)
        throw new GeoError('INVALID_VERSION', '问题集版本无效，请刷新页面后重试。')
      const questions = parseGeoQuestions(body.questions)
      const questionSet = await store.saveQuestions(optimizationID, Number(body.version), questions)
      return geoReply({
        questionSet,
        message: '问题集已保存；历史采样仍保留原问题与版本。',
        requestId,
      })
    }
    if (body.action === 'record') {
      const optimizationID = geoID(body.optimizationID),
        idempotencyID = geoID(body.requestID)
      const result = await store.record(optimizationID, idempotencyID, parseGeoObservation(body))
      return geoReply(
        {
          observation: result.observation,
          replayed: result.replayed,
          message: result.replayed
            ? '此采样请求已处理，返回了原记录。'
            : result.observation.resultState === 'failed'
              ? '检测失败已记录；该样本不计入提及率和引用率。'
              : '人工采样已记录；提及情况按当前配置中的品牌词与比对标识匹配。',
          requestId,
        },
        result.replayed ? 200 : 201,
      )
    }
    const row = geoObject(body)
    throw new GeoError(
      'INVALID_ACTION',
      typeof row.action === 'string' ? '请选择有效操作。' : '缺少操作类型。',
    )
  } catch (error) {
    return geoAPIError(error, requestId)
  }
}
