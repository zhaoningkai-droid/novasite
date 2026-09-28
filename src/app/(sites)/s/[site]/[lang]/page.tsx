import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { getSite, isSiteLocale } from '@/platform/site'
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
  const configuredNewsCategory = (site.fixedPages?.homepage as { featuredNewsCategory?: number | { id: number } | null } | undefined)?.featuredNewsCategory
  const featuredNewsCategoryID = typeof configuredNewsCategory === 'number' ? configuredNewsCategory : configuredNewsCategory?.id
  const [products, posts, news, cases, pages, productCategories] = await Promise.all([
    payload.find({ collection: 'products', locale: lang, depth: 1, limit: 8, overrideAccess: true, sort: 'sortOrder,-publishedAt', where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }, { featured: { equals: true } }] } }),
    payload.find({ collection: 'posts', locale: lang, depth: 1, limit: 3, sort: '-publishedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } }),
    payload.find({ collection: 'news', locale: lang, depth: 1, limit: 3, sort: 'sortOrder,-publishedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }, { featured: { equals: true } }, ...(featuredNewsCategoryID ? [{ category: { equals: featuredNewsCategoryID } }] : [])] } }),
    payload.find({ collection: 'cases', locale: lang, depth: 1, limit: 4, sort: 'sortOrder,-publishedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }, { featured: { equals: true } }] } }),
    payload.find({ collection: 'pages', locale: lang, depth: 2, limit: 1, sort: '-updatedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } }),
    payload.find({ collection: 'product-categories', locale: lang, depth: 1, limit: 8, sort: 'sortOrder', overrideAccess: true, where: { tenant: { equals: site.id } } }),
  ])
  const homepage = pages.docs[0] || ({
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
      page={homepage}
      posts={posts.docs}
      productCategories={productCategories.docs}
      products={products.docs}
      site={site}
      siteSlug={siteSlug}
    />
  )
}
