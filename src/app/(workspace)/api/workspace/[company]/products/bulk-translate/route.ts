import { after, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { settingsEditorRoles, workspaceSettingsScope } from '@/platform/workspace-settings-api'
import {
  productTranslationViews,
  queueProductTranslations,
  runOneProductTranslation,
} from '@/platform/product-translation/jobs'

type Context = { params: Promise<{ company: string }> }
export const maxDuration = 240
const validIDs = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= 50 &&
  value.every((id) => Number.isSafeInteger(id) && id > 0)

export async function GET(request: Request, { params }: Context) {
  const { company: slug } = await params
  const scope = await workspaceSettingsScope(slug, settingsEditorRoles)
  if ('error' in scope) return scope.error
  const company = await scope.payload.findByID({
    collection: 'tenants',
    id: scope.company.id,
    depth: 0,
    overrideAccess: false,
    user: scope.user,
  })
  const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').map(Number)
  if (!validIDs(ids)) return NextResponse.json({ message: '产品编号无效。' }, { status: 422 })
  try {
    const result = await productTranslationViews(scope.payload, company, scope.user, [
      ...new Set(ids),
    ])
    // Status requests run in Next's request context. Public pages also read current DB content directly.
    if (result.views.some((view) => view.completed)) {
      for (const locale of company.enabledLocales || [])
        revalidatePath(`/s/${slug}/${locale}`, 'layout')
    }
    return NextResponse.json(result, { headers: { 'cache-control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ message: '翻译进度读取失败，请稍后刷新。' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: Context) {
  const { company: slug } = await params
  const scope = await workspaceSettingsScope(slug, settingsEditorRoles)
  if ('error' in scope) return scope.error
  const company = await scope.payload.findByID({
    collection: 'tenants',
    id: scope.company.id,
    depth: 0,
    overrideAccess: false,
    user: scope.user,
  })
  if (Number(request.headers.get('content-length') || 0) > 5000)
    return NextResponse.json({ message: '提交内容过大。' }, { status: 413 })
  const body = await request.json().catch(() => null)
  if (!validIDs(body?.ids))
    return NextResponse.json({ message: '请选择1至50个产品。' }, { status: 422 })
  const response = await queueProductTranslations({ ...scope, company, productIDs: body.ids })
  if (response.status === 202) {
    // An immediate kick improves local responsiveness; the independent worker ensures restart recovery.
    after(async () => {
      try {
        await runOneProductTranslation(scope.payload)
        revalidatePath(`/workspace/${slug}/website/content`)
      } catch {
        /* The persisted job remains available to the worker. */
      }
    })
  }
  return response
}
