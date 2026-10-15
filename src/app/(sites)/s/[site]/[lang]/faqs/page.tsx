import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import { notFound } from 'next/navigation'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'

import RichText from '@/components/RichText'
import { ExecutiveTenantFAQPage } from '@/platform/legacy-templates/ExecutiveTenantPages'
import { copy, getSite, isSiteLocale, jsonLD } from '@/platform/site'
import { richTextToPlainText } from '@/platform/rich-text'

type Props = {
  params: Promise<{ lang: string; site: string }>
  searchParams: Promise<{ page?: string | string[] }>
}

const plain = (value: unknown): string => {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(plain).join(' ')
  const record = value as { text?: unknown; root?: unknown; children?: unknown }
  return `${typeof record.text === 'string' ? record.text : ''} ${plain(record.root)} ${plain(record.children)}`.trim()
}

export default async function FAQPage({ params, searchParams }: Props) {
  const { lang, site: slug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(slug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['faqs'])
  if (newPage) return newPage

  const payload = await getPayload({ config })
  const selectedTemplateKey =
    site.selectedTemplate && typeof site.selectedTemplate === 'object'
      ? site.selectedTemplate.key
      : ''
  if (selectedTemplateKey === 'executive-industrial-pro-v1') {
    const query = await searchParams
    const rawPage = Array.isArray(query.page) ? query.page[0] : query.page
    const requestedPage = Math.max(1, Number.parseInt(rawPage || '1', 10) || 1)
    const where: Where = {
      and: [{ tenant: { equals: site.id } }, { enabled: { equals: true } }],
    }
    const count = await payload.find({
      collection: 'faqs',
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
          collection: 'faqs',
          locale: lang,
          depth: 0,
          limit: 10,
          page,
          sort: 'sortOrder',
          overrideAccess: true,
          where,
        })
      : { docs: [] }
    const items = result.docs.map((item) => ({
      id: item.id,
      question: item.question,
      answer: <RichText data={item.answer} enableGutter={false} />,
    }))
    const faqPlain = result.docs.map((item) => ({
      question: item.question,
      answer: richTextToPlainText(item.answer) || plain(item.answer),
    }))
    return (
      <>
        <ExecutiveTenantFAQPage
          items={items}
          locale={lang}
          page={page}
          siteSlug={slug}
          totalPages={totalPages}
        />
        {faqPlain.length ? (
          <script
            dangerouslySetInnerHTML={{
              __html: jsonLD({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: faqPlain.map((item) => ({
                  '@type': 'Question',
                  name: item.question,
                  acceptedAnswer: { '@type': 'Answer', text: item.answer },
                })),
              }),
            }}
            type="application/ld+json"
          />
        ) : null}
      </>
    )
  }

  const result = await payload.find({
    collection: 'faqs',
    locale: lang,
    depth: 0,
    limit: 100,
    sort: 'sortOrder',
    overrideAccess: true,
    where: { and: [{ tenant: { equals: site.id } }, { enabled: { equals: true } }] },
  })
  const faqs = result.docs.map((item) => ({ question: item.question, answer: plain(item.answer) }))
  const title = lang === 'zh' ? '常见问题' : 'Frequently asked questions'
  return (
    <main>
      <section className="site-page-hero">
        <div className="site-wrap">
          <span className="site-eyebrow">{copy[lang].about}</span>
          <h1>{title}</h1>
        </div>
      </section>
      <section className="site-section site-section--white">
        <div className="site-wrap site-grid" data-site-faqs>
          {faqs.map((item) => (
            <article className="site-card" key={item.question}>
              <div className="site-card__body">
                <h2>{item.question}</h2>
                <p>{item.answer}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      {faqs.length ? (
        <script
          dangerouslySetInnerHTML={{
            __html: jsonLD({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faqs.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: { '@type': 'Answer', text: item.answer },
              })),
            }),
          }}
          type="application/ld+json"
        />
      ) : null}
    </main>
  )
}
