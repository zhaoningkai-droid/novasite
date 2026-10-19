import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { settingsEditorRoles, workspaceSettingsScope } from '../workspace-settings-api'
import { assertGeoWriteRequest, geoAPIError, geoReply, readGeoBody } from './keyword-api'
import { GeoError, geoID } from './keywords'
import { createGeoKeywordStore } from './keyword-store'
import { createGeoAIStore } from './ai-store'
import { parseGeoAIInput, runGeoQuestionAI } from './question-ai'
export async function handleGeoAI(request: Request, company: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error)
      return geoReply({ ...(await scope.error.json()), requestId }, scope.error.status)
    const pool = (scope.payload.db as unknown as PostgresAdapter).pool
    const store = createGeoAIStore(pool, scope.company.id, scope.user.id)
    if (request.method === 'GET')
      return geoReply({
        items: await store.recent(geoID(new URL(request.url).searchParams.get('optimizationID'))),
        requestId,
      })
    if (request.method !== 'POST') throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
    const body = await readGeoBody(request, 2 * 1024 * 1024),
      id = geoID(body.requestId)
    const config = await createGeoKeywordStore(pool, scope.company.id, scope.user.id).find(
      geoID(body.optimizationID),
    )
    if (!config) throw new GeoError('NOT_FOUND', '未找到当前客户的优化词配置。', 404)
    const input = parseGeoAIInput(body, config)
    if (!process.env.DEEPSEEK_API_KEY)
      throw new GeoError('AI_NOT_CONFIGURED', 'GEO扩词和翻译服务尚未配置，请联系管理员。', 503)
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash'
    const claim = await store.claim(id, input, model)
    if (!claim.claimed)
      return geoReply(
        { operation: claim.operation, replayed: true, requestId },
        claim.operation.state === 'running' ? 202 : 200,
      )
    try {
      const result = await runGeoQuestionAI(input, config, {
        key: process.env.DEEPSEEK_API_KEY,
        model,
        onUsage: (usage) => store.usage(id, usage),
      })
      return geoReply({ operation: await store.finish(id, 'succeeded', result, null), requestId })
    } catch (error) {
      const known = error instanceof GeoError,
        name = error instanceof Error ? error.name : ''
      const uncertain = !known || ['AbortError', 'TimeoutError'].includes(name)
      const code = known ? error.code : 'PROVIDER_UNCONFIRMED'
      await store.finish(id, uncertain ? 'unknown' : 'failed', null, code)
      throw new GeoError(
        code,
        known ? error.message : 'AI调用结果未确认，可能产生用量。请先取回结果，勿直接重复提交。',
        known ? error.status : 503,
      )
    }
  } catch (error) {
    return geoAPIError(error, requestId)
  }
}
