import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string; productID: string }> }

export async function PATCH(request: Request, { params }: Context) {
  const { company: slug, productID: rawProductID } = await params
  const productID = Number(rawProductID)
  const featured = (await request.json().catch(() => null))?.featured
  if (!Number.isInteger(productID) || productID < 1 || typeof featured !== 'boolean')
    return NextResponse.json({ message: '推荐设置参数无效。' }, { status: 400 })
  const cookieStore = await cookies()
  const { user } = await getMeUser()
  if (!cookieStore.get('payload-token')?.value || !user)
    return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return NextResponse.json({ message: '没有该公司的编辑权限。' }, { status: 403 })
  if (cookieStore.get('payload-tenant')?.value !== String(company.id))
    return NextResponse.json({ message: '当前公司已切换，请刷新后重试。' }, { status: 409 })

  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'products',
    limit: 1,
    overrideAccess: false,
    user,
    where: { and: [{ id: { equals: productID } }, { tenant: { equals: company.id } }] },
  })
  if (!found.docs[0])
    return NextResponse.json({ message: '未找到当前公司的产品。' }, { status: 404 })
  await payload.update({
    collection: 'products',
    context: { workspaceBaseEdit: true },
    data: { featured },
    id: productID,
    locale: 'zh',
    overrideAccess: false,
    user,
  })
  revalidatePath(`/workspace/${slug}/website/content`)
  revalidatePath(`/s/${slug}/zh`)
  return NextResponse.json({
    featured,
    message: featured ? '已推荐到首页产品模块。' : '已取消首页推荐。',
  })
}
