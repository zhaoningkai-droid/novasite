'use client'
import { useK712Page, useK712Site } from './TemplateData'
import { useInquirySubmission } from '@/platform/inquiry/useInquirySubmission'
import { inquiryRequiredFields, inquiryTextLimits } from '@/platform/inquiry/required-fields'
import type { ReactNode } from 'react'
import type { IndustryPageModel } from '@/platform/industry-templates/model'
import { DemoAnchor, demoHTML } from '../DemoLink'
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from '../DemoLink'
import Swiper from 'swiper'
import rawPages from './inner-data.json'
import assetMap from './all-assets.json'
type ImageData = {
  src: string
  alt: string
}
type PageLink = {
  label: string
  href: string
  className?: string
}
type Card = {
  href: string
  title: string
  image: ImageData
  excerpt?: string
  date?: string
}
type Certificate = {
  image: ImageData
  title: string
}
type PageData = {
  path: string
  family: string
  scope: string
  title: string
  banner: ImageData
  breadcrumb: string
  nav: PageLink[]
  pagination: PageLink[]
  paginationBreak?: boolean
  inlineCss: string
  items: Card[]
  heading?: string
  body?: string
  content?: ReactNode
  contactNodes?: ReactNode[]
  adjacent?: string[]
  images?: ImageData[]
  recommendations?: Card[]
  certificates?: Certificate[]
  certificateBackground?: string
  blocks?: {
    id: string
    heading: string
    body: string
    content?: ReactNode
    image: ImageData
  }[]
  questions?: {
    question: string
    answer: string
    content?: ReactNode
  }[]
  contactCards?: string[]
}
const pages = rawPages as Record<string, PageData>
const assets = assetMap as Record<string, string>
const asset = (path: string) => assets[path] || path
function customerPage(m: IndustryPageModel): PageData {
  const source =
    m.kind === 'about'
      ? '/about/'
      : m.kind === 'contact'
        ? '/contact/'
        : m.kind === 'faqs'
          ? '/faq/'
          : m.kind === 'product'
            ? '/product/12.html'
            : m.kind === 'article'
              ? m.section === 'cases'
                ? '/case/8.html'
                : '/article/41.html'
              : m.section === 'products'
                ? '/product/'
                : m.section === 'cases'
                  ? '/case/'
                  : '/article/'
  const template = pages[source]
  const card = (c: NonNullable<IndustryPageModel['cards']>[number]): Card => ({
    href: c.href,
    title: c.title,
    image: { src: c.image || '', alt: c.title },
    excerpt: c.summary || '',
    date: c.date?.slice(0, 10),
  })
  const page = m.pagination
  const pagination =
    page && page.totalPages > 1
      ? Array.from({ length: page.totalPages }, (_, i) => ({
          label: String(i + 1),
          href:
            i + 1 === page.page
              ? '#'
              : `${m.base}/${m.kind === 'faqs' ? 'faqs' : m.section}?${new URLSearchParams({ ...(m.activeCategory ? { category: m.activeCategory } : {}), page: String(i + 1) })}`,
          className: i + 1 === page.page ? 'page-item page-link active' : 'page-item page-link',
        }))
      : []
  return {
    path: `${m.base}/${m.section || m.kind}`,
    family: template.family,
    scope: template.scope,
    title: m.title,
    heading: m.title,
    banner: m.image ? { src: m.image, alt: '' } : template.banner,
    breadcrumb: '',
    inlineCss: template.inlineCss,
    nav: (m.categories || []).map((c) => ({
      label: c.label,
      href: c.href,
      className:
        m.activeCategory && c.href.includes('category=' + encodeURIComponent(m.activeCategory))
          ? 'active'
          : '',
    })),
    pagination,
    items: (m.cards || []).map(card),
    content: (
      <>
        {m.kind === 'article' && m.images?.map((src) => <img key={src} src={src} alt={m.title} />)}
        {m.content}
        {m.kind === 'product' && m.parameters?.length ? (
          <table>
            <tbody>
              {m.parameters.map((p, i) => (
                <tr key={i}>
                  <th>{p.label}</th>
                  <td>{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </>
    ),
    body: '',
    adjacent: [],
    images: (m.images || []).map((src) => ({ src, alt: m.title })),
    recommendations: (m.products || []).map(card),
    certificates: [],
    blocks: [
      ...(m.intro
        ? [
            {
              id: 'gsjj',
              heading: m.intro.title,
              body: '',
              content: (
                <>
                  <p style={{ whiteSpace: 'pre-line' }}>{m.intro.text}</p>
                  {m.certificates &&
                    !m.intro.text
                      .replace(/\s/g, '')
                      .includes(m.certificates.replace(/\s/g, '')) && (
                      <p style={{ whiteSpace: 'pre-line' }}>{m.certificates}</p>
                    )}
                </>
              ),
              image: { src: m.intro.image || '', alt: m.intro.title },
            },
          ]
        : []),
      ...(m.modules || []).map((c, i) => ({
        id: `gsjj${i + 2}`,
        heading: c.title,
        body: '',
        content: <p style={{ whiteSpace: 'pre-line' }}>{c.text}</p>,
        image: { src: c.image || '', alt: c.title },
      })),
    ],
    questions: (m.faqs || []).map((f) => ({ question: f.question, answer: '', content: f.answer })),
  }
}
function Rich({
  html,
  className,
  children,
}: {
  children?: ReactNode
  html: string
  className?: string
}) {
  if (children !== undefined) return <div className={className}>{children}</div>
  return <div className={className} dangerouslySetInnerHTML={{ __html: demoHTML(html, 'k712') }} />
}
function Pagination({ items }: { items: PageLink[] }) {
  return (
    items.length > 0 && (
      <div className="pagebar">
        <nav className="pagination" aria-label="分页">
          {items.map((item, i) =>
            item.href && item.href !== '#' ? (
              <DemoAnchor
                className={item.className || 'page-item page-link'}
                href={item.href}
                key={i}
              >
                {item.label}
              </DemoAnchor>
            ) : (
              <span className="page-item page-link k712-page-static" key={i}>
                {item.label}
              </span>
            ),
          )}
        </nav>
      </div>
    )
  )
}
function CategoryNav({ items, path }: { items: PageLink[]; path: string }) {
  return (
    items.length > 0 && (
      <div className="pro_nav">
        <div className="wal">
          <div className="pro_nav_txt">
            {items.map((item) => (
              <div className="p1" key={item.href}>
                <DemoAnchor
                  href={item.href}
                  className={item.className || undefined}
                  aria-current={
                    item.className?.split(' ').includes('active') ||
                    path.split('?')[0] === item.href
                      ? 'page'
                      : undefined
                  }
                  title={item.label}
                >
                  {item.label}
                </DemoAnchor>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  )
}
function ProductList({ page }: { page: PageData }) {
  const m = useK712Page()
  const product = m ? m.section === 'products' : page.path.startsWith('/product')
  return (
    <div className="ncontainer">
      <div className="pro_bodyb w1200">
        <div className="innerright">
          <div className="slide-content">
            <div className="innerplist">
              <div className="productss">
                <div className="pro_con clearfix">
                  {page.items.map((item, index) => (
                    <DemoAnchor href={item.href} title={item.title} key={index}>
                      <span>
                        <img
                          src={item.image.src}
                          alt={item.image.alt || item.title}
                          className="img-responsive center-block"
                        />
                      </span>
                      <p className="pro_title">{item.title}</p>
                    </DemoAnchor>
                  ))}
                  <div className="clear" />
                </div>
              </div>
            </div>
          </div>
          {product && (
            <>
              <div className="clear" />
              {page.paginationBreak && <br />}
              <Pagination items={page.pagination} />
            </>
          )}
        </div>
        <div className="clear" />
        {!product && (
          <>
            <div className="inrrctainer" />
            <Pagination items={page.pagination} />
          </>
        )}
      </div>
      <div className="clear" />
    </div>
  )
}
function NewsList({ page }: { page: PageData }) {
  return (
    <div className="ncontainer">
      <div className="pro_bodyb w1200">
        <div className="innerrighttt">
          <div className="news-twoo">
            <ul>
              {page.items.map((item) => (
                <li key={item.href}>
                  <DemoAnchor href={item.href} title={item.title}>
                    <div className="newscon">
                      <b>{item.title}</b>
                      <p className="dot">{item.excerpt}</p>
                    </div>
                    <div className="day">
                      <p>
                        {item.date} <span className="fa fa-angle-right" />
                      </p>
                    </div>
                  </DemoAnchor>
                </li>
              ))}
            </ul>
          </div>
          <div className="clear" />
          <Pagination items={page.pagination} />
        </div>
        <div className="clear" />
      </div>
      <div className="clear" />
    </div>
  )
}
function Adjacent({ page }: { page: PageData }) {
  const m = useK712Page()
  if (m)
    return (
      <div className="detpnt">
        {[m.previous, m.next].map((link, i) => (
          <div className="detpntline" key={i}>
            {i === 0 ? '上一篇：' : '下一篇：'}
            {link ? <DemoAnchor href={link.href}>{link.label}</DemoAnchor> : '暂无'}
          </div>
        ))}
        <div className="clear" />
      </div>
    )
  return (
    <div className="detpnt">
      {page.adjacent?.map((html, i) => (
        <Rich html={html} key={i} className="detpntline" />
      ))}
      <div className="clear" />
    </div>
  )
}
function EditorialDetail({ page }: { page: PageData }) {
  const m = useK712Page()
  return (
    <div className="ncontainer w1200">
      <div className="pro_bodyb">
        <div className="innerright">
          <div className="article_title">{page.heading}</div>
          {m?.model && <time>{m.model.slice(0, 10)}</time>}
          <div className="clear" />
          <Rich html={page.body || ''} className="innerrightxq ab_img">
            {page.content}
          </Rich>
        </div>
        <br />
        <Adjacent page={page} />
        <div className="clear" />
      </div>
      <div className="clear" />
    </div>
  )
}
function Certificates({
  items,
  about = false,
  background,
}: {
  items: Certificate[]
  about?: boolean
  background?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const pagination = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!container.current || !pagination.current) return
    const slider = new Swiper(container.current, {
      slidesPerView: 4,
      spaceBetween: 20,
      loop: true,
      speed: 1000,
      autoplay: { delay: 3000, stopOnLastSlide: false, disableOnInteraction: false },
      pagination: { el: pagination.current, clickable: true },
      breakpoints: {
        360: { slidesPerView: 1, spaceBetween: 10 },
        640: { slidesPerView: 2, spaceBetween: 15 },
        768: { slidesPerView: 3, spaceBetween: 15 },
        990: { slidesPerView: 4, spaceBetween: 20 },
      },
    })
    return () => {
      slider.destroy(true, true)
    }
  }, [])
  if (!items.length) return null
  const bg = background?.match(/background:\s*([^;]+)/)?.[1]
  return (
    <div
      className={
        about ? 'section homePg5 fp-section fp-table k712-about-certificates' : 'honor-section'
      }
      style={about ? { background: bg } : { marginBottom: 40 }}
    >
      <div className={about ? 'fp-tableCell' : undefined}>
        <div className="container">
          {about ? (
            <div className="main_title" style={{ textAlign: 'center' }}>
              <b style={{ fontSize: 24, color: '#fff' }}>企业实力</b>
            </div>
          ) : (
            <div style={{ borderBottom: '2px solid #dfdfdf', marginBottom: 20 }}>
              <div className="honor_title">企业实力</div>
            </div>
          )}
          <div className="certificate-section">
            <div className="swiper-container certificate-list" ref={container}>
              <div className="swiper-wrapper">
                {items.map((item, index) => (
                  <div className="swiper-slide" key={index}>
                    <div className="certificate-item">
                      <div className="certificate-img">
                        <img src={item.image.src} alt={item.image.alt} />
                        <div className="certificate-overlay">
                          <i className="iconfont icon-sousuo" />
                          <div className="certificate-title-hover">{item.title}</div>
                        </div>
                      </div>
                      <div className="certificate-title">{item.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="certificate-pagination" ref={pagination} />
          </div>
        </div>
      </div>
    </div>
  )
}
function Gallery({ images }: { images: ImageData[] }) {
  const main = useRef<HTMLDivElement>(null)
  const thumbs = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const previous = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!main.current || !thumbs.current || !next.current || !previous.current) return
    const thumbnails = new Swiper(thumbs.current, {
      loop: images.length > 1,
      spaceBetween: 10,
      slidesPerView: 4,
      freeMode: true,
      watchSlidesProgress: true,
    })
    const gallery = new Swiper(main.current, {
      loop: images.length > 1,
      spaceBetween: 10,
      navigation: { nextEl: next.current, prevEl: previous.current },
      thumbs: { swiper: thumbnails },
    })
    return () => {
      gallery.destroy(true, true)
      thumbnails.destroy(true, true)
    }
  }, [images])
  return (
    <div className="xql" style={{ overflow: 'hidden' }}>
      <div className="swiper mySwiper2 protop" ref={main}>
        <div className="swiper-wrapper">
          {images.map((image, index) => (
            <div className="swiper-slide" key={index}>
              <img src={image.src} alt={image.alt || '产品图片'} width="100%" />
            </div>
          ))}
        </div>
        <button
          className="swiper-button-next"
          ref={next}
          aria-label="下一张产品图片"
          type="button"
        />
        <button
          className="swiper-button-prev"
          ref={previous}
          aria-label="上一张产品图片"
          type="button"
        />
      </div>
      <div className="swiper mySwiper probot" ref={thumbs}>
        <div className="swiper-wrapper">
          {images.map((image, index) => (
            <div className="swiper-slide" key={index}>
              <img src={image.src} alt={image.alt} width="100%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
export function MessageForm({ contact = false }: { contact?: boolean }) {
  const m = useK712Page()
  const submitInquiry = useInquirySubmission()
  const required: Record<string, boolean> = inquiryRequiredFields(m?.requiredFields)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    if (m) {
      if (sending || m.preview) return
      setSending(true)
      try {
        if (await submitInquiry(form, m.site)) setMessage('询盘已提交。')
      } catch {
        setMessage('提交失败，请稍后重试。')
      } finally {
        setSending(false)
      }
      return
    }
    const fields = Object.fromEntries(new FormData(form).entries())
    try {
      const existing = JSON.parse(
        localStorage.getItem('k712-offline-messages') || '[]',
      ) as unknown[]
      localStorage.setItem(
        'k712-offline-messages',
        JSON.stringify([...existing, { ...fields, savedAt: new Date().toISOString() }]),
      )
      setMessage('留言已保存在此浏览器。本地离线演示，不会发送给企业。')
    } catch {
      setMessage('当前浏览器无法保存留言；尚未发送或保存。')
    }
  }
  const field = (name: string, placeholder: string, isRequired = false, type = 'text') => {
    const key = m && name === 'contact' ? 'phone' : name
    return (
      <input
        type={type}
        name={key}
        placeholder={placeholder}
        aria-label={placeholder}
        required={m ? Boolean(required[key]) : isRequired}
        maxLength={inquiryTextLimits[key as keyof typeof inquiryTextLimits] || 180}
      />
    )
  }
  const extra = m ? (
    <>
      {m.productId && <input type="hidden" name="productId" value={m.productId} />}
      {m.kind === 'product' && <input type="hidden" name="product" value={m.title} />}
      <input type="text" name="website" hidden tabIndex={-1} autoComplete="off" />
      {['country', 'address', 'capacity', ...(m.kind !== 'product' ? ['product'] : [])]
        .filter((k) => required[k])
        .map((k) =>
          field(
            k,
            (
              {
                country: '国家 *',
                address: '地址 *',
                capacity: '采购数量 *',
                product: '意向产品 *',
              } as Record<string, string>
            )[k],
            true,
          ),
        )}
    </>
  ) : null
  if (contact)
    return (
      <div className="k712-contact-form pro_bodyb w1200" id="inquiry" style={{ marginTop: 40 }}>
        <div className="innerright">
          <h3 style={{ fontSize: 24, color: '#333', marginBottom: 20 }}>在线留言</h3>
          <form id="messageForm" className="k712-message-form" onSubmit={submit}>
            {extra}
            <div style={{ marginBottom: 20 }}>{field('name', '您的姓名 *', true)}</div>
            <div style={{ marginBottom: 20 }}>{field('company', '公司名称')}</div>
            <div style={{ marginBottom: 20 }}>{field('contact', '电话 *', true, 'tel')}</div>
            <div style={{ marginBottom: 20 }}>{field('email', '邮箱 *', true, 'email')}</div>
            <div style={{ marginBottom: 20 }}>
              <textarea
                required={Boolean(m)}
                minLength={m ? 10 : undefined}
                maxLength={m ? 4000 : 5000}
                name="message"
                rows={5}
                placeholder="需求描述"
                aria-label="需求描述"
              />
            </div>
            {!m && (
              <div className="k712-offline-captcha" role="note">
                <p>
                  本地离线演示
                  <br />
                  留言仅保存在此浏览器，不会发送给企业。
                </p>
              </div>
            )}
            <div>
              <button
                disabled={sending || Boolean(m?.preview)}
                type="submit"
                className="k712-contact-submit"
              >
                Submit
              </button>
            </div>
            {message && (
              <p className="k712-form-result" role="status">
                {message}
              </p>
            )}
          </form>
        </div>
      </div>
    )
  return (
    <section className={contact ? 'k712-contact-form pro_bodyb w1200' : 'init-5'} id="inquiry">
      <div className={contact ? 'innerright' : 'wrap'}>
        <div className={contact ? undefined : 'container-fluid'}>
          <h2>{m?.inquiryTitle || (contact ? '在线留言' : '联系我们')}</h2>
          {m?.inquiryDescription && <p>{m.inquiryDescription}</p>}
          <form className={contact ? 'k712-message-form' : 'form-horizontal'} onSubmit={submit}>
            {extra}
            <ul className="cl">
              <li>{field('name', contact ? '您的姓名 *' : '您的姓名*', true)}</li>
              {contact && <li>{field('company', '公司名称')}</li>}
              <li>{field('contact', contact ? '电话 *' : 'Phone/WhatsApp*', true, 'tel')}</li>
              <li>{field('email', contact ? '邮箱 *' : '您的邮箱地址', contact, 'email')}</li>
              {!contact && <li>{field('company', '公司名称')}</li>}
              <li className="message-li">
                <textarea
                  required={Boolean(m)}
                  minLength={m ? 10 : undefined}
                  maxLength={m ? 4000 : 5000}
                  name="message"
                  rows={contact ? 5 : 4}
                  placeholder="需求描述"
                  aria-label="需求描述"
                />
              </li>
              <li className="submit-li">
                <div className="yam">
                  <input
                    disabled={sending || Boolean(m?.preview)}
                    type="submit"
                    value={contact ? 'Submit' : '提交'}
                  />
                </div>
              </li>
            </ul>
            {!m && <p className="k712-offline-note">本地离线留言，仅保存到此浏览器。</p>}
            {message && (
              <p className="k712-form-result" role="status">
                {message}
              </p>
            )}
            <div className="clear" />
          </form>
        </div>
      </div>
    </section>
  )
}
function ProductDetail({ page }: { page: PageData }) {
  const site = useK712Site(),
    m = useK712Page()
  return (
    <div className="ncontainer w1200" style={{ marginTop: 40 }}>
      <div className="innerright">
        <Gallery images={page.images || []} />
        <div className="xqr">
          <h3>{page.heading}</h3>
          {m?.summary && <p>{m.summary}</p>}
          {m?.tags?.length ? <p>{m.tags.join(' · ')}</p> : null}
          {m?.publishedAt && <time>{m.publishedAt.slice(0, 10)}</time>}
          <div className="xiazai">
            <ul>
              {m?.datasheet && (
                <li>
                  <DemoAnchor href={m.datasheet} target="_blank" rel="noopener noreferrer">
                    下载产品资料
                  </DemoAnchor>
                </li>
              )}
            </ul>
          </div>
          <div className="btn_box">
            <DemoAnchor
              href={`tel:${site ? site.contact.phone || '' : '123456789'}`}
              className="btn_item lxwm"
            >
              <img src={asset('/site/k712/images/lxicon.png')} width={30} height={30} alt="" />
              <b>{site ? site.contact.phone : '123456789'}</b>
            </DemoAnchor>
            <Link href="/contact/" className="btn_item">
              <i
                className="iconfont icon-phone"
                style={{ fontSize: 26, color: '#fff', paddingRight: 15 }}
              />
              <b>联系我们</b>
            </Link>
          </div>
        </div>
        <div className="clear" />
        <br />
        <Certificates items={page.certificates || []} />
        <div className="prodetail_box" id="product-details">
          <div className="prodetail_tit">
            <DemoAnchor href="#product-details">
              <b>产品详情</b>
            </DemoAnchor>
          </div>
          <Rich className="prodetailtxt2 ab_img" html={page.body || ''}>
            {page.content}
          </Rich>
        </div>
      </div>
      <div className="clear" />
      <br />
      <Adjacent page={page} />
      <MessageForm />
      <div className="clear" />
      {Boolean(page.recommendations?.length) && (
        <div className="mt-5 k712-recommendations">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h4 className="fw-bold mb-0">猜你喜欢</h4>
          </div>
          <div className="row row-cols-1 row-cols-md-2 row-cols-lg-5 g-4">
            {page.recommendations?.map((item, index) => (
              <div className="col" key={index}>
                <div className="product-card h-100">
                  <DemoAnchor href={item.href} className="product-img-link">
                    <img src={item.image.src} alt={item.image.alt} className="card-img-top" />
                  </DemoAnchor>
                  <div className="card-body p-3">
                    <DemoAnchor href={item.href}>
                      <h6 className="card-title text-dark mb-2">{item.title}</h6>
                    </DemoAnchor>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="clear" />
    </div>
  )
}
function About({ page }: { page: PageData }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  return (
    <>
      {page.blocks?.map((block, index) => {
        const image = block.image.src && (
          <div className={`about_${index % 2 === 1 ? 'fr fr' : 'fl fl'} ab_img`}>
            <img src={block.image.src} alt={block.image.alt} />
          </div>
        )
        const content = (
          <div className={index % 2 === 1 ? 'about_fl fl' : 'about_fr fr'}>
            <h3>{block.heading}</h3>
            <div className="desc-wrapper">
              <Rich
                html={block.body}
                className={`desc-content ${expanded[block.id] ? 'expanded' : ''}`}
              >
                {block.content}
              </Rich>
              <button
                className={`toggle-btn ${expanded[block.id] ? 'collapsed' : ''}`}
                type="button"
                aria-expanded={!!expanded[block.id]}
                onClick={() => setExpanded({ ...expanded, [block.id]: !expanded[block.id] })}
              >
                {expanded[block.id] ? '收起内容' : '展开阅读全文'}
              </button>
            </div>
          </div>
        )
        return (
          <div id={block.id} key={block.id} className="k712-about-block">
            <div className="container">
              <div className={`about-box ${!block.image.src ? 'k712-no-image' : ''}`}>
                {index % 2 === 1 ? (
                  <>
                    {content}
                    {image}
                  </>
                ) : (
                  <>
                    {image}
                    {content}
                  </>
                )}
              </div>
            </div>
            <div className="clearfix" />
          </div>
        )
      })}
      <Certificates items={page.certificates || []} about background={page.certificateBackground} />
    </>
  )
}
function Faq({ page }: { page: PageData }) {
  const [opened, setOpened] = useState<Record<number, boolean>>({})
  return (
    <div className="container" style={{ padding: '40px 0' }}>
      <div className="row">
        <div className="col-xs-12">
          {page.questions?.map((item, index) => (
            <div className={`faq_item ${opened[index] ? 'active' : ''}`} key={index}>
              <h3 className="faq_title">
                <button
                  type="button"
                  aria-expanded={!!opened[index]}
                  aria-controls={`faq-answer-${index}`}
                  onClick={() => setOpened({ ...opened, [index]: !opened[index] })}
                >
                  <span className="faq_title_text">{item.question}</span>
                  <span className="faq_toggle">{opened[index] ? '-' : '+'}</span>
                </button>
              </h3>
              <div id={`faq-answer-${index}`}>
                <Rich html={item.answer} className="faq_content">
                  {item.content}
                </Rich>
              </div>
            </div>
          ))}
          <Pagination items={page.pagination} />
        </div>
      </div>
    </div>
  )
}
function Contact({ page }: { page: PageData }) {
  const m = useK712Page()
  const cells = (offset: number) =>
    Array.from({ length: 5 }, (_, index) =>
      index % 2 === 1 ? (
        <td className="wapblock" key={index}>
          &nbsp;
        </td>
      ) : (
        <td
          className="lianxi wapblock"
          style={{ textAlign: 'center', boxShadow: '0 0 10px 0 #ccc' }}
          key={index}
        >
          {m ? (
            [
              <>
                <h3>电话</h3>
                <DemoAnchor href={`tel:${m.contact?.phone || ''}`}>{m.contact?.phone}</DemoAnchor>
              </>,
              <>
                <h3>邮箱</h3>
                <DemoAnchor href={`mailto:${m.contact?.email || ''}`}>
                  {m.contact?.email}
                </DemoAnchor>
              </>,
              <>
                <h3>地址</h3>
                <p>{m.contact?.address}</p>
              </>,
              <>
                <h3>WhatsApp</h3>
                <p>{m.contact?.whatsapp}</p>
              </>,
              ...(m.contact?.qr || []).map((q) => (
                <div key={q.label}>
                  <img src={q.image} alt={q.label} width="120" />
                  <p>{q.label}</p>
                </div>
              )),
            ][offset + index / 2] || null
          ) : (
            <div
              dangerouslySetInnerHTML={{
                __html: demoHTML(page.contactCards?.[offset + index / 2] || '', 'k712'),
              }}
            />
          )}
        </td>
      ),
    )
  return (
    <div className="ncontainer">
      <div className="pro_bodyb w1200">
        <div className="innerright">
          <br className="wapnone" />
          <br className="wapnone" />
          <strong className="wapnone" style={{ position: 'absolute' }}>
            <span style={{ fontSize: 250 }}>
              <span
                style={{
                  background: 'linear-gradient(#ffffff,#f5f6f9)',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                CONTACT
              </span>
            </span>
          </strong>
          <br className="wapnone" />
          <strong className="wapnone" style={{ position: 'absolute' }}>
            <span style={{ fontSize: 44, color: '#333' }}>&nbsp; {m ? m.company : 'Hegr'}</span>
          </strong>
          <br className="wapnone" />
          <br className="wapnone" />
          <br className="wapnone" />
          <br className="wapnone" />
          {m?.summary && <p>{m.summary}</p>}
          <table className="k712-contact-table" style={{ width: '100%', borderSpacing: 0 }}>
            <tbody>
              <tr className="wapnone">
                {[32, 2, 32, 2, 32].map((width, index) => (
                  <td style={{ width: `${width}%` }} key={index}>
                    &nbsp;
                  </td>
                ))}
              </tr>
              <tr>{cells(0)}</tr>
              <tr>
                {Array.from({ length: 5 }, (_, index) => (
                  <td className={index === 4 ? 'wapblock' : 'wapnone'} key={index}>
                    &nbsp;
                  </td>
                ))}
              </tr>
              <tr>{cells(3)}</tr>
            </tbody>
          </table>
        </div>
        <div className="clear" />
        {(!m || m.showInquiry) && <MessageForm contact />}
      </div>
      <div className="clear" />
    </div>
  )
}
export function InnerPage({ path, query = '' }: { path: string; query?: string }) {
  const m = useK712Page()
  const normalized = path.includes('.') || path.endsWith('/') ? path : path + '/'
  const normalizedQuery = /^\d+$/.test(query) ? 'page=' + query : query
  const queryString = normalizedQuery.startsWith('?')
    ? normalizedQuery
    : normalizedQuery
      ? '?' + normalizedQuery
      : ''
  const page = m
    ? customerPage(m)
    : pages[path.replace(/\/$/, '') + queryString] ||
      pages[path + queryString] ||
      pages[normalized + queryString] ||
      pages[path] ||
      pages[normalized]
  if (!page)
    return (
      <div className="k712-inner">
        <div className="container" style={{ padding: '100px 0' }}>
          <h1>页面未找到</h1>
          <Link href="/">返回首页</Link>
        </div>
      </div>
    )
  return (
    <div className={`k712-inner ${page.scope} k712-${page.family}`}>
      <style>{page.inlineCss}</style>
      <div id="adminbuy_cn_img">
        <img src={page.banner.src} alt={page.banner.alt} width="100%" />
      </div>
      <div className="thrid" />
      <div className="innerrtitle">
        <div className="ncontainer">
          {m ? (
            <div className="navpost">
              <img src="/sites/k712/asset-2864552d91cea91b.png" width="25" alt="" />
              <span className="inposition">当前位置：</span>
              <DemoAnchor href={m.base}>首页</DemoAnchor> &gt;&gt; {m.title}
            </div>
          ) : (
            <Rich html={page.breadcrumb} className="navpost" />
          )}
          <div className="clear" />
        </div>
      </div>
      <CategoryNav items={page.nav} path={page.path} />
      {page.family === 'product-list' && <ProductList page={page} />}
      {page.family === 'news-list' && <NewsList page={page} />}
      {page.family === 'editorial-detail' && <EditorialDetail page={page} />}
      {page.family === 'product-detail' && <ProductDetail page={page} />}
      {page.family === 'about' && <About page={page} />}
      {page.family === 'faq' && <Faq page={page} />}
      {page.family === 'contact' && <Contact page={page} />}
      <div className="clear" />
    </div>
  )
}
