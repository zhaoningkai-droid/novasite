import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { getSite, isSiteLocale, siteHref } from '@/platform/site'
import { richTextToPlainText } from '@/platform/rich-text'
import { productCoverURL } from '@/platform/productImages'
import { ExecutiveTenantHome } from '@/platform/legacy-templates/ExecutiveTenantHome'
import type { ExecutiveImageItem, ExecutiveHomeCard, ExecutiveHomeSettings, ExecutiveTenantHomeData } from '@/platform/legacy-templates/executive-home-model'
import { SitePageBlocks } from './SitePageBlocks'
import type { Page } from '@/payload-types'

type Props = { params: Promise<{ lang: string; site: string }> }

export const dynamic = 'force-dynamic'

export default async function SiteHome({ params }: Props) {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, [])
  if (newPage) return newPage

  const payload = await getPayload({ config: configPromise })
  const homepage = site.fixedPages?.homepage as (NonNullable<typeof site.fixedPages>['homepage'] & {
    banners?: Array<{ desktopImage?: string; description?: string; linkType?: 'external' | 'internal' | 'none'; linkURL?: string; mobileImage?: string; sortOrder?: number; title?: string }> | null
    companyIntro?: string | null
    companyIntroTitle?: string | null
    executiveHome?: ExecutiveHomeSettings | null
    inquiryDescription?: string | null
    inquiryRequiredFields?: Record<string, boolean> | null
    inquiryTitle?: string | null
    introImage?: { alt?: string | null; thumbnailURL?: string | null; url?: string | null } | number | null
    strengthItems?: Array<{ image?: { alt?: string | null; thumbnailURL?: string | null; url?: string | null } | number | null; label?: string | null; sortOrder?: number | null; unit?: string | null; value?: string | null }> | null
    videoMedia?: { url?: string | null } | number | null
    videoURL?: string | null
  }) | undefined
  const configuredNewsCategory = homepage?.featuredNewsCategory as number | { id: number } | null | undefined
  const featuredNewsCategoryID = typeof configuredNewsCategory === 'number' ? configuredNewsCategory : configuredNewsCategory?.id
  const selectedTemplateKey = site.selectedTemplate && typeof site.selectedTemplate === 'object' ? site.selectedTemplate.key : ''
  const isExecutive = selectedTemplateKey === 'executive-industrial-pro-v1'
  const executiveSettings = homepage?.executiveHome || {}
  const faqLimit = Math.max(1, Math.min(12, Number(executiveSettings.faqLimit) || 6))
  const [products, posts, news, cases, pages, productCategories, faqs] = await Promise.all([
    payload.find({ collection: 'products', locale: lang, depth: 1, limit: isExecutive ? 12 : 8, overrideAccess: true, sort: 'sortOrder,-publishedAt', where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }, { featured: { equals: true } }] } }),
    payload.find({ collection: 'posts', locale: lang, depth: 1, limit: 3, sort: '-publishedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } }),
    payload.find({ collection: 'news', locale: lang, depth: 1, limit: isExecutive ? 6 : 3, sort: 'sortOrder,-publishedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }, { featured: { equals: true } }, ...(featuredNewsCategoryID ? [{ category: { equals: featuredNewsCategoryID } }] : [])] } }),
    payload.find({ collection: 'cases', locale: lang, depth: 1, limit: isExecutive ? 8 : 4, sort: 'sortOrder,-publishedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }, { featured: { equals: true } }] } }),
    payload.find({ collection: 'pages', locale: lang, depth: 2, limit: 1, sort: '-updatedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } }),
    payload.find({ collection: 'product-categories', locale: lang, depth: 1, limit: 8, sort: 'sortOrder', overrideAccess: true, where: { tenant: { equals: site.id } } }),
    isExecutive && executiveSettings.faqEnabled ? payload.find({ collection: 'faqs', locale: lang, depth: 0, limit: faqLimit, sort: 'sortOrder', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { enabled: { equals: true } }] } }) : Promise.resolve({ docs: [] }),
  ])

  if (isExecutive) {
    const mediaURL = (value: unknown) => typeof value === 'object' && value && typeof (value as { url?: unknown }).url === 'string'
      ? (value as { url: string }).url
      : typeof value === 'object' && value && typeof (value as { thumbnailURL?: unknown }).thumbnailURL === 'string'
        ? (value as { thumbnailURL: string }).thumbnailURL : ''
    const mediaImage = (value: unknown, fallbackText?: string): ExecutiveImageItem => {
      const media = typeof value === 'object' && value ? value as { alt?: string | null; id?: number; thumbnailURL?: string | null; url?: string | null } : null
      return { alt: media?.alt || fallbackText || '', image: media ? { id: media.id, alt: media.alt, thumbnailURL: media.thumbnailURL, url: media.url } : null }
    }
    const about = site.fixedPages?.about as { intro?: string | null; modules?: Array<{ description?: string | null; image?: unknown; sortOrder?: number | null; title?: string | null }> | null; title?: string | null } | undefined
    const sortedAboutModules = [...(about?.modules || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
    const introModule = sortedAboutModules.find((item) => item.description || item.title || mediaURL(item.image))
    const aboutBackground = mediaURL(executiveSettings.introBackground) || mediaURL(homepage?.introImage) || mediaURL(introModule?.image)
    const banners = [...(homepage?.banners || [])]
      .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
      .map((item) => ({ desktopImage: item.desktopImage || '', description: item.description || '', linkType: item.linkType, linkURL: item.linkURL || '', mobileImage: item.mobileImage || '', sortOrder: item.sortOrder, title: item.title || '' }))
    if (!banners.length && (site.branding.heroImageURL || homepage?.heroTitle || homepage?.heroDescription)) banners.push({
      desktopImage: site.branding.heroImageURL || '', description: homepage?.heroDescription || '', linkType: 'none' as const, linkURL: '', mobileImage: '', sortOrder: 1, title: homepage?.heroTitle || '',
    })
    const sortedItems = (items: ExecutiveImageItem[] | null | undefined) => [...(items || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
    const strengthRecords = [...(homepage?.strengthItems || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
    const strengthGallery = executiveSettings.strengthGallery?.length
      ? sortedItems(executiveSettings.strengthGallery)
      : strengthRecords.filter((item) => mediaURL(item.image)).map((item, index) => ({ ...mediaImage(item.image, item.label || ''), caption: item.label || '', sortOrder: index }))
    const card = (value: ExecutiveHomeCard) => value
    const data: ExecutiveTenantHomeData = {
      about: {
        background: aboutBackground,
        buttonLabel: executiveSettings.introButtonLabel || '',
        overlay: Math.max(0, Math.min(0.85, Number(executiveSettings.introOverlay ?? 0.62))),
        text: about?.intro || introModule?.description || homepage?.companyIntro || '',
        title: about?.title || introModule?.title || homepage?.companyIntroTitle || '',
      },
      advantages: executiveSettings.advantagesEnabled ? [...(executiveSettings.advantages || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0)) : [],
      banners,
      cases: cases.docs.map((item) => card({
        description: item.summary || '', href: siteHref(siteSlug, lang, `/cases/${item.slug}`), image: mediaURL(item.cover), imageAlt: item.title,
        label: item.country || item.industry || '', title: item.title,
      })),
      categories: productCategories.docs.filter((item) => item.slug && item.name).map((item) => card({
        description: item.description || '', href: siteHref(siteSlug, lang, `/products?category=${encodeURIComponent(item.slug || '')}`),
        image: mediaURL(item.cover), imageAlt: item.name, title: item.name,
      })),
      certificates: sortedItems(executiveSettings.certificates),
      companyName: site.branding.companyName,
      contact: {
        address: site.contact?.address || '', email: site.contact?.email || '', phone: site.contact?.phone || '', whatsapp: site.contact?.whatsapp || '',
        qrCode: mediaURL(site.contact?.whatsappQRCode) || mediaURL(site.contact?.wechatQRCode) || '',
      },
      faq: faqs.docs.map((item) => ({ answer: richTextToPlainText(item.answer), question: item.question })).filter((item) => item.question && item.answer),
      faqTitle: executiveSettings.faqTitle || '',
      footerBackground: mediaURL((site.fixedPages?.footer as { backgroundImage?: unknown } | undefined)?.backgroundImage),
      footerOverlay: Math.max(0, Math.min(0.85, Number((site.fixedPages?.footer as { backgroundOverlay?: number } | undefined)?.backgroundOverlay ?? 0.65))),
      locale: lang,
      news: news.docs.map((item) => card({
        date: item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(lang) : '', description: item.summary || '', href: siteHref(siteSlug, lang, `/news/${item.slug}`),
        image: mediaURL(item.cover), imageAlt: item.title, title: item.title,
      })),
      products: products.docs.map((item) => card({
        category: typeof item.category === 'object' && item.category ? item.category.name : '', description: item.summary || '',
        href: siteHref(siteSlug, lang, `/products/${item.slug}`), image: productCoverURL(item, ''), imageAlt: item.title, title: item.title,
      })),
      settings: executiveSettings,
      siteSlug,
      strengthGallery,
      strengthItems: homepage?.showStrength !== false ? strengthRecords.map((item) => card({
        href: '#strength', title: item.label || '', value: item.value || '', unit: item.unit || '',
      })) : [],
      videoPoster: mediaURL(executiveSettings.videoPoster),
      videoSource: homepage?.showVideo ? mediaURL(homepage.videoMedia) || homepage.videoURL || '' : '',
      showCases: homepage?.showCases !== false,
      showFAQ: Boolean(executiveSettings.faqEnabled),
      showInquiry: homepage?.showInquiryForm === true && Boolean(homepage.inquiryTitle || homepage.inquiryDescription || site.contact?.email || site.contact?.phone || site.contact?.address),
      showNews: homepage?.showNews !== false,
      showProducts: homepage?.showFeaturedProducts !== false,
      showStrength: homepage?.showStrength !== false,
      inquiry: { description: homepage?.inquiryDescription || '', requiredFields: homepage?.inquiryRequiredFields || {}, title: homepage?.inquiryTitle || '' },
    }
    return <ExecutiveTenantHome data={data} />
  }

  const homePageDocument = pages.docs[0] || ({
    createdAt: site.createdAt,
    hero: { links: [], type: 'lowImpact' },
    id: 0,
    layout: [],
    slug: 'home',
    title: site.branding.companyName,
    updatedAt: site.updatedAt,
  } satisfies Partial<Page> as Page)

  return (
    <SitePageBlocks
      cases={cases.docs}
      locale={lang}
      news={news.docs}
      page={homePageDocument}
      posts={posts.docs}
      productCategories={productCategories.docs}
      products={products.docs}
      site={site}
      siteSlug={siteSlug}
    />
  )
}
