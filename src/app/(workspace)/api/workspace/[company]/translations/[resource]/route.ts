import { after, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { settingsEditorRoles, workspaceSettingsScope } from '@/platform/workspace-settings-api'
import { contentTranslationViews, queueContentTranslations } from '@/platform/content-translation/jobs'
import { isTranslationResource } from '@/platform/content-translation/resources'
import { runOneProductTranslation } from '@/platform/product-translation/jobs'

type Context = { params: Promise<{ company: string; resource: string }> }
const validIDs = (ids: unknown): ids is number[] => Array.isArray(ids) && ids.length > 0 && ids.length <= 50 && ids.every((id) => Number.isSafeInteger(id) && id > 0 && id <= 67108862)
export const maxDuration = 240
export async function GET(request: Request, { params }: Context) {
  const { company: slug, resource } = await params
  if (!isTranslationResource(resource)) return NextResponse.json({ message: '不支持这个翻译模块。' }, { status: 404 })
  const scope = await workspaceSettingsScope(slug)
  if ('error' in scope) return scope.error
  const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').map(Number)
  if (!validIDs(ids)) return NextResponse.json({ message: '请选择需要翻译的内容。' }, { status: 422 })
  try {
    const company = await scope.payload.findByID({ collection: 'tenants', id: scope.company.id, depth: 0, overrideAccess: false, user: scope.user, context: { skipContentTranslationOverlay: true } })
    const result = await contentTranslationViews(scope.payload, company, scope.user, resource, [...new Set(ids)])
    if (result.views.some((view) => view.completed)) {
      for (const locale of company.enabledLocales || []) revalidatePath(`/s/${slug}/${locale}`, 'layout')
    }
    return NextResponse.json(result, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    return NextResponse.json({ message: error instanceof Error ? error.message : '翻译状态读取失败。' }, { status })
  }
}
export async function POST(request: Request, { params }: Context) {
  const { company: slug, resource } = await params
  if (!isTranslationResource(resource)) return NextResponse.json({ message: '不支持这个翻译模块。' }, { status: 404 })
  const scope = await workspaceSettingsScope(slug, settingsEditorRoles)
  if ('error' in scope) return scope.error
  if (Number(request.headers.get('content-length') || 0) > 5000) return NextResponse.json({ message: '提交内容过大。' }, { status: 413 })
  const body = await request.json().catch(() => null)
  if (!validIDs(body?.ids)) return NextResponse.json({ message: '请选择1至50项内容。' }, { status: 422 })
  const company = await scope.payload.findByID({ collection: 'tenants', id: scope.company.id, depth: 0, overrideAccess: false, user: scope.user, context: { skipContentTranslationOverlay: true } })
  const response = await queueContentTranslations({ ...scope, company, resource, ids: body.ids })
  if (response.status === 202) after(async () => { try { await runOneProductTranslation(scope.payload); revalidatePath(`/workspace/${slug}/website`, 'layout') } catch { /* Durable worker resumes the stored task. */ } })
  return response
}
