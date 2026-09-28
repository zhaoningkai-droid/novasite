import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import RichText from '@/components/RichText'
import { getBaseURL, getSite, isSiteLocale, jsonLD, siteHref } from '@/platform/site'
import { productCoverURL, productImageURLs } from '@/platform/productImages'

type Props = { params: Promise<{ lang: string; site: string; slug: string }> }

const productCopy = {
  en: { portfolio: 'Product portfolio', request: 'Request this product', specifications: 'Technical specifications' },
  zh: { portfolio: '产品中心', request: '询价此产品', specifications: '技术参数' },
  ru: { portfolio: 'Продукция', request: 'Запросить этот товар', specifications: 'Технические параметры' },
  id: { portfolio: 'Produk', request: 'Minta penawaran produk ini', specifications: 'Spesifikasi teknis' },
} as const

const productTags = (product: { tags?: unknown }) =>
  Array.isArray(product.tags)
    ? product.tags.map((item) => typeof item === 'object' && item ? String((item as { label?: unknown }).label || '').trim() : '').filter(Boolean)
    : []

const productKeywords = (product: { keywords?: unknown }) =>
  typeof product.keywords === 'string'
    ? product.keywords.split(/[，,]/).map((item) => item.trim()).filter(Boolean)
    : []

const getProduct = async (siteID: number, slug: string, lang: 'en' | 'zh' | 'ru' | 'id') => {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({ collection: 'products', locale: lang, depth: 2, limit: 1, overrideAccess: true, where: { and: [{ tenant: { equals: siteID } }, { slug: { equals: slug } }, { _status: { equals: 'published' } }] } })
  return result.docs[0] ?? null
}

const getSpecifications = async (siteID: number, productID: number, lang: 'en' | 'zh' | 'ru' | 'id') => {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'product-specifications',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        { tenant: { equals: siteID } },
        { product: { equals: productID } },
        { localeCode: { equals: lang } },
      ],
    },
  })
  return result.docs[0]?.items ?? []
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, site: siteSlug, slug } = await params
  if (!isSiteLocale(lang)) return {}
  const site = await getSite(siteSlug, lang)
  if (!site) return {}
  const product = await getProduct(site.id, slug, lang)
  if (!product) return {}
  const url = `${getBaseURL(site, siteSlug)}/${lang}/products/${slug}`
  return { title: product.title, description: product.summary || undefined, alternates: { canonical: url }, openGraph: { title: product.title, description: product.summary || undefined, url } }
}

export default async function ProductPage({ params }: Props) {
  const { lang, site: siteSlug, slug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['products', slug])
  if (newPage) return newPage

  const product = await getProduct(site.id, slug, lang)
  if (!product) notFound()
  const specifications = await getSpecifications(site.id, product.id, lang)
  const t = productCopy[lang]
  const image = productCoverURL(product, 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1400&q=85')
  const tags = productTags(product)
  const keywords = productKeywords(product)
  const productSchema = { '@context': 'https://schema.org', '@type': 'Product', name: product.title, description: product.summary, image: productImageURLs(product), brand: { '@type': 'Brand', name: site.branding.companyName }, manufacturer: { '@type': 'Organization', name: site.branding.companyName } }

  return <main><section className="site-page-hero"><div className="site-wrap"><Link className="site-eyebrow" href={siteHref(siteSlug, lang, '/products')}>← {t.portfolio}</Link><h1>{product.title}</h1><p>{product.summary}</p>{tags.length ? <div className="site-product-tags site-product-tags--hero">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}{keywords.length ? <div className="site-product-keywords site-product-keywords--hero">{keywords.map((keyword) => <em key={keyword}>{keyword}</em>)}</div> : null}</div></section><section className="site-section site-section--white"><div className="site-wrap site-product"><div className="site-product__image" style={{ backgroundImage: `url(${image})` }} /><div>{product.detailHTML ? <div className="rich-text" dangerouslySetInnerHTML={{ __html: product.detailHTML }} /> : <RichText data={product.description} enableGutter={false} />}<div className="site-actions"><a className="site-button" href={`mailto:${site.contact?.email || ''}?subject=${encodeURIComponent(`RFQ: ${product.title}`)}`}>{t.request}</a></div></div></div>{specifications.length ? <div className="site-specs"><h2>{t.specifications}</h2>{specifications.map((spec) => <div key={spec.id}><span>{spec.label}</span><strong>{spec.value}</strong></div>)}</div> : null}</section><script dangerouslySetInnerHTML={{ __html: jsonLD(productSchema) }} type="application/ld+json" /></main>
}
