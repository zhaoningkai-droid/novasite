import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { copy, getSite, isSiteLocale, jsonLD } from '@/platform/site'
type Props = { params: Promise<{ lang: string; site: string }> }
const plain = (value: any): string => !value || typeof value !== 'object' ? '' : Array.isArray(value) ? value.map(plain).join(' ') : `${typeof value.text === 'string' ? value.text : ''} ${plain(value.root)} ${plain(value.children)}`.trim()
export default async function FAQPage({ params }: Props) { const { lang, site: slug } = await params; if (!isSiteLocale(lang)) notFound(); const site = await getSite(slug, lang); if (!site) notFound();
  const newPage = await renderSelectedTemplate(site, lang, ['faqs'])
  if (newPage) return newPage
 const payload = await getPayload({ config }); const result = await payload.find({ collection: 'faqs', locale: lang, depth: 0, limit: 100, sort: 'sortOrder', overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { enabled: { equals: true } }] } }); const faqs = result.docs.map((item) => ({ question: item.question, answer: plain(item.answer) })); const title = lang === 'zh' ? '常见问题' : 'Frequently asked questions'; return <main><section className="site-page-hero"><div className="site-wrap"><span className="site-eyebrow">{copy[lang].about}</span><h1>{title}</h1></div></section><section className="site-section site-section--white"><div className="site-wrap site-grid" data-site-faqs>{faqs.map((item) => <article className="site-card" key={item.question}><div className="site-card__body"><h2>{item.question}</h2><p>{item.answer}</p></div></article>)}</div></section>{faqs.length ? <script dangerouslySetInnerHTML={{ __html: jsonLD({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }) }} type="application/ld+json"/> : null}</main> }
