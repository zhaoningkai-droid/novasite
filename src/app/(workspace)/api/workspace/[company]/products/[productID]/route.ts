import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string; productID: string }> }

const cleanText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function PATCH(request: Request, { params }: Context) {
  const { company: slug, productID: rawProductID } = await params
  const productID = Number(rawProductID)
  if (!Number.isInteger(productID) || productID < 1) return NextResponse.json({ message: '产品编号无效，无法保存。' }, { status: 400 })

  const cookieStore = await cookies()
  if (!cookieStore.get('payload-token')?.value) return NextResponse.json({ message: '登录已失效，请重新登录后再保存。' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const title = cleanText(body?.title)
  const errors: Record<string, string> = {}
  if (!title) errors.title = '请输入产品名称。'
  else if (title.length > 120) errors.title = '产品名称不能超过120个字符。'
  if (Object.keys(errors).length > 0) return NextResponse.json({ errors, message: '请先完成必填内容后再保存。' }, { status: 422 })

  const { user } = await getMeUser()
  if (!user) return NextResponse.json({ message: '登录已失效，请重新登录后再保存。' }, { status: 401 })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return NextResponse.json({ message: '没有该公司的编辑权限。' }, { status: 403 })
  if (cookieStore.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前工作公司已切换，请刷新页面后再保存。' }, { status: 409 })

  const payload = await getPayload({ config })
  const products = await payload.find({
    collection: 'products',
    limit: 1,
    locale: 'zh',
    overrideAccess: false,
    user,
    where: { and: [{ id: { equals: productID } }, { tenant: { equals: company.id } }] },
  })
  const product = products.docs[0]
  if (!product) return NextResponse.json({ message: '未找到当前公司的产品，或该产品已被移除。' }, { status: 404 })

  try {
    await payload.update({ collection: 'products', context: { workspaceBaseEdit: true }, data: { model: title, title }, id: product.id, locale: 'zh', overrideAccess: false, user })
    revalidatePath(`/workspace/${slug}/website/content`)
    revalidatePath(`/workspace/${slug}/website/content/${product.id}/edit`)
    return NextResponse.json({ message: '保存成功。' })
  } catch {
    return NextResponse.json({ message: '保存未完成，请稍后重试。已填写的内容已保留。' }, { status: 500 })
  }
}
