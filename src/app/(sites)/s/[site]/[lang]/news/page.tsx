import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload, type Where } from 'payload'

import { copy, getSite, isSiteLocale, siteHref } from '@/platform/site'
import { ExecutiveTenantStoryList } from '@/platform/legacy-templates/ExecutiveTenantPages'

type Props = {
  params: Promise<{ lang: string; site: string }>
  searchParams: Promise<{ category?: string | string[]; page?: string | string[] }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  return isSiteLocale(lang) ? { title: copy[lang].news } : {}
}

export default async function NewsPage({ params, searchParams }: Props) {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['news'], await searchParams)
  if (newPage) return newPage

  const payload = await getPayload({ config: configPromise })
  const selectedTemplateKey =
    site.selectedTemplate && typeof site.selectedTemplate === 'object'
      ? site.selectedTemplate.key
      : ''
  if (selectedTemplateKey === 'executive-industrial-pro-v1') {
    const query = await searchParams
    const rawCategory = Array.isArray(query.category) ? query.category[0] : query.category
    const rawPage = Array.isArray(query.page) ? query.page[0] : query.page
    const requestedPage = Math.max(1, Number.parseInt(rawPage || '1', 10) || 1)
    const [categoryResult] = await Promise.all([
      payload.find({
        collection: 'news-categories',
        locale: lang,
        depth: 0,
        limit: 100,
        sort: 'sortOrder',
        overrideAccess: true,
        where: { tenant: { equals: site.id } },
      }),
    ])
    const categories = categoryResult.docs.filter((item) => item.slug && item.name)
    const category = rawCategory ? categories.find((item) => item.slug === rawCategory) : undefined
    if (rawCategory && !category)
      return (
        <ExecutiveTenantStoryList
          filter={{ key: 'category', label: rawCategory, value: rawCategory }}
          items={[]}
          kind="news"
          locale={lang}
          page={1}
          siteSlug={siteSlug}
          total={0}
          totalPages={0}
        />
      )
    const where: Where = {
      and: [
        { tenant: { equals: site.id } },
        { _status: { equals: 'published' as const } },
        ...(category ? [{ category: { equals: category.id } }] : []),
      ],
    }
    const count = await payload.find({
      collection: 'news',
      locale: lang,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where,
    })
    const totalPages = count.totalPages || 0
    const page = totalPages ? Math.min(requestedPage, totalPages) : 1
    const result = totalPages
      ? await payload.find({
          collection: 'news',
          locale: lang,
          depth: 1,
          limit: 9,
          page,
          sort: 'sortOrder,-publishedAt',
          overrideAccess: true,
          where,
        })
      : { docs: [] }
    const items = result.docs.map((item) => ({
      id: item.id,
      title: item.title,
      slug: item.slug,
      summary: item.summary,
      label: typeof item.category === 'object' && item.category ? item.category.name : '',
      date: item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(lang) : '',
      image: typeof item.cover === 'object' && item.cover?.url ? item.cover.url : null,
    }))
    return (
      <ExecutiveTenantStoryList
        filter={
          category ? { key: 'category', label: category.name, value: category.slug } : undefined
        }
        items={items}
        kind="news"
        locale={lang}
        page={page}
        siteSlug={siteSlug}
        total={count.totalDocs}
        totalPages={totalPages}
      />
    )
  }
  const news = await payload.find({
    collection: 'news',
    locale: lang,
    depth: 1,
    limit: 100,
    sort: '-publishedAt',
    overrideAccess: true,
    where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] },
  })
  const t = copy[lang]
  return (
    <main>
      <section className="site-page-hero">
        <div className="site-wrap">
          <span className="site-eyebrow">{t.knowledge}</span>
          <h1>{t.news}</h1>
          <p>{t.insightsIntro}</p>
        </div>
      </section>
      <section className="site-section">
        <div className="site-wrap">
          {news.docs.length ? (
            <div className="site-grid">
              {news.docs.map((item) => (
                <Link
                  className="site-card"
                  href={siteHref(siteSlug, lang, `/news/${item.slug}`)}
                  key={item.id}
                >
                  <div
                    className="site-card__image"
                    style={{
                      backgroundImage: `url(${typeof item.cover === 'object' && item.cover?.url ? item.cover.url : 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=82'})`,
                    }}
                  />
                  <div className="site-card__body">
                    <small>
                      {item.publishedAt
                        ? new Date(item.publishedAt).toLocaleDateString(lang)
                        : t.news}
                    </small>
                    <h2>{item.title}</h2>
                    <p>{item.summary}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="site-empty">暂无已发布新闻。</div>
          )}
        </div>
      </section>
    </main>
  )
}
