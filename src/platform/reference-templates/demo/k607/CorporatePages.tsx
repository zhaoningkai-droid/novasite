'use client'
import { useK607Page, useK607Site, pageLinks } from './TemplateData'
import { useInquirySubmission } from '@/platform/inquiry/useInquirySubmission'
import { inquiryRequiredFields } from '@/platform/inquiry/required-fields'
import { DemoAnchor } from '../DemoLink'
/* Source image dimensions and cropping are preserved. */
/* eslint-disable @next/next/no-img-element */
import { useState, type FormEvent } from 'react'
import Link from '../DemoLink'
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import assets from './all-assets.json'
import './corporate.css'
const assetMap: Record<string, string> = assets
const asset = (source: string) => assetMap[source] || `/sites/k607/${source.split('/').pop()}`
const qr = asset(
  '//shanghai.waimao.o668.com/upload/hegeer/202603/18cf43ad70a9b6487e432d995fd22ccf.png',
)
const aboutSections = [
  {
    title: '企业介绍',
    image: '//shanghai.waimao.o668.com/upload/preview/202608/d486bde351a9eb29705cda5b4caa4f27.webp',
    text: '企业概况\n企业官方注册全称：中国商贸有限公司\n成立时间：深耕毛绒玩具核心产业带多年，依托成熟供应链体系搭建全链路生产能力\n全球总部：中国・河北・石家庄\n生产基地 / 仓储地址：中国・河北・石家庄\n核心团队背景：100 人专业团队涵盖生产、质检、定制设计、外贸全链路，核心成员平均拥有 8 年以上毛绒玩具行业经验，具备批量生产与定制化项目落地能力',
  },
  {
    title: '核心团队背景',
    image: '//shanghai.waimao.o668.com/upload/hegeer/202603/65656aac57657bb4ebb8f3c9f51782bf.webp',
    text: '公司拥有一支经验丰富的专业团队，成员覆盖产品设计、生产管理、品质检测及跨境贸易等多个领域。核心成员平均拥有8年以上毛绒玩具行业经验，具备成熟的项目执行能力与国际市场服务经验。',
  },
  {
    title: '高效运输能力',
    image: '//shanghai.waimao.o668.com/upload/hegeer/202603/b0596b46d43a158b90a6c79d5662ae3f.webp',
    text: '生产与服务能力赫格尔商贸依托中国毛绒玩具核心产业带优势，构建了覆盖全球的高效跨境供应链体系。我们的产品已通过 CE、CPC 等国际安全认证，远销英国、新加坡、俄罗斯等 10 余个国家和地区，为全球采购商提供稳定、高效的毛绒玩具定制与批发服务。与多家国际头部物流企业达成战略合作，实现现货订单 2 天内极速交付，定制订单交付周期较行业平均缩短 30%。',
  },
]
const questions = [
  ['下单前可以拿样品吗', '下单前可以拿样品吗'],
  ['发货周期多久？', '根据订单量不同以及是否需要定制来评估周期'],
  ['支持哪些付款方式？', '支持 T/T、L/C、西联汇款、阿里信用保障等。'],
  ['起订量是多少？', '起订量为 XX 件，小批量试单可另行协商。'],
  ['撒大大', '啊大大大大大大'],
  [
    '可以成为你们的独家代理 / 经销商吗？',
    '我们欢迎长期合作与经销商加盟，可提供销售计划与市场信息，进一步洽谈合作。',
  ],
  [
    '出现质量问题怎么办？',
    '出货前我们会严格质检。如确认为质量问题，我们将根据情况安排换货、维修或退款。',
  ],
  [
    '支持哪些付款方式？',
    '支持 T/T、L/C、西联汇款、阿里信用保障等。通常预付 30% 定金，尾款发货前付清。',
  ],
  ['生产周期多久？', '常规产品 7–15 个工作日，定制产品根据复杂程度 15–25 个工作日。'],
  ['起订量是多少？', '起订量为 XX 件，小批量试单可另行协商。'],
  [
    '下单前可以拿样品吗？',
    '可以提供样品，您只需支付样品费和运费。正式下单后，样品费可退还或抵扣货款。',
  ],
]
function CorporateBanner({ title, contact }: { title: string; contact: boolean }) {
  const m = useK607Page()
  return (
    <>
      <div className="corp-banner">
        <img
          src={m?.image || asset(`/site/k607/images/${contact ? 'contact' : 'about'}-banner.jpg`)}
          alt=""
        />
      </div>
      <div className="corp-position">
        <div className="corp-position-inner">
          <span className="corp-position-title">{title}</span>
          <p>
            <MapPin aria-hidden="true" />
            <span>
              当前位置：<Link href="/">首页</Link> &gt;&gt; {title}
            </span>
          </p>
        </div>
      </div>
    </>
  )
}
function AboutContent() {
  const m = useK607Page(),
    site = useK607Site()
  const sections = m
    ? [
        ...(m.intro
          ? [{ title: m.intro.title, text: m.intro.text, image: m.intro.image || '' }]
          : []),
        ...(m.modules || []).map((c) => ({
          title: c.title,
          text: c.text || '',
          image: c.image || '',
        })),
      ]
    : aboutSections
  const [expanded, setExpanded] = useState<number[]>([])
  return (
    <div className="corp-about">
      {sections.map((section, index) => (
        <section
          key={section.title}
          className={`corp-about-section ${index % 2 === 1 ? 'corp-about-reversed' : ''} ${!section.image ? 'corp-about-text-only' : ''}`}
        >
          <div className="corp-about-copy">
            {index === 0 ? <h1>{section.title}</h1> : <h2>{section.title}</h2>}
            <p className="corp-brand">{site ? site.company : 'Hegr'}</p>
            <div
              id={`corp-description-${index}`}
              className={`corp-description ${expanded.includes(index) ? 'is-expanded' : ''}`}
            >
              {section.text}
            </div>
            <button
              type="button"
              className={`corp-read-more ${expanded.includes(index) ? 'is-expanded' : ''}`}
              aria-expanded={expanded.includes(index)}
              aria-controls={`corp-description-${index}`}
              onClick={() =>
                setExpanded((previous) =>
                  previous.includes(index)
                    ? previous.filter((value) => value !== index)
                    : [...previous, index],
                )
              }
            >
              {expanded.includes(index) ? '收起内容' : '展开阅读全文'}
            </button>
          </div>
          {section.image && (
            <div className="corp-about-image">
              <img src={m ? section.image : asset(section.image)} alt={section.title} />
            </div>
          )}
        </section>
      ))}
      {m?.certificates && (
        <section className="corp-about-section corp-about-text-only">
          <div className="corp-about-copy">
            <h2>资质认证</h2>
            <p>{m.certificates}</p>
          </div>
        </section>
      )}
    </div>
  )
}
function FaqContent() {
  const m = useK607Page()
  const rows = m ? (m.faqs || []).map((f) => [f.question, f.answer]) : questions
  const [active, setActive] = useState<number[]>([0])
  return (
    <>
      <div className="corp-faq">
        {rows.map(([question, answer], index) => (
          <section
            key={index}
            className={`corp-faq-item ${active.includes(index) ? 'is-active' : ''}`}
          >
            <h2>
              <button
                type="button"
                aria-expanded={active.includes(index)}
                aria-controls={`corp-answer-${index}`}
                onClick={() =>
                  setActive((previous) =>
                    previous.includes(index)
                      ? previous.filter((value) => value !== index)
                      : [...previous, index],
                  )
                }
              >
                {question}
                <span aria-hidden="true">{active.includes(index) ? '−' : '+'}</span>
              </button>
            </h2>
            <div
              id={`corp-answer-${index}`}
              className="corp-faq-answer"
              aria-hidden={!active.includes(index)}
            >
              <div className="corp-faq-answer-inner">{answer}</div>
            </div>
          </section>
        ))}
      </div>
      <nav className="corp-pagination" aria-label="常见问题分页">
        {m ? (
          pageLinks(m).map((p) => (
            <DemoAnchor key={p.href} href={p.href}>
              {p.text}
            </DemoAnchor>
          ))
        ) : (
          <>
            <Link href="/faq/">首页</Link>
            <Link href="/faq/" aria-label="上一页">
              &lt;&lt;
            </Link>
            <span aria-current="page">1</span>
            <Link href="/faq/" aria-label="下一页">
              &gt;&gt;
            </Link>
            <Link href="/faq/">末页</Link>
          </>
        )}
      </nav>
    </>
  )
}
function ContactContent() {
  const site = useK607Site(),
    m = useK607Page()
  const contact = site?.contact
  const qrs = site
    ? contact?.qr || []
    : ['WhatsApp', '微信', 'Weixin'].map((label) => ({ label, image: qr }))
  const [zoomQr, setZoomQr] = useState<string | null>(null)
  return (
    <section className="corp-contact">
      <div className="corp-contact-grid">
        <div className="corp-contact-details" id="contact">
          <h1>{m?.title || '联系我们'}</h1>
          {m?.summary && <p>{m.summary}</p>}
          <p>
            <Phone aria-hidden="true" />
            <DemoAnchor href={site ? `tel:${contact?.phone || ''}` : 'tel:123456789'}>
              电话：{site ? contact?.phone : '123456789'}
            </DemoAnchor>
          </p>
          <p>
            <Mail aria-hidden="true" />
            <DemoAnchor
              href={site ? `mailto:${contact?.email || ''}` : 'mailto:123456789@gmail.com'}
            >
              邮箱：{site ? contact?.email : '123456789@gmail.com'}
            </DemoAnchor>
          </p>
          <p>
            <MessageCircle aria-hidden="true" />
            WhatsApp：{site ? contact?.whatsapp : '45454545'}
          </p>
          <p>
            <MapPin aria-hidden="true" />
            地址：{site ? contact?.address : '河北省石家庄市桥西区石家庄站2层'}
          </p>
          <h2>Follow Us</h2>
          <div className="corp-qrs">
            {qrs.map(({ label: title, image }) => (
              <button
                type="button"
                key={title}
                onClick={() => setZoomQr(title)}
                aria-label={`放大${title}二维码`}
              >
                <img src={image} alt={`${title}二维码`} />
                <span>{title}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="corp-contact-message" id="msg">
          {(!m || m.showInquiry) && <LocalContactForm />}
        </div>
      </div>
      {zoomQr && (
        <div
          className="corp-qr-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${zoomQr}二维码`}
          onClick={() => setZoomQr(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setZoomQr(null)
          }}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <button type="button" autoFocus onClick={() => setZoomQr(null)} aria-label="关闭二维码">
              ×
            </button>
            <h2>{zoomQr}</h2>
            <img src={qrs.find((q) => q.label === zoomQr)?.image} alt={`${zoomQr}二维码`} />
          </div>
        </div>
      )}
    </section>
  )
}
export function LocalContactForm({
  heading = '在线留言',
  product,
}: {
  heading?: string
  product?: string
}) {
  const m = useK607Page()
  const submitInquiry = useInquirySubmission()
  const [sending, setSending] = useState(false)
  const required: Record<string, boolean> | null = m
    ? inquiryRequiredFields(m.requiredFields)
    : null
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  async function saveMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    if (m) {
      if (sending || m.preview) return
      setSending(true)
      try {
        if (await submitInquiry(form, m.site)) {
          setFailed(false)
          setNotice('询盘已提交。')
        }
      } catch {
        setFailed(true)
        setNotice('提交失败，请稍后重试。')
      } finally {
        setSending(false)
      }
      return
    }
    const fields = Object.fromEntries(new FormData(form))
    if (!String(fields.name || '').trim() || !String(fields.contact || '').trim()) {
      setFailed(true)
      setNotice('请填写姓名和电话。')
      return
    }
    try {
      const key = 'k607-local-contact-messages'
      const previous: unknown = JSON.parse(localStorage.getItem(key) || '[]')
      const messages: unknown[] = Array.isArray(previous) ? previous : []
      localStorage.setItem(
        key,
        JSON.stringify([...messages, { ...fields, savedAt: new Date().toISOString() }]),
      )
      setFailed(false)
      setNotice('留言已保存到此浏览器本地，未发送至原站或任何第三方。')
      form.reset()
    } catch {
      setFailed(true)
      setNotice('浏览器未允许本地保存，留言尚未保存。请检查浏览器存储设置后重试。')
    }
  }
  return (
    <div className="corp-local-form">
      <h2>{heading}</h2>
      {m?.inquiryDescription && <p>{m.inquiryDescription}</p>}
      <form onSubmit={saveMessage}>
        {m?.productId && <input type="hidden" name="productId" value={m.productId} />}
        {m && <input type="text" name="website" hidden tabIndex={-1} autoComplete="off" />}
        {product && <input type="hidden" name="product" value={product} />}
        <input
          name="name"
          aria-label="姓名"
          placeholder={product ? '您的姓名*' : '姓名 *'}
          required
          autoComplete="name"
          maxLength={120}
        />
        <input
          name={m ? 'phone' : 'contact'}
          aria-label={product ? '电话 / WhatsApp' : '电话'}
          placeholder={product ? 'Phone/WhatsApp*' : '电话 *'}
          required={m ? Boolean(required?.phone) : true}
          type="tel"
          autoComplete="tel"
          maxLength={60}
        />
        {(product ? ['email', 'company'] : ['company', 'email']).map((name) =>
          name === 'company' ? (
            <input
              key={name}
              required={Boolean(required?.company)}
              name="company"
              aria-label="公司名称"
              placeholder="公司名称"
              autoComplete="organization"
              maxLength={180}
            />
          ) : (
            <input
              key={name}
              name="email"
              aria-label="邮箱"
              placeholder={product ? '您的邮箱地址' : '邮箱 *'}
              required={m ? Boolean(required?.email) : !product}
              type="email"
              autoComplete="email"
              maxLength={180}
            />
          ),
        )}
        {m &&
          ['country', 'address', 'capacity', ...(!product ? ['product'] : [])]
            .filter((field) => required?.[field])
            .map((field) => (
              <input
                key={field}
                name={field}
                aria-label={
                  (
                    {
                      country: '国家',
                      address: '地址',
                      capacity: '采购数量',
                      product: '意向产品',
                    } as Record<string, string>
                  )[field]
                }
                placeholder={
                  (
                    {
                      country: '国家 *',
                      address: '地址 *',
                      capacity: '采购数量 *',
                      product: '意向产品 *',
                    } as Record<string, string>
                  )[field]
                }
                required
                maxLength={field === 'address' ? 300 : 160}
              />
            ))}
        {product ? (
          <div className="product-message-field">
            <textarea
              required={Boolean(m)}
              minLength={m ? 10 : undefined}
              name="message"
              aria-label="需求描述"
              placeholder="需求描述"
              rows={5}
              maxLength={m ? 4000 : 5000}
            />
          </div>
        ) : (
          <textarea
            required={Boolean(m)}
            minLength={m ? 10 : undefined}
            name="message"
            aria-label={product ? '需求描述' : '在线留言'}
            placeholder={product ? '需求描述' : '在线留言'}
            rows={5}
            maxLength={m ? 4000 : 5000}
          />
        )}
        {!m && !product && (
          <p className="corp-local-note corp-verification-note">
            本地演示表单：留言仅保存于当前浏览器，无需人机验证，不会发送至原站。
          </p>
        )}
        {product ? (
          <button className="corp-submit" disabled={sending || Boolean(m?.preview)} type="submit">
            提交
          </button>
        ) : (
          <div className="corp-submit-row">
            <button className="corp-submit" disabled={sending || Boolean(m?.preview)} type="submit">
              提交
            </button>
          </div>
        )}
        {!m && product && (
          <p className="corp-local-note">留言仅保存于当前浏览器本地，不会发送至原站。</p>
        )}
        {notice && (
          <p
            role={failed ? 'alert' : 'status'}
            className={`corp-save-notice ${failed ? 'is-error' : ''}`}
          >
            {notice}
          </p>
        )}
      </form>
    </div>
  )
}
export function CorporatePage({ path }: { path: string }) {
  const m = useK607Page()
  const contact = path.startsWith('/contact')
  const faq = path.startsWith('/faq')
  const title = m?.title || (contact ? '联系我们' : faq ? '常见问题' : '关于我们')
  return (
    <div className="corp-page">
      <CorporateBanner title={title} contact={contact} />
      {contact ? <ContactContent /> : faq ? <FaqContent /> : <AboutContent />}
    </div>
  )
}
