import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import RichText from '@/components/RichText'
import { copy, getBaseURL, getSite, isSiteLocale, jsonLD, locales, siteHref } from '@/platform/site'

type Props = { params: Promise<{ lang: string; site: string; slug: string }> }

async function getPost(siteID: number, slug: string, lang: Parameters<typeof getSite>[1]) {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({ collection: 'posts', locale: lang, depth: 2, limit: 1, overrideAccess: true, where: { and: [{ tenant: { equals: siteID } }, { slug: { equals: slug } }, { _status: { equals: 'published' } }] } })
  return result.docs[0] ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, site: siteSlug, slug } = await params
  if (!isSiteLocale(lang)) return {}
  const site = await getSite(siteSlug, lang)
  if (!site) return {}
  const post = await getPost(site.id, slug, lang)
  if (!post) return {}
  const base = getBaseURL(site, siteSlug)
  const path = `/blog/${post.slug}`
  return {
    title: post.meta?.title || post.title,
    description: post.meta?.description,
    alternates: { canonical: `${base}/${lang}${path}`, languages: Object.fromEntries(locales.map((locale) => [locale, `${base}/${locale}${path}`])) },
    openGraph: { title: post.meta?.title || post.title, description: post.meta?.description || undefined, type: 'article', url: `${base}/${lang}${path}` },
  }
}

export default async function ArticlePage({ params }: Props) {
  const { lang, site: siteSlug, slug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['blog', slug])
  if (newPage) return newPage

  const post = await getPost(site.id, slug, lang)
  if (!post) notFound()
  const url = `${getBaseURL(site, siteSlug)}/${lang}/blog/${post.slug}`
  const schema = { '@context': 'https://schema.org', '@type': 'Article', headline: post.title, description: post.meta?.description, datePublished: post.publishedAt, dateModified: post.updatedAt, mainEntityOfPage: url, publisher: { '@type': 'Organization', name: site.branding.companyName } }

  return <main><section className="site-page-hero"><div className="site-wrap site-article__heading"><Link className="site-eyebrow" href={siteHref(siteSlug, lang, '/blog')}>← {copy[lang].blog}</Link><h1>{post.title}</h1><p>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(lang, { dateStyle: 'long' }) : ''}</p></div></section><article className="site-section site-section--white"><div className="site-wrap site-article"><RichText data={post.content} enableGutter={false} /></div></article><script dangerouslySetInnerHTML={{ __html: jsonLD(schema) }} type="application/ld+json" /></main>
}
