import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { workspaceSettingsScope, settingsEditorRoles } from '../workspace-settings-api'
import { assertGeoWriteRequest, geoReply, readGeoBody, geoAPIError } from '../geo/keyword-api'
import { assertGeoRequestOrigin } from '../geo/request-origin'
import { GeoError, geoID, geoVersion } from '../geo/keywords'
import { createKnowledgeStore } from './store'
import { retrieveKnowledge } from './retrieval'
const requiredText = (raw: unknown, label: string) => {
  if (typeof raw !== 'string' || !raw.trim())
    throw new GeoError('INVALID_INPUT', `请填写${label}。`)
  return raw.trim()
}
export async function handleKnowledge(request: Request, company: string, rawID?: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') {
      assertGeoRequestOrigin(request)
      if (!request.headers.get('content-type')?.startsWith('multipart/form-data'))
        assertGeoWriteRequest(request)
    }
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if (scope.error) return scope.error
    const pool = (scope.payload.db as unknown as PostgresAdapter).pool,
      store = createKnowledgeStore(pool, scope.company.id, scope.user.id)
    const url = new URL(request.url),
      id = rawID ? geoID(rawID) : undefined
    if (request.method === 'GET') {
      if (id && url.searchParams.get('download') === '1') {
        const file = await store.original(id)
        return new Response(new Uint8Array(file.original), {
          headers: {
            'content-type': 'application/octet-stream',
            'content-disposition': `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
            'cache-control': 'private, no-store',
            'x-content-type-options': 'nosniff',
          },
        })
      }
      if (id)
        return geoReply({
          document: await store.findDocument(id),
          chunks: await store.chunks(id),
          requestId,
        })
      return geoReply({
        base: await store.base(),
        documents: await store.documents(
          url.searchParams.get('q') || '',
          url.searchParams.get('archived') === '1',
        ),
        requestId,
      })
    }
    if (
      request.method === 'POST' &&
      request.headers.get('content-type')?.startsWith('multipart/form-data')
    ) {
      if (Number(request.headers.get('content-length')) > 34 * 1024 * 1024)
        throw new GeoError('FILE_TOO_LARGE', '单次上传文件过大，请拆分后上传。', 413)
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File) || !file.size)
        throw new GeoError('INVALID_FILE', '请选择电脑上的资料文件。')
      if (file.size > 32 * 1024 * 1024)
        throw new GeoError('FILE_TOO_LARGE', '单个文件过大，请拆分后上传。', 413)
      const filename = file.name
        .split(/[\\/]/)
        .pop()!
        .replace(/[\u0000-\u001f]/g, '')
        .slice(0, 255)
      const result = await store.upload(filename, file.type, Buffer.from(await file.arrayBuffer()))
      return geoReply({ ...result, requestId }, 201)
    }
    const body = await readGeoBody(request, 4 * 1024 * 1024)
    if (request.method === 'POST' && body.action === 'search') {
      const query = requiredText(body.query, '检索问题')
      const result = await retrieveKnowledge(
        pool,
        scope.company.id,
        { question: query, direction: typeof body.direction === 'string' ? body.direction : '' },
        { key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL },
      )
      return geoReply({ ...result, requestId })
    }
    if (request.method === 'POST' && body.action === 'text') {
      const title = requiredText(body.title, '资料标题'),
        text = requiredText(body.text, '资料内容')
      return geoReply(
        { ...(await store.upload(`${title}.txt`, 'text/plain', Buffer.from(text))), requestId },
        201,
      )
    }
    if (request.method === 'PUT' && !id) {
      await store.saveBase({
        name: requiredText(body.name, '知识库名称'),
        intro: typeof body.intro === 'string' ? body.intro.trim() : '',
        enabled: body.enabled !== false,
        version: body.version === undefined ? undefined : geoVersion(body.version),
      })
      return geoReply({ base: await store.base(), message: '已保存', requestId })
    }
    if (request.method === 'PATCH' && id) {
      if (body.action === 'retry')
        return geoReply({ document: await store.retry(id), message: '已重新解析', requestId })
      if (body.action === 'content')
        return geoReply({
          document: await store.index(
            id,
            requiredText(body.text, '资料内容'),
            geoVersion(body.version),
          ),
          message: '已保存',
          requestId,
        })
      if (typeof body.enabled !== 'boolean' && typeof body.archived !== 'boolean')
        throw new GeoError('INVALID_INPUT', '请选择资料操作。')
      await store.update(id, geoVersion(body.version), {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        archived: typeof body.archived === 'boolean' ? body.archived : undefined,
      })
      return geoReply({ message: '已保存', requestId })
    }
    throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
  } catch (error) {
    console.error('[knowledge]', error instanceof GeoError ? error.code : 'UNAVAILABLE', requestId)
    return geoAPIError(error, requestId)
  }
}
