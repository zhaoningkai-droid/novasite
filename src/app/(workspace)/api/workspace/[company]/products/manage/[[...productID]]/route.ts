import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { sanitizeRichHTML } from '@/platform/sanitizeRichHTML'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string; productID?: string[] }> }
const inFlightCreates = new Map<string, Promise<{ id: number }>>()
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const idempotencyKey = (value: unknown) => {
  const key = text(value)
  return /^[a-zA-Z0-9_-]{16,128}$/.test(key) ? key : ''
}
const lexical = (value: string): any => ({ root: { children: [{ children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), type: 'text', version: 1 }], direction: null, format: '', indent: 0, type: 'paragraph', version: 1 }], direction: null, format: '', indent: 0, type: 'root', version: 1 } })

async function save(request: Request, context: Context, creating: boolean) {
  const { company: slug, productID = [] } = await context.params
  const cookieStore = await cookies()
  if (!cookieStore.get('payload-token')?.value) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const { user } = await getMeUser()
  if (!user) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || cookieStore.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前公司已切换，请刷新页面后重试。' }, { status: 409 })
  const body = await request.json().catch(() => null)
  const title = text(body?.title), summary = text(body?.summary), detailHTML = sanitizeRichHTML(text(body?.detailHTML))
  const category = Number(body?.category), gallery = Array.isArray(body?.gallery) ? body.gallery.map(Number).filter(Number.isInteger) : []
  const tags = Array.isArray(body?.tags) ? body.tags.map(text).filter(Boolean).slice(0, 12) : []
  if (!Number.isInteger(category) || !title || !detailHTML || !tags.length || !gallery.length) return NextResponse.json({ message: '请填写分类、名称、至少一个标签、至少一张图片和产品详情。' }, { status: 422 })
  if (gallery.length > 5) return NextResponse.json({ message: '产品图片最多 5 张。' }, { status: 422 })
  const payload = await getPayload({ config })
  const [categoryCheck, mediaCheck] = await Promise.all([payload.find({ collection: 'product-categories', limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: category } }, { tenant: { equals: company.id } }] } }), payload.find({ collection: 'media', limit: 6, overrideAccess: false, user, where: { and: [{ id: { in: gallery } }, { tenant: { equals: company.id } }] } })])
  if (!categoryCheck.docs[0] || mediaCheck.docs.length !== gallery.length) return NextResponse.json({ message: '分类或图片不属于当前公司，不能保存。' }, { status: 403 })
  const data: any = { category, detailHTML, description: lexical(detailHTML), gallery, keywords: text(body?.keywords), sortOrder: Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0, summary, tags: tags.map((label: string) => ({ label })), tenant: company.id, title, _status: 'published' as const }
  const createKey = idempotencyKey(body?.idempotencyKey)
  if (creating && !createKey) return NextResponse.json({ message: '新建产品请求无效，请刷新页面后重试。' }, { status: 422 })
  if (creating) data.slug = `workspace-${company.id}-${createKey}`
  const id = Number(productID[0])
  if (!creating && (!Number.isInteger(id) || id < 1)) return NextResponse.json({ message: '产品编号无效。' }, { status: 400 })
  const existing = creating ? null : await payload.find({ collection: 'products', limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: id } }, { tenant: { equals: company.id } }] } })
  if (!creating && !existing?.docs[0]) return NextResponse.json({ message: '未找到当前公司的产品。' }, { status: 404 })
  if (creating) {
    const prior = await payload.find({ collection: 'products', limit: 1, overrideAccess: false, user, where: { and: [{ slug: { equals: data.slug } }, { tenant: { equals: company.id } }] } })
    if (prior.docs[0]) return NextResponse.json({ id: prior.docs[0].id, message: '保存成功，已恢复本次产品草稿。' })
  }
  let result
  try {
    if (creating) {
      const flightKey = `${company.id}:${data.slug}`
      const active = inFlightCreates.get(flightKey)
      if (active) {
        const original = await active
        return NextResponse.json({ id: original.id, message: '保存成功，已恢复本次产品草稿。' })
      }
      const task = payload
        .create({ collection: 'products', data, locale: 'zh', overrideAccess: false, user })
        .then((doc) => ({ id: doc.id }))
        .finally(() => inFlightCreates.delete(flightKey))
      inFlightCreates.set(flightKey, task)
      const created = await task
      result = created
    } else {
      result = await payload.update({ collection: 'products', context: { workspaceBaseEdit: true }, data, id, locale: 'zh', overrideAccess: false, user })
    }
  } catch (error) {
    // A retry can arrive after the first create succeeded. Slugs are deterministic per editor draft,
    // so return the original document instead of creating a second product.
    if (creating) {
      const prior = await payload.find({ collection: 'products', limit: 1, overrideAccess: false, user, where: { and: [{ slug: { equals: data.slug } }, { tenant: { equals: company.id } }] } })
      if (prior.docs[0]) return NextResponse.json({ id: prior.docs[0].id, message: '保存成功，已恢复本次产品草稿。' })
    }
    console.error('产品完整保存失败', error)
    return NextResponse.json({ message: '保存未完成，请检查产品资料后重试。' }, { status: 500 })
  }
  revalidatePath(`/workspace/${slug}/website/content`); revalidatePath(`/s/${slug}/zh`); revalidatePath(`/s/${slug}/zh/products`)
  return NextResponse.json({ id: (result as { id: number }).id, message: '保存成功，当前公司前台内容已同步更新。' })
}
export const POST = (request: Request, context: Context) => save(request, context, true)
export const PATCH = (request: Request, context: Context) => save(request, context, false)
