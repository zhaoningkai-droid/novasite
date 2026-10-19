import { temporarySiteOrigin } from '@/platform/platform-hosts'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import type { Tenant } from '@/payload-types'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { locales } from '@/platform/site-locales'
import { getMeUser } from '@/utilities/getMeUser'
import { revalidateWorkspaceSettings } from '@/platform/workspace-settings-api'
import { userHasRole } from '@/access/roles'
import { ga4MeasurementId, ga4PropertyId } from '@/platform/analytics/ga4-config'

type Context = { params: Promise<{ company: string }> }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const mediaID = (value: unknown) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined

export async function PATCH(request: Request, { params }: Context) {
  const { company: slug } = await params
  const body = await request.json().catch(() => null)
  const { user } = await getMeUser()
  const store = await cookies()

  if (!user || !store.get('payload-token')?.value) {
    return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  }
  if (!user.roles?.some((role) => role === 'super-admin' || role === 'site-admin')) {
    return NextResponse.json({ message: '当前账号没有修改站点设置的权限。' }, { status: 403 })
  }
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || store.get('payload-tenant')?.value !== String(company.id)) {
    return NextResponse.json({ message: '当前公司无权限或已切换，请刷新后重试。' }, { status: 403 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ message: '站点设置内容无效。' }, { status: 422 })
  }
  if (Object.prototype.hasOwnProperty.call(body, 'selectedTemplate')) {
    return NextResponse.json({ message: '模板请在模板库中单独选择并保存，以便记录和恢复版本。' }, { status: 409 })
  }
  const hasGa4 = Object.hasOwn(body, 'googleAnalyticsId') || Object.hasOwn(body, 'googleAnalyticsPropertyId')
  if (hasGa4 && !userHasRole(user, ['super-admin'])) {
    return NextResponse.json({ message: 'GA4 配置仅允许平台管理员修改。' }, { status: 403 })
  }
  const measurementId = ga4MeasurementId(body.googleAnalyticsId)
  const propertyId = ga4PropertyId(body.googleAnalyticsPropertyId)
  if (hasGa4 && ((text(body.googleAnalyticsId) && !measurementId) || (text(body.googleAnalyticsPropertyId) && !propertyId) || Boolean(measurementId) !== Boolean(propertyId))) {
    return NextResponse.json({ message: '请同时填写 G- 开头的衡量 ID 和纯数字媒体资源 ID，或同时留空。' }, { status: 422 })
  }

  const enabled = Array.isArray(body.enabledLocales)
    ? body.enabledLocales.filter((value: unknown): value is typeof locales[number] => locales.includes(value as typeof locales[number]))
    : []
  if (!enabled.length) return NextResponse.json({ message: '至少保留一种启用语言。' }, { status: 422 })
  const defaultLocale = enabled.includes(body.defaultLocale) ? body.defaultLocale : enabled[0]
  // Keep the user's optional domain/address as entered. This field does not
  // authorize a hostname or publish a site; those controls remain separate.
  const primaryDomain = text(body.primaryDomain)

  const logo = mediaID(body.logo)
  const favicon = mediaID(body.favicon)
  const payload = await getPayload({ config })
  if (logo || favicon) {
    const ids = [logo, favicon].filter((id): id is number => Boolean(id))
    const media = await payload.find({
      collection: 'media',
      depth: 0,
      limit: ids.length,
      overrideAccess: false,
      user,
      where: { and: [{ id: { in: ids } }, { tenant: { equals: company.id } }] },
    })
    if (media.docs.length !== new Set(ids).size) {
      return NextResponse.json({ message: 'Logo 和图标只能选择当前公司的媒体。' }, { status: 422 })
    }
  }

  const tenant = await payload.findByID({
    collection: 'tenants', id: company.id, depth: 0, locale: company.defaultLocale, overrideAccess: false, user,
  })
  await payload.update({
    collection: 'tenants',
    id: company.id,
    locale: company.defaultLocale,
    overrideAccess: false,
    user,
    data: {
      name: text(body.name) || tenant.name,
      primaryDomain,
      previewDomain: temporarySiteOrigin(slug) || tenant.previewDomain,
      defaultLocale,
      enabledLocales: enabled,
      status: ['building', 'published', 'suspended'].includes(body.status) ? body.status : tenant.status,
      branding: {
        ...tenant.branding,
        companyName: text(body.companyName) || tenant.branding.companyName,
        headerText: body.headerText === undefined ? tenant.branding.headerText : text(body.headerText),
        logo,
        favicon,
      },
      seo: {
        ...tenant.seo,
        titleSuffix: text(body.titleSuffix),
        defaultDescription: text(body.defaultDescription),
        indexingEnabled: body.indexingEnabled === true,
        ...(hasGa4 ? { googleAnalyticsId: measurementId, googleAnalyticsPropertyId: propertyId } : {}),
      },
    } as Partial<Tenant>,
  })
  revalidateWorkspaceSettings(slug, 'sites')
  const response = NextResponse.json({ message: '站点信息、语言和全局设置已保存。' })
  response.cookies.set('payload-tenant', String(company.id), { maxAge: 31536000, path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
  return response
}
