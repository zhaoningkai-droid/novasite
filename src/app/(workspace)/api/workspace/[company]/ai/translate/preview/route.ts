import { APIError } from 'payload'
import { NextResponse } from 'next/server'
import { assertGeoRequestOrigin } from '@/platform/geo/request-origin'
import { fieldTranslationPreview, parseFieldPreview } from '@/platform/product-translation/field-preview'
import { settingsEditorRoles, workspaceSettingsScope } from '@/platform/workspace-settings-api'

type Context = { params: Promise<{ company: string }> }

async function readPreviewBody(request: Request) {
  const maximum = 48_000
  if (Number(request.headers.get('content-length')) > maximum)
    throw new APIError('翻译预览请求过长。', 413)
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new APIError('请提交 JSON 格式的预览请求。', 415)
  const reader = request.body?.getReader()
  if (!reader) throw new APIError('请提交翻译预览请求。', 400)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let length = 0
  let body = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximum) {
        await reader.cancel().catch(() => {})
        throw new APIError('翻译预览请求过长。', 413)
      }
      body += decoder.decode(value, { stream: true })
    }
    return JSON.parse(body + decoder.decode()) as unknown
  } catch (error) {
    if (error instanceof APIError) throw error
    throw new APIError('翻译预览请求格式无效。', 400)
  } finally { reader.releaseLock() }
}

export async function POST(request: Request, { params }: Context) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
  try {
    assertGeoRequestOrigin(request)
    const { company } = await params
    const scope = await workspaceSettingsScope(company, settingsEditorRoles)
    if ('error' in scope) return scope.error
    const input = parseFieldPreview(await readPreviewBody(request))
    const preview = await fieldTranslationPreview(scope.payload, scope.company.id, scope.user, input)
    const writes = input.action === 'generate' || input.action === 'retry-unknown'
    const queued = writes && (preview?.status === 'queued' || preview?.status === 'running')
    return NextResponse.json({ preview }, { status: queued ? 202 : 200, headers })
  } catch (error) {
    if (error instanceof APIError) return NextResponse.json({ message: error.message }, { status: error.status, headers })
    if (error instanceof Error && 'code' in error && error.code === 'INVALID_ORIGIN')
      return NextResponse.json({ message: '请在当前后台提交翻译预览。' }, { status: 403, headers })
    return NextResponse.json({ message: '暂时无法读取翻译预览，请刷新后查看。' }, { status: 503, headers })
  }
}
