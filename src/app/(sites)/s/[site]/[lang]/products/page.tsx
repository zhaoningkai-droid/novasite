import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { copy, getSite, isSiteLocale, siteHref } from '@/platform/site'
import { productCoverURL } from '@/platform/productImages'

type Props = { params: Promise<{ lang: string; site: string }>; searchParams: Promise<{ category?: string | string[]; page?: string | string[] }> }

const productTags = (product: { tags?: unknown }) =>
  Array.isArray(product.tags)
    ? product.tags.map((item) => typeof item === 'object' && item ? String((item as { label?: unknown }).label || '').trim() : '').filter(Boolean).slice(0, 4)
    : []

const productKeywords = (product: { keywords?: unknown }) =>
  typeof product.keywords === 'string'
    ? product.keywords.split(/[，,]/).map((item) => item.trim()).filter(Boolean).slice(0, 5)
    : []

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  return isSiteLocale(lang) ? { title: copy[lang].products } : {}
}

export default async function ProductsPage({ params, searchParams }: Props) {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['products'], await searchParams)
  if (newPage) return newPage

  const payload = await getPayload({ config: configPromise })
  const products = await payload.find({ collection: 'products', locale: lang, depth: 1, limit: 100, sort: 'sortOrder', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } })
  return <main><section className="site-page-hero"><div className="site-wrap"><span className="site-eyebrow">Engineered equipment</span><h1>{copy[lang].products}</h1><p>{copy[lang].intro}</p></div></section><section className="site-section"><div className="site-wrap">{products.docs.length ? <div className="site-grid">{products.docs.map((product) => { const tags = productTags(product); const keywords = productKeywords(product); return <Link className="site-card" href={siteHref(siteSlug, lang, `/products/${product.slug}`)} key={product.id}><div className="site-card__image" style={{ backgroundImage: `url(${productCoverURL(product, 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=82')})` }} /><div className="site-card__body"><h3>{product.title}</h3>{tags.length ? <div className="site-product-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}<p>{product.summary}</p>{keywords.length ? <div className="site-product-keywords">{keywords.map((keyword) => <em key={keyword}>{keyword}</em>)}</div> : null}</div></Link> })}</div> : <div className="site-empty">No published products yet.</div>}</div></section></main>
}
