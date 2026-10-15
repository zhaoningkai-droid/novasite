import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { APIError, getPayload } from 'payload'

import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { sanitizeRichHTML } from '@/platform/sanitizeRichHTML'
import { isSiteLocale, locales } from '@/platform/site-locales'
import { getMeUser } from '@/utilities/getMeUser'
import { userHasRole } from '@/access/roles'
import { PRODUCT_DATASHEET_MIME } from '@/platform/storage/file-policy'

type Context = { params: Promise<{ company: string; productID?: string[] }> }
const inFlightCreates = new Map<string, Promise<{ id: number; published: boolean }>>()
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
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor']))
    return NextResponse.json({ message: '当前账号只有查看权限，不能保存产品。' }, { status: 403 })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || cookieStore.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前公司已切换，请刷新页面后重试。' }, { status: 409 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json({ message: '保存内容格式无效。' }, { status: 422 })
  const sourceLocale = typeof body.sourceLocale === 'string' && isSiteLocale(body.sourceLocale)
    ? body.sourceLocale
    : company.defaultLocale
  if (sourceLocale !== company.defaultLocale)
    return NextResponse.json({ message: '站点默认语言已修改，请刷新产品编辑页后再保存。' }, { status: 409 })
  const title = text(body?.title), summary = text(body?.summary), detailHTML = sanitizeRichHTML(text(body?.detailHTML))
  const detailChanged = creating || body?.detailChanged === true
  const publish = body?.publish === true
  // Omission preserves the relation for older clients; explicit null removes it.
  const datasheetProvided = Object.prototype.hasOwnProperty.call(body, 'datasheet')
  const datasheet = body.datasheet == null ? null : Number(body.datasheet)
  if (datasheetProvided && datasheet !== null &&
      ((!['number', 'string'].includes(typeof body.datasheet)) ||
      !Number.isSafeInteger(datasheet) || datasheet < 1))
    return NextResponse.json({ message: '产品资料编号无效。' }, { status: 422 })
  const tagsChanged = creating || body?.tagsChanged === true
  const category = Number(body?.category), gallery = Array.isArray(body?.gallery) ? body.gallery.map(Number).filter(Number.isInteger) : []
  const tags = Array.isArray(body?.tags) ? body.tags.map(text).filter(Boolean).slice(0, 12) : []
  if (!Number.isInteger(category) || !title || (tagsChanged && !tags.length) || (publish && !tags.length) || !gallery.length || (detailChanged && !detailHTML)) return NextResponse.json({ message: '请填写分类、名称、至少一个标签、至少一张图片和产品详情。' }, { status: 422 })
  if (gallery.length > 5) return NextResponse.json({ message: '产品图片最多 5 张。' }, { status: 422 })
  if (!Number.isSafeInteger(category) || category < 1 ||
    !Array.isArray(body.gallery) || body.gallery.some((value: unknown) =>
      !Number.isSafeInteger(Number(value)) || Number(value) < 1) ||
    new Set(gallery).size !== gallery.length ||
    !Number.isSafeInteger(Number(body.sortOrder ?? 0)) || Number(body.sortOrder ?? 0) < 0)
    return NextResponse.json({ message: '分类、图片编号或排序无效，请检查后重试。' }, { status: 422 })
  const payload = await getPayload({ config })
  const [categoryCheck, mediaCheck] = await Promise.all([payload.find({ collection: 'product-categories', limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: category } }, { tenant: { equals: company.id } }] } }), payload.find({ collection: 'media', limit: 6, overrideAccess: false, user, where: { and: [{ id: { in: gallery } }, { tenant: { equals: company.id } }] } })])
  if (!categoryCheck.docs[0] || mediaCheck.docs.length !== gallery.length) return NextResponse.json({ message: '分类或图片不属于当前公司，不能保存。' }, { status: 403 })
  if (mediaCheck.docs.some((item) => !['image/jpeg', 'image/png', 'image/webp'].includes(item.mimeType || '') ||
    (item.filesize || 0) > 500 * 1024))
    return NextResponse.json({ message: '产品图片仅支持不超过500KB的 JPG、PNG 或 WebP。' }, { status: 422 })
  const data: any = { category, gallery, keywords: text(body?.keywords), sortOrder: Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0, summary, tenant: company.id, title, _status: publish ? 'published' as const : 'draft' as const }
  if (tagsChanged) data.tags = tags.map((label: string) => ({ label }))
  if (detailChanged) {
    data.detailHTML = detailHTML
    data.description = lexical(detailHTML)
  }
  const createKey = idempotencyKey(body?.idempotencyKey)
  if (creating && !createKey) return NextResponse.json({ message: '新建产品请求无效，请刷新页面后重试。' }, { status: 422 })
  if (creating) data.slug = `workspace-${company.id}-${createKey}`
  const id = Number(productID[0])
  if (!creating && (!Number.isInteger(id) || id < 1)) return NextResponse.json({ message: '产品编号无效。' }, { status: 400 })
  const existing = creating ? null : await payload.find({ collection: 'products', draft: true, limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: id } }, { tenant: { equals: company.id } }] } })
  if (!creating && !existing?.docs[0]) return NextResponse.json({ message: '未找到当前公司的产品。' }, { status: 404 })
  if (datasheetProvided) {
    if (datasheet !== null) {
      const documents = await payload.find({
        collection: 'media', depth: 0, limit: 1, overrideAccess: false, user,
        where: { and: [{ id: { equals: datasheet } }, { tenant: { equals: company.id } }] },
      })
      const document = documents.docs[0]
      if (!document) return NextResponse.json({ message: '产品资料不属于当前公司，不能保存。' }, { status: 403 })
      const current = existing?.docs[0]?.datasheet
      const currentID = typeof current === 'object' && current ? current.id : current
      if (document.mimeType !== PRODUCT_DATASHEET_MIME && currentID !== datasheet)
        return NextResponse.json({ message: '产品资料只能选择 PDF 文件。' }, { status: 422 })
    }
    data.datasheet = datasheet
  }
  if (creating) {
    const prior = await payload.find({ collection: 'products', limit: 1, overrideAccess: false, user, where: { and: [{ slug: { equals: data.slug } }, { tenant: { equals: company.id } }] } })
    if (prior.docs[0]) {
      const published = prior.docs[0]._status === 'published'
      return NextResponse.json({ id: prior.docs[0].id, published, message: published ? '已恢复本次发布结果，客户网站已同步更新。' : '已恢复本次草稿，客户网站暂未更新。' })
    }
  }
  let result
  try {
    if (creating) {
      const flightKey = `${company.id}:${data.slug}`
      const active = inFlightCreates.get(flightKey)
      if (active) {
        const original = await active
        return NextResponse.json({ id: original.id, published: original.published, message: original.published ? '已恢复本次发布结果，客户网站已同步更新。' : '已恢复本次草稿，客户网站暂未更新。' })
      }
      const task = payload
        .create({ collection: 'products', data, draft: !publish, locale: sourceLocale, overrideAccess: false, user })
        .then((doc) => ({ id: doc.id, published: doc._status === 'published' }))
        .finally(() => inFlightCreates.delete(flightKey))
      inFlightCreates.set(flightKey, task)
      const created = await task
      result = created
    } else {
      result = await payload.update({ collection: 'products', context: { workspaceBaseEdit: true }, data, draft: !publish, id, locale: sourceLocale, overrideAccess: false, user })
    }
  } catch (error) {
    if (error instanceof APIError && error.status === 409) return NextResponse.json({message:error.message},{status:409})
    // A retry can arrive after the first create succeeded. Slugs are deterministic per editor draft,
    // so return the original document instead of creating a second product.
    if (creating) {
      const prior = await payload.find({ collection: 'products', limit: 1, overrideAccess: false, user, where: { and: [{ slug: { equals: data.slug } }, { tenant: { equals: company.id } }] } })
      if (prior.docs[0]) {
        const published = prior.docs[0]._status === 'published'
        return NextResponse.json({ id: prior.docs[0].id, published, message: published ? '已恢复本次发布结果，客户网站已同步更新。' : '已恢复本次草稿，客户网站暂未更新。' })
      }
    }
    console.error('产品完整保存失败', error)
    return NextResponse.json({ message: '保存未完成，请检查产品资料后重试。' }, { status: 500 })
  }
  const published = (result as { published?: boolean }).published ?? publish
  revalidatePath(`/workspace/${slug}/website/content`)
  if (published) {
    for (const locale of locales) revalidatePath(`/s/${slug}/${locale}`, 'layout')
  }
  return NextResponse.json({ id: (result as { id: number }).id, published, message: published ? '已发布，客户网站已同步更新。' : '已保存为草稿，客户网站暂未更新。' })
}
export const POST = (request: Request, context: Context) => save(request, context, true)
export const PATCH = (request: Request, context: Context) => save(request, context, false)
