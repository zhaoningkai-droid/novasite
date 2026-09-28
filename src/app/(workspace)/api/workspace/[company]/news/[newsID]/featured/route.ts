import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string; newsID: string }> }

export async function PATCH(request: Request, context: Context) {
  const { company: slug, newsID } = await context.params
  const body = await request.json().catch(() => null)
  if (typeof body?.featured !== 'boolean') return NextResponse.json({ message: '推荐状态无效。' }, { status: 422 })
  const { user } = await getMeUser()
  const cookieStore = await cookies()
  if (!user || !cookieStore.get('payload-token')?.value) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || cookieStore.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前公司无权限或已切换，请刷新后重试。' }, { status: 403 })
  const id = Number(newsID)
  if (!Number.isInteger(id)) return NextResponse.json({ message: '新闻编号无效。' }, { status: 422 })
  const payload = await getPayload({ config })
  const found = await payload.find({ collection: 'news', limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: id } }, { tenant: { equals: company.id } }] } })
  if (!found.docs[0]) return NextResponse.json({ message: '未找到当前公司的新闻。' }, { status: 404 })
  await payload.update({ collection: 'news', data: { featured: body.featured }, id, overrideAccess: false, user })
  revalidatePath(`/workspace/${slug}/website/content/news`)
  revalidatePath(`/s/${slug}/zh`)
  revalidatePath(`/s/${slug}/en`)
  revalidatePath(`/s/${slug}/ru`)
  revalidatePath(`/s/${slug}/id`)
  return NextResponse.json({ featured: body.featured, message: body.featured ? '已推荐到首页新闻模块。' : '已取消首页新闻推荐。' })
}
