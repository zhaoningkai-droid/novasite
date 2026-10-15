import { APIError } from 'payload'
import { NextResponse } from 'next/server'
import {
  inquiryOperatorRoles, inquiryReaderRoles, readWorkspaceInquiryNotification,
  retryInquiryNotification,
} from '@/platform/inquiry/inbox-service'
import { workspaceSettingsScope } from '@/platform/workspace-settings-api'

type Context = { params: Promise<{ company: string; inquiryID: string }> }
export async function GET(_request: Request, { params }: Context) {
  const { company, inquiryID } = await params
  const scope = await workspaceSettingsScope(company, [...inquiryReaderRoles])
  if ('error' in scope) return scope.error
  if (!/^\d+$/.test(inquiryID) || !Number.isSafeInteger(Number(inquiryID))
    || Number(inquiryID) < 1 || Number(inquiryID) > 2147483647) {
    return NextResponse.json({ message: '询盘编号无效。' }, { status: 400 })
  }
  try {
    const notification = await readWorkspaceInquiryNotification(scope, Number(inquiryID))
    return NextResponse.json({ notification }, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    })
  } catch (error) {
    return NextResponse.json({ message: error instanceof APIError ? error.message
      : '通知状态暂时无法读取。' }, {
      status: error instanceof APIError ? error.status : 503,
    })
  }
}

export async function POST(request: Request, { params }: Context) {
  const { company, inquiryID } = await params
  const scope = await workspaceSettingsScope(company, [...inquiryOperatorRoles])
  if ('error' in scope) return scope.error
  if (!/^\d+$/.test(inquiryID) || !Number.isSafeInteger(Number(inquiryID))
    || Number(inquiryID) < 1 || Number(inquiryID) > 2147483647) {
    return NextResponse.json({ message: '询盘编号无效。' }, { status: 400 })
  }
  try {
    const origin = new URL(request.headers.get('origin') || '')
    if (origin.host.toLowerCase() !== request.headers.get('host')?.toLowerCase()
      || !['http:', 'https:'].includes(origin.protocol)) throw new Error()
  } catch { return NextResponse.json({ message: '请在当前后台操作。' }, { status: 403 }) }
  if (!request.headers.get('content-type')?.startsWith('application/json')
    || Number(request.headers.get('content-length') || 0) > 1000) {
    return NextResponse.json({ message: '提交格式无效。' }, { status: 400 })
  }
  const body = await request.json().catch(() => null)
  if (body?.confirm !== true || typeof body.acknowledgePossibleDuplicate !== 'boolean') {
    return NextResponse.json({ message: '请先确认通知操作。' }, { status: 422 })
  }
  try {
    const notification = await retryInquiryNotification(scope, Number(inquiryID),
      body.acknowledgePossibleDuplicate)
    return NextResponse.json({ notification, message: '通知已安排重试，询盘没有重复创建。' })
  } catch (error) {
    return NextResponse.json({ message: error instanceof APIError ? error.message
      : '通知暂时无法安排，请稍后重试。' }, {
      status: error instanceof APIError ? error.status : 503,
    })
  }
}
