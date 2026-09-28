import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string; productID: string }> }
const locales = new Set(['en', 'zh', 'ru', 'id'])
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function PATCH(request: Request, { params }: Context) {
  const { company: slug, productID: rawProductID } = await params
  const productID = Number(rawProductID)
  const body = await request.json().catch(() => null)
  const locale = clean(body?.locale)
  const title = clean(body?.title)
  const summary = clean(body?.summary)
  if (!Number.isInteger(productID) || !locales.has(locale)) return NextResponse.json({ message: '语言或产品编号无效。' }, { status: 400 })
  if (!title || !summary) return NextResponse.json({ message: '请填写当前语言的产品名称和列表摘要。' }, { status: 422 })
  if (title.length > 120 || summary.length > 360) return NextResponse.json({ message: '产品名称不得超过120字，列表摘要不得超过360字。' }, { status: 422 })
  const cookieStore = await cookies()
  if (!cookieStore.get('payload-token')?.value) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const { user } = await getMeUser()
  if (!user) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || cookieStore.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前工作公司已切换，请刷新后重试。' }, { status: 409 })
  const payload = await getPayload({ config })
  const result = await payload.find({ collection: 'products', depth: 0, limit: 1, locale: locale as 'en' | 'zh' | 'ru' | 'id', overrideAccess: false, user, where: { and: [{ id: { equals: productID } }, { tenant: { equals: company.id } }] } })
  const product = result.docs[0]
  if (!product) return NextResponse.json({ message: '未找到当前公司的产品。' }, { status: 404 })
  await payload.update({ collection: 'products', context: { workspaceBaseEdit: true }, data: { summary, title }, id: product.id, locale: locale as 'en' | 'zh' | 'ru' | 'id', overrideAccess: false, user })
  return NextResponse.json({ message: '当前语言已保存。' })
}
