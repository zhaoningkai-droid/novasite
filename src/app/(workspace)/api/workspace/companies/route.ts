import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getMeUser } from '@/utilities/getMeUser'

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
  if (key === 'executive-industrial-pro-v1') return '高级B2B工业模板'
  if (key === 'precision-light-v1') return '明亮技术模板'
  return '工业深色模板'
}

const navigationItems = {
  zh: [
    { label: '首页', href: '/' },
    { label: '产品中心', href: '/products', children: [{ label: '标准紧固件', href: '/products?category=standard-fasteners' }, { label: '非标定制', href: '/products?category=non-standard-custom' }] },
    { label: '新闻资讯', href: '/news' },
    { label: '案例中心', href: '/cases' },
    { label: '关于我们', href: '/about' },
    { label: '常见问题', href: '/faq' },
    { label: '联系我们', href: '/contact' },
  ],
  en: [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products', children: [{ label: 'Standard Fasteners', href: '/products?category=standard-fasteners' }, { label: 'Custom Fasteners', href: '/products?category=non-standard-custom' }] },
    { label: 'News', href: '/news' },
    { label: 'Cases', href: '/cases' },
    { label: 'About', href: '/about' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Contact', href: '/contact' },
  ],
  ru: [
    { label: 'Главная', href: '/' },
    { label: 'Продукция', href: '/products', children: [{ label: 'Стандартный крепеж', href: '/products?category=standard-fasteners' }, { label: 'Нестандартный крепеж', href: '/products?category=non-standard-custom' }] },
    { label: 'Новости', href: '/news' },
    { label: 'Кейсы', href: '/cases' },
    { label: 'О нас', href: '/about' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Контакты', href: '/contact' },
  ],
  id: [
    { label: 'Beranda', href: '/' },
    { label: 'Produk', href: '/products', children: [{ label: 'Fastener Standar', href: '/products?category=standard-fasteners' }, { label: 'Fastener Kustom', href: '/products?category=non-standard-custom' }] },
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

const seedBasics = async ({ payload, tenantID, user, companyName }: { payload: Awaited<ReturnType<typeof getPayload>>, tenantID: number, user: NonNullable<Awaited<ReturnType<typeof getMeUser>>['user']>, companyName: string }) => {
  await Promise.all(locales.map((locale) => payload.create({
    collection: 'site-navigation',
    overrideAccess: false,
    user,
    data: {
      tenant: tenantID,
      title: '主导航',
      localeCode: locale,
      footerIntro: locale === 'zh' ? `${companyName} 专注紧固件五金产品展示、询盘转化和外贸客户服务。` : `${companyName} focuses on B2B fastener products, inquiries, and global customer service.`,
      items: navigationItems[locale],
      quickLinks: quickLinks[locale],
    } as any,
  })))
}

export async function POST(request: Request) {
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
      previewDomain: `http://localhost:3100/s/${slug}/zh`,
      defaultLocale: 'zh',
      enabledLocales: ['zh', 'en', 'ru', 'id'],
      selectedTemplate: templateID,
      templateVersion: selectedTemplate?.version || '1.0.0',
      templateAppliedAt: now,
      branding: {
        companyName: name,
        tagline: '专业紧固件五金产品与外贸服务',
        primaryColor: '#0B3B60',
        accentColor: '#F97316',
        heroImageURL: 'https://images.unsplash.com/photo-1581092335397-9fa3411088c6?auto=format&fit=crop&w=2000&q=85',
      },
      contact: {},
      seo: {
        titleSuffix: `${name} · 紧固件五金独立站`,
        defaultDescription: `${name} 的产品展示、企业介绍、案例新闻和询盘服务独立站。`,
        indexingEnabled: false,
      },
      fixedPages: {
        homepage: {
          heroEyebrow: 'FASTENER & HARDWARE SUPPLIER',
          heroTitle: '专业紧固件五金产品展示站',
          heroDescription: '用于展示企业实力、产品分类、案例新闻和客户询盘，内容可在后台逐步完善。',
          showCompanyIntro: true,
          companyIntroTitle: '关于我们',
          companyIntro: `${name} 专注紧固件五金产品展示、外贸客户沟通和询盘转化。`,
          showStrength: true,
          showFeaturedProducts: true,
          showVideo: false,
          showInquiryForm: true,
          inquiryTitle: '获取产品报价与资料',
          inquiryDescription: '请留下需求，我们会尽快联系您。',
          inquiryRequiredFields: { name: true, company: false, email: true, phone: true, message: true },
          showNews: true,
          showCases: true,
        },
        about: {
          title: '关于我们',
          intro: `${name} 的企业介绍可在后台“关于我们”中维护，并同步到独立站。`,
          modules: [
            { title: '企业简介', description: '请在后台补充公司发展、主营产品、服务市场和核心优势。', sortOrder: 1 },
            { title: '核心产品与技术', description: '请在后台补充紧固件五金产品能力、材料工艺和质量体系。', sortOrder: 2 },
            { title: '企业实力', description: '请在后台补充工厂规模、生产设备、检测能力和交付能力。', sortOrder: 3 },
          ],
          showStrength: true,
        },
        contactPage: {
          title: '联系我们',
          intro: '请在后台补充地址、邮箱、电话、WhatsApp 和二维码。',
          showInquiryForm: true,
        },
        footer: {
          intro: `${name} 专注紧固件五金产品展示与外贸询盘服务。`,
          socialLinks: {},
          quickLinks: quickLinks.zh,
        },
      },
    } as any,
  })

  try {
    await seedBasics({ payload, tenantID: tenant.id, user, companyName: name })
  } catch (error) {
    return NextResponse.json({
      message: '公司已创建，但默认分类或导航初始化未完全成功，请进入工作台后补充。',
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
