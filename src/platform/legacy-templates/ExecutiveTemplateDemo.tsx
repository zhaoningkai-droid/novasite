'use client'

import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Blocks,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Globe2,
  Headset,
  Layers3,
  Mail,
  Menu,
  Play,
  QrCode,
  Ruler,
  ShieldCheck,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'

import {
  executiveDemoLocales,
  getExecutiveDemoCopy,
  type ExecutiveDemoLocale,
} from './executive-demo-data'
import { ExecutiveQuoteDialog, openExecutiveQuote } from './ExecutiveQuoteDialog'
import { useExecutiveCarousel } from './useExecutiveCarousel'

type Props = { locale: ExecutiveDemoLocale }

const sectionHref: Record<string, string> = { products: 'products', news: 'news', cases: 'cases' }

const IconByName = ({ name }: { name: string }) => {
  const props = { 'aria-hidden': true as const, size: 22, strokeWidth: 1.8 }
  if (name === 'drawing') return <Ruler {...props} />
  if (name === 'material') return <Layers3 {...props} />
  if (name === 'measure') return <ClipboardCheck {...props} />
  return <Headset {...props} />
}

function DemoImage({
  alt,
  className = '',
  loading = 'lazy',
  position = 'center',
  src,
}: {
  alt: string
  className?: string
  loading?: 'eager' | 'lazy'
  position?: string
  src: string
}) {
  const [failed, setFailed] = useState(false)

  return (
    <div className={`ed-image ${className}`} data-image-failed={failed || undefined}>
      <Image
        alt={alt}
        decoding="async"
        height={900}
        loading={loading}
        onError={() => setFailed(true)}
        src={src}
        style={{ objectPosition: position }}
        unoptimized
        width={1200}
      />
    </div>
  )
}

export function ExecutiveTemplateDemo({ locale }: Props) {
  const copy = getExecutiveDemoCopy(locale)
  const isEnglish = locale === 'en'
  const base = `/template-demo/executive-industrial-pro-v1/${locale}`
  const {
    activeIndex: activeSlide,
    move: moveSlide,
    progressPaused,
    setPaused: setCarouselPaused,
  } = useExecutiveCarousel(copy.slides.length)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [activeCertificate, setActiveCertificate] = useState<number | null>(null)
  const [openFAQs, setOpenFAQs] = useState<Set<number>>(() => new Set())
  const [videoOpen, setVideoOpen] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const certificateDialog = useRef<HTMLDialogElement>(null)
  const certificateTrigger = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const dialog = certificateDialog.current
    if (!dialog) return
    if (activeCertificate !== null && !dialog.open) dialog.showModal()
    if (activeCertificate === null && dialog.open) dialog.close()
  }, [activeCertificate])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        setLanguageOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const submitDemoForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) {
      setFormMessage(copy.formError)
      return
    }
    setFormMessage(copy.formSuccess)
    form.reset()
  }

  const closeCertificate = () => {
    setActiveCertificate(null)
    window.setTimeout(() => certificateTrigger.current?.focus(), 0)
  }

  return (
    <div
      className="executive-demo"
      data-demo-locale={locale}
      onClick={(event) => {
        if (!(event.target instanceof Element)) return
        const trigger = event.target.closest<HTMLAnchorElement>('a[href="#inquiry"]')
        if (!trigger) return
        event.preventDefault()
        openExecutiveQuote(trigger.getAttribute('data-quote-product') || undefined)
      }}
    >
      <a className="ed-skip-link" href="#main-content">
        {isEnglish ? 'Skip to content' : '跳到主要内容'}
      </a>

      <header className="ed-header">
        <div className="ed-header__inner">
          <a aria-label={copy.brand} className="ed-brand" href="#home">
            <span aria-hidden="true" className="ed-brand__mark">
              匠
            </span>
            <span className="ed-brand__wordmark">
              <strong>{copy.brand}</strong>
              <small>{copy.brandEnglish}</small>
            </span>
          </a>

          <nav aria-label={isEnglish ? 'Main navigation' : '主导航'} className="ed-nav">
            <a className="is-current" href="#home">
              {copy.nav.home}
            </a>
            {copy.menuGroups.map((group) => {
              const open = openMenu === group.key
              return (
                <div
                  className="ed-nav-group"
                  data-open={open || undefined}
                  key={group.key}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setOpenMenu(null)
                    }
                  }}
                  onMouseEnter={() => setOpenMenu(group.key)}
                  onMouseLeave={() => setOpenMenu(null)}
                >
                  <button
                    aria-controls={`ed-menu-${group.key}`}
                    aria-expanded={open}
                    onClick={() => setOpenMenu(open ? null : group.key)}
                    onFocus={() => setOpenMenu(group.key)}
                    type="button"
                  >
                    {copy.nav[group.key as 'products' | 'news' | 'cases']}
                    <ChevronDown aria-hidden="true" size={14} />
                  </button>
                  <div
                    aria-hidden={!open}
                    className="ed-mega-menu"
                    id={`ed-menu-${group.key}`}
                    inert={!open}
                  >
                    <div className="ed-mega-menu__intro">
                      <span>{isEnglish ? 'EXPLORE' : '快速导航'}</span>
                      <h2>{group.title}</h2>
                      <p>
                        {isEnglish
                          ? 'Browse the sample collection and see how the template presents a clear range.'
                          : '浏览演示内容，了解模板如何清晰呈现产品与项目方向。'}
                      </p>
                    </div>
                    <div className="ed-mega-menu__items">
                      {group.items.map((item) => (
                        <a
                          href={`${base}/${sectionHref[group.key]}?category=${encodeURIComponent(item)}`}
                          key={item}
                        >
                          <ArrowUpRight aria-hidden="true" size={15} />
                          {item}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
            <a href={`${base}/about`}>{copy.nav.about}</a>
            <a href={`${base}/faqs`}>{copy.nav.faq}</a>
            <a href={`${base}/contact`}>{copy.nav.contact}</a>
          </nav>

          <div
            className="ed-language"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setLanguageOpen(false)
              }
            }}
          >
            <button
              aria-expanded={languageOpen}
              aria-haspopup="true"
              onClick={() => {
                setLanguageOpen((current) => !current)
                setOpenMenu(null)
              }}
              type="button"
            >
              <Globe2 aria-hidden="true" size={17} />
              <span>{copy.languageName}</span>
              <ChevronDown aria-hidden="true" size={14} />
            </button>
            {languageOpen ? (
              <div className="ed-language__menu" role="menu">
                {executiveDemoLocales.map((option) => {
                  const optionCopy = getExecutiveDemoCopy(option)
                  return (
                    <a
                      aria-current={option === locale ? 'page' : undefined}
                      href={`/template-demo/executive-industrial-pro-v1/${option}`}
                      key={option}
                      role="menuitem"
                    >
                      <span
                        aria-hidden="true"
                        className={`ed-language__flag ed-language__flag--${option}`}
                      >
                        {option === 'zh' ? '中' : 'EN'}
                      </span>
                      {optionCopy.languageName}
                      {option === locale ? <span className="ed-language__check">✓</span> : null}
                    </a>
                  )
                })}
              </div>
            ) : null}
          </div>

          <details className="ed-mobile-menu">
            <summary aria-label={isEnglish ? 'Open menu' : '打开菜单'}>
              <Menu aria-hidden="true" size={22} />
            </summary>
            <div
              className="ed-mobile-menu__panel"
              onClick={(event) => {
                if (!(event.target instanceof Element) || !event.target.closest('a')) return
                const menu = event.currentTarget.closest('details.ed-mobile-menu')
                if (menu instanceof HTMLDetailsElement) menu.open = false
              }}
            >
              <a href="#home">{copy.nav.home}</a>
              {copy.menuGroups.map((group) => (
                <details key={`mobile-${group.key}`}>
                  <summary>
                    {copy.nav[group.key as 'products' | 'news' | 'cases']}
                    <ChevronDown aria-hidden="true" size={15} />
                  </summary>
                  <div className="ed-mobile-menu__submenu">
                    {group.items.map((item) => (
                      <a
                        href={`${base}/${sectionHref[group.key]}?category=${encodeURIComponent(item)}`}
                        key={item}
                      >
                        {item}
                      </a>
                    ))}
                  </div>
                </details>
              ))}
              <a href={`${base}/about`}>{copy.nav.about}</a>
              <a href={`${base}/faqs`}>{copy.nav.faq}</a>
              <a href={`${base}/contact`}>{copy.nav.contact}</a>
              <div className="ed-mobile-menu__languages">
                {executiveDemoLocales.map((option) => (
                  <a href={`/template-demo/executive-industrial-pro-v1/${option}`} key={option}>
                    {getExecutiveDemoCopy(option).languageName}
                  </a>
                ))}
              </div>
            </div>
          </details>
        </div>
      </header>

      <main id="main-content">
        <section
          aria-label={isEnglish ? 'Featured architectural imagery' : '古建主题轮播图'}
          className="ed-hero"
          id="home"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setCarouselPaused(false)
          }}
          onFocus={() => setCarouselPaused(true)}
          onMouseEnter={() => setCarouselPaused(true)}
          onMouseLeave={() => setCarouselPaused(false)}
        >
          {copy.slides.map((slide, index) => (
            <div
              aria-hidden={index !== activeSlide}
              className={`ed-hero__slide${index === activeSlide ? ' is-active' : ''}`}
              key={slide.image}
            >
              <Image
                alt=""
                fill
                loading={index === 0 ? 'eager' : 'lazy'}
                priority={index === 0}
                sizes="100vw"
                src={slide.image}
                style={{ objectPosition: slide.position }}
                unoptimized
              />
            </div>
          ))}
          <div className="ed-hero__veil" />
          <div className="ed-hero__content">
            <span className="ed-demo-chip">
              <span />
              {copy.demoNotice}
            </span>
            <span className="ed-eyebrow">{copy.slides[activeSlide].eyebrow}</span>
            <h1>{copy.slides[activeSlide].title}</h1>
            <p>{copy.slides[activeSlide].description}</p>
            <div className="ed-hero__actions">
              <a className="ed-button ed-button--light" href="#product-categories">
                {copy.heroPrimary}
                <ArrowRight aria-hidden="true" size={17} />
              </a>
              <a className="ed-button ed-button--outline" href="#inquiry">
                {copy.heroSecondary}
                <ArrowUpRight aria-hidden="true" size={16} />
              </a>
            </div>
          </div>
          <div className="ed-hero__controls">
            <span className="ed-hero__counter">
              <strong>{String(activeSlide + 1).padStart(2, '0')}</strong>
              <i />
              {String(copy.slides.length).padStart(2, '0')}
              <small>{copy.slideLabel}</small>
            </span>
            {copy.slides.length > 1 ? (
              <div className="ed-hero__arrows">
                <button
                  aria-label={isEnglish ? 'Previous image' : '上一张'}
                  onClick={() => moveSlide(-1)}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" size={19} />
                </button>
                <button
                  aria-label={isEnglish ? 'Next image' : '下一张'}
                  onClick={() => moveSlide(1)}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" size={19} />
                </button>
              </div>
            ) : null}
          </div>
          <div
            className="ed-hero__progress"
            key={`slide-${activeSlide}-${progressPaused}`}
            data-paused={progressPaused || undefined}
          />
        </section>

        <section aria-labelledby="advantages-heading" className="ed-section ed-advantages">
          <div className="ed-container">
            <div className="ed-section-heading ed-section-heading--center">
              <span className="ed-eyebrow ed-eyebrow--green">{copy.advantagesKicker}</span>
              <h2 id="advantages-heading">{copy.advantagesHeading}</h2>
            </div>
            <div className="ed-advantage-grid">
              {copy.advantages.map((item, index) => (
                <article className="ed-advantage-card" key={item.title}>
                  <span className="ed-advantage-card__icon">
                    <IconByName name={item.icon} />
                  </span>
                  <small>{String(index + 1).padStart(2, '0')}</small>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <span className="ed-advantage-card__line" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-label={copy.credentialHeading} className="ed-credential-strip">
          <div className="ed-container ed-credential-strip__inner">
            <p>{copy.credentialHeading}</p>
            <div>
              {copy.credentialItems.map((item, index) => (
                <span key={item}>
                  <b>0{index + 1}</b>
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="certificates-heading" className="ed-section ed-certificates">
          <div className="ed-container">
            <div className="ed-section-heading ed-section-heading--center">
              <span className="ed-eyebrow ed-eyebrow--green">{copy.certificatesKicker}</span>
              <h2 id="certificates-heading">{copy.certificatesHeading}</h2>
              <p>{copy.certificatesDescription}</p>
            </div>
            <div className="ed-certificate-grid">
              {copy.certificates.map((certificate, index) => (
                <button
                  aria-label={`${certificate.title} · ${isEnglish ? 'open sample' : '查看演示样张'}`}
                  className="ed-certificate-card"
                  key={certificate.title}
                  onClick={(event) => {
                    certificateTrigger.current = event.currentTarget
                    setActiveCertificate(index)
                  }}
                  type="button"
                >
                  <span
                    className="ed-certificate-card__paper"
                    style={{ '--paper-accent': certificate.color } as CSSProperties}
                  >
                    <span className="ed-certificate-card__eyebrow">{copy.brandEnglish}</span>
                    <span className="ed-certificate-card__rule" />
                    <Award aria-hidden="true" size={30} strokeWidth={1.4} />
                    <strong>{certificate.title}</strong>
                    <small>{certificate.code}</small>
                    <span className="ed-certificate-card__sample">
                      {isEnglish ? 'DEMO SAMPLE' : '演示样张'}
                    </span>
                  </span>
                  <span className="ed-certificate-card__caption">
                    <span>{certificate.title}</span>
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="about-heading" className="ed-about" id="about">
          <div className="ed-about__background" />
          <div className="ed-about__shade" />
          <div className="ed-container ed-about__inner">
            <div className="ed-about__copy">
              <span className="ed-eyebrow">{copy.aboutKicker}</span>
              <h2 id="about-heading">{copy.aboutTitle}</h2>
              <p>{copy.aboutText}</p>
              <a className="ed-button ed-button--light" href="#inquiry">
                {copy.aboutButton}
                <ArrowRight aria-hidden="true" size={16} />
              </a>
            </div>
            <div className="ed-video-card">
              {!videoOpen ? (
                <button
                  aria-label={copy.videoPlay}
                  className="ed-video-card__poster"
                  onClick={() => setVideoOpen(true)}
                  type="button"
                >
                  <DemoImage
                    alt=""
                    className="ed-video-card__image"
                    loading="lazy"
                    src={copy.slides[1].image}
                  />
                  <span className="ed-video-card__play">
                    <Play aria-hidden="true" fill="currentColor" size={22} />
                  </span>
                  <span className="ed-video-card__label">{copy.videoLabel}</span>
                </button>
              ) : (
                <video
                  autoPlay
                  className="ed-video-card__player"
                  controls
                  playsInline
                  poster={copy.slides[1].image}
                  preload="metadata"
                  src={copy.video}
                />
              )}
              <p>{copy.videoTitle}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="strength-heading" className="ed-section ed-strength">
          <div className="ed-container">
            <div className="ed-section-heading ed-section-heading--split">
              <div>
                <span className="ed-eyebrow ed-eyebrow--green">{copy.strengthKicker}</span>
                <h2 id="strength-heading">{copy.strengthTitle}</h2>
              </div>
              <span className="ed-sample-label">
                <span />
                {copy.sampleData}
              </span>
            </div>
            <div className="ed-stats-grid">
              {copy.stats.map((stat) => (
                <article key={stat.label}>
                  <strong>
                    {stat.value}
                    <small>{stat.unit}</small>
                  </strong>
                  <span>{stat.label}</span>
                </article>
              ))}
            </div>
            <div className="ed-strength-gallery">
              {copy.workshopPhotos.map((photo, index) => (
                <figure key={photo.title}>
                  <DemoImage alt={photo.title} position={photo.position} src={photo.image} />
                  <figcaption>
                    <small>0{index + 1}</small>
                    {photo.title}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="cases-heading" className="ed-section ed-cases" id="cases">
          <div className="ed-container">
            <div className="ed-section-heading ed-section-heading--split">
              <div>
                <span className="ed-eyebrow ed-eyebrow--green">{copy.casesKicker}</span>
                <h2 id="cases-heading">{copy.casesTitle}</h2>
                <p>{copy.casesText}</p>
              </div>
              <a className="ed-text-link" href={`${base}/cases`}>
                {copy.allCases}
                <ArrowUpRight aria-hidden="true" size={17} />
              </a>
            </div>
            <div className="ed-case-grid">
              {copy.cases.map((item, index) => (
                <article className="ed-case-card" key={item.title}>
                  <DemoImage alt={item.title} className="ed-case-card__image" src={item.image} />
                  <div className="ed-case-card__body">
                    <span className="ed-card-kicker">
                      {item.type}
                      <i />
                      {isEnglish ? 'SAMPLE' : '项目示例'}
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                    <a href="#inquiry">
                      {isEnglish ? 'Discuss a similar project' : '沟通类似项目'}
                      <ArrowUpRight aria-hidden="true" size={15} />
                    </a>
                  </div>
                  <span aria-hidden="true" className="ed-case-card__number">
                    0{index + 1}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-label={copy.caseStripTitle} className="ed-cta-ribbon">
          <div className="ed-container ed-cta-ribbon__inner">
            <div>
              <strong>{copy.caseStripTitle}</strong>
              <span>{copy.caseStripText}</span>
            </div>
            <a className="ed-button ed-button--blue" href="#inquiry">
              {copy.caseStripButton}
              <ArrowRight aria-hidden="true" size={16} />
            </a>
          </div>
        </section>

        <section
          aria-labelledby="categories-heading"
          className="ed-section ed-categories"
          id="product-categories"
        >
          <div className="ed-container">
            <div className="ed-section-heading ed-section-heading--center">
              <span className="ed-eyebrow">{copy.categoriesKicker}</span>
              <h2 id="categories-heading">{copy.categoriesTitle}</h2>
              <p>{copy.categoriesText}</p>
            </div>
            <div className="ed-category-grid">
              {copy.categories.map((category, index) => (
                <a className="ed-category-card" href="#products" key={category.name}>
                  <DemoImage alt={category.name} src={category.image} />
                  <span className="ed-category-card__shade" />
                  <span className="ed-category-card__meta">
                    0{index + 1} / {category.count}
                  </span>
                  <strong>{category.name}</strong>
                  <ArrowUpRight aria-hidden="true" className="ed-category-card__arrow" size={18} />
                </a>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="products-heading"
          className="ed-section ed-products"
          id="products"
        >
          <div className="ed-container">
            <div className="ed-section-heading ed-section-heading--split">
              <div>
                <span className="ed-eyebrow ed-eyebrow--green">{copy.productsKicker}</span>
                <h2 id="products-heading">{copy.productsTitle}</h2>
                <p>{copy.productsText}</p>
              </div>
              <a className="ed-text-link" href={`${base}/products`}>
                {copy.allProducts}
                <ArrowUpRight aria-hidden="true" size={17} />
              </a>
            </div>
            <div className="ed-product-grid">
              {copy.products.map((product, index) => (
                <article className="ed-product-card" key={product.name}>
                  <a
                    aria-label={`${product.name} · ${isEnglish ? 'ask about this element' : '询问该构件'}`}
                    className="ed-product-card__image-link"
                    data-quote-product={product.name}
                    href="#inquiry"
                  >
                    <DemoImage
                      alt={`${isEnglish ? 'Sample setting for' : '模板场景示意图：'} ${product.name}`}
                      className="ed-product-card__image"
                      src={product.image}
                    />
                    <span className="ed-product-card__index">0{index + 1}</span>
                    <span className="ed-product-card__quick">
                      <ArrowUpRight aria-hidden="true" size={19} />
                    </span>
                  </a>
                  <div className="ed-product-card__body">
                    <span>{product.category}</span>
                    <h3>{product.name}</h3>
                    <p>{product.summary}</p>
                    <a data-quote-product={product.name} href="#inquiry">
                      {isEnglish ? 'Ask about this element' : '询问该构件'}
                      <ArrowRight aria-hidden="true" size={15} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-label={copy.productStripTitle} className="ed-product-strip">
          <div className="ed-container ed-product-strip__inner">
            <Blocks aria-hidden="true" size={27} strokeWidth={1.6} />
            <strong>{copy.productStripTitle}</strong>
            <span>{copy.productStripText}</span>
            <a href="#inquiry">
              {copy.productStripButton}
              <ArrowRight aria-hidden="true" size={16} />
            </a>
          </div>
        </section>

        <section aria-labelledby="news-heading" className="ed-section ed-news" id="news">
          <div className="ed-container">
            <div className="ed-section-heading ed-section-heading--split">
              <div>
                <span className="ed-eyebrow ed-eyebrow--green">{copy.newsKicker}</span>
                <h2 id="news-heading">{copy.newsTitle}</h2>
              </div>
              <a className="ed-text-link" href={`${base}/news`}>
                {copy.allNews}
                <ArrowUpRight aria-hidden="true" size={17} />
              </a>
            </div>
            <div className="ed-news-grid">
              {copy.news.map((article, index) => (
                <article className="ed-news-card" key={article.title}>
                  <a
                    aria-label={`${article.title} · ${isEnglish ? 'read article' : '阅读文章'}`}
                    className="ed-news-card__image"
                    href={`${base}/news/story-${String(index + 1).padStart(2, '0')}`}
                  >
                    <DemoImage alt={article.title} src={article.image} />
                    <span>0{index + 1}</span>
                  </a>
                  <div className="ed-news-card__body">
                    <span>{article.date}</span>
                    <h3>{article.title}</h3>
                    <p>{article.summary}</p>
                    <a href={`${base}/news/story-${String(index + 1).padStart(2, '0')}`}>
                      {isEnglish ? 'Learn more' : '了解更多'}
                      <ArrowUpRight aria-hidden="true" size={15} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="ed-section ed-faq" id="faq">
          <div className="ed-container ed-faq__layout">
            <div className="ed-section-heading">
              <span className="ed-eyebrow ed-eyebrow--green">{copy.faqKicker}</span>
              <h2 id="faq-heading">{copy.faqTitle}</h2>
              <p>
                {isEnglish
                  ? 'A few practical notes to help start a clear project conversation.'
                  : '整理项目沟通中常见的问题，帮助你更快准备资料。'}
              </p>
              <a className="ed-text-link" href="#inquiry">
                {isEnglish ? 'Ask about your project' : '咨询你的项目'}
                <ArrowUpRight aria-hidden="true" size={16} />
              </a>
            </div>
            <div className="ed-faq-list">
              {copy.faqs.map((item, index) => {
                const isOpen = openFAQs.has(index)
                return (
                  <article className="ed-faq-item" data-open={isOpen || undefined} key={item.q}>
                    <h3>
                      <button
                        aria-controls={`ed-faq-answer-${index}`}
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenFAQs((previous) => {
                            const next = new Set(previous)
                            if (next.has(index)) next.delete(index)
                            else next.add(index)
                            return next
                          })
                        }
                        type="button"
                      >
                        <span>
                          <b>0{index + 1}</b>
                          {item.q}
                        </span>
                        <ChevronDown aria-hidden="true" size={18} />
                      </button>
                    </h3>
                    {isOpen ? <p id={`ed-faq-answer-${index}`}>{item.a}</p> : null}
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section aria-labelledby="inquiry-heading" className="ed-inquiry" id="inquiry">
          <div className="ed-inquiry__texture" />
          <div className="ed-container ed-inquiry__grid">
            <div className="ed-inquiry__copy">
              <span className="ed-eyebrow">{copy.inquiryKicker}</span>
              <h2 id="inquiry-heading">{copy.inquiryTitle}</h2>
              <p>{copy.inquiryText}</p>
              <div className="ed-inquiry__note">
                <ShieldCheck aria-hidden="true" size={19} />
                <span>
                  {isEnglish
                    ? 'This sample form runs locally in your browser only.'
                    : '演示表单只在当前浏览器内显示反馈。'}
                </span>
              </div>
            </div>
            <form className="ed-inquiry-form" noValidate onSubmit={submitDemoForm}>
              <div className="ed-inquiry-form__row">
                <label>
                  {copy.form.name}
                  <input autoComplete="name" name="name" required />
                </label>
                <label>
                  {copy.form.email}
                  <input autoComplete="email" name="email" required type="email" />
                </label>
              </div>
              <label>
                {copy.form.phone}
                <input autoComplete="tel" name="phone" type="tel" />
              </label>
              <label>
                {copy.form.message}
                <textarea name="message" required rows={4} />
              </label>
              <button className="ed-button ed-button--blue" type="submit">
                {copy.form.submit}
                <ArrowRight aria-hidden="true" size={17} />
              </button>
              <p aria-live="polite" className="ed-inquiry-form__message" role="status">
                {formMessage}
              </p>
            </form>
          </div>
        </section>
      </main>

      <footer className="ed-footer">
        <div className="ed-footer__background" />
        <div className="ed-footer__shade" />
        <div className="ed-container ed-footer__content">
          <div className="ed-footer__brand">
            <a aria-label={copy.brand} className="ed-brand" href="#home">
              <span aria-hidden="true" className="ed-brand__mark">
                匠
              </span>
              <span className="ed-brand__wordmark">
                <strong>{copy.brand}</strong>
                <small>{copy.brandEnglish}</small>
              </span>
            </a>
            <span className="ed-footer__badge">{copy.footerLabel}</span>
            <p>{copy.footerText}</p>
            <a className="ed-footer__email" href={`${base}/contact`}>
              <Mail aria-hidden="true" size={16} />
              {copy.nav.contact}
              <ArrowUpRight aria-hidden="true" size={14} />
            </a>
          </div>
          <div className="ed-footer__links">
            <strong>{copy.footerNav}</strong>
            {[
              ['home', base],
              ['products', `${base}/products`],
              ['cases', `${base}/cases`],
              ['news', `${base}/news`],
              ['about', `${base}/about`],
              ['faq', `${base}/faqs`],
              ['contact', `${base}/contact`],
            ].map(([key, href]) => (
              <a href={href} key={key}>
                {copy.nav[key as keyof typeof copy.nav]}
              </a>
            ))}
          </div>
          <div className="ed-footer__contact">
            <strong>{copy.footerContact}</strong>
            <p>{copy.footerContactNote}</p>
            <a href={`${base}/contact`}>
              {isEnglish ? 'View contact page' : '查看联系页面'}
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          </div>
          <div className="ed-footer__qr">
            <span className="ed-footer__qr-art">
              <QrCode aria-hidden="true" size={94} strokeWidth={1.3} />
            </span>
            <strong>{copy.footerQr}</strong>
            <small>{copy.footerQrNote}</small>
          </div>
        </div>
        <div className="ed-container ed-footer__bottom">
          <span>© {copy.brandEnglish}</span>
          <span>{copy.copyright}</span>
          <a href="https://www.pexels.com/license/" rel="noreferrer" target="_blank">
            {copy.imageCredit}
          </a>
        </div>
      </footer>

      <dialog
        aria-label={isEnglish ? 'Document sample' : '证书演示样张'}
        className="ed-certificate-dialog"
        onCancel={() => setActiveCertificate(null)}
        onClose={() => {
          setActiveCertificate(null)
          window.setTimeout(() => certificateTrigger.current?.focus(), 0)
        }}
        ref={certificateDialog}
      >
        {activeCertificate !== null ? (
          <div className="ed-certificate-dialog__inner">
            <button
              aria-label={isEnglish ? 'Close' : '关闭'}
              className="ed-dialog-close"
              onClick={closeCertificate}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
            <span className="ed-eyebrow ed-eyebrow--green">{copy.certificatesKicker}</span>
            <h2>{copy.certificates[activeCertificate].title}</h2>
            <div className="ed-certificate-dialog__sample">
              <Award aria-hidden="true" size={56} strokeWidth={1.2} />
              <strong>{copy.certificates[activeCertificate].title}</strong>
              <span>{copy.certificates[activeCertificate].code}</span>
              <small>
                {isEnglish ? 'SAMPLE DOCUMENT · NOT A CERTIFICATION' : '演示样张 · 并非认证证书'}
              </small>
            </div>
            <p>{copy.certificatesDescription}</p>
          </div>
        ) : null}
      </dialog>
      <ExecutiveQuoteDialog locale={locale} />
    </div>
  )
}
