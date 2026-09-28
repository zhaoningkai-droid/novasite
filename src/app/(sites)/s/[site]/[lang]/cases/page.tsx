import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { copy, getSite, isSiteLocale, siteHref } from '@/platform/site'

type Props = { params: Promise<{ lang: string; site: string }>; searchParams: Promise<{ category?: string | string[]; page?: string | string[] }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> { const { lang } = await params; return isSiteLocale(lang) ? { title: copy[lang].cases } : {} }

export default async function CasesPage({ params, searchParams }: Props) {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['cases'], await searchParams)
  if (newPage) return newPage

  const payload = await getPayload({ config: configPromise })
  const cases = await payload.find({ collection: 'cases', locale: lang, depth: 1, limit: 100, sort: '-publishedAt', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } })
  const t = copy[lang]
  return <main><section className="site-page-hero"><div className="site-wrap"><span className="site-eyebrow">{t.knowledge}</span><h1>{t.cases}</h1><p>{t.insightsIntro}</p></div></section><section className="site-section"><div className="site-wrap">{cases.docs.length ? <div className="site-grid">{cases.docs.map((item) => <Link className="site-card" href={siteHref(siteSlug, lang, `/cases/${item.slug}`)} key={item.id}><div className="site-card__image" style={{ backgroundImage: `url(${typeof item.cover === 'object' && item.cover?.url ? item.cover.url : 'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?auto=format&fit=crop&w=1200&q=82'})` }} /><div className="site-card__body"><small>{item.country || t.cases}</small><h2>{item.title}</h2><p>{item.summary}</p></div></Link>)}</div> : <div className="site-empty">暂无已发布案例。</div>}</div></section></main>
}
