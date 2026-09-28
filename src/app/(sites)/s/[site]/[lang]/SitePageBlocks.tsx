import Link from 'next/link'

import type { Case, News, Page, Post, Product, ProductCategory, Tenant } from '@/payload-types'
import { copy, siteHref, type SiteLocale } from '@/platform/site'
import { productCoverURL } from '@/platform/productImages'
import { RFQForm } from './RFQForm'
import { HeroCarousel } from './HeroCarousel'

type Props = {
  cases: Case[]
  locale: SiteLocale
  news: News[]
  page: Page
  posts: Post[]
  productCategories: ProductCategory[]
  products: Product[]
  site: Tenant
  siteSlug: string
}

type MediaLike = { alt?: string | null; thumbnailURL?: string | null; url?: string | null }
type HomepageSettings = NonNullable<NonNullable<Tenant['fixedPages']>['homepage']> & {
  banners?: Array<{ desktopImage?: string; description?: string; linkType?: 'external' | 'internal' | 'none'; linkURL?: string; mobileImage?: string; sortOrder?: number; title?: string }> | null
  companyIntro?: string | null
  companyIntroTitle?: string | null
  inquiryDescription?: string | null
  inquiryRequiredFields?: Record<string, boolean> | null
  inquiryTitle?: string | null
  introImage?: MediaLike | number | null
  showCases?: boolean | null
  showCompanyIntro?: boolean | null
  showFeaturedProducts?: boolean | null
  showInquiryForm?: boolean | null
  showNews?: boolean | null
  showStrength?: boolean | null
  showVideo?: boolean | null
  strengthItems?: Array<{ image?: MediaLike | number | null; label?: string | null; sortOrder?: number | null; unit?: string | null; value?: string | null }> | null
  videoDescription?: string | null
  videoMedia?: MediaLike | number | null
  videoTitle?: string | null
  videoURL?: string | null
}
type AboutSettings = {
  intro?: string | null
  modules?: Array<{ description?: string | null; image?: MediaLike | number | null; sortOrder?: number | null; title?: string | null }> | null
  title?: string | null
}
type PageLink = {
  label: string
  newTab?: boolean | null
  reference?: { relationTo: 'pages' | 'posts'; value: number | Page | Post } | null
  type?: 'reference' | 'custom' | null
  url?: string | null
}

const imageURL = (value: unknown, fallback = '') => {
  if (typeof value === 'object' && value) {
    const media = value as MediaLike
    return media.url || media.thumbnailURL || fallback
  }
  return fallback
}

const productTags = (product: { tags?: unknown }) =>
  Array.isArray(product.tags)
    ? product.tags
        .map((item) =>
          typeof item === 'object' && item
            ? String((item as { label?: unknown }).label || '').trim()
            : '',
        )
        .filter(Boolean)
        .slice(0, 4)
    : []

const productKeywords = (product: { keywords?: unknown }) =>
  typeof product.keywords === 'string'
    ? product.keywords
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5)
    : []

const internalHref = (link: PageLink, siteSlug: string, locale: SiteLocale): string | null => {
  if (link.type === 'custom') return link.url || null
  if (!link.reference || typeof link.reference.value !== 'object') return null
  const slug = link.reference.value.slug
  if (!slug) return null
  if (link.reference.relationTo === 'posts') return siteHref(siteSlug, locale, `/blog/${slug}`)
  return slug === 'home' ? siteHref(siteSlug, locale) : siteHref(siteSlug, locale, `/${slug}`)
}

function SiteLink({ link, siteSlug, locale }: { link: PageLink; siteSlug: string; locale: SiteLocale }) {
  const href = internalHref(link, siteSlug, locale)
  if (!href) return null
  const props = link.newTab ? { rel: 'noopener noreferrer', target: '_blank' } : {}
  const className = link.type === 'custom' ? 'site-button site-button--ghost' : 'site-button'
  return <Link className={className} href={href} {...props}>{link.label}</Link>
}

export function SitePageBlocks({ cases, locale, news, page, posts, productCategories, products, site, siteSlug }: Props) {
  const t = copy[locale]
  const homepage = site.fixedPages?.homepage as HomepageSettings | undefined
  const about = site.fixedPages?.about as AboutSettings | undefined
  const aboutModules = about?.modules?.length ? [...about.modules].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0)) : []
  const primaryAboutModule = aboutModules[0]
  const configuredStrengthItems = homepage?.strengthItems?.length
    ? [...homepage.strengthItems].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
    : []
  const solutionItems = productCategories.slice(0, 4)
  const featuredPosts = posts.slice(0, 3)
  const templateKey =
    site.selectedTemplate && typeof site.selectedTemplate === 'object'
      ? site.selectedTemplate.key
      : ''

  if (templateKey === 'atelier-industry-v1') {
    const href = (path: string) => siteHref(siteSlug, locale, path)
    const heading = (title: string, path?: string) => (
      <div className="atelier-heading"><h2>{title}</h2>
        {path ? <Link href={href(path)} aria-label={title}>↗</Link> : null}
      </div>
    )
    const video = imageURL(homepage?.videoMedia) || homepage?.videoURL
    return <main id="atelier-main" className="atelier-home" data-site-page={page.slug}>
      {page.hero.type !== 'none' && homepage?.banners?.length ? <HeroCarousel
        banners={homepage.banners} fallbackTitle="" fallbackDescription=""
      /> : null}
      {homepage?.showStrength !== false && configuredStrengthItems.length ?
        <section className="atelier-strength site-wrap">
          {configuredStrengthItems.map((item, index) => <article key={index}>
            {imageURL(item.image) ? <img src={imageURL(item.image)} alt={item.label || ''} loading="lazy" /> : null}
            <h2>{item.value}{item.unit}</h2><p>{item.label}</p>
          </article>)}
        </section> : null}
      {homepage?.showCompanyIntro !== false && aboutModules.length ?
        <section className="atelier-about site-wrap" id="about">
          {aboutModules.map((item, index) => <article key={index}>
            {imageURL(item.image) ? <div className="atelier-about-image"><img
              src={imageURL(item.image)} alt={item.title || ''} loading="lazy" /></div> : null}
            <div className="atelier-about-copy"><span className="atelier-index">0{index + 1}</span>
              <h2>{item.title}</h2><p>{item.description}</p>
              <Link className="atelier-link" href={href('/about')}>{t.about} <span>↗</span></Link>
            </div>
          </article>)}
        </section> : null}
      {homepage?.showVideo && video ? <section className="atelier-video site-wrap" data-site-video>
        {homepage.videoTitle ? heading(homepage.videoTitle) : null}
        {homepage.videoDescription ? <p>{homepage.videoDescription}</p> : null}
        {imageURL(homepage.videoMedia) ? <video controls preload="metadata" src={video} /> :
          <iframe src={video} title={homepage.videoTitle || t.about} allowFullScreen />}
      </section> : null}
      {homepage?.showCases !== false && cases.length ? <section className="atelier-section site-wrap">
        {heading(t.cases, '/cases')}<div className="atelier-cases">
          {cases.map((item, index) => <Link href={href(`/cases/${item.slug}`)} key={item.id}>
            {imageURL(item.cover) ? <img src={imageURL(item.cover)} alt={item.title} loading="lazy" /> : null}
            <div><span className="atelier-index">{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.title}</h3>{item.summary ? <p>{item.summary}</p> : null}</div>
          </Link>)}
        </div></section> : null}
      {productCategories.length ? <section className="atelier-catalog"><div className="site-wrap">
        {heading(t.products, '/products')}<div className="atelier-category-list">
          {productCategories.map((item, index) => <Link href={href(`/products?category=${item.slug}`)} key={item.id}>
            <span className="atelier-index">{String(index + 1).padStart(2, '0')}</span>
            <h3>{item.name}</h3><span aria-hidden="true">↗</span>
          </Link>)}
        </div></div></section> : null}
      {homepage?.showFeaturedProducts !== false && products.length ? <section className="atelier-section site-wrap">
        {heading(t.products, '/products')}<div className="atelier-products">
          {products.map((product) => <Link href={href(`/products/${product.slug}`)} key={product.id}>
            {productCoverURL(product, '') ? <div className="atelier-product-image"><img
              src={productCoverURL(product, '')} alt={product.title} loading="lazy" /></div> : null}
            <div className="atelier-product-title"><h3>{product.title}</h3><span aria-hidden="true">↗</span></div>
            {product.summary ? <p>{product.summary}</p> : null}
            <div className="atelier-tags">{[...new Set([...productTags(product), ...productKeywords(product)])]
              .map((tag) => <span key={tag}>{tag}</span>)}</div>
          </Link>)}
        </div></section> : null}
      {homepage?.showNews !== false && news.length ? <section className="atelier-section site-wrap">
        {heading(t.news, '/news')}<div className="atelier-journal">
          {news.map((item) => <Link href={href(`/news/${item.slug}`)} key={item.id}>
            {imageURL(item.cover) ? <img src={imageURL(item.cover)} alt={item.title} loading="lazy" /> : null}
            <div><h3>{item.title}</h3>{item.summary ? <p>{item.summary}</p> : null}</div>
            <span aria-hidden="true">↗</span>
          </Link>)}
        </div></section> : null}
      {featuredPosts.length ? <section className="atelier-section site-wrap">
        {heading(t.blog, '/blog')}<div className="atelier-products">
          {featuredPosts.map((post) => <Link href={href(`/blog/${post.slug}`)} key={post.id}>
            {imageURL(post.heroImage || post.meta?.image) ? <div className="atelier-product-image"><img
              src={imageURL(post.heroImage || post.meta?.image)} alt={post.title} loading="lazy" /></div> : null}
            <h3>{post.title}</h3><p>{post.meta?.description}</p>
          </Link>)}
        </div></section> : null}
      {homepage?.showInquiryForm !== false ? <section className="atelier-inquiry" id="contact" data-site-rfq>
        <div className="site-wrap"><div><h2>{homepage?.inquiryTitle || t.rfqTitle}</h2>
          <p>{homepage?.inquiryDescription}</p>
          {site.contact?.email ? <a href={`mailto:${site.contact.email}`}>{site.contact.email} ↗</a> : null}
        </div><RFQForm labels={{ send: t.send, sending: t.sending, sent: t.sent, error: t.error }}
          requiredFields={homepage?.inquiryRequiredFields || {}} site={siteSlug} /></div>
      </section> : null}
    </main>
  }

  if (templateKey === 'executive-industrial-pro-v1') {
    const leadProduct = products[0]
    const otherProducts = products.slice(1, 7)
    const trustItems = configuredStrengthItems.slice(0, 4)
    const aboutText = about?.intro || primaryAboutModule?.description || homepage?.companyIntro || ''
    const aboutTitle = about?.title || primaryAboutModule?.title || homepage?.companyIntroTitle || ''
    const aboutImage = imageURL(primaryAboutModule?.image, imageURL(homepage?.introImage))
    const factoryCards = aboutModules
      .map((module) => ({ ...module, imageURL: imageURL(module.image) }))
      .filter((module) => module.imageURL)
      .slice(0, 6)
    const videoSource = imageURL(homepage?.videoMedia) || homepage?.videoURL || ''

    return (
      <main className="executive-home" data-site-page={page.slug}>
        {page.hero.type !== 'none' && (
          <HeroCarousel
            banners={homepage?.banners || []}
            eyebrow={homepage?.heroEyebrow ? <span className="site-eyebrow">{homepage.heroEyebrow}</span> : null}
            fallbackDescription={homepage?.heroDescription || ''}
            fallbackImage={site.branding?.heroImageURL || ''}
            fallbackTitle={homepage?.heroTitle || ''}
          >
            <div className="site-actions">
              {page.hero.links?.length ? (
                page.hero.links.map(({ link }, index) => <SiteLink key={index} link={link} locale={locale} siteSlug={siteSlug} />)
              ) : (
                <>
                  <Link className="site-button" href={siteHref(siteSlug, locale, '/products')}>{t.explore}</Link>
                  <Link className="site-button site-button--ghost" href="#contact">{t.quote}</Link>
                </>
              )}
            </div>
            {trustItems.length ? (
              <aside className="executive-hero-panel" aria-label={locale === 'zh' ? '核心能力' : 'Core capabilities'}>
                {trustItems.map((item, index) => (
                  <div key={`${item.label}-${index}`}>
                    <strong>{item.value}{item.unit}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </aside>
            ) : null}
          </HeroCarousel>
        )}

        {homepage?.showVideo === true && videoSource ? (
          <section className="executive-section executive-video" data-site-video>
            <div className="site-wrap executive-video__grid">
              <div className="executive-section-title">
                <span className="site-eyebrow">{locale === 'zh' ? '官方视频' : 'Official video'}</span>
                {homepage.videoTitle ? <h2>{homepage.videoTitle}</h2> : null}
                {homepage.videoDescription ? <p>{homepage.videoDescription}</p> : null}
              </div>
              <div className="executive-video__frame">
                {imageURL(homepage.videoMedia) ? (
                  <video controls preload="metadata" src={imageURL(homepage.videoMedia)} />
                ) : (
                  <iframe
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    src={homepage.videoURL || ''}
                    title={homepage.videoTitle || 'Official video'}
                  />
                )}
              </div>
            </div>
          </section>
        ) : null}

        {homepage?.showStrength !== false && trustItems.length ? (
          <section className="executive-section executive-proof">
            <div className="site-wrap executive-proof__grid">
              <div className="executive-section-title">
                <span className="site-eyebrow">{locale === 'zh' ? '企业实力' : 'Company strength'}</span>
                <h2>{t.advantages}</h2>
              </div>
              <div className="executive-proof__cards">
                {trustItems.map((item, index) => (
                  <article key={`${item.value}-${index}`}>
                    <b>{String(index + 1).padStart(2, '0')}</b>
                    <strong>{item.value}{item.unit}</strong>
                    <span>{item.label}</span>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {homepage?.showCompanyIntro !== false && (aboutTitle || aboutText || aboutImage) ? (
          <section className="executive-section executive-about" id="about">
            <div className="site-wrap executive-about__grid">
              <div>
                <span className="site-eyebrow">{t.about}</span>
                {aboutTitle ? <h2>{aboutTitle}</h2> : null}
                {aboutText ? <p>{aboutText}</p> : null}
                <Link className="site-button" href={siteHref(siteSlug, locale, '/about')}>{locale === 'zh' ? '查看企业介绍' : 'View company profile'}</Link>
              </div>
              {aboutImage ? <div className="executive-about__image" style={{ backgroundImage: `url(${aboutImage})` }} /> : null}
            </div>
          </section>
        ) : null}

        {factoryCards.length ? (
          <section className="executive-section executive-factory">
            <div className="site-wrap">
              <div className="executive-section-title">
                <span className="site-eyebrow">{locale === 'zh' ? '关于我们模块' : 'About modules'}</span>
                {about?.title ? <h2>{about.title}</h2> : null}
              </div>
              <div className="executive-factory__grid">
                {factoryCards.map((module, index) => (
                  <figure key={`${module.title}-${index}`} className={index === 0 ? 'featured' : ''}>
                    <img alt={module.title || ''} src={module.imageURL} />
                    {module.title ? <figcaption>{module.title}</figcaption> : null}
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {homepage?.showCases !== false && cases.length ? (
          <section className="executive-section executive-cases">
            <div className="site-wrap">
              <div className="site-section__heading">
                <div className="executive-section-title">
                  <span className="site-eyebrow">{locale === 'zh' ? '客户案例 / 展会' : 'Cases / exhibitions'}</span>
                  <h2>{t.cases}</h2>
                </div>
                <Link className="site-text-link" href={siteHref(siteSlug, locale, '/cases')}>{locale === 'zh' ? '查看全部案例' : 'View all cases'} →</Link>
              </div>
              <div className="executive-case-grid">
                {cases.slice(0, 4).map((item, index) => (
                  <Link className={index === 0 ? 'executive-case-card featured' : 'executive-case-card'} href={siteHref(siteSlug, locale, `/cases/${item.slug}`)} key={item.id}>
                    {imageURL(item.cover) ? <img alt={item.title} src={imageURL(item.cover)} /> : null}
                    <div><small>{item.country || item.industry || t.cases}</small><h3>{item.title}</h3><p>{item.summary}</p></div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {productCategories.length ? (
          <section className="executive-section executive-categories">
            <div className="site-wrap">
              <div className="executive-section-title executive-section-title--center">
                <span className="site-eyebrow">{locale === 'zh' ? '产品分类' : 'Product range'}</span>
                <h2>{locale === 'zh' ? '让买家快速找到对应产品线' : 'Help buyers find the right product line fast'}</h2>
              </div>
              <div className="executive-category-grid">
                {productCategories.map((category) => (
                  <Link href={siteHref(siteSlug, locale, `/products?category=${category.slug}`)} key={category.id}>
                    {imageURL(category.cover) ? <img alt={category.name} src={imageURL(category.cover)} /> : null}
                    <strong>{category.name}</strong>
                    {category.description ? <span>{category.description}</span> : null}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {homepage?.showFeaturedProducts !== false && products.length ? (
          <section className="executive-section executive-products">
            <div className="site-wrap">
              <div className="site-section__heading">
                <div className="executive-section-title">
                  <span className="site-eyebrow">{locale === 'zh' ? '产品展示' : 'Products'}</span>
                  <h2>{t.products}</h2>
                </div>
                <Link className="site-text-link" href={siteHref(siteSlug, locale, '/products')}>{t.allProducts} →</Link>
              </div>
              <div className="executive-product-layout">
                {leadProduct ? (
                  <Link className="executive-product-lead" href={siteHref(siteSlug, locale, `/products/${leadProduct.slug}`)}>
                    {productCoverURL(leadProduct, '') ? (
                      <div style={{ backgroundImage: `url(${productCoverURL(leadProduct, '')})` }} />
                    ) : null}
                    <article>
                      <small>{locale === 'zh' ? '重点推荐' : 'Featured product'}</small>
                      <h3>{leadProduct.title}</h3>
                      {leadProduct.summary ? <p>{leadProduct.summary}</p> : null}
                      <span>{locale === 'zh' ? '查看详情' : 'View details'} →</span>
                    </article>
                  </Link>
                ) : null}
                <div className="executive-product-grid">
                  {otherProducts.map((product) => {
                    const tags = productTags(product)
                    const keywords = productKeywords(product)
                    return (
                      <Link className="executive-product-card" href={siteHref(siteSlug, locale, `/products/${product.slug}`)} key={product.id}>
                        {productCoverURL(product, '') ? <img alt={product.title} src={productCoverURL(product, '')} /> : null}
                        <div>
                          <h3>{product.title}</h3>
                          {tags.length ? <p>{tags.join(' / ')}</p> : product.summary ? <p>{product.summary}</p> : null}
                          {keywords.length ? <small>{keywords.slice(0, 3).join(' · ')}</small> : null}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {solutionItems.length ? (
          <section className="executive-section executive-solutions">
            <div className="site-wrap">
              <div className="executive-section-title executive-section-title--center">
                <span className="site-eyebrow">{locale === 'zh' ? '应用解决方案' : 'Solutions'}</span>
                <h2>{locale === 'zh' ? '按应用场景组织产品与交付方案' : 'Organize products around real application needs'}</h2>
              </div>
              <div className="executive-solution-list">
                {solutionItems.map((category) => (
                  <article key={category.id}>
                    {imageURL(category.cover) ? <img alt={category.name} src={imageURL(category.cover)} /> : null}
                    <div><h3>{category.name}</h3>{category.description ? <p>{category.description}</p> : null}</div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {homepage?.showNews !== false && news.length ? (
          <section className="executive-section executive-news">
            <div className="site-wrap">
              <div className="site-section__heading">
                <div className="executive-section-title">
                  <span className="site-eyebrow">{locale === 'zh' ? '新闻资讯' : t.knowledge}</span>
                  <h2>{t.news}</h2>
                </div>
                <Link className="site-text-link" href={siteHref(siteSlug, locale, '/news')}>{locale === 'zh' ? '查看全部新闻' : 'View all news'} →</Link>
              </div>
              <div className="executive-news-grid">
                {news.map((item) => (
                  <Link href={siteHref(siteSlug, locale, `/news/${item.slug}`)} key={item.id}>
                    {imageURL(item.cover) ? <img alt={item.title} src={imageURL(item.cover)} /> : null}
                    <div><time>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(locale) : t.news}</time><h3>{item.title}</h3>{item.summary ? <p>{item.summary}</p> : null}</div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {featuredPosts.length ? (
          <section className="executive-section executive-blog">
            <div className="site-wrap">
              <div className="site-section__heading">
                <div className="executive-section-title">
                  <span className="site-eyebrow">{t.blog}</span>
                  <h2>{t.latest}</h2>
                </div>
                <Link className="site-text-link" href={siteHref(siteSlug, locale, '/blog')}>{locale === 'zh' ? '查看全部博客' : 'View all blog posts'} →</Link>
              </div>
              <div className="executive-blog-grid">
                {featuredPosts.map((post, index) => (
                  <Link className={index === 0 ? 'executive-blog-card featured' : 'executive-blog-card'} href={siteHref(siteSlug, locale, `/blog/${post.slug}`)} key={post.id}>
                    {imageURL(post.heroImage || post.meta?.image) ? <img alt={post.title} src={imageURL(post.heroImage || post.meta?.image)} /> : null}
                    <div>
                      <time>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(locale) : t.blog}</time>
                      <h3>{post.title}</h3>
                      {post.meta?.description ? <p>{post.meta.description}</p> : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {homepage?.showInquiryForm !== false && (
          <section className="executive-rfq" id="contact" data-site-rfq>
            <div className="site-wrap executive-rfq__grid">
              <div>
                <span className="site-eyebrow">{t.rfq}</span>
                <h2>{homepage?.inquiryTitle || t.rfqTitle}</h2>
                {homepage?.inquiryDescription || site.contact?.email ? <p>{homepage?.inquiryDescription || site.contact?.email}</p> : null}
              </div>
              <RFQForm labels={{ send: t.send, sending: t.sending, sent: t.sent, error: t.error }} requiredFields={homepage?.inquiryRequiredFields || {}} site={siteSlug} />
            </div>
          </section>
        )}
      </main>
    )
  }

  return (
    <main className="industrial-home" data-site-page={page.slug}>
      {page.hero.type !== 'none' && (
        <HeroCarousel
          banners={homepage?.banners || []}
          eyebrow={homepage?.heroEyebrow ? <span className="site-eyebrow">{homepage.heroEyebrow}</span> : null}
          fallbackDescription={homepage?.heroDescription || ''}
          fallbackImage={site.branding?.heroImageURL || ''}
          fallbackTitle={homepage?.heroTitle || ''}
        >
          <div className="site-actions">
            {page.hero.links?.length ? page.hero.links.map(({ link }, index) => <SiteLink key={index} link={link} locale={locale} siteSlug={siteSlug} />) : (
              <>
                <Link className="site-button" href={siteHref(siteSlug, locale, '/products')}>{t.explore}</Link>
                <Link className="site-button site-button--ghost" href="#contact">{t.quote}</Link>
              </>
            )}
          </div>
        </HeroCarousel>
      )}

      {homepage?.showVideo === true && (imageURL(homepage.videoMedia) || homepage.videoURL) ? (
        <section className="site-section site-section--white official-video" data-site-video>
          <div className="site-wrap official-video__inner">
            <div className="industrial-section-title"><span className="site-eyebrow">{locale === 'zh' ? '官方视频' : 'Official Video'}</span><h2>{homepage.videoTitle || (locale === 'zh' ? '企业宣传视频' : 'Company video')}</h2>{homepage.videoDescription ? <p>{homepage.videoDescription}</p> : null}</div>
            <div className="official-video__frame">
              {imageURL(homepage.videoMedia) ? <video controls preload="metadata" src={imageURL(homepage.videoMedia)} /> : homepage.videoURL ? <iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen src={homepage.videoURL} title={homepage.videoTitle || 'Official video'} /> : null}
            </div>
          </div>
        </section>
      ) : null}

      {homepage?.showStrength !== false && configuredStrengthItems.length ? <section className="site-section site-section--white industrial-band">
        <div className="site-wrap">
          <div className="industrial-section-title"><span className="site-eyebrow">{locale === 'zh' ? '企业优势' : 'Advantages'}</span><h2>{t.advantages}</h2></div>
          <div className="advantage-grid">{configuredStrengthItems.slice(0, 4).map((item, index) => <article className="advantage-card" key={`${item.label}-${index}`}><b>0{index + 1}</b><h3>{item.label}</h3><p>{item.value}{item.unit ? ` ${item.unit}` : ''}</p></article>)}</div>
        </div>
      </section> : null}

      {homepage?.showCompanyIntro !== false && (about?.intro || about?.title || primaryAboutModule?.description || primaryAboutModule?.title) ? (
        <section className="about-feature" data-site-company-intro id="about">
          <div className="site-wrap about-feature__inner">
            {imageURL(primaryAboutModule?.image) ? <div className="about-feature__media" style={{ backgroundImage: `url(${imageURL(primaryAboutModule?.image)})` }} /> : null}
            <div className="about-feature__copy"><span className="site-eyebrow">{t.about}</span><h2>{about?.title || primaryAboutModule?.title || t.about}</h2><p>{about?.intro || primaryAboutModule?.description}</p><Link className="site-button" href={siteHref(siteSlug, locale, '/about')}>{locale === 'zh' ? '了解更多' : 'Learn more'}</Link></div>
          </div>
        </section>
      ) : null}

      {homepage?.showStrength !== false && configuredStrengthItems.length ? <section className="site-section site-section--white" data-site-strength><div className="site-wrap"><div className="site-stats industrial-stats">{configuredStrengthItems.map((item, index) => <div className="site-stat" key={`${item.value}-${index}`}><strong>{item.value}{item.unit}</strong><span>{item.label}</span></div>)}</div></div></section> : null}

      {aboutModules.some((module) => imageURL(module.image)) ? <section className="site-section factory-showcase">
        <div className="site-wrap">
          <div className="industrial-section-title"><span className="site-eyebrow">{locale === 'zh' ? '关于我们模块' : 'About modules'}</span>{about?.title ? <h2>{about.title}</h2> : null}</div>
          <div className="factory-grid">{aboutModules.filter((module) => imageURL(module.image)).map((module, index) => <figure key={`${module.title}-${index}`}><img alt={module.title || ''} src={imageURL(module.image)} />{module.title ? <figcaption>{module.title}</figcaption> : null}</figure>)}</div>
        </div>
      </section> : null}

      {homepage?.showCases !== false && cases.length ? <section className="site-section site-section--white" data-site-catalog="cases"><div className="site-wrap"><div className="site-section__heading"><div><span className="site-eyebrow">{locale === 'zh' ? '客户案例 / 展会' : 'Cases / Exhibitions'}</span><h2>{t.cases}</h2></div><Link className="site-text-link" href={siteHref(siteSlug, locale, '/cases')}>{locale === 'zh' ? '查看全部案例' : 'View all cases'} →</Link></div><div className="case-showcase">{cases.map((item) => <Link className="case-card" href={siteHref(siteSlug, locale, `/cases/${item.slug}`)} key={item.id}>{imageURL(item.cover) ? <img alt={item.title} src={imageURL(item.cover)} /> : null}<div><small>{item.country || item.industry || t.cases}</small><h3>{item.title}</h3>{item.summary ? <p>{item.summary}</p> : null}</div></Link>)}</div></div></section> : null}

      {productCategories.length ? <section className="site-section product-category-band" data-site-catalog="categories"><div className="site-wrap"><div className="industrial-section-title"><span className="site-eyebrow">{locale === 'zh' ? '产品分类' : 'Product Range'}</span><h2>{t.products}</h2></div><div className="category-grid">{productCategories.map((category) => <Link className="category-tile" href={siteHref(siteSlug, locale, `/products?category=${category.slug}`)} key={category.id}>{imageURL(category.cover) ? <img alt={category.name} src={imageURL(category.cover)} /> : null}<strong>{category.name}</strong>{category.description ? <span>{category.description}</span> : null}</Link>)}</div></div></section> : null}

      {homepage?.showFeaturedProducts !== false && products.length ? (
        <section className="site-section site-section--white" data-site-catalog="products">
          <div className="site-wrap">
            <div className="site-section__heading">
              <div>
                <span className="site-eyebrow">{locale === 'zh' ? '产品展示' : 'Products'}</span>
                <h2>{t.products}</h2>
              </div>
              <Link className="site-text-link" href={siteHref(siteSlug, locale, '/products')}>
                {t.allProducts} →
              </Link>
            </div>
            <div className="product-grid">
              {products.map((product) => {
                const tags = productTags(product)
                const keywords = productKeywords(product)
                const coverURL = productCoverURL(product, '')
                return (
                  <Link
                    className="site-card product-card"
                    href={siteHref(siteSlug, locale, `/products/${product.slug}`)}
                    key={product.id}
                  >
                    {coverURL ? (
                      <div
                        className="site-card__image"
                        style={{ backgroundImage: `url(${coverURL})` }}
                      />
                    ) : null}
                    <div className="site-card__body">
                      <h3>{product.title}</h3>
                      {tags.length ? (
                        <div className="site-product-tags">
                          {tags.map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      ) : null}
                      <p>{product.summary}</p>
                      {keywords.length ? (
                        <div className="site-product-keywords">
                          {keywords.map((keyword) => (
                            <em key={keyword}>{keyword}</em>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {solutionItems.length ? (
        <section className="site-section solution-band">
          <div className="site-wrap">
            <div className="industrial-section-title">
              <span className="site-eyebrow">{locale === 'zh' ? '应用解决方案' : 'Solutions'}</span>
              <h2>{locale === 'zh' ? '应用解决方案' : 'Solutions'}</h2>
            </div>
            <div className="solution-grid">
              {solutionItems.map((category) => {
                const coverURL = imageURL(category.cover)
                return (
                  <article key={category.id}>
                    {coverURL ? <img alt={category.name} src={coverURL} /> : null}
                    <div>
                      <h3>{category.name}</h3>
                      {category.description ? <p>{category.description}</p> : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {homepage?.showNews !== false && news.length ? (
        <section className="site-section site-section--white" data-site-catalog="news">
          <div className="site-wrap">
            <div className="site-section__heading">
              <div>
                <span className="site-eyebrow">{locale === 'zh' ? '新闻资讯' : t.knowledge}</span>
                <h2>{t.news}</h2>
              </div>
              <Link className="site-text-link" href={siteHref(siteSlug, locale, '/news')}>{locale === 'zh' ? '查看全部新闻' : 'View all news'} →</Link>
            </div>
            <div className="news-grid">
              {news.map((item) => {
                const coverURL = imageURL(item.cover)
                return (
                  <Link className="site-card" href={siteHref(siteSlug, locale, `/news/${item.slug}`)} key={item.id}>
                    {coverURL ? <div className="site-card__image" style={{ backgroundImage: `url(${coverURL})` }} /> : null}
                    <div className="site-card__body">
                      <small>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(locale) : t.news}</small>
                      <h3>{item.title}</h3>
                      {item.summary ? <p>{item.summary}</p> : null}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {featuredPosts.length ? (
        <section className="site-section blog-strip">
          <div className="site-wrap">
            <div className="industrial-section-title">
              <span className="site-eyebrow">{t.blog}</span>
              <h2>{t.latest}</h2>
            </div>
            <div className="news-grid">
              {featuredPosts.map((post) => {
                const coverURL = imageURL(post.heroImage || post.meta?.image)
                return (
                  <Link className="site-card" href={siteHref(siteSlug, locale, `/blog/${post.slug}`)} key={post.id}>
                    {coverURL ? <div className="site-card__image" style={{ backgroundImage: `url(${coverURL})` }} /> : null}
                    <div className="site-card__body">
                      <small>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString(locale) : t.blog}</small>
                      <h3>{post.title}</h3>
                      {post.meta?.description ? <p>{post.meta.description}</p> : null}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {homepage?.showInquiryForm !== false && <section className="site-section inquiry-section" id="contact" data-site-rfq><div className="site-wrap inquiry-section__inner"><div><span className="site-eyebrow">{t.rfq}</span><h2>{homepage?.inquiryTitle || t.rfqTitle}</h2>{homepage?.inquiryDescription || site.contact?.email ? <p>{homepage?.inquiryDescription || site.contact?.email}</p> : null}</div><RFQForm labels={{ send: t.send, sending: t.sending, sent: t.sent, error: t.error }} requiredFields={homepage?.inquiryRequiredFields || {}} site={siteSlug} /></div></section>}
    </main>
  )
}
