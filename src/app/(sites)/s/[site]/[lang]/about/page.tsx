import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import { notFound } from 'next/navigation'

import { copy, getSite, isSiteLocale } from '@/platform/site'

type Props = { params: Promise<{ lang: string; site: string }> }

export default async function AboutPage({ params }: Props) {
  const { lang, site: slug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(slug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['about'])
  if (newPage) return newPage

  const about = site.fixedPages?.about
  const t = copy[lang]
  const modules = [...((about as any)?.modules || [])].sort((left: any, right: any) => (left.sortOrder || 0) - (right.sortOrder || 0))
  return <main><section className="site-page-hero"><div className="site-wrap"><span className="site-eyebrow">{t.about}</span><h1>{about?.title || t.about}</h1><p>{about?.intro}</p></div></section>{modules.length ? <section className="site-section"><div className="site-wrap site-grid" data-site-about-modules>{modules.map((item: any, index: number) => <article className="site-card" key={item.id || index}>{typeof item.image === 'object' && item.image?.url ? <img alt={item.image.alt || item.title} className="site-editorial-media" src={item.image.url}/> : null}<div className="site-card__body"><h2>{item.title}</h2><p>{item.description}</p></div></article>)}</div></section> : null}</main>
}
