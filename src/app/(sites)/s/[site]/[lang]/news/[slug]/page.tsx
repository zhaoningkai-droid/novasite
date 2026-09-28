import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import RichText from '@/components/RichText'
import { copy, getBaseURL, getSite, isSiteLocale, jsonLD, locales, siteHref } from '@/platform/site'

type Props = { params: Promise<{ lang: string; site: string; slug: string }> }

async function getNews(siteID: number, slug: string, lang: Parameters<typeof getSite>[1]) {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({ collection: 'news', locale: lang, depth: 2, limit: 1, overrideAccess: true, where: { and: [{ tenant: { equals: siteID } }, { slug: { equals: slug } }, { _status: { equals: 'published' } }] } })
  return result.docs[0] ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, site: siteSlug, slug } = await params
  if (!isSiteLocale(lang)) return {}
  const site = await getSite(siteSlug, lang)
  if (!site) return {}
  const item = await getNews(site.id, slug, lang)
  if (!item) return {}
  const base = getBaseURL(site, siteSlug)
  const path = `/news/${item.slug}`
  return { title: item.meta?.title || item.title, description: item.meta?.description || item.summary, alternates: { canonical: `${base}/${lang}${path}`, languages: Object.fromEntries(locales.map((locale) => [locale, `${base}/${locale}${path}`])) }, openGraph: { title: item.meta?.title || item.title, description: item.meta?.description || item.summary, type: 'article', url: `${base}/${lang}${path}` } }
}

export default async function NewsDetailPage({ params }: Props) {
  const { lang, site: siteSlug, slug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['news', slug])
  if (newPage) return newPage

  const item = await getNews(site.id, slug, lang)
  if (!item) notFound()
  const url = `${getBaseURL(site, siteSlug)}/${lang}/news/${item.slug}`
  const schema = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: item.title, description: item.summary, datePublished: item.publishedAt, dateModified: item.updatedAt, mainEntityOfPage: url, publisher: { '@type': 'Organization', name: site.branding.companyName } }
  return <main><section className="site-page-hero"><div className="site-wrap site-article__heading"><Link className="site-eyebrow" href={siteHref(siteSlug, lang, '/news')}>← {copy[lang].news}</Link><h1>{item.title}</h1><p>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(lang, { dateStyle: 'long' }) : ''}</p></div></section><article className="site-section site-section--white"><div className="site-wrap site-article"><RichText data={item.content} enableGutter={false} /></div></article><script dangerouslySetInnerHTML={{ __html: jsonLD(schema) }} type="application/ld+json" /></main>
}
