import { getPayload, type Where } from 'payload'
import { notFound } from 'next/navigation'
import config from '@payload-config'
import RichText from '@/components/RichText'
import type { Tenant, User, Product, News, Case, Post } from '@/payload-types'
import { productCoverURL, productImageURLs } from '@/platform/productImages'
import { sanitizeRichHTML } from '@/platform/sanitizeRichHTML'
import { richTextToPlainText } from '@/platform/rich-text'
import { templateHref } from '@/platform/new-templates/links'
import { templateCopy } from '@/platform/new-templates/copy'
import type { Banner } from '@/platform/new-templates/Carousel'
import type { SiteLocale } from '@/platform/site-locales'
import { requestedPage, type IndustryCard, type IndustryPageModel } from './model'
import { IndustryPage } from './Page'

type Options = {
  template?: { key: string }
  site: Tenant
  locale: SiteLocale
  base: string
  path?: string[]
  search?: { category?: string | string[]; page?: string | string[] }
  preview?: boolean
  user?: User
}
export const industryMediaURL = (value: unknown): string =>
  value && typeof value === 'object' && 'url' in value && typeof value.url === 'string'
    ? value.url
    : ''
const sorted = <T extends { sortOrder?: number | null }>(items: T[] = []) =>
  [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))

// This adapter imports no demo data. Every collection query is scoped to this tenant.
export async function loadIndustryTenantPage(options: Options): Promise<IndustryPageModel> {
  const { site, locale, base, preview, user, search = {}, path = [] } = options
  const payload = await getPayload({ config })
  const t = templateCopy(locale)
  const access = { overrideAccess: !user, user, locale, depth: 1 }
  const tenant: Where = { tenant: { equals: site.id } }
  const published: Where = { _status: { equals: 'published' } }
  const href = (path: string) => templateHref(base, path) || base
  const homepage = site.fixedPages?.homepage
  const core = {
    catalogFirst: options.template?.key === 'autoparts-571-v1',
    locale,
    base,
    site: site.slug,
    company: site.branding.companyName,
    preview,
    title: site.branding.companyName,
    requiredFields: (homepage?.inquiryRequiredFields || {}) as Record<string, boolean>,
    inquiryTitle: homepage?.inquiryTitle,
    inquiryDescription: homepage?.inquiryDescription,
    contact: {
      ...site.contact,
      qr: [
        { label: 'WhatsApp', image: industryMediaURL(site.contact?.whatsappQRCode) },
        { label: 'WeChat', image: industryMediaURL(site.contact?.wechatInternationalQRCode) },
        { label: '微信', image: industryMediaURL(site.contact?.wechatQRCode) },
      ].filter((item) => item.image),
    },
  }
  const productCard = (item: Product): IndustryCard => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    image: productCoverURL(item, ''),
    href: href(`/products/${item.slug}`),
  })
  const articleCard = (item: News | Case | Post, section: string): IndustryCard => ({
    id: item.id,
    title: item.title,
    summary: 'summary' in item ? item.summary : null,
    image: industryMediaURL(
      'cover' in item ? item.cover : 'heroImage' in item ? item.heroImage : null,
    ),
    href: href(`/${section}/${item.slug}`),
    date: item.publishedAt,
  })
  const faqCard = (item: {
    id: number
    question: string
    answer: Parameters<typeof RichText>[0]['data']
  }) => ({
    id: item.id,
    question: item.question,
    answer: <RichText data={item.answer} enableGutter={false} />,
    answerText: richTextToPlainText(item.answer),
  })
  if (!path.length) {
    const featuredCategory = homepage?.featuredNewsCategory
    const newsCategory =
      typeof featuredCategory === 'number' ? featuredCategory : featuredCategory?.id
    const [products, cases, news, faqs] = await Promise.all([
      payload.find({
        ...access,
        collection: 'products',
        limit: 8,
        sort: 'sortOrder,-publishedAt',
        where: { and: [tenant, published, { featured: { equals: true } }] },
      }),
      payload.find({
        ...access,
        collection: 'cases',
        limit: 3,
        sort: 'sortOrder,-publishedAt',
        where: { and: [tenant, published, { featured: { equals: true } }] },
      }),
      payload.find({
        ...access,
        collection: 'news',
        limit: 3,
        sort: 'sortOrder,-publishedAt',
        where: {
          and: [
            tenant,
            published,
            { featured: { equals: true } },
            ...(newsCategory ? [{ category: { equals: newsCategory } }] : []),
          ],
        },
      }),
      payload.find({
        ...access,
        collection: 'faqs',
        limit: 6,
        sort: 'sortOrder',
        where: { and: [tenant, { enabled: { equals: true } }] },
      }),
    ])
    const rawBanners = Array.isArray(homepage?.banners)
      ? homepage.banners
          .filter((item) => item && typeof item === 'object')
          .map((item) => {
            const source = item as Record<string, unknown>
            const value = (key: string) =>
              typeof source[key] === 'string' ? (source[key] as string) : undefined
            return {
              desktopImage: value('desktopImage'),
              mobileImage: value('mobileImage'),
              title: value('title'),
              description: value('description'),
              linkType: value('linkType'),
              linkURL: value('linkURL'),
              sortOrder: typeof source.sortOrder === 'number' ? source.sortOrder : 0,
            }
          })
      : []
    const banners: Banner[] = sorted(rawBanners)
      .filter((item) => item.desktopImage || item.mobileImage || item.title || item.description)
      .map((item) => ({
        ...item,
        desktopImage: item.desktopImage || undefined,
        mobileImage: item.mobileImage || undefined,
        title: item.title || undefined,
        description: item.description || undefined,
        href:
          item.linkType && item.linkType !== 'none' && item.linkURL
            ? templateHref(base, item.linkURL)
            : undefined,
      }))
    if (
      !banners.length &&
      (homepage?.heroTitle ||
        homepage?.heroDescription ||
        site.branding.heroImageURL ||
        site.branding.mobileHeroImageURL)
    )
      banners.push({
        title: homepage?.heroTitle || site.branding.companyName,
        description: homepage?.heroDescription || undefined,
        desktopImage: site.branding.heroImageURL || undefined,
        mobileImage: site.branding.mobileHeroImageURL || undefined,
      })
    const videoSrc = industryMediaURL(homepage?.videoMedia)
    const videoEmbed =
      /^https:\/\/(www\.)?(youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(
        homepage?.videoURL || '',
      )
        ? homepage?.videoURL
        : undefined
    return {
      ...core,
      kind: 'home',
      banners,
      intro:
        homepage?.showCompanyIntro !== false &&
        (homepage?.companyIntroTitle || homepage?.companyIntro)
          ? {
              title: homepage.companyIntroTitle || t.about,
              text: homepage.companyIntro || '',
              image: industryMediaURL(homepage.introImage),
            }
          : undefined,
      stats:
        homepage?.showStrength !== false
          ? sorted(homepage?.strengthItems || []).map((item) => ({
              ...item,
              image: industryMediaURL(item.image),
            }))
          : [],
      products: homepage?.showFeaturedProducts !== false ? products.docs.map(productCard) : [],
      cases:
        homepage?.showCases !== false ? cases.docs.map((item) => articleCard(item, 'cases')) : [],
      news: homepage?.showNews !== false ? news.docs.map((item) => articleCard(item, 'news')) : [],
      faqs: faqs.docs.map(faqCard),
      showInquiry: homepage?.showInquiryForm !== false,
      video:
        homepage?.showVideo && (videoSrc || videoEmbed)
          ? {
              src: videoSrc || videoEmbed!,
              title: homepage.videoTitle || t.about,
              embed: !videoSrc,
            }
          : undefined,
    }
  }
  const section = path[0]
  if (['about', 'contact', 'faqs'].includes(section) && path.length !== 1) notFound()
  if (section === 'about') {
    const about = site.fixedPages?.about
    return {
      ...core,
      kind: 'about',
      title: about?.title || t.about,
      image: site.branding.navigationBannerURL || undefined,
      intro: about?.intro ? { title: about.title || t.about, text: about.intro } : undefined,
      modules: sorted(about?.modules || []).map((item) => ({
        title: item.title,
        text: item.description,
        image: industryMediaURL(item.image),
      })),
      certificates: about?.certificates,
    }
  }
  if (section === 'contact')
    return {
      ...core,
      kind: 'contact',
      title: site.fixedPages?.contactPage?.title || t.contact,
      summary: site.fixedPages?.contactPage?.intro,
      showInquiry: site.fixedPages?.contactPage?.showInquiryForm !== false,
    }
  const page = requestedPage(search.page)
  if (section === 'faqs') {
    const result = await payload.find({
      ...access,
      collection: 'faqs',
      limit: 10,
      page,
      sort: 'sortOrder',
      where: { and: [tenant, { enabled: { equals: true } }] },
    })
    if (page > Math.max(1, result.totalPages)) notFound()
    return {
      ...core,
      kind: 'faqs',
      title: t.faqs,
      faqs: result.docs.map(faqCard),
      pagination: { page, totalPages: result.totalPages, totalDocs: result.totalDocs },
    }
  }
  if (!['products', 'news', 'cases', 'blog'].includes(section) || path.length > 2) notFound()
  const collection = section === 'blog' ? 'posts' : (section as 'products' | 'news' | 'cases')
  const categoryCollection =
    collection === 'posts'
      ? 'categories'
      : collection === 'products'
        ? 'product-categories'
        : collection === 'news'
          ? 'news-categories'
          : 'case-categories'
  if (path[1]) {
    const result = await payload.find({
      ...access,
      collection,
      depth: 2,
      limit: 1,
      where: { and: [tenant, published, { slug: { equals: path[1] } }] },
    })
    const item = result.docs[0]
    if (!item) notFound()
    const category = 'category' in item ? item.category : undefined
    const categoryId = typeof category === 'number' ? category : category?.id
    const related = await payload.find({
      ...access,
      collection,
      limit: collection === 'products' ? 4 : 3,
      sort: collection === 'posts' ? '-publishedAt' : 'sortOrder,-publishedAt',
      where: {
        and: [
          tenant,
          published,
          { id: { not_equals: item.id } },
          ...(categoryId ? [{ category: { equals: categoryId } }] : []),
        ],
      },
    })
    if (collection === 'products') {
      const product = item as Product
      const specs = await payload.find({
        ...access,
        collection: 'product-specifications',
        limit: 1,
        where: {
          and: [tenant, { product: { equals: product.id } }, { localeCode: { equals: locale } }],
        },
      })
      const parameters = specs.docs[0] ? specs.docs[0].items || [] : product.specifications || []
      return {
        ...core,
        kind: 'product',
        section: 'products',
        title: product.title,
        summary: product.summary,
        model: product.model,
        productId: product.id,
        images: productImageURLs(product),
        parameters: parameters
          .filter((row) => row.label)
          .map((row) => ({
            label: row.label || '',
            value: row.value || '',
          })),
        datasheet: industryMediaURL(
          (product as Product & { datasheetPDF?: unknown }).datasheetPDF || product.datasheet,
        ),
        content: product.detailHTML ? (
          <div
            dangerouslySetInnerHTML={{
              __html: sanitizeRichHTML(product.detailHTML),
            }}
          />
        ) : product.description ? (
          <RichText data={product.description} enableGutter={false} />
        ) : undefined,
        products: related.docs.map((item) => productCard(item as Product)),
      }
    }
    const article = item as News | Case | Post
    const image = industryMediaURL(
      'cover' in article ? article.cover : 'heroImage' in article ? article.heroImage : undefined,
    )
    return {
      ...core,
      kind: 'article',
      section: section as IndustryPageModel['section'],
      title: article.title,
      summary: 'summary' in article ? article.summary : undefined,
      model: article.publishedAt,
      images: image ? [image] : [],
      content:
        'content' in article ? <RichText data={article.content} enableGutter={false} /> : null,
      cards: related.docs.map((item) => articleCard(item as News | Case | Post, section)),
    }
  }
  const categories = await payload.find({
    ...access,
    collection: categoryCollection,
    pagination: false,
    sort: 'sortOrder',
    where: tenant,
  })
  const categorySlug = Array.isArray(search.category) ? search.category[0] : search.category
  const active = categorySlug
    ? categories.docs.find((item) => item.slug === categorySlug)
    : undefined
  if (categorySlug && !active) notFound()
  const descendants = active ? new Set([active.id]) : new Set<number>()
  let changed = true
  while (changed && active) {
    changed = false
    for (const item of categories.docs) {
      const parent = 'parent' in item ? item.parent : null
      const parentId = typeof parent === 'number' ? parent : parent?.id
      if (parentId && descendants.has(parentId) && !descendants.has(item.id)) {
        descendants.add(item.id)
        changed = true
      }
    }
  }
  const result = await payload.find({
    ...access,
    collection,
    limit: collection === 'products' ? 12 : collection === 'cases' ? 6 : 9,
    page,
    sort: collection === 'posts' ? '-publishedAt' : 'sortOrder,-publishedAt',
    where: {
      and: [
        tenant,
        published,
        ...(active
          ? [
              collection === 'posts'
                ? { categories: { in: [...descendants] } }
                : { category: { in: [...descendants] } },
            ]
          : []),
      ],
    },
  })
  if (page > Math.max(1, result.totalPages)) notFound()
  return {
    ...core,
    kind: 'catalog',
    section: section as IndustryPageModel['section'],
    title: active ? ('name' in active ? active.name : active.title) : t[section as 'products'],
    cards: result.docs.map((item) =>
      collection === 'products'
        ? productCard(item as Product)
        : articleCard(item as News | Case | Post, section),
    ),
    categories: categories.docs.map((item) => ({
      label: 'name' in item ? item.name : item.title,
      href: href(`/${section}?category=${encodeURIComponent(item.slug || '')}`),
    })),
    activeCategory: categorySlug,
    pagination: { page, totalPages: result.totalPages, totalDocs: result.totalDocs },
  }
}

export async function renderIndustryTenantPage(options: Options) {
  return <IndustryPage model={await loadIndustryTenantPage(options)} />
}
