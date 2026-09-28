import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { copy, getSite, isSiteLocale, siteHref } from '@/platform/site'

type Props = { params: Promise<{ lang: string; site: string }>; searchParams: Promise<{ category?: string | string[]; page?: string | string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> { const { lang } = await params; return isSiteLocale(lang) ? { title: copy[lang].blog } : {} }

export default async function BlogPage({ params, searchParams }: Props) {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['blog'], await searchParams)
  if (newPage) return newPage

  const payload = await getPayload({ config: configPromise })
  const posts = await payload.find({ collection: 'posts', locale: lang, depth: 1, limit: 100, sort: '-publishedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } })
  const t = copy[lang]
  return <main><section className="site-page-hero"><div className="site-wrap"><span className="site-eyebrow">{t.knowledge}</span><h1>{t.blog}</h1><p>{t.insightsIntro}</p></div></section><section className="site-section"><div className="site-wrap">{posts.docs.length ? <div className="site-grid">{posts.docs.map((post) => <Link className="site-card" href={siteHref(siteSlug, lang, `/blog/${post.slug}`)} key={post.id}><div className="site-card__body"><small>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(lang) : t.blog}</small><h3>{post.title}</h3><p>{post.meta?.description}</p></div></Link>)}</div> : <div className="site-empty">No published insights yet.</div>}</div></section></main>
}
