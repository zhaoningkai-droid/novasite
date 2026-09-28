import { getPayload, type Where } from 'payload'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import config from '@payload-config'
import RichText from '@/components/RichText'
import type { Tenant, User, Product, News, Case, Post } from '@/payload-types'
import { jsonLD, type SiteLocale } from '@/platform/site'
import { productCoverURL, productImageURLs } from '@/platform/productImages'
import { sanitizeRichHTML } from '@/platform/sanitizeRichHTML'
import { templateCopy } from './copy'
import { templateHref } from './links'
import { Carousel, type Banner } from './Carousel'
import { ProductShowcase } from './ProductShowcase'
import { Inquiry } from './Inquiry'
import type { NewTemplate } from './registry'

type Options = {
  site: Tenant
  locale: SiteLocale
  template: NewTemplate
  base: string
  path?: string[]
  search?: { category?: string | string[]; page?: string | string[] }
  preview?: boolean
  user?: User
}
type Card = { id: number; title: string; summary?: string | null; image: string; href: string }
export const mediaURL = (media: unknown): string =>
  typeof media === 'object' && media && 'url' in media && typeof media.url === 'string'
    ? media.url
    : ''
const sorted = <T extends { sortOrder?: number | null }>(items: T[] = []) =>
  [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
const plain = (value: unknown): string => {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(plain).join(' ')
  const node = value as { text?: unknown; root?: unknown; children?: unknown }
  return [typeof node.text === 'string' ? node.text : '', plain(node.root), plain(node.children)]
    .filter(Boolean)
    .join(' ')
}
function Cards({ items, kind = 'products' }: { items: Card[]; kind?: string }) {
  return (
    <div className={`nt-cards nt-cards--${kind}`}>
      {items.map((item) => (
        <Link className="nt-card" href={item.href} key={item.id}>
          {item.image ? (
            <div className="nt-card-image">
              <img alt={item.title} src={item.image} width="800" height="600" loading="lazy" />
            </div>
          ) : null}
          <div className="nt-card-copy">
            <h3>{item.title}</h3>
            {item.summary ? <p>{item.summary}</p> : null}
            <span aria-hidden="true">↗</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
export async function renderTemplatePage(options: Options) {
  const { site, locale, template, base, preview, user, search = {} } = options
  const path = options.path || []
  const payload = await getPayload({ config })
  const t = templateCopy(locale)
  const access = { overrideAccess: !user, user, locale, depth: 1 }
  const tenant: Where = { tenant: { equals: site.id } }
  const published: Where = { _status: { equals: 'published' } }
  const href = (value: string) => templateHref(base, value) || base
  const homepage = site.fixedPages?.homepage
  const inquiry = (product = '', productId?: number) => (
    <Inquiry
      site={site.slug}
      locale={locale}
      preview={preview}
      product={product}
      productId={productId}
      requiredFields={(homepage?.inquiryRequiredFields || {}) as Record<string, boolean>}
    />
  )
  const heading = (title: string, destination?: string) => (
    <div className="nt-heading">
      <h2>{title}</h2>
      {destination ? (
        <Link href={href(destination)}>
          {t.more} <span aria-hidden="true">↗</span>
        </Link>
      ) : null}
    </div>
  )
  const strength = () =>
    homepage?.showStrength !== false && homepage?.strengthItems?.length ? (
      <section className="nt-strength nt-wrap" aria-label={t.strength}>
        {sorted(homepage.strengthItems).map((item, i) => (
          <article key={item.id || i}>
            {mediaURL(item.image) ? (
              <img src={mediaURL(item.image)} alt="" width="160" height="160" loading="lazy" />
            ) : null}
            <strong>
              {item.value}
              <small>{item.unit}</small>
            </strong>
            <p>{item.label}</p>
          </article>
        ))}
      </section>
    ) : null
  const productCard = (item: Product): Card => ({
    ...item,
    image: productCoverURL(item, ''),
    href: href(`/products/${item.slug}`),
  })
  const contentCard = (item: News | Case | Post, collection: string): Card => ({
    id: item.id,
    title: item.title,
    summary: 'summary' in item ? item.summary : undefined,
    image: mediaURL('heroImage' in item ? item.heroImage : 'cover' in item ? item.cover : null),
    href: href(`/${collection}/${item.slug}`),
  })
  if (!path.length) {
    const configuredCategory = homepage?.featuredNewsCategory
    const categoryID =
      typeof configuredCategory === 'number' ? configuredCategory : configuredCategory?.id
    const [products, cases, news] = await Promise.all([
      payload.find({
        ...access,
        collection: 'products',
        limit: 8,
        sort: 'sortOrder,-publishedAt',
        where: { and: [tenant, published, { featured: { equals: true } }] },
      }),
      payload.find({
        ...access,
        collection: 'cases',
        limit: 4,
        sort: 'sortOrder,-publishedAt',
        where: { and: [tenant, published, { featured: { equals: true } }] },
      }),
      payload.find({
        ...access,
        collection: 'news',
        limit: 4,
        sort: 'sortOrder,-publishedAt',
        where: {
          and: [
            tenant,
            published,
            { featured: { equals: true } },
            ...(categoryID ? [{ category: { equals: categoryID } }] : []),
          ],
        },
      }),
    ])
    const rawBanners = Array.isArray(homepage?.banners)
      ? (homepage.banners as Array<
          Banner & {
            linkType?: string
            linkURL?: string
            sortOrder?: number
          }
        >)
      : []
    const banners = sorted(rawBanners).map((banner) => ({
      ...banner,
      href:
        banner.linkType === 'none' || !banner.linkType
          ? null
          : banner.linkURL
            ? templateHref(base, banner.linkURL)
            : null,
    }))
    if (!banners.length && (homepage?.heroTitle || homepage?.heroDescription))
      banners.push({
        title: homepage.heroTitle || site.branding.companyName,
        description: homepage.heroDescription || '',
        href: null,
      })
    const modules = {
      intro:
        homepage?.showCompanyIntro !== false &&
        (homepage?.companyIntro || homepage?.companyIntroTitle) ? (
          <section className="nt-wrap nt-section nt-intro" key="intro">
            {mediaURL(homepage?.introImage) ? (
              <img
                src={mediaURL(homepage?.introImage)}
                alt=""
                width="1000"
                height="800"
                loading="lazy"
              />
            ) : null}
            <div>
              {heading(homepage.companyIntroTitle || t.about)}
              <p>{homepage.companyIntro}</p>
              <Link className="nt-text-link" href={href('/about')}>
                {t.detail} ↗
              </Link>
            </div>
          </section>
        ) : null,
      strength: <div key="strength">{strength()}</div>,
      products:
        homepage?.showFeaturedProducts !== false && products.docs.length ? (
          <section className="nt-wrap nt-section" key="products">
            {heading(t.products, '/products')}
            {template.tone === 'machinery' ? (
              <ProductShowcase items={products.docs.map(productCard)} locale={locale} />
            ) : (
              <Cards items={products.docs.map(productCard)} />
            )}
          </section>
        ) : null,
      cases:
        homepage?.showCases !== false && cases.docs.length ? (
          <section className="nt-wrap nt-section" key="cases">
            {heading(t.cases, '/cases')}
            <Cards kind="cases" items={cases.docs.map((item) => contentCard(item, 'cases'))} />
          </section>
        ) : null,
      news:
        homepage?.showNews !== false && news.docs.length ? (
          <section className="nt-wrap nt-section" key="news">
            {heading(t.news, '/news')}
            <Cards kind="news" items={news.docs.map((item) => contentCard(item, 'news'))} />
          </section>
        ) : null,
      video:
        homepage?.showVideo &&
        (mediaURL(homepage.videoMedia) || /^https:\/\//.test(homepage.videoURL || '')) ? (
          <section className="nt-wrap nt-section nt-video" key="video">
            {heading(homepage.videoTitle || t.about)}
            <p>{homepage.videoDescription}</p>
            {mediaURL(homepage.videoMedia) ? (
              <video controls preload="metadata" src={mediaURL(homepage.videoMedia)} />
            ) : (
              <iframe
                src={homepage.videoURL!}
                title={homepage.videoTitle || t.about}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allowFullScreen
              />
            )}
          </section>
        ) : null,
      inquiry:
        homepage?.showInquiryForm !== false ? (
          <section className="nt-inquiry-section" key="inquiry">
            <div className="nt-wrap">
              <div>
                {heading(homepage?.inquiryTitle || t.quote)}
                <p>{homepage?.inquiryDescription}</p>
              </div>
              {inquiry()}
            </div>
          </section>
        ) : null,
    }
    return (
      <main id="nt-main">
        <Carousel banners={banners} locale={locale} company={site.branding.companyName} />
        {template.modules.map((key) => modules[key])}
      </main>
    )
  }
  const section = path[0]
  const title = section in t ? t[section as keyof typeof t] : ''
  const hero = (text: string, summary?: string | null) => (
    <section className="nt-page-hero">
      {site.branding.navigationBannerURL ? (
        <img src={site.branding.navigationBannerURL} alt="" width="1600" height="500" />
      ) : null}
      <div className="nt-wrap">
        <nav aria-label={t.home}>
          <Link href={base}>{t.home}</Link> / <Link href={href(`/${section}`)}>{title}</Link>
        </nav>
        <h1>{text}</h1>
        {summary ? <p>{summary}</p> : null}
      </div>
    </section>
  )
  if (section === 'about') {
    const about = site.fixedPages?.about
    return (
      <main id="nt-main">
        {hero(about?.title || t.about)}
        <div className="nt-wrap nt-section">
          {about?.intro ? <p className="nt-lead">{about.intro}</p> : null}
          {sorted(about?.modules || []).map((item, i) => (
            <section className="nt-intro nt-section" key={item.id || i}>
              {mediaURL(item.image) ? (
                <img src={mediaURL(item.image)} alt="" width="1000" height="800" loading="lazy" />
              ) : null}
              <div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </div>
            </section>
          ))}
          {about?.certificates ? (
            <section>
              <h2>{t.certificate}</h2>
              <p>{about.certificates}</p>
            </section>
          ) : null}
        </div>
        {about?.showStrength !== false ? strength() : null}
      </main>
    )
  }
  if (section === 'contact') {
    const contact = site.contact
    const qr = [contact?.whatsappQRCode, contact?.wechatInternationalQRCode, contact?.wechatQRCode]
    return (
      <main id="nt-main">
        {hero(
          site.fixedPages?.contactPage?.title || t.contact,
          site.fixedPages?.contactPage?.intro,
        )}
        <section className="nt-wrap nt-section nt-contact">
          <div>
            <h2>{site.branding.companyName}</h2>
            <address>
              {contact?.address ? <p>{contact.address}</p> : null}
              {contact?.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
              {contact?.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : null}
              {contact?.whatsapp ? (
                <a href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}>WhatsApp</a>
              ) : null}
            </address>
            <div className="nt-qr">
              {qr.map((image, i) =>
                mediaURL(image) ? (
                  <figure key={i}>
                    <img
                      src={mediaURL(image)}
                      alt={['WhatsApp', 'WeChat', '微信'][i]}
                      width="160"
                      height="160"
                    />
                    <figcaption>{['WhatsApp', 'WeChat', '微信'][i]}</figcaption>
                  </figure>
                ) : null,
              )}
            </div>
          </div>
          {site.fixedPages?.contactPage?.showInquiryForm !== false ? inquiry() : null}
        </section>
      </main>
    )
  }
  if (section === 'faqs') {
    const result = await payload.find({
      ...access,
      collection: 'faqs',
      pagination: false,
      sort: 'sortOrder',
      where: { and: [tenant, { enabled: { equals: true } }] },
    })
    return (
      <main id="nt-main">
        {hero(t.faqs)}
        <section className="nt-wrap nt-section nt-faqs">
          {result.docs.length ? (
            result.docs.map((item) => (
              <details key={item.id}>
                <summary>{item.question}</summary>
                <RichText data={item.answer} enableGutter={false} />
              </details>
            ))
          ) : (
            <p>{t.empty}</p>
          )}
        </section>
        {result.docs.length ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLD({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: result.docs.map((item) => ({
                  '@type': 'Question',
                  name: item.question,
                  acceptedAnswer: { '@type': 'Answer', text: plain(item.answer) },
                })),
              }),
            }}
          />
        ) : null}
      </main>
    )
  }
  if (!['products', 'news', 'cases', 'blog'].includes(section) || path.length > 2) notFound()
  const collection = section === 'blog' ? 'posts' : (section as 'products' | 'news' | 'cases')
  if (path[1]) {
    const result = await payload.find({
      ...access,
      collection,
      depth: 2,
      limit: 1,
      where: { and: [tenant, published, { slug: { equals: path[1] } }] },
    })
    const item = result.docs[0]
    if (!item) notFound()
    if (collection === 'products') {
      const product = item as Product
      const specs = await payload.find({
        ...access,
        collection: 'product-specifications',
        limit: 1,
        where: {
          and: [tenant, { product: { equals: product.id } }, { localeCode: { equals: locale } }],
        },
      })
      const images = productImageURLs(product)
      const datasheet = mediaURL(
        (product as Product & { datasheetPDF?: unknown }).datasheetPDF || product.datasheet,
      )
      return (
        <main id="nt-main">
          {hero(product.title, product.summary)}
          {template.tone === 'machinery' ? (
            <nav className="nt-wrap nt-detail-tabs" aria-label={t.description}>
              <a href="#product-description">{t.description}</a>
              {specs.docs[0]?.items?.length ? (
                <a href="#product-specifications">{t.specs}</a>
              ) : null}
              {datasheet ? (
                <a href={datasheet} target="_blank" rel="noopener noreferrer">
                  {t.download}
                </a>
              ) : null}
              <a href="#product-inquiry">{t.quote}</a>
            </nav>
          ) : null}
          <section className="nt-wrap nt-section nt-product-detail">
            <div className="nt-gallery">
              {images.map((image, i) => (
                <a href={image} key={image} target="_blank" rel="noopener noreferrer">
                  <img
                    src={image}
                    alt={`${product.title} ${i + 1}`}
                    width="800"
                    height="800"
                    loading={i ? 'lazy' : 'eager'}
                  />
                </a>
              ))}
            </div>
            <div>
              <h2 id="product-description">{t.description}</h2>
              {product.model ? <p>{product.model}</p> : null}
              {product.detailHTML ? (
                <div
                  className="nt-rich"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeRichHTML(product.detailHTML),
                  }}
                />
              ) : (
                <RichText data={product.description} enableGutter={false} />
              )}
              <a className="nt-button" href="#product-inquiry">
                {t.quote}
              </a>
              {datasheet ? (
                <a
                  className="nt-button nt-button--outline"
                  href={datasheet}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.download}
                </a>
              ) : null}
            </div>
          </section>
          {specs.docs[0]?.items?.length ? (
            <section className="nt-wrap nt-section">
              <h2 id="product-specifications">{t.specs}</h2>
              <table className="nt-specs">
                <tbody>
                  {specs.docs[0].items.map((spec, i) => (
                    <tr key={spec.id || i}>
                      <th scope="row">{spec.label}</th>
                      <td>{spec.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          <section className="nt-wrap nt-section" id="product-inquiry">
            <h2>{t.quote}</h2>
            {inquiry(product.title, product.id)}
          </section>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLD({
                '@context': 'https://schema.org',
                '@type': 'Product',
                name: product.title,
                description: product.summary,
                image: images,
                brand: { '@type': 'Brand', name: site.branding.companyName },
              }),
            }}
          />
        </main>
      )
    }
    const article = item as News | Case | Post
    return (
      <main id="nt-main">
        {hero(article.title, 'summary' in article ? article.summary : undefined)}
        <article className="nt-wrap nt-section nt-article">
          {mediaURL(
            'heroImage' in article ? article.heroImage : 'cover' in article ? article.cover : null,
          ) ? (
            <img
              src={mediaURL(
                'heroImage' in article
                  ? article.heroImage
                  : 'cover' in article
                    ? article.cover
                    : null,
              )}
              alt={article.title}
              width="1200"
              height="800"
              loading="lazy"
            />
          ) : null}
          {article.publishedAt ? (
            <time dateTime={article.publishedAt}>
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
                new Date(article.publishedAt),
              )}
            </time>
          ) : null}
          {'content' in article && article.content ? (
            <RichText data={article.content} enableGutter={false} />
          ) : null}
          <Link className="nt-text-link" href={href(`/${section}`)}>
            {t.more} →
          </Link>
        </article>
      </main>
    )
  }
  const categoryCollection =
    collection === 'products'
      ? 'product-categories'
      : collection === 'news'
        ? 'news-categories'
        : collection === 'cases'
          ? 'case-categories'
          : 'categories'
  const categories = await payload.find({
    ...access,
    collection: categoryCollection,
    pagination: false,
    where: tenant,
    sort: 'sortOrder',
  })
  const categorySlug = typeof search.category === 'string' ? search.category : undefined
  const activeCategory = categories.docs.find((item) => item.slug === categorySlug)
  // An unknown or foreign category must never silently display another company's products.
  const categoryIDs = activeCategory
    ? [
        activeCategory.id,
        ...categories.docs
          .filter(
            (item) =>
              'parent' in item &&
              (typeof item.parent === 'number' ? item.parent : item.parent?.id) ===
                activeCategory.id,
          )
          .map((item) => item.id),
      ]
    : []
  const requestedPage = typeof search.page === 'string' ? Number(search.page) : 1
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const result = await payload.find({
    ...access,
    collection,
    limit: 12,
    page,
    sort: collection === 'posts' ? '-publishedAt' : 'sortOrder,-publishedAt',
    where: {
      and: [
        tenant,
        published,
        ...(categorySlug
          ? [
              collection === 'posts'
                ? { categories: { in: categoryIDs.length ? categoryIDs : [-1] } }
                : { category: { in: categoryIDs.length ? categoryIDs : [-1] } },
            ]
          : []),
      ],
    },
  })
  const pageHref = (index: number) =>
    href(
      `/${section}?${new URLSearchParams({
        ...(categorySlug ? { category: categorySlug } : {}),
        page: String(index),
      })}`,
    )
  return (
    <main id="nt-main">
      {hero(title)}
      <section className="nt-wrap nt-section nt-catalog">
        {categories.docs.length ? (
          <nav className="nt-categories" aria-label={t.all}>
            <Link aria-current={!categorySlug ? 'page' : undefined} href={href(`/${section}`)}>
              {t.all}
            </Link>
            {categories.docs.map((item) => (
              <Link
                key={item.id}
                aria-current={activeCategory?.id === item.id ? 'page' : undefined}
                href={href(`/${section}?category=${encodeURIComponent(item.slug || '')}`)}
              >
                {'name' in item ? item.name : item.title}
              </Link>
            ))}
          </nav>
        ) : null}
        <div>
          {result.docs.length ? (
            <Cards
              kind={section}
              items={result.docs.map((item) =>
                collection === 'products'
                  ? productCard(item as Product)
                  : contentCard(item as News | Case | Post, section),
              )}
            />
          ) : (
            <p className="nt-empty">{t.empty}</p>
          )}
          {result.totalPages > 1 ? (
            <nav className="nt-pagination" aria-label={title}>
              {result.hasPrevPage ? <Link href={pageHref(page - 1)}>{t.previous}</Link> : null}
              <span>
                {page} / {result.totalPages}
              </span>
              {result.hasNextPage ? <Link href={pageHref(page + 1)}>{t.next}</Link> : null}
            </nav>
          ) : null}
        </div>
      </section>
    </main>
  )
}
