import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string; mediaID: string }> }

export async function DELETE(_request: Request, { params }: Context) {
  const { company: slug, mediaID: rawMediaID } = await params
  const mediaID = Number(rawMediaID)
  if (!Number.isInteger(mediaID)) return NextResponse.json({ message: '媒体编号无效。' }, { status: 400 })
  const cookieStore = await cookies()
  if (!cookieStore.get('payload-token')?.value) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const { user } = await getMeUser()
  if (!user) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || cookieStore.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前工作公司已切换，请刷新后重试。' }, { status: 409 })
  const payload = await getPayload({ config })
  const found = await payload.find({ collection: 'media', depth: 0, limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: mediaID } }, { tenant: { equals: company.id } }] } })
  if (!found.docs[0]) return NextResponse.json({ message: '未找到当前公司的媒体文件。' }, { status: 404 })
  await payload.delete({ collection: 'media', id: mediaID, overrideAccess: false, user })
  return NextResponse.json({ message: '测试媒体已清理。' })
}
