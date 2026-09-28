import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import type { Tenant } from '@/payload-types'
import { settingsEditorRoles, revalidateWorkspaceSettings, settingsAPIError } from '@/platform/workspace-settings-api'
import { homepageIntroFields, settingsID, SettingsInputError } from '@/platform/workspace-settings-validation'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string }> }
type HomepageConfig = { banners?: unknown[]; featuredNewsCategoryID?: number | null; inquiryRequiredFields?: Record<string, boolean>; socialLinks?: Record<string, string>; footerIntro?: string; footerLogoMediaID?: number }
type StrengthItem = { image?: number | null; label: string; sortOrder: number; unit: string; value: string }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const optionalBoolean = (value: unknown, fallback: boolean | null | undefined) => typeof value === 'boolean' ? value : fallback
const isHTTPSURL = (value: string) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
const isInternalPath = (value: string) => value.startsWith('/') && !value.startsWith('//')

const strengths = (value: unknown): StrengthItem[] => {
  if (!Array.isArray(value)) throw new SettingsInputError('企业实力内容格式无效。')
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SettingsInputError('企业实力项目格式无效。')
    const item = raw as Record<string, unknown>
    const image = item.imageID === undefined || item.imageID === null ? null : Number(item.imageID)
    if (image !== null && (!Number.isSafeInteger(image) || image < 1)) throw new SettingsInputError('企业实力图片编号无效。')
    const order = item.sortOrder === undefined || item.sortOrder === null ? 0 : Number(item.sortOrder)
    if (!Number.isFinite(order)) throw new SettingsInputError('企业实力排序无效。')
    return { image, label: text(item.label), sortOrder: order, unit: text(item.unit), value: text(item.value) }
  }).filter((item) => item.value || item.label || item.unit).sort((a, b) => a.sortOrder - b.sortOrder)
}

const requiredFields = (value: unknown, fallback: unknown = {}) => {
  const provided = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const previous = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback as Record<string, unknown> : {}
  return ['name', 'company', 'email', 'phone', 'message'].reduce<Record<string, boolean>>((result, field) => {
    result[field] = typeof provided[field] === 'boolean' ? provided[field] : Boolean(previous[field])
    return result
  }, {})
}

const socialLinks = (value: unknown, fallback: Record<string, string> = {}) => {
  const provided = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return ['tiktok', 'facebook', 'instagram', 'youtube', 'linkedin', 'blog'].reduce<Record<string, string>>((result, field) => {
    result[field] = text(provided[field] ?? fallback[field])
    return result
  }, {})
}

const banners = (value: unknown) => Array.isArray(value)
  ? value.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SettingsInputError('轮播图内容格式无效。')
    const item = raw as Record<string, unknown>
    const linkType = item.linkType
    const linkURL = text(item.linkURL)
    if (!['none', 'internal', 'external'].includes(String(linkType))) throw new SettingsInputError('轮播图跳转类型无效。')
    if (linkType === 'external' && !isHTTPSURL(linkURL)) throw new SettingsInputError('站外链接必须使用 HTTPS。')
    if (linkType === 'internal' && !isInternalPath(linkURL)) throw new SettingsInputError('站内链接必须使用以 / 开头的路径。')
    const image = (name: string, mediaName: string) => {
      const url = text(item[name])
      const rawID = item[mediaName]
      const id = rawID === undefined || rawID === null || rawID === '' ? undefined : Number(rawID)
      if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) throw new SettingsInputError('轮播图媒体编号无效。')
      if (!url) {
        if (id !== undefined) throw new SettingsInputError('轮播图媒体编号缺少对应图片。')
        return ''
      }
      if (/[\u0000-\u001f\u007f\\]/.test(url) || url.startsWith('//')) throw new SettingsInputError('轮播图图片地址无效。')
      if (url.startsWith('/')) return url
      try {
        const parsed = new URL(url)
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error()
        return url
      } catch { throw new SettingsInputError('轮播图图片地址无效。') }
    }
    const order = item.sortOrder === undefined || item.sortOrder === null ? 0 : Number(item.sortOrder)
    if (!Number.isFinite(order)) throw new SettingsInputError('轮播图排序无效。')
    return {
      desktopImage: image('desktopImage', 'desktopMediaID'),
      desktopMediaID: Number.isSafeInteger(Number(item.desktopMediaID)) && Number(item.desktopMediaID) > 0 ? Number(item.desktopMediaID) : undefined,
      description: text(item.description),
      linkType,
      linkURL,
      mobileImage: image('mobileImage', 'mobileMediaID'),
      mobileMediaID: Number.isSafeInteger(Number(item.mobileMediaID)) && Number(item.mobileMediaID) > 0 ? Number(item.mobileMediaID) : undefined,
      navigationImage: image('navigationImage', 'navigationMediaID'),
      navigationMediaID: Number.isSafeInteger(Number(item.navigationMediaID)) && Number(item.navigationMediaID) > 0 ? Number(item.navigationMediaID) : undefined,
      sortOrder: order,
      title: text(item.title),
    }
  }).filter((item) => item.desktopImage || item.mobileImage || item.navigationImage || item.title || item.description).sort((a, b) => a.sortOrder - b.sortOrder)
  : (() => { throw new SettingsInputError('轮播图内容格式无效。') })()

export async function PATCH(request: Request, { params }: Context) {
  try {
  const { company: slug } = await params
  const input: unknown = await request.json().catch(() => null)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return NextResponse.json({ message: '首页设置格式无效，请刷新后重试。' }, { status: 422 })
  }
  const body = input as Record<string, unknown>
  const { user } = await getMeUser()
  const store = await cookies()
  if (!user || !store.get('payload-token')?.value) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  if (!user.roles?.some((role) => settingsEditorRoles.includes(role))) {
    return NextResponse.json({ message: '当前账号没有修改首页内容的权限。' }, { status: 403 })
  }
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || store.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前公司无权限或已切换，请刷新后重试。' }, { status: 403 })

  const validModes = ['banner', 'recommendations', 'video', 'intro', 'strength', 'inquiry', 'homepage-config']
  if (typeof body.mode !== 'string' || !validModes.includes(body.mode)) return NextResponse.json({ message: '首页模块无效，请刷新页面后重试。' }, { status: 422 })
  const mode = body.mode
  const heroTitle = text(body.heroTitle)
  const heroDescription = text(body.heroDescription)

  const videoURL = text(body.videoURL)
  const requestedVideoMediaID = mode === 'video' ? settingsID(body.videoMediaID, '视频') : null
  if (mode === 'video' && body.showVideo === true && !requestedVideoMediaID && !isHTTPSURL(videoURL)) return NextResponse.json({ message: '启用官方视频时，请填写有效的 HTTPS 视频嵌入链接或上传本地视频。' }, { status: 422 })

  const strengthItems = mode === 'strength' ? strengths(body.strengthItems) : []
  const hasIncompleteStrength = mode === 'strength' && Array.isArray(body.strengthItems) && body.strengthItems.some((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true
    const item = raw as Record<string, unknown>
    return !text(item.value) || !text(item.label)
  })
  if (mode === 'strength' && hasIncompleteStrength) return NextResponse.json({ message: '每项企业实力请填写数字和说明，或移除空白项。' }, { status: 422 })

  const payload = await getPayload({ config })
  const tenant = await payload.findByID({ collection: 'tenants', id: company.id, depth: 0, locale: 'zh', overrideAccess: false, user })
  const existingHomepage = tenant.fixedPages?.homepage
  const homepageConfig = body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config as HomepageConfig : {}
  const incomingBanners = mode === 'banner' ? body.banners : mode === 'homepage-config' ? homepageConfig.banners : undefined
  const normalizedBanners = incomingBanners === undefined ? undefined : banners(incomingBanners)
  if (normalizedBanners) {
    const legacyImageURLs = new Set<string>([
      text(tenant.branding?.heroImageURL),
      text((tenant.branding as Record<string, unknown> | undefined)?.mobileHeroImageURL),
      text((tenant.branding as Record<string, unknown> | undefined)?.navigationBannerURL),
      ...(Array.isArray(existingHomepage?.banners) ? existingHomepage.banners.flatMap((raw: unknown) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
        const item = raw as Record<string, unknown>
        return [text(item.desktopImage), text(item.mobileImage), text(item.navigationImage)]
      }) : []),
    ].filter(Boolean))
    const references = normalizedBanners.flatMap((item) => [
      { id: item.desktopMediaID, url: item.desktopImage },
      { id: item.mobileMediaID, url: item.mobileImage },
      { id: item.navigationMediaID, url: item.navigationImage },
    ].filter((entry): entry is { id: number; url: string } => Boolean(entry.id && entry.url)))
    if (references.some((item) => !item.id && !legacyImageURLs.has(item.url))) {
      return NextResponse.json({ message: '新增轮播图只能使用当前公司已上传的图片。' }, { status: 422 })
    }
    const mediaIDs = [...new Set(references.flatMap((item) => item.id ? [item.id] : []))]
    if (mediaIDs.length) {
      const media = await payload.find({ collection: 'media', depth: 0, limit: mediaIDs.length, overrideAccess: false, user,
        where: { and: [{ id: { in: mediaIDs } }, { tenant: { equals: company.id } }] } })
      if (media.docs.length !== mediaIDs.length || media.docs.some((item) => !imageTypes.has(item.mimeType || '') || (item.filesize || 0) > 500 * 1024)) {
        return NextResponse.json({ message: '轮播图只能使用当前公司的 JPG、PNG 或 WebP 图片，单张不超过500KB。' }, { status: 422 })
      }
      const byID = new Map(media.docs.map((item) => [item.id, item]))
      if (references.some((reference) => reference.id && byID.get(reference.id)?.url !== reference.url)) {
        return NextResponse.json({ message: '轮播图图片与媒体库记录不匹配，请重新选择。' }, { status: 422 })
      }
    }
  }
  if (mode === 'strength') {
    const imageIDs = [...new Set(strengthItems.flatMap((item) => item.image ? [item.image] : []))]
    if (imageIDs.length) {
      const owned = await payload.find({ collection: 'media', depth: 0, limit: imageIDs.length, overrideAccess: false, user, where: { and: [{ id: { in: imageIDs } }, { tenant: { equals: company.id } }] } })
      if (owned.docs.length !== imageIDs.length) return NextResponse.json({ message: '企业实力图片不属于当前公司。' }, { status: 403 })
    }
  }
  if (body?.mode === 'homepage-config') {
    const config = homepageConfig
    const categoryID = Number.isInteger(config.featuredNewsCategoryID) ? config.featuredNewsCategoryID : null
    if (categoryID) {
      const category = await payload.findByID({ collection: 'news-categories', id: categoryID, depth: 0, overrideAccess: false, user }).catch(() => null)
      if (!category || category.tenant !== company.id) return NextResponse.json({ message: '所选新闻分类不属于当前公司。' }, { status: 403 })
    }
    const logoID = Number.isInteger(config.footerLogoMediaID) ? config.footerLogoMediaID : null
    if (logoID) {
      const logo = await payload.findByID({ collection: 'media', id: logoID, depth: 0, overrideAccess: false, user }).catch(() => null)
      if (!logo || logo.tenant !== company.id) return NextResponse.json({ message: '页脚 Logo 不属于当前公司。' }, { status: 403 })
    }
    try {
    await payload.update({
      collection: 'tenants', id: company.id, locale: 'zh', overrideAccess: false, user,
      data: { branding: logoID ? { ...tenant.branding, logo: logoID } : tenant.branding, fixedPages: { ...tenant.fixedPages, homepage: { ...existingHomepage, banners: normalizedBanners ?? existingHomepage?.banners ?? [], featuredNewsCategory: categoryID || null, inquiryRequiredFields: requiredFields(config.inquiryRequiredFields, existingHomepage?.inquiryRequiredFields), showNews: optionalBoolean(body?.showNews, existingHomepage?.showNews) }, footer: { ...tenant.fixedPages?.footer, intro: text(config.footerIntro ?? tenant.fixedPages?.footer?.intro), socialLinks: socialLinks(config.socialLinks, tenant.fixedPages?.footer?.socialLinks as Record<string, string> | undefined) } } } as Partial<Tenant>,
    })
    } catch (error) {
      console.error('[workspace-homepage-config-save]', error)
      return settingsAPIError(error, '首页设置未保存，请检查内容后重试。')
    }
    revalidateWorkspaceSettings(slug, 'homepage')
    return NextResponse.json({ message: '首页管理配置已保存。' })
  }
  const videoMediaID = requestedVideoMediaID
  if (mode === 'video' && videoMediaID) {
    const video = await payload.findByID({ collection: 'media', id: videoMediaID, depth: 0, overrideAccess: false, user }).catch(() => null)
    if (!video || video.tenant !== company.id) return NextResponse.json({ message: '所选视频不属于当前公司。' }, { status: 403 })
  }
  const introImageID = mode === 'intro' ? settingsID(body.introImageID, '企业介绍图片') : null
  if (mode === 'intro' && introImageID) {
    const image = await payload.findByID({ collection: 'media', id: introImageID, depth: 0, overrideAccess: false, user }).catch(() => null)
    if (!image || image.tenant !== company.id) return NextResponse.json({ message: '企业介绍图片不属于当前公司。' }, { status: 403 })
  }
  const contentFields = mode === 'video' ? { showVideo: optionalBoolean(body?.showVideo, existingHomepage?.showVideo), videoTitle: text(body?.videoTitle), videoDescription: text(body?.videoDescription), videoURL, videoSource: videoMediaID ? 'local' : 'external', videoMedia: videoMediaID }
    : mode === 'intro' ? homepageIntroFields(body, existingHomepage || {})
      : mode === 'strength' ? { showStrength: optionalBoolean(body?.showStrength, existingHomepage?.showStrength), strengthItems }
        : mode === 'inquiry' ? { showInquiryForm: optionalBoolean(body?.showInquiryForm, existingHomepage?.showInquiryForm), inquiryTitle: text(body?.inquiryTitle), inquiryDescription: text(body?.inquiryDescription), inquiryRequiredFields: requiredFields(homepageConfig.inquiryRequiredFields, existingHomepage?.inquiryRequiredFields) }
          : {}

  try {
  await payload.update({
    collection: 'tenants',
    id: company.id,
    locale: 'zh',
    overrideAccess: false,
    user,
    data: {
      ...(mode === 'banner' ? { branding: { ...tenant.branding, heroImageURL: text(body?.desktopImage), mobileHeroImageURL: text(body?.mobileImage), navigationBannerURL: text(body?.navigationImage) } } : {}),
      fixedPages: {
        ...tenant.fixedPages,
        homepage: {
          ...existingHomepage,
          ...(mode === 'banner' ? { banners: normalizedBanners, heroEyebrow: text(body?.heroEyebrow), heroTitle, heroDescription } : {}),
          ...(mode === 'recommendations' ? { showFeaturedProducts: optionalBoolean(body?.showFeaturedProducts, existingHomepage?.showFeaturedProducts), showNews: optionalBoolean(body?.showNews, existingHomepage?.showNews), showCases: optionalBoolean(body?.showCases, existingHomepage?.showCases) } : {}),
          ...contentFields,
        },
      },
    } as Partial<Tenant>,
  })
  } catch (error) {
    console.error('[workspace-homepage-save]', error)
    return settingsAPIError(error, '首页模块未保存，请检查内容后重试。')
  }
  revalidateWorkspaceSettings(slug, 'homepage')
  return NextResponse.json({ message: '首页模块已保存，客户网站首页已同步更新。' })
  } catch (error) {
    console.error('[workspace-homepage-save]', error)
    return settingsAPIError(error, '首页模块未保存，请检查内容后重试。')
  }
}
