import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Download,
  MessageCircle,
} from 'lucide-react'

import type { SiteLocale } from '@/platform/site-locales'
import { copy } from '@/platform/site'

import { ExecutiveTenantQuoteTrigger } from './ExecutiveTenantQuoteDialog'
import { ExecutiveTenantContactForm } from './ExecutiveTenantContactForm'
import { ExecutiveTenantProductGallery } from './ExecutiveTenantProductGallery'

export type ExecutiveTenantCardItem = {
  id: number
  title: string
  slug: string
  summary?: string | null
  image?: string | null
  label?: string | null
  date?: string | null
}

export type ExecutiveTenantCategory = {
  id: number
  name: string
  slug: string
  description?: string | null
  image?: string | null
}

const pageLabels: Record<
  SiteLocale,
  {
    home: string
    all: string
    productDetails: string
    related: string
    inquire: string
    published: string
    prev: string
    next: string
    first: string
    last: string
    page: string
    faqIntro: string
    contact: string
    follow: string
    message: string
    address: string
    phone: string
    email: string
    whatsapp: string
    submit: string
    category: string
    empty: string
    back: string
    download: string
    details: string
  }
> = {
  zh: {
    home: '主页',
    all: '全部',
    productDetails: '产品详情',
    related: '猜你喜欢',
    inquire: '获取报价',
    published: '发布日期',
    prev: '上一页',
    next: '下一页',
    first: '首页',
    last: '末页',
    page: '页',
    faqIntro: '查看常见问题与回答。',
    contact: '联系方式',
    follow: '关注我们',
    message: '留言咨询',
    address: '地址',
    phone: '电话',
    email: '邮箱',
    whatsapp: 'WhatsApp',
    submit: '提交留言',
    category: '产品分类',
    empty: '暂无已发布内容。',
    back: '返回列表',
    download: '下载产品资料',
    details: '查看详情',
  },
  en: {
    home: 'Home',
    all: 'All',
    productDetails: 'Product details',
    related: 'Related products',
    inquire: 'Get a quote',
    published: 'Published',
    prev: 'Previous',
    next: 'Next',
    first: 'First',
    last: 'Last',
    page: 'Page',
    faqIntro: 'Answers to common questions.',
    contact: 'Contact details',
    follow: 'Follow us',
    message: 'Send a message',
    address: 'Address',
    phone: 'Phone',
    email: 'Email',
    whatsapp: 'WhatsApp',
    submit: 'Submit',
    category: 'Product groups',
    empty: 'No published content yet.',
    back: 'Back to list',
    download: 'Download product materials',
    details: 'Learn more',
  },
  es: {
    home: 'Inicio',
    all: 'Todo',
    productDetails: 'Detalles del producto',
    related: 'Productos relacionados',
    inquire: 'Solicitar cotización',
    published: 'Publicado',
    prev: 'Anterior',
    next: 'Siguiente',
    first: 'Primera',
    last: 'Última',
    page: 'Página',
    faqIntro: 'Respuestas a preguntas frecuentes.',
    contact: 'Contacto',
    follow: 'Síguenos',
    message: 'Enviar mensaje',
    address: 'Dirección',
    phone: 'Teléfono',
    email: 'Correo',
    whatsapp: 'WhatsApp',
    submit: 'Enviar',
    category: 'Categorías',
    empty: 'Aún no hay contenido publicado.',
    back: 'Volver a la lista',
    download: 'Descargar información',
    details: 'Ver detalles',
  },
  ar: {
    home: 'الرئيسية',
    all: 'الكل',
    productDetails: 'تفاصيل المنتج',
    related: 'منتجات ذات صلة',
    inquire: 'طلب عرض سعر',
    published: 'تاريخ النشر',
    prev: 'السابق',
    next: 'التالي',
    first: 'الأولى',
    last: 'الأخيرة',
    page: 'صفحة',
    faqIntro: 'إجابات عن الأسئلة الشائعة.',
    contact: 'معلومات الاتصال',
    follow: 'تابعنا',
    message: 'أرسل رسالة',
    address: 'العنوان',
    phone: 'الهاتف',
    email: 'البريد الإلكتروني',
    whatsapp: 'واتساب',
    submit: 'إرسال',
    category: 'فئات المنتجات',
    empty: 'لا يوجد محتوى منشور بعد.',
    back: 'العودة إلى القائمة',
    download: 'تنزيل مواد المنتج',
    details: 'اعرف المزيد',
  },
  id: {
    home: 'Beranda',
    all: 'Semua',
    productDetails: 'Detail produk',
    related: 'Produk terkait',
    inquire: 'Minta penawaran',
    published: 'Tanggal terbit',
    prev: 'Sebelumnya',
    next: 'Berikutnya',
    first: 'Pertama',
    last: 'Terakhir',
    page: 'Halaman',
    faqIntro: 'Jawaban untuk pertanyaan umum.',
    contact: 'Informasi kontak',
    follow: 'Ikuti kami',
    message: 'Kirim pesan',
    address: 'Alamat',
    phone: 'Telepon',
    email: 'Email',
    whatsapp: 'WhatsApp',
    submit: 'Kirim',
    category: 'Kategori produk',
    empty: 'Belum ada konten yang diterbitkan.',
    back: 'Kembali ke daftar',
    download: 'Unduh materi produk',
    details: 'Lihat detail',
  },
  de: {
    home: 'Startseite',
    all: 'Alle',
    productDetails: 'Produktdetails',
    related: 'Ähnliche Produkte',
    inquire: 'Angebot anfordern',
    published: 'Veröffentlicht',
    prev: 'Zurück',
    next: 'Weiter',
    first: 'Erste',
    last: 'Letzte',
    page: 'Seite',
    faqIntro: 'Antworten auf häufige Fragen.',
    contact: 'Kontaktdaten',
    follow: 'Folgen Sie uns',
    message: 'Nachricht senden',
    address: 'Adresse',
    phone: 'Telefon',
    email: 'E-Mail',
    whatsapp: 'WhatsApp',
    submit: 'Senden',
    category: 'Produktkategorien',
    empty: 'Noch keine Inhalte veröffentlicht.',
    back: 'Zurück zur Liste',
    download: 'Produktunterlagen laden',
    details: 'Mehr erfahren',
  },
  ru: {
    home: 'Главная',
    all: 'Все',
    productDetails: 'Описание товара',
    related: 'Похожие товары',
    inquire: 'Запросить цену',
    published: 'Дата публикации',
    prev: 'Назад',
    next: 'Далее',
    first: 'Первая',
    last: 'Последняя',
    page: 'Страница',
    faqIntro: 'Ответы на частые вопросы.',
    contact: 'Контакты',
    follow: 'Следите за нами',
    message: 'Отправить сообщение',
    address: 'Адрес',
    phone: 'Телефон',
    email: 'Эл. почта',
    whatsapp: 'WhatsApp',
    submit: 'Отправить',
    category: 'Категории товаров',
    empty: 'Опубликованных материалов пока нет.',
    back: 'Вернуться к списку',
    download: 'Скачать материалы',
    details: 'Подробнее',
  },
}

const pathFor = (siteSlug: string, locale: SiteLocale, path: string) =>
  `/s/${siteSlug}/${locale}${path ? `/${path.replace(/^\//, '')}` : ''}`
const specificationLabels: Record<SiteLocale, string> = {
  zh: '技术参数',
  en: 'Specifications',
  es: 'Especificaciones',
  ar: 'المواصفات',
  id: 'Spesifikasi',
  de: 'Technische Daten',
  ru: 'Характеристики',
}
const image = (
  src: string | null | undefined,
  alt: string,
  sizes = '(max-width: 700px) 90vw, 30vw',
) => (src ? <Image alt={alt} fill sizes={sizes} src={src} unoptimized /> : null)

function Breadcrumb({
  siteSlug,
  locale,
  section,
  current,
}: {
  siteSlug: string
  locale: SiteLocale
  section: string
  current?: string
}) {
  const t = pageLabels[locale]
  return (
    <nav aria-label={locale === 'zh' ? '面包屑' : 'Breadcrumb'} className="ed-inner-crumb">
      <Link href={pathFor(siteSlug, locale, '')}>{t.home}</Link>
      <ChevronRight aria-hidden="true" size={13} />
      <span>{section}</span>
      {current ? (
        <>
          <ChevronRight aria-hidden="true" size={13} />
          <span aria-current="page">{current}</span>
        </>
      ) : null}
    </nav>
  )
}

function PageIntro({
  eyebrow,
  title,
  description,
  locale,
  quote = true,
}: {
  eyebrow: string
  title: string
  description?: string | null
  locale: SiteLocale
  quote?: boolean
}) {
  return (
    <section className="ed-inner-intro">
      <div>
        <span className="ed-eyebrow ed-eyebrow--green">{eyebrow.toUpperCase()}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {quote ? (
        <ExecutiveTenantQuoteTrigger>
          {copy[locale].quote}
          <ArrowRight aria-hidden="true" size={16} />
        </ExecutiveTenantQuoteTrigger>
      ) : null}
    </section>
  )
}

function Pager({
  href,
  locale,
  page,
  totalPages,
  query = '',
}: {
  href: string
  locale: SiteLocale
  page: number
  totalPages: number
  query?: string
}) {
  if (totalPages <= 1) return null
  const target = (nextPage: number) => `${href}?${query ? `${query}&` : ''}page=${nextPage}`
  const links = [
    { label: pageLabels[locale].first, target: 1, disabled: page <= 1 },
    { label: pageLabels[locale].prev, target: page - 1, disabled: page <= 1 },
    { label: `${page} / ${totalPages}`, target: page, disabled: true, current: true },
    { label: pageLabels[locale].next, target: page + 1, disabled: page >= totalPages },
    { label: pageLabels[locale].last, target: totalPages, disabled: page >= totalPages },
  ]
  return (
    <nav aria-label="Pagination" className="ed-page-pager">
      {links.map((item, index) =>
        item.current ? (
          <span aria-current="page" key={index}>
            {item.label}
          </span>
        ) : item.disabled ? (
          <a aria-disabled="true" key={index}>
            {item.label}
          </a>
        ) : (
          <Link href={target(item.target)} key={index}>
            {item.label}
          </Link>
        ),
      )}
    </nav>
  )
}

export function ExecutiveTenantProductList({
  siteSlug,
  locale,
  categories,
  activeCategory,
  items,
  page,
  totalPages,
  total,
}: {
  siteSlug: string
  locale: SiteLocale
  categories: ExecutiveTenantCategory[]
  activeCategory?: string
  items: ExecutiveTenantCardItem[]
  page: number
  totalPages: number
  total: number
}) {
  const t = pageLabels[locale]
  const base = pathFor(siteSlug, locale, '/products')
  const selected = categories.find((item) => item.slug === activeCategory)
  const categoryLink = (slug?: string) =>
    `${base}${slug ? `?category=${encodeURIComponent(slug)}` : ''}`
  return (
    <main className="ed-inner-page ed-list-page" id="main-content">
      <Breadcrumb locale={locale} section={copy[locale].products} siteSlug={siteSlug} />
      <div className="ed-container">
        <PageIntro
          description={selected?.description || null}
          eyebrow={copy[locale].products}
          locale={locale}
          title={selected?.name || copy[locale].products}
        />
        <div className="ed-product-list-layout">
          <aside className="ed-product-list-sidebar">
            <strong className="ed-product-list-sidebar__title">{t.category}</strong>
            <Link aria-current={!activeCategory ? 'page' : undefined} href={categoryLink()}>
              {t.all}
            </Link>
            {categories.map((item) => (
              <Link
                aria-current={item.slug === activeCategory ? 'page' : undefined}
                href={categoryLink(item.slug)}
                key={item.id}
              >
                {item.name}
              </Link>
            ))}
          </aside>
          <section aria-label={copy[locale].products} className="ed-list-main">
            <div className="ed-list-toolbar">
              <h2>{selected?.name || copy[locale].products}</h2>
              <span>{total}</span>
            </div>
            {items.length ? (
              <div className="ed-inner-card-grid">
                {items.map((item) => (
                  <article className="ed-inner-product-card" key={item.id}>
                    <Link
                      aria-label={`${item.title} — ${t.details}`}
                      className="ed-inner-product-card__image"
                      href={pathFor(siteSlug, locale, `/products/${item.slug}`)}
                    >
                      {image(item.image || null, item.title)}
                      {item.label ? <span>{item.label}</span> : null}
                    </Link>
                    <div>
                      <small>{item.label || copy[locale].products}</small>
                      <h3>
                        <Link href={pathFor(siteSlug, locale, `/products/${item.slug}`)}>
                          {item.title}
                        </Link>
                      </h3>
                      {item.summary ? <p>{item.summary}</p> : null}
                      <Link
                        className="ed-text-link"
                        href={pathFor(siteSlug, locale, `/products/${item.slug}`)}
                      >
                        {t.details}
                        <ArrowRight aria-hidden="true" size={14} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ed-inner-empty">
                <p>{t.empty}</p>
              </div>
            )}
            <Pager
              href={base}
              locale={locale}
              page={page}
              query={activeCategory ? `category=${encodeURIComponent(activeCategory)}` : ''}
              totalPages={totalPages}
            />
          </section>
        </div>
      </div>
    </main>
  )
}

export function ExecutiveTenantStoryList({
  siteSlug,
  locale,
  kind,
  items,
  page,
  totalPages,
  total,
  filter,
}: {
  siteSlug: string
  locale: SiteLocale
  kind: 'news' | 'cases'
  items: ExecutiveTenantCardItem[]
  page: number
  totalPages: number
  total: number
  filter?: { key: string; value: string; label: string }
}) {
  const title = kind === 'news' ? copy[locale].news : copy[locale].cases
  const base = pathFor(siteSlug, locale, `/${kind}`)
  return (
    <main className="ed-inner-page ed-list-page" id="main-content">
      <Breadcrumb locale={locale} section={title} siteSlug={siteSlug} />
      <div className="ed-container">
        <PageIntro
          description={copy[locale].insightsIntro}
          eyebrow={title}
          locale={locale}
          title={title}
        />
        {filter ? (
          <nav
            aria-label={locale === 'zh' ? '分类筛选' : 'Category filters'}
            className="ed-category-filter"
          >
            <Link href={base}>{pageLabels[locale].all}</Link>
            <Link
              aria-current="page"
              href={`${base}?${filter.key}=${encodeURIComponent(filter.value)}`}
            >
              {filter.label}
            </Link>
          </nav>
        ) : null}
        <section aria-label={title}>
          <div className="ed-list-toolbar">
            <h2>{title}</h2>
            <span>{total}</span>
          </div>
          <div className={`ed-inner-card-grid ed-inner-card-grid--${kind}`}>
            {items.length ? (
              items.map((item) => (
                <article className="ed-inner-story-card" key={item.id}>
                  <Link
                    aria-label={`${item.title} — ${pageLabels[locale].details}`}
                    className="ed-inner-story-card__image"
                    href={pathFor(siteSlug, locale, `/${kind}/${item.slug}`)}
                  >
                    {image(item.image || null, item.title)}
                  </Link>
                  <div>
                    <small>{item.date || item.label || title}</small>
                    <h2>
                      <Link href={pathFor(siteSlug, locale, `/${kind}/${item.slug}`)}>
                        {item.title}
                      </Link>
                    </h2>
                    {item.summary ? <p>{item.summary}</p> : null}
                    <Link
                      className="ed-text-link"
                      href={pathFor(siteSlug, locale, `/${kind}/${item.slug}`)}
                    >
                      {pageLabels[locale].details}
                      <ArrowRight aria-hidden="true" size={14} />
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <div className="ed-inner-empty">
                <p>{pageLabels[locale].empty}</p>
              </div>
            )}
          </div>
          <Pager
            href={base}
            locale={locale}
            page={page}
            query={filter ? `${filter.key}=${encodeURIComponent(filter.value)}` : ''}
            totalPages={totalPages}
          />
        </section>
      </div>
    </main>
  )
}

export function ExecutiveTenantProductDetail({
  siteSlug,
  locale,
  item,
  gallery,
  related,
  categories,
  specs,
  description,
  datasheet,
  phone,
  email,
}: {
  siteSlug: string
  locale: SiteLocale
  item: ExecutiveTenantCardItem & {
    categoryId: number
    categorySlug?: string
    tags: string[]
    productId: number
  }
  gallery: Array<{ url: string; alt: string }>
  related: ExecutiveTenantCardItem[]
  categories: ExecutiveTenantCategory[]
  specs: Array<{ id?: string | number; label: string; value: string }>
  description: ReactNode
  datasheet?: string | null
  phone?: string | null
  email?: string | null
}) {
  const t = pageLabels[locale]
  const category = categories.find((entry) => entry.id === item.categoryId)
  const contactPath = pathFor(siteSlug, locale, '/contact')
  return (
    <main className="ed-inner-page ed-product-detail" id="main-content">
      <Breadcrumb
        current={item.title}
        locale={locale}
        section={copy[locale].products}
        siteSlug={siteSlug}
      />
      <div className="ed-product-detail__top">
        <ExecutiveTenantProductGallery images={gallery} locale={locale} title={item.title} />
        <div className="ed-product-detail__summary">
          <span className="ed-eyebrow ed-eyebrow--green">
            {category?.name || copy[locale].products}
          </span>
          <h1>{item.title}</h1>
          {item.summary ? <p>{item.summary}</p> : null}
          {item.tags.length ? (
            <div className="ed-product-detail__tags">
              {item.tags.slice(0, 6).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
          <div className="ed-product-detail__actions">
            <ExecutiveTenantQuoteTrigger product={item.title} productId={item.productId}>
              {t.inquire}
              <ArrowRight aria-hidden="true" size={16} />
            </ExecutiveTenantQuoteTrigger>
            {datasheet ? (
              <a className="ed-button ed-button--document" download href={datasheet}>
                <Download aria-hidden="true" size={16} />
                {t.download}
              </a>
            ) : null}
          </div>
        </div>
      </div>
      <div className="ed-product-detail__body">
        <article>
          <nav aria-label={t.productDetails} className="ed-product-detail__tabs">
            <a href="#product-copy">{t.productDetails}</a>
            {related.length ? <a href="#related-products">{t.related}</a> : null}
          </nav>
          <div className="ed-product-detail__rich" id="product-copy">
            {description}
          </div>
          {specs.length ? (
            <section className="site-specs">
              <h2>{specificationLabels[locale]}</h2>
              {specs.map((spec, index) => (
                <div key={spec.id || `${spec.label}-${index}`}>
                  <span>{spec.label}</span>
                  <strong>{spec.value}</strong>
                </div>
              ))}
            </section>
          ) : null}
        </article>
        <aside className="ed-product-detail__aside">
          <section>
            <span>{t.category.toUpperCase()}</span>
            <h2>{category?.name || copy[locale].products}</h2>
            {category ? (
              <Link
                href={pathFor(
                  siteSlug,
                  locale,
                  `/products?category=${encodeURIComponent(category.slug)}`,
                )}
              >
                {t.details}
                <ArrowRight aria-hidden="true" size={15} />
              </Link>
            ) : null}
          </section>
          <section>
            <span>{locale === 'zh' ? '快速咨询' : 'QUICK INQUIRY'}</span>
            {phone ? <a href={`tel:${phone}`}>{phone}</a> : null}
            {email ? <a href={`mailto:${email}`}>{email}</a> : null}
            <Link className="ed-button ed-button--blue" href={contactPath}>
              {copy[locale].contact}
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </section>
        </aside>
      </div>
      {related.length ? (
        <section className="ed-related" id="related-products">
          <div className="ed-section-heading ed-section-heading--center">
            <span className="ed-eyebrow ed-eyebrow--green">{t.related.toUpperCase()}</span>
            <h2>{t.related}</h2>
          </div>
          <div className="ed-related__rail">
            {related.map((product) => (
              <Link
                className="ed-related-card"
                href={pathFor(siteSlug, locale, `/products/${product.slug}`)}
                key={product.id}
              >
                <div>
                  {image(product.image || null, product.title, '(max-width: 700px) 70vw, 250px')}
                </div>
                <strong>
                  {product.title}
                  <ArrowUpRight aria-hidden="true" size={14} />
                </strong>
                <span>{product.label || copy[locale].products}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

export function ExecutiveTenantStoryDetail({
  siteSlug,
  locale,
  kind,
  title,
  summary,
  label,
  date,
  imageURL,
  body,
  related = [],
}: {
  siteSlug: string
  locale: SiteLocale
  kind: 'news' | 'cases'
  title: string
  summary?: string | null
  label?: string | null
  date?: string | null
  imageURL?: string | null
  body: ReactNode
  related?: ExecutiveTenantCardItem[]
}) {
  const section = kind === 'news' ? copy[locale].news : copy[locale].cases
  return (
    <main className="ed-inner-page ed-story-detail" id="main-content">
      <Breadcrumb current={title} locale={locale} section={section} siteSlug={siteSlug} />
      <header className="ed-story-detail__head">
        <Link className="ed-story-back" href={pathFor(siteSlug, locale, `/${kind}`)}>
          <ArrowLeft aria-hidden="true" size={14} />
          {pageLabels[locale].back}
        </Link>
        <span className="ed-eyebrow ed-eyebrow--green">{label || section}</span>
        <h1>{title}</h1>
        {summary ? <p>{summary}</p> : null}
        {date ? <small>{date}</small> : null}
      </header>
      {imageURL ? (
        <div className="ed-story-detail__cover">
          {image(imageURL, title, '(max-width: 700px) 100vw, 1180px')}
        </div>
      ) : null}
      <article className="ed-story-detail__body">{body}</article>
      <div className="ed-story-detail__cta">
        <strong>
          {locale === 'zh' ? '想了解更多项目信息？' : 'Would you like to discuss a project?'}
        </strong>
        <ExecutiveTenantQuoteTrigger>
          {pageLabels[locale].inquire}
          <ArrowRight aria-hidden="true" size={15} />
        </ExecutiveTenantQuoteTrigger>
      </div>
      {related.length ? (
        <section className="ed-related">
          <div className="ed-section-heading ed-section-heading--center">
            <h2>{locale === 'zh' ? '相关阅读' : 'Related stories'}</h2>
          </div>
          <div className="ed-related__rail">
            {related.map((item) => (
              <Link
                className="ed-related-card"
                href={pathFor(siteSlug, locale, `/${kind}/${item.slug}`)}
                key={item.id}
              >
                <div>{image(item.image || null, item.title)}</div>
                <strong>
                  {item.title}
                  <ArrowUpRight aria-hidden="true" size={14} />
                </strong>
                <span>{item.date || item.label || section}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

export function ExecutiveTenantAbout({
  siteSlug,
  locale,
  title,
  intro,
  heroImage,
  modules,
}: {
  siteSlug: string
  locale: SiteLocale
  title: string
  intro?: string | null
  heroImage?: string | null
  modules: Array<{
    id: number | string
    title?: string | null
    description?: string | null
    image?: string | null
  }>
}) {
  return (
    <main className="ed-inner-page ed-about-page" id="main-content">
      <Breadcrumb locale={locale} section={copy[locale].about} siteSlug={siteSlug} />
      <section
        className="ed-about-page__hero ed-about-page__hero--tenant"
        style={
          heroImage
            ? {
                backgroundImage: `linear-gradient(90deg,rgba(18,28,24,.84),rgba(18,28,24,.45)),url("${heroImage}")`,
              }
            : undefined
        }
      >
        <div>
          <span className="ed-eyebrow ed-eyebrow--green">{copy[locale].about}</span>
          <h1>{title}</h1>
          {intro ? <p>{intro}</p> : null}
        </div>
      </section>
      {modules.length ? (
        <section className="ed-about-page__modules">
          {modules.map((item, index) => (
            <article
              className={`ed-about-module ${index % 2 ? 'ed-about-module--reverse' : ''}`}
              key={item.id}
            >
              {item.image ? (
                <div className="ed-about-module__image">
                  {image(item.image, item.title || title, '(max-width: 700px) 92vw, 50vw')}
                </div>
              ) : null}
              <div>
                <span className="ed-eyebrow ed-eyebrow--green">{copy[locale].about}</span>
                {item.title ? <h2>{item.title}</h2> : null}
                {item.description ? <p>{item.description}</p> : null}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className="ed-container">
          <div className="ed-inner-empty">
            <p>{pageLabels[locale].empty}</p>
          </div>
        </div>
      )}
    </main>
  )
}

export function ExecutiveTenantFAQPage({
  siteSlug,
  locale,
  items,
  page,
  totalPages,
}: {
  siteSlug: string
  locale: SiteLocale
  items: Array<{ id: number; question: string; answer: ReactNode }>
  page: number
  totalPages: number
}) {
  const title: Record<SiteLocale, string> = {
    zh: '常见问题',
    en: 'Frequently asked questions',
    es: 'Preguntas frecuentes',
    ar: 'الأسئلة الشائعة',
    id: 'Pertanyaan umum',
    de: 'Häufige Fragen',
    ru: 'Частые вопросы',
  }
  const pageTitle = title[locale]
  const base = pathFor(siteSlug, locale, '/faqs')
  return (
    <main className="ed-inner-page ed-faq-page" id="main-content">
      <Breadcrumb locale={locale} section={pageTitle} siteSlug={siteSlug} />
      <div className="ed-faq-page__intro">
        <span className="ed-eyebrow ed-eyebrow--green">FAQ</span>
        <h1>{pageTitle}</h1>
        <p>{pageLabels[locale].faqIntro}</p>
      </div>
      <section aria-label={pageTitle} className="ed-faq-page__list">
        {items.length ? (
          items.map((item, index) => (
            <details className="ed-faq-page__item" key={item.id}>
              <summary>
                <span>
                  <small>{String((page - 1) * 10 + index + 1).padStart(2, '0')}</small>
                  {item.question}
                </span>
                <span aria-hidden="true" className="ed-faq-page__plus" />
              </summary>
              <div className="ed-faq-page__answer">{item.answer}</div>
            </details>
          ))
        ) : (
          <div className="ed-inner-empty">
            <p>{pageLabels[locale].empty}</p>
          </div>
        )}
        <Pager href={base} locale={locale} page={page} totalPages={totalPages} />
      </section>
    </main>
  )
}

export function ExecutiveTenantContact({
  siteSlug,
  locale,
  title,
  intro,
  phone,
  email,
  address,
  whatsapp,
  qrs,
  requiredFields,
  backgroundImage,
  showForm = true,
}: {
  siteSlug: string
  locale: SiteLocale
  title: string
  intro?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  whatsapp?: string | null
  qrs: Array<{ label: string; src: string }>
  requiredFields?: Record<string, boolean>
  backgroundImage?: string | null
  showForm?: boolean
}) {
  const t = pageLabels[locale]
  return (
    <main className="ed-inner-page ed-contact-page" id="main-content">
      <Breadcrumb locale={locale} section={copy[locale].contact} siteSlug={siteSlug} />
      <section
        className="ed-contact-page__backdrop ed-contact-page__backdrop--tenant"
        style={
          backgroundImage
            ? {
                backgroundImage: `linear-gradient(rgba(16,25,21,.58),rgba(16,25,21,.58)),url("${backgroundImage}")`,
              }
            : undefined
        }
      >
        <div className={`ed-contact-card${showForm ? '' : ' ed-contact-card--no-form'}`}>
          <section className="ed-contact-info">
            <span className="ed-eyebrow ed-eyebrow--green">{copy[locale].contact}</span>
            <h1>{title}</h1>
            {intro ? <p>{intro}</p> : null}
            <dl>
              {phone ? (
                <div>
                  <dt>{t.phone}</dt>
                  <dd>
                    <a href={`tel:${phone}`}>{phone}</a>
                  </dd>
                </div>
              ) : null}
              {whatsapp ? (
                <div>
                  <dt>{t.whatsapp}</dt>
                  <dd>
                    <a
                      aria-label={`${t.whatsapp}: ${whatsapp}`}
                      className="ed-contact-whatsapp"
                      href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <MessageCircle aria-hidden="true" size={16} />
                      {whatsapp}
                    </a>
                  </dd>
                </div>
              ) : null}
              {email ? (
                <div>
                  <dt>{t.email}</dt>
                  <dd>
                    <a href={`mailto:${email}`}>{email}</a>
                  </dd>
                </div>
              ) : null}
              {address ? (
                <div>
                  <dt>{t.address}</dt>
                  <dd>{address}</dd>
                </div>
              ) : null}
            </dl>
            {qrs.length ? (
              <>
                <h2>{t.follow}</h2>
                <div className="ed-contact-qr ed-contact-qr--tenant">
                  {qrs.map((qr) => (
                    <figure key={qr.label}>
                      <Image
                        alt={`${qr.label} QR code`}
                        height={132}
                        src={qr.src}
                        unoptimized
                        width={132}
                      />
                      <figcaption>{qr.label}</figcaption>
                    </figure>
                  ))}
                </div>
              </>
            ) : null}
          </section>
          {showForm ? (
            <section className="ed-contact-form-wrap">
              <h2>{t.message}</h2>
              <ExecutiveTenantContactForm
                locale={locale}
                requiredFields={requiredFields}
                site={siteSlug}
              />
            </section>
          ) : null}
        </div>
      </section>
    </main>
  )
}
