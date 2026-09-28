import { renderSelectedTemplate } from '@/platform/new-templates/selected'
import { notFound } from 'next/navigation'

import { copy, getSite, isSiteLocale } from '@/platform/site'
import { RFQForm } from '../RFQForm'

type Props = { params: Promise<{ lang: string; site: string }> }

export default async function ContactPage({ params }: Props) {
  const { lang, site: slug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(slug, lang)
  if (!site) notFound()
  const newPage = await renderSelectedTemplate(site, lang, ['contact'])
  if (newPage) return newPage

  const contact = site.fixedPages?.contactPage
  const t = copy[lang]
  const qr = [['WhatsApp', site.contact?.whatsappQRCode], ['WeChat', site.contact?.wechatInternationalQRCode], ['微信', site.contact?.wechatQRCode]] as const
  return <main><section className="site-page-hero"><div className="site-wrap"><span className="site-eyebrow">{t.contact}</span><h1>{contact?.title || t.contact}</h1><p>{contact?.intro}</p></div></section><section className="site-section site-section--white"><div className="site-wrap site-contact-grid"><div><h2>{lang === 'zh' ? '联系方式' : 'Contact details'}</h2><p>{site.contact?.email}</p><p>{site.contact?.phone}</p>{site.contact?.whatsapp ? <p>WhatsApp：{site.contact.whatsapp}</p> : null}<p>{site.contact?.address}</p><div className="site-contact-qrs" data-site-contact-qrs>{qr.map(([label, image]) => typeof image === 'object' && image?.url ? <figure key={label}><img alt={`${label} 二维码`} src={image.url}/><figcaption>{label}</figcaption></figure> : null)}</div></div>{contact?.showInquiryForm !== false ? <div><h2>{t.rfqTitle}</h2><RFQForm labels={{ send: t.send, sending: t.sending, sent: t.sent, error: t.error }} requiredFields={(site.fixedPages?.homepage as any)?.inquiryRequiredFields || {}} site={slug} /></div> : null}</div></section></main>
}
