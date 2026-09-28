import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
import type { Tenant } from '@/payload-types'

type Context = { params: Promise<{ company: string }> }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const qrFields = ['whatsappQRCode', 'wechatInternationalQRCode', 'wechatQRCode'] as const
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function PATCH(request: Request, { params }: Context) {
  const { company: slug } = await params
  const body = await request.json().catch(() => null)
  const { user } = await getMeUser()
  const store = await cookies()
  if (!user || !store.get('payload-token')?.value) {
    return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  }
  if (!user.roles?.some((role) => role === 'super-admin' || role === 'site-admin')) {
    return NextResponse.json({ message: '当前账号没有修改联系信息的权限。' }, { status: 403 })
  }
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || store.get('payload-tenant')?.value !== String(company.id)) {
    return NextResponse.json({ message: '当前公司无权限或已切换，请刷新后重试。' }, { status: 403 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ message: '提交内容无效。' }, { status: 422 })
  }
  const email = text(body.email)
  const phone = text(body.phone)
  const address = text(body.address)
  const whatsapp = text(body.whatsapp)
  if (!address || !email || !phone) {
    return NextResponse.json({ message: '请填写地址、邮箱和电话。' }, { status: 422 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: '请输入有效的邮箱地址。' }, { status: 422 })
  }
  const images: Partial<Record<typeof qrFields[number], number | null>> = {}
  for (const field of qrFields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue
    const id = body[field]
    if (id !== null && (!Number.isInteger(id) || id <= 0)) {
      return NextResponse.json({ message: '二维码图片无效，请重新上传。' }, { status: 422 })
    }
    images[field] = id
  }
  const imageIDs = [...new Set(Object.values(images).filter((id): id is number =>
    typeof id === 'number'))]
  const payload = await getPayload({ config })
  if (imageIDs.length) {
    const media = await payload.find({ collection: 'media', depth: 0, limit: imageIDs.length,
      overrideAccess: false, user, where: { and: [
        { id: { in: imageIDs } }, { tenant: { equals: company.id } },
      ] } })
    if (media.docs.length !== imageIDs.length || media.docs.some((item) =>
      !imageTypes.has(item.mimeType || '') || (item.filesize || 0) > 500 * 1024)) {
      return NextResponse.json({
        message: '二维码须为当前公司的 JPG、PNG 或 WebP 图片，单张不超过500KB。',
      }, { status: 422 })
    }
  }
  const tenant = await payload.findByID({ collection: 'tenants', id: company.id,
    depth: 0, locale: 'zh', overrideAccess: false, user })
  const page = tenant.fixedPages?.contactPage
  try {
    await payload.update({ collection: 'tenants', id: company.id, locale: 'zh',
      overrideAccess: false, user, data: {
        contact: { ...tenant.contact, address, email, phone, whatsapp, ...images },
        fixedPages: { ...tenant.fixedPages, contactPage: {
          ...page,
          title: 'title' in body ? text(body.title) : page?.title,
          intro: 'intro' in body ? text(body.intro) : page?.intro,
          showInquiryForm: 'showInquiryForm' in body
            ? body.showInquiryForm !== false : page?.showInquiryForm,
        } },
      } satisfies Partial<Tenant> })
  } catch (error) {
    console.error('[workspace-contact-save]', error)
    return NextResponse.json({ message: '联系我们未保存，请检查内容后重试。' }, { status: 500 })
  }
  for (const locale of ['zh', 'en', 'ru', 'id']) {
    revalidatePath(`/s/${slug}/${locale}`, 'layout')
  }
  return NextResponse.json({ message: '联系我们已保存，联系页和页脚已同步更新。' })
}
