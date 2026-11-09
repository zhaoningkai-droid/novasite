import { NextResponse } from 'next/server'
import { assertGeoRequestOrigin } from '@/platform/geo/request-origin'
import { parseTranslationReview, retryReviewedTranslation } from '@/platform/product-translation/review'
import { settingsAdminRoles, settingsAPIError, workspaceSettingsScope } from '@/platform/workspace-settings-api'

type Context = { params: Promise<{ company: string }> }

export async function POST(request: Request, { params }: Context) {
  try {
    assertGeoRequestOrigin(request)
    const { company: slug } = await params
    const scope = await workspaceSettingsScope(slug, settingsAdminRoles)
    if ('error' in scope) return scope.error
    if (Number(request.headers.get('content-length') || 0) > 2048)
      return NextResponse.json({ message: '提交内容过大。' }, { status: 413 })
    const input = parseTranslationReview(await request.json().catch(() => null))
    const result = await retryReviewedTranslation(scope.payload, scope.company.id, scope.user, input)
    return NextResponse.json({ ...result, message: '已重新排队，可离开页面。' }, { status: 202 })
  } catch (error) {
    return settingsAPIError(error, '确认状态暂时无法读取，请刷新任务后查看。')
  }
}
