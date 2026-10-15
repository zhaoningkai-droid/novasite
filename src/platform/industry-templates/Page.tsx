import Link from 'next/link'
import { ArrowUpRight, Mail, MapPin, Phone, MessageCircle } from 'lucide-react'
import { Carousel } from '@/platform/new-templates/Carousel'
import { Inquiry } from '@/platform/new-templates/Inquiry'
import { ProductGallery } from '@/platform/new-templates/ProductGallery'
import { templateCopy } from '@/platform/new-templates/copy'
import { QuoteDialog } from './controls'
import { safeDate, type IndustryCard, type IndustryPageModel } from './model'
import { IndustryStructuredData } from './StructuredData'

export function IndustryCards({
  items,
  kind = 'products',
}: {
  items: IndustryCard[]
  kind?: string
}) {
  return (
    <div className={`it-cards it-cards--${kind}`}>
      {items.map((item, index) => (
        <Link className="it-card" href={item.href} key={item.id}>
          <div className="it-card-image">
            {item.image ? (
              <img src={item.image} alt={item.title} width="640" height="480" loading="lazy" />
            ) : null}
          </div>
          <div className="it-card-copy">
            <small>{safeDate(item.date) || String(index + 1).padStart(2, '0')}</small>
            <h3>{item.title}</h3>
            {item.summary ? <p>{item.summary}</p> : null}
            <span className="it-card-arrow" aria-hidden="true">
              <ArrowUpRight size={20} />
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}

export function IndustryForm({
  model,
  address = false,
}: {
  model: IndustryPageModel
  address?: boolean
}) {
  return (
    <Inquiry
      site={model.site}
      locale={model.locale}
      preview={model.preview}
      demo={model.demo}
      address={address}
      requiredFields={model.requiredFields}
      product={model.kind === 'product' ? model.title : undefined}
      productId={model.productId}
    />
  )
}

export function IndustryPage({ model }: { model: IndustryPageModel }) {
  return (
    <>
      <IndustryStructuredData model={model} />
      <IndustryBody model={model} />
    </>
  )
}

function IndustryBody({ model }: { model: IndustryPageModel }) {
  const m = model
  const t = templateCopy(m.locale)
  const href = (path: string) => `${m.base}/${path}`
  const quote = (
    <QuoteDialog locale={m.locale}>
      <IndustryForm model={m} />
    </QuoteDialog>
  )
  const heading = (title: string, label: string, path?: string) => (
    <div className="it-heading">
      <div>
        <span className="it-eyebrow">{label}</span>
        <h2>{title}</h2>
      </div>
      {path ? (
        <Link className="it-text-link" href={href(path)}>
          {t.more}
          <ArrowUpRight size={18} />
        </Link>
      ) : null}
    </div>
  )
  const pagination = () => {
    const p = m.pagination
    if (!p || p.totalPages <= 1) return null
    const destination = (page: number) =>
      `${href(m.kind === 'faqs' ? 'faqs' : m.section || '')}?${new URLSearchParams({
        ...(m.activeCategory ? { category: m.activeCategory } : {}),
        page: String(page),
      })}`
    const pages = [...new Set([1, p.page - 1, p.page, p.page + 1, p.totalPages])]
      .filter((page) => page > 0 && page <= p.totalPages)
      .sort((a, b) => a - b)
    return (
      <nav className="it-pagination" aria-label={t.more}>
        {p.page > 1 ? <Link href={destination(p.page - 1)}>{t.previous}</Link> : null}
        {pages.map((page, index) => (
          <span key={page}>
            {index > 0 && page - pages[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}
            <Link href={destination(page)} aria-current={page === p.page ? 'page' : undefined}>
              {page}
            </Link>
          </span>
        ))}
        {p.page < p.totalPages ? <Link href={destination(p.page + 1)}>{t.next}</Link> : null}
      </nav>
    )
  }
  const faqs = () => (
    <div className="it-faq-list" key={m.pagination?.page || 1}>
      {(m.faqs || []).map((item) => (
        <details key={item.id}>
          <summary>
            <span>{item.question}</span>
            <span aria-hidden="true">+</span>
          </summary>
          <div>{item.answer}</div>
        </details>
      ))}
    </div>
  )
  const inquiry = () =>
    m.showInquiry === false ? null : (
      <section className="it-inquiry-section" id="inquiry">
        <div className="it-wrap it-inquiry-grid">
          <div>
            <span className="it-eyebrow">{t.contact}</span>
            <h2>{m.inquiryTitle || t.quote}</h2>
            {m.inquiryDescription ? <p>{m.inquiryDescription}</p> : null}
            <Contact model={m} />
          </div>
          <IndustryForm model={m} />
        </div>
      </section>
    )
  const hero = () => (
    <section className={`it-page-hero ${m.image ? 'has-image' : ''}`}>
      {m.image ? <img src={m.image} alt="" width="1920" height="800" /> : null}
      <div className="it-wrap">
        <nav aria-label={t.home}>
          <Link href={m.base}>{t.home}</Link>
          <span aria-hidden="true"> / </span>
          {m.section ? <Link href={href(m.section)}>{t[m.section]}</Link> : m.title}
        </nav>
        <h1>{m.title}</h1>
        {m.summary ? <p>{m.summary}</p> : null}
      </div>
    </section>
  )

  const intro = () =>
    m.intro ? (
      <section className="it-wrap it-section it-intro">
        <div>
          <span className="it-eyebrow">{m.company}</span>
          <h2>{m.intro.title}</h2>
          <p>{m.intro.text}</p>
          <Link className="it-text-link" href={href('about')}>
            {t.detail}
            <ArrowUpRight size={18} />
          </Link>
        </div>
        {m.intro.image ? (
          <img src={m.intro.image} alt="" width="960" height="640" loading="lazy" />
        ) : null}
      </section>
    ) : null
  const products = () =>
    m.products?.length ? (
      <section className="it-wrap it-section">
        {heading(t.products, 'PRODUCTS', 'products')}
        <IndustryCards items={m.products} />
      </section>
    ) : null

  if (m.kind === 'home')
    return (
      <main id="it-main">
        <Carousel
          banners={m.banners || []}
          locale={m.locale}
          company={m.company}
          autoplay
          interval={8000}
          quote={quote}
        />
        {!m.banners?.length &&
        !m.intro &&
        !m.products?.length &&
        !m.cases?.length &&
        !m.news?.length &&
        !m.stats?.length &&
        !m.faqs?.length ? (
          <p className="it-wrap it-empty">{t.empty}</p>
        ) : null}
        {m.catalogFirst ? products() : intro()}
        {m.stats?.length ? (
          <section className="it-capabilities">
            <div className="it-wrap it-section">
              {heading(t.strength, 'CAPABILITIES')}
              <div className="it-stats">
                {m.stats.map((item, i) => (
                  <article key={i}>
                    {item.image ? (
                      <img src={item.image} alt="" width="480" height="320" loading="lazy" />
                    ) : null}
                    <strong>
                      {item.value}
                      <small>{item.unit}</small>
                    </strong>
                    <h3>{item.label}</h3>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}
        {m.catalogFirst ? intro() : products()}
        {m.video ? (
          <section className="it-wrap it-section it-video">
            {heading(m.video.title, t.about)}
            {m.video.embed ? (
              <iframe
                src={m.video.src}
                title={m.video.title}
                sandbox="allow-scripts allow-same-origin allow-presentation"
                loading="lazy"
                allowFullScreen
              />
            ) : (
              <video src={m.video.src} controls preload="metadata" />
            )}
          </section>
        ) : null}
        {m.cases?.length ? (
          <section className="it-tinted">
            <div className="it-wrap it-section">
              {heading(t.cases, 'PROJECTS', 'cases')}
              <IndustryCards items={m.cases} kind="cases" />
            </div>
          </section>
        ) : null}
        {m.news?.length ? (
          <section className="it-wrap it-section">
            {heading(t.news, 'INSIGHTS', 'news')}
            <IndustryCards items={m.news} kind="news" />
          </section>
        ) : null}
        {m.faqs?.length ? (
          <section className="it-tinted">
            <div className="it-wrap it-section">
              {heading(t.faqs, 'FAQ', 'faqs')}
              {faqs()}
            </div>
          </section>
        ) : null}
        {inquiry()}
      </main>
    )

  if (m.kind === 'catalog')
    return (
      <main id="it-main">
        {hero()}
        <div className="it-wrap it-section it-catalog">
          {m.categories?.length ? (
            <aside>
              <h2>{m.section ? t[m.section] : t.products}</h2>
              <nav aria-label={t.all}>
                <Link
                  href={href(m.section || '')}
                  aria-current={!m.activeCategory ? 'page' : undefined}
                >
                  {t.all}
                </Link>
                {m.categories.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={
                      item.href.includes(
                        `category=${encodeURIComponent(m.activeCategory || '')}`,
                      ) && Boolean(m.activeCategory)
                        ? 'page'
                        : undefined
                    }
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <Contact model={m} />
            </aside>
          ) : null}
          <section>
            {m.cards?.length ? (
              <IndustryCards items={m.cards} kind={m.section} />
            ) : (
              <p className="it-empty">{t.empty}</p>
            )}
            {pagination()}
          </section>
        </div>
      </main>
    )

  if (m.kind === 'product')
    return (
      <main id="it-main">
        <nav className="it-wrap it-breadcrumb" aria-label={t.home}>
          <Link href={m.base}>{t.home}</Link> / <Link href={href('products')}>{t.products}</Link>/{' '}
          <span>{m.title}</span>
        </nav>
        <section className="it-wrap it-section it-product-top">
          <ProductGallery images={m.images || []} title={m.title} />
          <div>
            <span className="it-eyebrow">{m.company}</span>
            <h1>{m.title}</h1>
            {m.model ? <p className="it-model">{m.model}</p> : null}
            {m.summary ? <p>{m.summary}</p> : null}
            <div className="it-product-actions">
              {quote}
              {m.datasheet ? (
                <a
                  className="it-button it-button--outline"
                  href={m.datasheet}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.download}
                  <ArrowUpRight size={18} />
                </a>
              ) : null}
            </div>
          </div>
        </section>
        <nav className="it-detail-nav" aria-label={t.description}>
          <div className="it-wrap">
            {m.content ? <a href="#description">{t.description}</a> : null}
            {m.parameters?.length ? <a href="#specs">{t.specs}</a> : null}
            <a href="#inquiry">{t.quote}</a>
          </div>
        </nav>
        <div className="it-wrap it-section it-product-content">
          <article>
            {m.content ? (
              <section className="it-rich" id="description">
                <h2>{t.description}</h2>
                {m.content}
              </section>
            ) : null}
            {m.parameters?.length ? (
              <section id="specs">
                <h2>{t.specs}</h2>
                <div className="it-table-wrap">
                  <table>
                    <tbody>
                      {m.parameters.map((row, i) => (
                        <tr key={i}>
                          <th scope="row">{row.label}</th>
                          <td>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </article>
          <aside>
            <h2>{t.contact}</h2>
            <Contact model={m} />
            {quote}
          </aside>
        </div>
        {inquiry()}
        {m.products?.length ? (
          <section className="it-wrap it-section">
            {heading(t.products, 'RELATED PRODUCTS', 'products')}
            <IndustryCards items={m.products} />
          </section>
        ) : null}
      </main>
    )

  if (m.kind === 'article')
    return (
      <main id="it-main">
        {hero()}
        <article className="it-wrap it-section it-article">
          {safeDate(m.model) ? <time dateTime={safeDate(m.model)}>{safeDate(m.model)}</time> : null}
          {m.images?.[0] ? <img src={m.images[0]} alt={m.title} width="1200" height="800" /> : null}
          <div className="it-rich">{m.content}</div>
          <Link className="it-text-link" href={href(m.section || 'news')}>
            {m.section ? t[m.section] : t.news}
            <ArrowUpRight size={18} />
          </Link>
        </article>
        {m.cards?.length ? (
          <section className="it-wrap it-section">
            <IndustryCards items={m.cards} kind={m.section} />
          </section>
        ) : null}
      </main>
    )

  if (m.kind === 'about')
    return (
      <main id="it-main">
        {hero()}
        <div className="it-wrap it-section">
          {m.intro ? (
            <section className="it-about-intro">
              <h2>{m.intro.title}</h2>
              <p>{m.intro.text}</p>
            </section>
          ) : null}
          {m.modules?.map((item, i) => (
            <section className="it-about-module" key={i}>
              {item.image ? (
                <img src={item.image} alt="" width="900" height="650" loading="lazy" />
              ) : null}
              <div>
                <span className="it-eyebrow">{m.company}</span>
                <h2>{item.title}</h2>
                <p>{item.text}</p>
                {quote}
              </div>
            </section>
          ))}
          {m.certificates ? (
            <section>
              <h2>{t.certificate}</h2>
              <p>{m.certificates}</p>
            </section>
          ) : null}
          {!m.intro && !m.modules?.length && !m.certificates ? (
            <p className="it-empty">{t.empty}</p>
          ) : null}
        </div>
        {inquiry()}
      </main>
    )

  if (m.kind === 'faqs')
    return (
      <main id="it-main">
        {hero()}
        <section className="it-wrap it-section it-faq-page">
          {m.faqs?.length ? faqs() : <p className="it-empty">{t.empty}</p>}
          {pagination()}
        </section>
      </main>
    )

  return (
    <main id="it-main">
      {hero()}
      <section className="it-wrap it-section it-contact-page">
        <div>
          <span className="it-eyebrow">{m.company}</span>
          <h2>{t.contact}</h2>
          <Contact model={m} />
          <div className="it-qr">
            {m.contact?.qr?.map((qr) => (
              <figure key={qr.label}>
                <img src={qr.image} alt={qr.label} width="160" height="160" />
                <figcaption>{qr.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
        {m.showInquiry !== false ? <IndustryForm model={m} address /> : null}
      </section>
    </main>
  )
}

export function Contact({ model }: { model: Pick<IndustryPageModel, 'contact' | 'demo'> }) {
  const c = model.contact
  if (!c) return null
  return (
    <address className="it-contact-details">
      {c.phone ? (
        <a href={model.demo ? undefined : `tel:${c.phone}`}>
          <Phone size={19} />
          <span>{c.phone}</span>
        </a>
      ) : null}
      {c.whatsapp ? (
        <a
          className="it-whatsapp"
          href={model.demo ? undefined : `https://wa.me/${c.whatsapp.replace(/\D/g, '')}`}
        >
          <MessageCircle size={19} />
          <span>WhatsApp · {c.whatsapp}</span>
        </a>
      ) : null}
      {c.email ? (
        <a href={model.demo ? undefined : `mailto:${c.email}`}>
          <Mail size={19} />
          <span>{c.email}</span>
        </a>
      ) : null}
      {c.address ? (
        <p>
          <MapPin size={19} />
          <span>{c.address}</span>
        </p>
      ) : null}
    </address>
  )
}
