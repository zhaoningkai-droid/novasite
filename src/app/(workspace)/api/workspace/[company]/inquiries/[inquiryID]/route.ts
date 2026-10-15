import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { APIError } from 'payload'
import {
  inquiryReaderRoles, readInquiryNotification, readWorkspaceInquiry,
  updateWorkspaceInquiry,
} from '@/platform/inquiry/inbox-service'
import { isInquiryStatus } from '@/platform/inquiry/inbox-model'
import { workspaceSettingsScope } from '@/platform/workspace-settings-api'

type Context = { params: Promise<{ company: string; inquiryID: string }> }
const validID = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
  && Number(value) > 0 && Number(value) <= 2147483647
const replyError = (error: unknown) => NextResponse.json({
  message: error instanceof APIError ? error.message : '询盘暂时无法读取或保存，请稍后重试。',
}, { status: error instanceof APIError ? error.status : 503 })

export async function GET(_request: Request, { params }: Context) {
  const { company, inquiryID } = await params
  const scope = await workspaceSettingsScope(company, [...inquiryReaderRoles])
  if ('error' in scope) return scope.error
  if (!validID(inquiryID)) return NextResponse.json({ message: '询盘编号无效。' }, { status: 400 })
  try {
    const lead = await readWorkspaceInquiry(scope, Number(inquiryID))
    const notification = await readInquiryNotification(scope.payload, scope.company.id, lead.id)
    return NextResponse.json({ lead, notification }, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    })
  } catch (error) { return replyError(error) }
}

export async function PATCH(request: Request, { params }: Context) {
  const { company, inquiryID } = await params
  const scope = await workspaceSettingsScope(company, [...inquiryReaderRoles])
  if ('error' in scope) return scope.error
  if (!validID(inquiryID)) return NextResponse.json({ message: '询盘编号无效。' }, { status: 400 })
  // Mutation is browser same-origin JSON; the production proxy also enforces this.
  try {
    const origin = new URL(request.headers.get('origin') || '')
    if (origin.host.toLowerCase() !== request.headers.get('host')?.toLowerCase()
      || !['http:', 'https:'].includes(origin.protocol)) throw new Error()
  } catch { return NextResponse.json({ message: '请在当前后台页面保存。' }, { status: 403 }) }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ message: '提交格式无效。' }, { status: 400 })
  }
  if (Number(request.headers.get('content-length') || 0) > 30000) {
    return NextResponse.json({ message: '备注过长，请缩短后保存。' }, { status: 413 })
  }
  const body = await request.json().catch(() => null)
  if (!body || !isInquiryStatus(body.status) || typeof body.expectedUpdatedAt !== 'string'
    || !Number.isFinite(Date.parse(body.expectedUpdatedAt))
    || (body.internalNotes !== undefined
      && (typeof body.internalNotes !== 'string' || body.internalNotes.length > 8000))) {
    return NextResponse.json({ message: '跟进状态或备注格式无效。' }, { status: 422 })
  }
  try {
    const lead = await updateWorkspaceInquiry(scope, Number(inquiryID), body)
    revalidatePath(`/workspace/${company}/website/inquiries`)
    revalidatePath(`/workspace/${company}/website/analytics`)
    return NextResponse.json({ lead, message: '跟进信息已保存。' })
  } catch (error) { return replyError(error) }
}
