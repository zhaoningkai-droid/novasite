'use client'

import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Ruler,
  X,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { SiteLocale } from '@/platform/site-locales'
import { siteHref } from '@/platform/site-url'
import { RFQForm } from '@/app/(sites)/s/[site]/[lang]/RFQForm'

import type { ExecutiveHomeSlide, ExecutiveImageItem, ExecutiveTenantHomeData } from './executive-home-model'
import { useExecutiveCarousel } from './useExecutiveCarousel'

const languageCopy: Record<string, Record<string, string>> = {
  zh: {
    about: '关于我们', all: '查看全部', cases: '客户案例', casesHeading: '合作项目与应用案例', categories: '产品分类', categoriesHeading: '按类别浏览产品', close: '关闭', contact: '联系我们', learnMore: '了解详情',
    empty: '网站内容准备中', emptyText: '内容管理员添加首页资料后，这里会展示企业信息。', faq: '常见问题',
    inquiry: '询盘留言', news: '公司新闻资讯', next: '下一张', previous: '上一张', products: '产品中心',
    request: '获取项目建议', send: '提交询盘', sending: '提交中…', sent: '提交成功，我们会尽快联系您。', error: '提交失败，请稍后重试。',
    caseCTAHeading: '正在推进一个项目？', caseCTADescription: '从项目场景和构件需求开始沟通。', caseCTAButton: '聊聊项目',
    productCTAHeading: '想确认产品型号或规格？', productCTADescription: '提交您关注的产品信息，方便进一步沟通。', productCTAButton: '咨询产品',
    strength: '公司实力', strengthHeading: '以真实能力支撑项目交付', advantagesHeading: '为每个项目提供清晰支持', certificatesHeading: '资质与品质文件', productsHeading: '精选产品', newsHeading: '公司新闻资讯', video: '播放视频',
  },
  en: {
    about: 'About us', all: 'View all', cases: 'Cases', casesHeading: 'Projects and applications', categories: 'Product categories', categoriesHeading: 'Browse by category', close: 'Close', contact: 'Contact us', learnMore: 'Learn more',
    empty: 'Website content is being prepared', emptyText: 'Company information will appear here after it is added in the workspace.', faq: 'Frequently asked questions',
    inquiry: 'Send an inquiry', news: 'Company news', next: 'Next image', previous: 'Previous image', products: 'Products',
    request: 'Discuss your project', send: 'Send inquiry', sending: 'Sending…', sent: 'Thank you. We will be in touch shortly.', error: 'Unable to send. Please try again.',
    caseCTAHeading: 'Planning a project?', caseCTADescription: 'Start with the application and elements you need.', caseCTAButton: 'Discuss a project',
    productCTAHeading: 'Need product details?', productCTADescription: 'Share the products or specifications you are reviewing.', productCTAButton: 'Ask about a product',
    strength: 'Company capability', strengthHeading: 'Built around real project capacity', advantagesHeading: 'Clear support for every project', certificatesHeading: 'Credentials and quality documents', productsHeading: 'Featured products', newsHeading: 'Company news', video: 'Play video',
  },
  es: {
    about: 'Nosotros', all: 'Ver todo', cases: 'Casos', casesHeading: 'Proyectos y aplicaciones', categories: 'Categorías de productos', categoriesHeading: 'Explorar por categoría', close: 'Cerrar', contact: 'Contacto', learnMore: 'Más información',
    empty: 'Sitio web en preparación', emptyText: 'La información de la empresa aparecerá cuando se añada en el panel.', faq: 'Preguntas frecuentes',
    inquiry: 'Enviar consulta', news: 'Noticias', next: 'Siguiente imagen', previous: 'Imagen anterior', products: 'Productos',
    request: 'Hablemos de su proyecto', send: 'Enviar consulta', sending: 'Enviando…', sent: 'Gracias. Nos pondremos en contacto pronto.', error: 'No se pudo enviar. Inténtelo de nuevo.',
    caseCTAHeading: '¿Está planificando un proyecto?', caseCTADescription: 'Comience con la aplicación y los elementos que necesita.', caseCTAButton: 'Hablar del proyecto',
    productCTAHeading: '¿Necesita detalles del producto?', productCTADescription: 'Comparta los productos o especificaciones que está revisando.', productCTAButton: 'Consultar producto',
    strength: 'Capacidad de la empresa', strengthHeading: 'Capacidad real para cada proyecto', advantagesHeading: 'Apoyo claro para cada proyecto', certificatesHeading: 'Certificaciones y documentos', productsHeading: 'Productos destacados', newsHeading: 'Noticias de la empresa', video: 'Reproducir vídeo',
  },
  ar: {
    about: 'من نحن', all: 'عرض الكل', cases: 'المشاريع', casesHeading: 'المشاريع والتطبيقات', categories: 'فئات المنتجات', categoriesHeading: 'تصفح حسب الفئة', close: 'إغلاق', contact: 'اتصل بنا', learnMore: 'اعرف المزيد',
    empty: 'الموقع قيد الإعداد', emptyText: 'ستظهر معلومات الشركة بعد إضافتها في لوحة التحكم.', faq: 'الأسئلة الشائعة',
    inquiry: 'أرسل استفسارًا', news: 'أخبار الشركة', next: 'الصورة التالية', previous: 'الصورة السابقة', products: 'المنتجات',
    request: 'ناقش مشروعك', send: 'إرسال الاستفسار', sending: 'جارٍ الإرسال…', sent: 'شكرًا لك. سنتواصل معك قريبًا.', error: 'تعذر الإرسال. حاول مرة أخرى.',
    caseCTAHeading: 'هل تخطط لمشروع؟', caseCTADescription: 'ابدأ بتوضيح الاستخدام والعناصر المطلوبة.', caseCTAButton: 'ناقش المشروع',
    productCTAHeading: 'هل تحتاج إلى تفاصيل المنتج؟', productCTADescription: 'شارك المنتجات أو المواصفات التي تراجعها.', productCTAButton: 'استفسر عن المنتج',
    strength: 'قدرات الشركة', strengthHeading: 'قدرات حقيقية لدعم المشاريع', advantagesHeading: 'دعم واضح لكل مشروع', certificatesHeading: 'الاعتمادات ووثائق الجودة', productsHeading: 'منتجات مختارة', newsHeading: 'أخبار الشركة', video: 'تشغيل الفيديو',
  },
  id: {
    about: 'Tentang Kami', all: 'Lihat semua', cases: 'Proyek', casesHeading: 'Proyek dan penerapan', categories: 'Kategori Produk', categoriesHeading: 'Jelajahi menurut kategori', close: 'Tutup', contact: 'Kontak', learnMore: 'Pelajari lebih lanjut',
    empty: 'Situs sedang disiapkan', emptyText: 'Informasi perusahaan akan tampil setelah ditambahkan di panel.', faq: 'Pertanyaan Umum',
    inquiry: 'Kirim pertanyaan', news: 'Berita perusahaan', next: 'Gambar berikutnya', previous: 'Gambar sebelumnya', products: 'Produk',
    request: 'Diskusikan proyek Anda', send: 'Kirim pertanyaan', sending: 'Mengirim…', sent: 'Terima kasih. Kami akan segera menghubungi Anda.', error: 'Tidak dapat mengirim. Silakan coba lagi.',
    caseCTAHeading: 'Sedang merencanakan proyek?', caseCTADescription: 'Mulailah dengan konteks proyek dan elemen yang dibutuhkan.', caseCTAButton: 'Diskusikan proyek',
    productCTAHeading: 'Perlu detail produk?', productCTADescription: 'Sampaikan produk atau spesifikasi yang sedang Anda tinjau.', productCTAButton: 'Tanya produk',
    strength: 'Kemampuan perusahaan', strengthHeading: 'Kemampuan nyata untuk mendukung proyek', advantagesHeading: 'Dukungan yang jelas untuk setiap proyek', certificatesHeading: 'Sertifikasi dan dokumen mutu', productsHeading: 'Produk pilihan', newsHeading: 'Berita perusahaan', video: 'Putar video',
  },
  de: {
    about: 'Über uns', all: 'Alle ansehen', cases: 'Referenzen', casesHeading: 'Projekte und Anwendungen', categories: 'Produktkategorien', categoriesHeading: 'Nach Kategorie durchsuchen', close: 'Schließen', contact: 'Kontakt', learnMore: 'Mehr erfahren',
    empty: 'Website wird vorbereitet', emptyText: 'Unternehmensinformationen erscheinen, sobald sie im Workspace hinterlegt sind.', faq: 'Häufige Fragen',
    inquiry: 'Anfrage senden', news: 'Unternehmensnachrichten', next: 'Nächstes Bild', previous: 'Vorheriges Bild', products: 'Produkte',
    request: 'Projekt besprechen', send: 'Anfrage senden', sending: 'Wird gesendet…', sent: 'Vielen Dank. Wir melden uns in Kürze.', error: 'Senden fehlgeschlagen. Bitte erneut versuchen.',
    caseCTAHeading: 'Planen Sie ein Projekt?', caseCTADescription: 'Beginnen Sie mit dem Einsatzbereich und den benötigten Bauteilen.', caseCTAButton: 'Projekt besprechen',
    productCTAHeading: 'Benötigen Sie Produktdetails?', productCTADescription: 'Teilen Sie die Produkte oder Spezifikationen mit, die Sie prüfen.', productCTAButton: 'Produkt anfragen',
    strength: 'Leistungsfähigkeit', strengthHeading: 'Leistungsfähigkeit für reale Projekte', advantagesHeading: 'Klare Unterstützung für jedes Projekt', certificatesHeading: 'Nachweise und Qualitätsdokumente', productsHeading: 'Ausgewählte Produkte', newsHeading: 'Unternehmensnachrichten', video: 'Video abspielen',
  },
  ru: {
    about: 'О компании', all: 'Смотреть все', cases: 'Проекты', casesHeading: 'Проекты и применение', categories: 'Категории продукции', categoriesHeading: 'Выбор по категориям', close: 'Закрыть', contact: 'Контакты', learnMore: 'Подробнее',
    empty: 'Сайт готовится к запуску', emptyText: 'Информация о компании появится после добавления в панели управления.', faq: 'Частые вопросы',
    inquiry: 'Отправить запрос', news: 'Новости компании', next: 'Следующее изображение', previous: 'Предыдущее изображение', products: 'Продукция',
    request: 'Обсудить проект', send: 'Отправить запрос', sending: 'Отправка…', sent: 'Спасибо. Мы скоро свяжемся с вами.', error: 'Не удалось отправить. Попробуйте еще раз.',
    caseCTAHeading: 'Планируете проект?', caseCTADescription: 'Начните с области применения и необходимых элементов.', caseCTAButton: 'Обсудить проект',
    productCTAHeading: 'Нужны сведения о товаре?', productCTADescription: 'Укажите товары или характеристики, которые вы рассматриваете.', productCTAButton: 'Запросить сведения',
    strength: 'Возможности компании', strengthHeading: 'Возможности для реальных проектов', advantagesHeading: 'Понятная поддержка каждого проекта', certificatesHeading: 'Сертификаты и документы о качестве', productsHeading: 'Рекомендуемая продукция', newsHeading: 'Новости компании', video: 'Воспроизвести видео',
  },
}

const iconFor = (name?: string | null) => {
  if (name === 'measure' || name === 'drawing') return <Ruler aria-hidden="true" size={21} />
  return <Layers3 aria-hidden="true" size={21} />
}

const imageURL = (item: ExecutiveImageItem) => {
  const value = item.image
  return typeof value === 'object' && value ? value.url || value.thumbnailURL || '' : ''
}

const bannerDestination = (slide: ExecutiveHomeSlide | undefined, siteSlug: string, locale: SiteLocale) => {
  const value = slide?.linkURL?.trim()
  if (slide?.linkType === 'internal' && value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return { external: false, href: siteHref(siteSlug, locale, value) }
  }
  if (slide?.linkType === 'external' && value) {
    try {
      const parsed = new URL(value)
      if (parsed.protocol === 'https:') return { external: true, href: parsed.toString() }
    } catch {
      return null
    }
  }
  return null
}

export function ExecutiveTenantHome({ data }: { data: ExecutiveTenantHomeData }) {
  const locale = data.locale as SiteLocale
  const text = languageCopy[locale] || languageCopy.en
  const slides = useMemo(() => [...data.banners]
    .filter((item) => item.desktopImage || item.mobileImage || item.title || item.description)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), [data.banners])
  const {
    activeIndex: activeSlide,
    move: moveSlide,
    progressPaused,
    setPaused: setCarouselPaused,
  } = useExecutiveCarousel(slides.length)
  const currentBannerDestination = bannerDestination(slides[activeSlide] || slides[0], data.siteSlug, locale)
  const [videoOpen, setVideoOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(null)
  const [selectedCertificate, setSelectedCertificate] = useState<number | null>(null)
  const certificateDialog = useRef<HTMLDialogElement>(null)
  const certificateTrigger = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const dialog = certificateDialog.current
    if (!dialog) return
    if (selectedCertificate !== null && !dialog.open) {
      dialog.showModal()
      dialog.querySelector('button')?.focus()
    }
    if (selectedCertificate === null && dialog.open) {
      dialog.close()
      certificateTrigger.current?.focus()
    }
  }, [selectedCertificate])

  const hasSections = Boolean(
    slides.length || data.advantages.length || data.settings.marksEnabled && data.settings.marks?.length ||
    data.settings.certificatesEnabled && data.certificates.length || data.about.title || data.about.text || data.about.background ||
    data.videoSource || data.showStrength && (data.strengthItems.length || data.strengthGallery.length) ||
    data.showCases && data.cases.length || data.categories.length || data.showProducts && data.products.length ||
    data.showNews && data.news.length || data.showFAQ && data.faq.length || data.showInquiry,
  )

  if (!hasSections) return <main className="executive-customer executive-customer--empty">
    <div className="ed-container"><span className="ed-eyebrow ed-eyebrow--green">{data.companyName}</span><h1>{text.empty}</h1><p>{text.emptyText}</p></div>
  </main>

  return <main className="executive-customer" data-site-page="home">
    {slides.length ? <section aria-label={locale === 'zh' ? '首页轮播图' : 'Homepage banners'} className="ed-hero" id="home"
      onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={() => setCarouselPaused(false)}
      onFocus={() => setCarouselPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setCarouselPaused(false) }}>
      {slides.map((slide, index) => {
        return <div aria-hidden={index !== activeSlide} className={`ed-hero__slide${index === activeSlide ? ' is-active' : ''}`} key={`${slide.desktopImage}-${index}`}>
          {slide.desktopImage || slide.mobileImage ? <picture>
            {slide.mobileImage ? <source media="(max-width: 759px)" srcSet={slide.mobileImage} /> : null}
            <Image alt="" fill priority={index === 0} sizes="100vw" src={slide.desktopImage || slide.mobileImage || ''} unoptimized />
          </picture> : null}
        </div>
      })}
      <div className="ed-hero__veil" />
      <div className="ed-hero__content">
        {slides[activeSlide]?.title ? <h1>{slides[activeSlide].title}</h1> : null}
        {slides[activeSlide]?.description ? <p>{slides[activeSlide].description}</p> : null}
        <div className="ed-hero__actions">
          <Link className="ed-button ed-button--light" href={data.categories.length ? '#product-categories' : siteHref(data.siteSlug, locale, '/products')}>{text.products}<ArrowRight aria-hidden="true" size={17} /></Link>
          <Link className="ed-button ed-button--outline" href={data.showInquiry ? '#inquiry' : siteHref(data.siteSlug, locale, '/contact')}>{text.request}<ArrowUpRight aria-hidden="true" size={16} /></Link>
          {currentBannerDestination ? <Link className="ed-button ed-button--outline" href={currentBannerDestination.href} rel={currentBannerDestination.external ? 'noopener noreferrer' : undefined} target={currentBannerDestination.external ? '_blank' : undefined}>{text.learnMore}<ArrowUpRight aria-hidden="true" size={16} /></Link> : null}
        </div>
      </div>
      {slides.length > 1 ? <div className="ed-hero__controls">
        <span className="ed-hero__counter"><strong>{String(activeSlide + 1).padStart(2, '0')}</strong><i />{String(slides.length).padStart(2, '0')}</span>
        <div className="ed-hero__arrows">
          <button aria-label={text.previous} onClick={() => moveSlide(-1)} type="button"><ChevronLeft aria-hidden="true" size={19} /></button>
          <button aria-label={text.next} onClick={() => moveSlide(1)} type="button"><ChevronRight aria-hidden="true" size={19} /></button>
        </div>
      </div> : null}
      {slides.length > 1 ? <div className="ed-hero__progress" key={`tenant-slide-${activeSlide}-${progressPaused}`} data-paused={progressPaused || undefined} /> : null}
    </section> : null}

    {data.advantages.length ? <section className="ed-section ed-advantages">
      <div className="ed-container"><div className="ed-section-heading ed-section-heading--center">
        <span className="ed-eyebrow ed-eyebrow--green">{text.about}</span>
        <h2>{data.settings.advantagesTitle || text.advantagesHeading}</h2>
      </div><div className="ed-advantage-grid">
        {data.advantages.map((item, index) => <article className="ed-advantage-card" key={`${item.title}-${index}`}>
          <span className="ed-advantage-card__icon">{iconFor(item.icon)}</span><small>{String(index + 1).padStart(2, '0')}</small>
          {item.title ? <h3>{item.title}</h3> : null}{item.description ? <p>{item.description}</p> : null}<span className="ed-advantage-card__line" />
        </article>)}
      </div></div>
    </section> : null}

    {data.settings.marksEnabled && data.settings.marks?.length ? <section className="ed-credential-strip" aria-label={locale === 'zh' ? '企业资质' : 'Company credentials'}>
      <div className="ed-container ed-credential-strip__inner"><p>{data.companyName}</p><div>{data.settings.marks.map((item, index) => <span key={`${item.label}-${index}`}>
        {imageURL(item) ? <Image alt={item.label || ''} height={40} loading="lazy" src={imageURL(item)} unoptimized width={120} /> : null}{item.label}
      </span>)}</div></div>
    </section> : null}

    {data.settings.certificatesEnabled && data.certificates.length ? <section className="ed-section ed-certificates">
      <div className="ed-container"><div className="ed-section-heading ed-section-heading--center">
        <span className="ed-eyebrow ed-eyebrow--green">{locale === 'zh' ? 'CERTIFICATES' : 'CERTIFICATES'}</span>
        <h2>{data.settings.certificatesTitle || text.certificatesHeading}</h2>
      </div><div className="ed-certificate-grid">
        {data.certificates.map((item, index) => <button aria-label={`${item.name || item.alt || ''} · ${text.all}`} className="ed-certificate-card" key={`${item.name}-${index}`} onClick={(event) => { certificateTrigger.current = event.currentTarget; setSelectedCertificate(index) }} type="button">
          <span className="ed-certificate-card__paper">{imageURL(item) ? <Image alt={item.alt || item.name || ''} height={900} loading="lazy" sizes="(max-width: 620px) 48vw, 24vw" src={imageURL(item)} unoptimized width={1200} /> : null}</span>
          {item.name ? <span className="ed-certificate-card__caption"><span>{item.name}</span><ArrowUpRight aria-hidden="true" size={16} /></span> : null}
        </button>)}
      </div></div>
    </section> : null}

    {data.about.title || data.about.text || data.about.background || data.videoSource ? <section aria-label={text.about} className="ed-about" id="about">
      <div className="ed-about__background" style={data.about.background ? { backgroundImage: `url(${data.about.background})` } : undefined} />
      <div className="ed-about__shade" style={{ background: `rgba(14, 24, 20, ${data.about.overlay})` }} />
      <div className="ed-container ed-about__inner">
        <div className="ed-about__copy"><span className="ed-eyebrow">{text.about}</span>
          {data.about.title ? <h2>{data.about.title}</h2> : null}{data.about.text ? <p>{data.about.text}</p> : null}
          {data.about.buttonLabel ? <Link className="ed-button ed-button--light" href={data.showInquiry ? '#inquiry' : siteHref(data.siteSlug, locale, '/contact')}>{data.about.buttonLabel}<ArrowRight aria-hidden="true" size={16} /></Link> : null}
        </div>
        {data.videoSource ? <div className="ed-video-card">
          {!videoOpen ? <button aria-label={text.video} className="ed-video-card__poster" onClick={() => setVideoOpen(true)} type="button">
            {data.videoPoster ? <span className="ed-video-card__image"><Image alt="" fill loading="lazy" sizes="(max-width: 860px) 100vw, 58vw" src={data.videoPoster} unoptimized /></span> : <span className="ed-video-card__image ed-video-card__image--empty" />}
            <span className="ed-video-card__play">▶</span>
          </button> : data.videoSource.startsWith('https://') && !/\.(mp4|webm|mov)(\?|$)/i.test(data.videoSource)
            ? <iframe allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen className="ed-video-card__player" loading="lazy" src={data.videoSource} title={text.about} />
            : <video autoPlay className="ed-video-card__player" controls playsInline poster={data.videoPoster || undefined} preload="metadata" src={data.videoSource} />}
        </div> : null}
      </div>
    </section> : null}

    {data.showStrength && (data.strengthItems.length || data.strengthGallery.length) ? <section className="ed-section ed-strength">
      <div className="ed-container"><div className="ed-section-heading ed-section-heading--split">
        <div><span className="ed-eyebrow ed-eyebrow--green">{text.strength}</span><h2>{data.settings.strengthTitle || text.strengthHeading}</h2></div>
      </div>
      {data.strengthItems.length ? <div className="ed-stats-grid">{data.strengthItems.map((item, index) => <article key={`${item.title}-${index}`}>
        <strong>{item.value}<small>{item.unit}</small></strong><span>{item.title}</span>
      </article>)}</div> : null}
      {data.strengthGallery.length ? <div className="ed-strength-gallery">{data.strengthGallery.map((item, index) => <figure key={`${item.caption}-${index}`}>
        {imageURL(item) ? <div className="ed-image"><Image alt={item.alt || item.caption || ''} fill loading="lazy" sizes="(max-width: 620px) 46vw, 33vw" src={imageURL(item)} unoptimized /></div> : null}
        {item.caption ? <figcaption><small>{String(index + 1).padStart(2, '0')}</small>{item.caption}</figcaption> : null}
      </figure>)}</div> : null}
      </div>
    </section> : null}

    {data.showCases && data.cases.length ? <section aria-label={text.cases} className="ed-section ed-cases" id="cases"><div className="ed-container">
      <div className="ed-section-heading ed-section-heading--split"><div><span className="ed-eyebrow ed-eyebrow--green">{text.cases}</span>
        <h2>{data.settings.casesTitle || text.casesHeading}</h2></div><Link className="ed-text-link" href={siteHref(data.siteSlug, locale, '/cases')}>{text.all}<ArrowUpRight aria-hidden="true" size={17} /></Link></div>
      <div className="ed-case-grid">{data.cases.slice(0, 8).map((item, index) => <article className="ed-case-card" key={`${item.href}-${index}`}>
        {item.image ? <Link className="ed-image ed-case-card__image" href={item.href}><Image alt={item.imageAlt || item.title} fill loading="lazy" sizes="(max-width: 620px) 48vw, 33vw" src={item.image} unoptimized /></Link> : null}
        <div className="ed-case-card__body">{item.label ? <span className="ed-card-kicker">{item.label}</span> : null}<h3><Link href={item.href}>{item.title}</Link></h3>
          {item.description ? <p>{item.description}</p> : null}<Link href={data.showInquiry ? '#inquiry' : siteHref(data.siteSlug, locale, '/contact')}>{text.contact}<ArrowUpRight aria-hidden="true" size={15} /></Link></div></article>)}</div>
    </div></section> : null}

    {data.showCases && data.cases.length ? <section className="ed-cta-ribbon"><div className="ed-container ed-cta-ribbon__inner">
      <div><strong>{data.settings.caseCTATitle || text.caseCTAHeading}</strong><span>{data.settings.caseCTADescription || text.caseCTADescription}</span></div>
      <Link className="ed-button ed-button--blue" href={data.showInquiry ? '#inquiry' : siteHref(data.siteSlug, locale, '/contact')}>{data.settings.caseCTAButton || text.caseCTAButton}<ArrowRight aria-hidden="true" size={16} /></Link>
    </div></section> : null}

    {data.categories.length ? <section aria-label={text.categories} className="ed-section ed-categories" id="product-categories"><div className="ed-container">
      <div className="ed-section-heading ed-section-heading--center"><span className="ed-eyebrow">{text.categories}</span><h2>{data.settings.categoriesTitle || text.categoriesHeading}</h2></div>
      <div className="ed-category-grid">{data.categories.map((item, index) => <Link className="ed-category-card" href={item.href} key={`${item.href}-${index}`}>
        {item.image ? <Image alt={item.imageAlt || item.title} fill loading="lazy" sizes="(max-width: 620px) 48vw, 25vw" src={item.image} unoptimized /> : null}<span className="ed-category-card__shade" />
        <span className="ed-category-card__meta">{String(index + 1).padStart(2, '0')}{item.label ? ` / ${item.label}` : ''}</span><strong>{item.title}</strong>
        <ArrowUpRight aria-hidden="true" className="ed-category-card__arrow" size={18} />
      </Link>)}</div>
    </div></section> : null}

    {data.showProducts && data.products.length ? <section aria-label={text.products} className="ed-section ed-products" id="products"><div className="ed-container">
      <div className="ed-section-heading ed-section-heading--split"><div><span className="ed-eyebrow ed-eyebrow--green">{text.products}</span><h2>{data.settings.productsTitle || text.productsHeading}</h2></div>
        <Link className="ed-text-link" href={siteHref(data.siteSlug, locale, '/products')}>{text.all}<ArrowUpRight aria-hidden="true" size={17} /></Link></div>
      <div className="ed-product-grid">{data.products.slice(0, 12).map((item, index) => <article className="ed-product-card" key={`${item.href}-${index}`}>
        <Link aria-label={item.title} className="ed-product-card__image-link" href={item.href}>{item.image ? <Image alt={item.imageAlt || item.title} className="ed-product-card__image" height={800} loading="lazy" sizes="(max-width: 620px) 48vw, 25vw" src={item.image} unoptimized width={800} /> : <span className="ed-product-card__image ed-product-card__image--empty" />}
          <span className="ed-product-card__index">{String(index + 1).padStart(2, '0')}</span><span className="ed-product-card__quick"><ArrowUpRight aria-hidden="true" size={19} /></span></Link>
        <div className="ed-product-card__body">{item.category ? <span className="ed-card-kicker">{item.category}</span> : null}<h3><Link href={item.href}>{item.title}</Link></h3>
          {item.description ? <p>{item.description}</p> : null}<Link className="ed-product-card__action" href={data.showInquiry ? '#inquiry' : siteHref(data.siteSlug, locale, '/contact')}>{text.contact}<ArrowRight aria-hidden="true" size={15} /></Link></div>
      </article>)}</div>
    </div></section> : null}

    {data.showProducts && data.products.length ? <section className="ed-product-strip"><div className="ed-container ed-product-strip__inner">
      <strong>{data.settings.productCTATitle || text.productCTAHeading}</strong>
      <span>{data.settings.productCTADescription || text.productCTADescription}</span>
      <Link className="ed-button ed-button--blue" href={data.showInquiry ? '#inquiry' : siteHref(data.siteSlug, locale, '/contact')}>{data.settings.productCTAButton || text.productCTAButton}<ArrowRight aria-hidden="true" size={16} /></Link>
    </div></section> : null}

    {data.showNews && data.news.length ? <section aria-label={text.news} className="ed-section ed-news" id="news"><div className="ed-container">
      <div className="ed-section-heading ed-section-heading--split"><div><span className="ed-eyebrow ed-eyebrow--green">{text.news}</span><h2>{data.settings.newsTitle || text.newsHeading}</h2></div>
        <Link className="ed-text-link" href={siteHref(data.siteSlug, locale, '/news')}>{text.all}<ArrowUpRight aria-hidden="true" size={17} /></Link></div>
      <div className="ed-news-grid">{data.news.slice(0, 6).map((item, index) => <article className="ed-news-card" key={`${item.href}-${index}`}>
        {item.image ? <Link className="ed-news-card__image" href={item.href}><span className="ed-image"><Image alt={item.imageAlt || item.title} fill loading="lazy" sizes="(max-width: 620px) 39vw, 33vw" src={item.image} unoptimized /></span></Link> : null}
        <div className="ed-news-card__body">{item.date ? <time>{item.date}</time> : null}<h3><Link href={item.href}>{item.title}</Link></h3>
          {item.description ? <p>{item.description}</p> : null}<Link className="ed-news-card__action" href={item.href}>{text.all}<ArrowUpRight aria-hidden="true" size={15} /></Link></div></article>)}</div>
    </div></section> : null}

    {data.showFAQ && data.faq.length ? <section aria-label={text.faq} className="ed-section ed-faq" id="faq"><div className="ed-container ed-faq__layout">
      <div className="ed-section-heading"><span className="ed-eyebrow ed-eyebrow--green">FAQ</span><h2>{data.faqTitle || text.faq}</h2></div>
      <div className="ed-faq-list">{data.faq.map((item, index) => <article className="ed-faq-item" data-open={faqOpen === index || undefined} key={`${item.question}-${index}`}>
        <h3><button aria-expanded={faqOpen === index} onClick={() => setFaqOpen((current) => current === index ? null : index)} type="button"><span><b>{String(index + 1).padStart(2, '0')}</b>{item.question}</span><ChevronDown aria-hidden="true" size={17} /></button></h3>
        {faqOpen === index ? <p>{item.answer}</p> : null}</article>)}</div>
    </div></section> : null}

    {data.showInquiry ? <section aria-label={text.inquiry} className="ed-inquiry" id="inquiry"><div className="ed-inquiry__texture" />
      <div className="ed-container ed-inquiry__grid"><div className="ed-inquiry__copy"><span className="ed-eyebrow">{text.inquiry}</span><h2>{data.inquiry.title || text.inquiry}</h2>
        {data.inquiry.description ? <p>{data.inquiry.description}</p> : null}</div>
        <RFQForm labels={{ send: text.send, sending: text.sending, sent: text.sent, error: text.error }} requiredFields={data.inquiry.requiredFields} site={data.siteSlug} />
      </div>
    </section> : null}

    <dialog aria-label={text.close} className="ed-lightbox" onCancel={(event) => { event.preventDefault(); setSelectedCertificate(null) }} onClick={(event) => { if (event.target === event.currentTarget) setSelectedCertificate(null) }} ref={certificateDialog}>
      <button aria-label={text.close} className="ed-dialog-close" onClick={() => setSelectedCertificate(null)} type="button"><X aria-hidden="true" size={20} /></button>
      {selectedCertificate !== null && data.certificates[selectedCertificate] && imageURL(data.certificates[selectedCertificate]) ? <Image alt={data.certificates[selectedCertificate].alt || data.certificates[selectedCertificate].name || ''} height={1600} onClick={(event) => event.stopPropagation()} src={imageURL(data.certificates[selectedCertificate])} unoptimized width={1200} /> : null}
    </dialog>
  </main>
}
