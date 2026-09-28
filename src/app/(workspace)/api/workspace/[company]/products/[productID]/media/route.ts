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
  const body = await request.json().catch(() => null)
  const mediaID = Number(body?.mediaID)
  const mode = body?.mode
  if (!Number.isInteger(productID) || !Number.isInteger(mediaID) || !['add', 'remove', 'replace'].includes(mode)) return NextResponse.json({ message: '图片操作参数无效。' }, { status: 400 })

  const cookieStore = await cookies()
  if (!cookieStore.get('payload-token')?.value) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const { user } = await getMeUser()
  if (!user) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || cookieStore.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前工作公司已切换，请刷新后重试。' }, { status: 409 })

  const payload = await getPayload({ config })
  const [products, mediaResult] = await Promise.all([
    payload.find({ collection: 'products', depth: 0, limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: productID } }, { tenant: { equals: company.id } }] } }),
    payload.find({ collection: 'media', depth: 0, limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: mediaID } }, { tenant: { equals: company.id } }] } }),
  ])
  const product = products.docs[0]
  if (!product) return NextResponse.json({ message: '未找到当前公司的产品。' }, { status: 404 })
  if (!mediaResult.docs[0]) return NextResponse.json({ message: '该图片不属于当前公司，不能绑定到产品。' }, { status: 403 })
  const current = Array.isArray(product.gallery) ? product.gallery.map((item) => typeof item === 'number' ? item : item.id) : []
  const gallery = mode === 'replace' ? [mediaID] : mode === 'remove' ? current.filter((id) => id !== mediaID) : current.includes(mediaID) ? current : [...current, mediaID]
  const updated = await payload.update({ collection: 'products', context: { workspaceBaseEdit: true }, data: { gallery }, id: product.id, locale: 'zh', overrideAccess: false, user })
  return NextResponse.json({ gallery: Array.isArray(updated.gallery) ? updated.gallery.map((item) => typeof item === 'number' ? item : item.id) : [], message: mode === 'remove' ? '已从当前产品移除图片。' : '已绑定到当前产品。' })
}
