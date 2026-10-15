import { temporarySiteOrigin } from '@/platform/platform-hosts'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getMeUser } from '@/utilities/getMeUser'
import { getLegacyTemplate } from '@/platform/legacy-template-catalog'
import { getNewTemplate } from '@/platform/new-templates/registry'

const locales = ['zh', 'en', 'ru', 'id'] as const

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const normalizeSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 56)

const isSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)

const templateName = (key?: string) => {
  const legacy = key ? getLegacyTemplate(key) : undefined
  if (legacy) return legacy.name
  return '工业深色模板'
}

const navigationItems = {
  zh: [
    { label: '首页', href: '/' },
    { label: '产品中心', href: '/products' },
    { label: '新闻资讯', href: '/news' },
    { label: '案例中心', href: '/cases' },
    { label: '关于我们', href: '/about' },
    { label: '常见问题', href: '/faq' },
    { label: '联系我们', href: '/contact' },
  ],
  en: [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    { label: 'News', href: '/news' },
    { label: 'Cases', href: '/cases' },
    { label: 'About', href: '/about' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Contact', href: '/contact' },
  ],
  ru: [
    { label: 'Главная', href: '/' },
    { label: 'Продукция', href: '/products' },
    { label: 'Новости', href: '/news' },
    { label: 'Кейсы', href: '/cases' },
    { label: 'О нас', href: '/about' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Контакты', href: '/contact' },
  ],
  id: [
    { label: 'Beranda', href: '/' },
    { label: 'Produk', href: '/products' },
    { label: 'Berita', href: '/news' },
    { label: 'Kasus', href: '/cases' },
    { label: 'Tentang Kami', href: '/about' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Kontak', href: '/contact' },
  ],
} as const

const quickLinks = {
  zh: [{ label: '产品中心', href: '/products' }, { label: '案例中心', href: '/cases' }, { label: '新闻资讯', href: '/news' }, { label: '联系我们', href: '/contact' }],
  en: [{ label: 'Products', href: '/products' }, { label: 'Cases', href: '/cases' }, { label: 'News', href: '/news' }, { label: 'Contact', href: '/contact' }],
  ru: [{ label: 'Продукция', href: '/products' }, { label: 'Кейсы', href: '/cases' }, { label: 'Новости', href: '/news' }, { label: 'Контакты', href: '/contact' }],
  id: [{ label: 'Produk', href: '/products' }, { label: 'Kasus', href: '/cases' }, { label: 'Berita', href: '/news' }, { label: 'Kontak', href: '/contact' }],
} as const

const seedBasics = async ({ payload, tenantID, user }: { payload: Awaited<ReturnType<typeof getPayload>>, tenantID: number, user: NonNullable<Awaited<ReturnType<typeof getMeUser>>['user']> }) => {
  // Navigation writes share the company's translation lock. Initialise one at
  // a time and do not populate relations we discard, keeping the small pool free.
  for (const locale of locales) await payload.create({
    collection: 'site-navigation',
    depth: 0,
    overrideAccess: false,
    user,
    data: {
      tenant: tenantID,
      title: '主导航',
      localeCode: locale,
      footerIntro: '',
      items: navigationItems[locale],
      quickLinks: quickLinks[locale],
    } as any,
  })
}

export async function POST(request: Request) {
  try {
    return await createCompany(request)
  } catch (error) {
    console.error('[workspace/companies] Company creation failed', error instanceof Error
      ? { name: error.name, message: error.message }
      : { message: 'Unknown error' })
    return NextResponse.json({ message: '公司创建失败，已保留填写内容，请稍后重试。' }, { status: 500 })
  }
}

async function createCompany(request: Request) {
  const body = await request.json().catch(() => null)
  const { user } = await getMeUser()
  if (!user) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
  if (!user.roles?.includes('super-admin')) return NextResponse.json({ message: '只有超级管理员可以创建客户公司。' }, { status: 403 })

  const name = text(body?.name)
  const slug = normalizeSlug(text(body?.slug) || name) || `company-${Date.now().toString(36)}`
  if (!name) return NextResponse.json({ message: '请输入公司名称。' }, { status: 422 })
  if (!slug || !isSlug(slug)) return NextResponse.json({ message: '站点标识只能使用小写字母、数字和中横线。' }, { status: 422 })

  const payload = await getPayload({ config })
  const duplicate = await payload.find({ collection: 'tenants', depth: 0, limit: 1, overrideAccess: false, user, where: { slug: { equals: slug } } })
  if (duplicate.totalDocs > 0) return NextResponse.json({ message: '这个站点标识已存在，请换一个。' }, { status: 409 })

  let templateID = Number(body?.selectedTemplate) || undefined
  let selectedTemplate: { id: number; key?: string; version?: string; name?: string } | null = null
  if (templateID) {
    const template = await payload.findByID({ collection: 'templates', id: templateID, depth: 0, overrideAccess: false, user })
    if (template.status !== 'published') return NextResponse.json({ message: '只能选择已发布的网站模板。' }, { status: 422 })
    if (!getLegacyTemplate(template.key) && !getNewTemplate(template.key)) {
      return NextResponse.json({ message: '该模板尚未接入网站页面，请先选择模板库中的可用模板。' }, { status: 422 })
    }
    selectedTemplate = template
  } else {
    const templates = await payload.find({ collection: 'templates', depth: 0, limit: 1, overrideAccess: false, user, where: { and: [{ key: { equals: 'power-engineering-v1' } }, { status: { equals: 'published' } }] } })
    selectedTemplate = templates.docs[0] || null
    templateID = selectedTemplate?.id
  }

  const now = new Date().toISOString()
  const tenant = await payload.create({
    collection: 'tenants',
    locale: 'zh',
    overrideAccess: false,
    user,
    data: {
      name,
      slug,
      status: 'building',
      primaryDomain: '',
      previewDomain: temporarySiteOrigin(slug) || new URL(`/s/${slug}/zh`, process.env.NEXT_PUBLIC_SERVER_URL || request.url).href,
      defaultLocale: 'zh',
      enabledLocales: ['zh', 'en', 'ru', 'id'],
      selectedTemplate: templateID,
      templateVersion: selectedTemplate?.version || '1.0.0',
      templateAppliedAt: now,
      branding: {
        companyName: name,
        tagline: '',
        primaryColor: '#0B3B60',
        accentColor: '#F97316',
        heroImageURL: '',
      },
      contact: {},
      seo: {
        titleSuffix: name,
        defaultDescription: '',
        indexingEnabled: false,
      },
      fixedPages: {
        homepage: {
          banners: [],
          heroEyebrow: '',
          heroTitle: '',
          heroDescription: '',
          showCompanyIntro: false,
          companyIntroTitle: '',
          companyIntro: '',
          showStrength: false,
          showFeaturedProducts: false,
          showVideo: false,
          showInquiryForm: false,
          inquiryTitle: '',
          inquiryDescription: '',
          inquiryRequiredFields: { name: true, company: false, email: true, phone: true, message: true },
          showNews: false,
          showCases: false,
        },
        about: {
          title: '关于我们',
          intro: '',
          modules: [],
          showStrength: false,
        },
        contactPage: {
          title: '联系我们',
          intro: '',
          showInquiryForm: false,
        },
        footer: {
          intro: '',
          socialLinks: {},
          quickLinks: [],
        },
      },
    } as any,
  })

  try {
    await seedBasics({ payload, tenantID: tenant.id, user })
  } catch (error) {
    return NextResponse.json({
      message: '公司已创建，但默认导航初始化未完全成功，请进入工作台后补充。',
      company: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        primaryDomain: tenant.primaryDomain,
        updatedAt: tenant.updatedAt,
      },
      warning: error instanceof Error ? error.message : '初始化失败',
    }, { status: 201 })
  }

  return NextResponse.json({
    message: `客户公司已创建，并应用${templateName(selectedTemplate?.key)}。`,
    company: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      primaryDomain: tenant.primaryDomain,
      updatedAt: tenant.updatedAt,
    },
  }, { status: 201 })
}
