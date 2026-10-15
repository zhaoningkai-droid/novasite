import { selectedNewTemplate } from '@/platform/new-templates/selected'
import { TemplateShell } from '@/platform/new-templates/Shell'
import '@/platform/new-templates/templates.css'
import Image from 'next/image'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { copy, getBaseURL, getSite, isSiteLocale, jsonLD, locales, siteHref } from '@/platform/site'
import {
  ExecutiveTenantHeader,
  type ExecutiveNavigationGroup,
} from '@/platform/legacy-templates/ExecutiveTenantHeader'
import { ExecutiveTenantQuoteDialog } from '@/platform/legacy-templates/ExecutiveTenantQuoteDialog'
import { CustomerBrand } from '@/platform/components/CustomerBrand/CustomerBrand'
import { sortedNavigation } from '@/platform/navigation-model'
import { GeistSans } from 'geist/font/sans'

import '../../../../(frontend)/globals.css'
import './site.css'
import './atelier.css'
import '@/app/(sites)/template-demo/[key]/[lang]/executive-demo.css'

type Props = { children: React.ReactNode; params: Promise<{ lang: string; site: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) return {}
  const site = await getSite(siteSlug, lang)
  if (!site) return {}
  const enabledLocales = [...(site.enabledLocales?.length ? site.enabledLocales : locales)]
  if (!enabledLocales.includes(lang)) return {}
  const baseURL = getBaseURL(site, siteSlug)
  const title = site.branding.companyName
  const description = site.seo?.defaultDescription || site.branding.tagline || title
  const favicon = typeof site.branding.favicon === 'object' ? site.branding.favicon?.url : undefined

  return {
    metadataBase: new URL(baseURL),
    title: { default: title, template: `%s · ${site.seo?.titleSuffix || title}` },
    description,
    alternates: {
      canonical: `${baseURL}/${lang}`,
      languages: Object.fromEntries(
        enabledLocales.map((locale) => [locale, `${baseURL}/${locale}`]),
      ),
    },
    robots: site.seo?.indexingEnabled
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: { title, description, type: 'website', url: `${baseURL}/${lang}` },
    icons: favicon ? { icon: favicon } : undefined,
    verification: site.seo?.googleSiteVerification
      ? { google: site.seo.googleSiteVerification }
      : undefined,
  }
}

export default async function SiteLayout({ children, params }: Props) {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const enabledLocales = [...(site.enabledLocales?.length ? site.enabledLocales : locales)]
  if (!enabledLocales.includes(lang)) notFound()
  const newTemplate = selectedNewTemplate(site)
  if (newTemplate)
    return (
      <html
        className={GeistSans.variable}
        data-theme="light"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        lang={lang}
        suppressHydrationWarning
      >
        <body>
          <TemplateShell
            site={site}
            locale={lang}
            template={newTemplate}
            base={`/s/${siteSlug}/${lang}`}
          >
            {children}
          </TemplateShell>
        </body>
      </html>
    )
  const primary = site.branding.primaryColor || '#0B3B60'
  const accent = site.branding.accentColor || '#F97316'
  const t = copy[lang]
  const logo = typeof site.branding.logo === 'object' ? site.branding.logo : null
  const selectedTemplate =
    site.selectedTemplate && typeof site.selectedTemplate === 'object'
      ? site.selectedTemplate
      : null
  const templateKey = selectedTemplate?.key || 'power-engineering-v1'
  const templateClass =
    templateKey === 'atelier-industry-v1'
      ? 'site-shell--atelier'
      : templateKey === 'executive-industrial-pro-v1'
        ? 'site-shell--executive'
        : templateKey === 'precision-light-v1'
          ? 'site-shell--technical'
          : 'site-shell--industrial'
  const payload = await getPayload({ config: configPromise })
  const navigationDocument = await payload.find({
    collection: 'site-navigation',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { and: [{ tenant: { equals: site.id } }, { localeCode: { equals: lang } }] },
  })
  const storedNavigation = navigationDocument.docs[0]?.items?.length
    ? sortedNavigation(navigationDocument.docs[0].items)
    : [
        { label: t.products, href: '/products' },
        { label: t.news, href: '/news' },
        { label: t.cases, href: '/cases' },
        { label: t.blog, href: '/blog' },
        { label: t.about, href: '/about' },
        { label: t.contact, href: '/contact' },
      ]
  const faqLabel =
    lang === 'zh'
      ? '常见问题'
      : lang === 'ru'
        ? 'Частые вопросы'
        : lang === 'id'
          ? 'Pertanyaan umum'
          : lang === 'ar'
            ? 'الأسئلة الشائعة'
            : lang === 'es'
              ? 'Preguntas frecuentes'
              : lang === 'de'
                ? 'Häufige Fragen'
                : 'FAQ'
  const menuLabel =
    lang === 'zh'
      ? '菜单'
      : lang === 'ru'
        ? 'Меню'
        : lang === 'ar'
          ? 'القائمة'
          : lang === 'es'
            ? 'Menú'
            : lang === 'de'
              ? 'Menü'
              : 'Menu'
  // Old workspaces used `/faq`; normalize it on output so it stays a single working FAQ entry.
  const navigation = [...storedNavigation, { href: '/faqs', label: faqLabel }].reduce<
    typeof storedNavigation
  >((items, item) => {
    const href = item.href === '/faq' ? '/faqs' : item.href
    return href && items.some((existing) => existing.href === href) ? items : [...items, { ...item, href }]
  }, [])
  const footer = navigationDocument.docs[0]
  const isExecutive = templateKey === 'executive-industrial-pro-v1'
  const inquiryRequiredFields =
    (site.fixedPages?.homepage as { inquiryRequiredFields?: Record<string, boolean> } | undefined)
      ?.inquiryRequiredFields || {}
  const defaultExecutiveNavigation = [
    { href: '/', label: lang === 'zh' ? '主页' : 'Home' },
    { href: '/products', label: lang === 'zh' ? '产品' : 'Products' },
    { href: '/news', label: lang === 'zh' ? '新闻' : 'News' },
    { href: '/cases', label: lang === 'zh' ? '案例' : 'Cases' },
    { href: '/about', label: lang === 'zh' ? '关于我们' : 'About us' },
    { href: '/faqs', label: faqLabel },
    { href: '/contact', label: lang === 'zh' ? '联系我们' : 'Contact' },
  ]
  const canonicalNavigation = isExecutive ? (storedNavigation.length ? navigation : defaultExecutiveNavigation)
    .map((item, index) => ({ ...item, key: ({ '/products': 'products', '/news': 'news', '/cases': 'cases', '/faqs': 'faq', '/': 'home' } as Record<string, string>)[item.href] || `custom-${index}` })) : []
  let executiveGroups: ExecutiveNavigationGroup[] = []
  if (isExecutive) {
    const [productCategoryResult, newsCategoryResult, caseResult] = await Promise.all([
      payload.find({
        collection: 'product-categories',
        depth: 0,
        limit: 80,
        locale: lang,
        overrideAccess: true,
        sort: 'sortOrder',
        where: { tenant: { equals: site.id } },
      }),
      payload.find({
        collection: 'news-categories',
        depth: 0,
        limit: 80,
        locale: lang,
        overrideAccess: true,
        sort: 'sortOrder',
        where: { tenant: { equals: site.id } },
      }),
      payload.find({
        collection: 'cases',
        depth: 0,
        limit: 100,
        locale: lang,
        overrideAccess: true,
        where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] },
      }),
    ])
    const productChildren = productCategoryResult.docs
      .filter((item) => item.slug && item.name)
      .map((item) => ({
        href: `/products?category=${encodeURIComponent(item.slug)}`,
        label: item.name,
      }))
    const newsChildren = newsCategoryResult.docs
      .filter((item) => item.slug && item.name)
      .map((item) => ({
        href: `/news?category=${encodeURIComponent(item.slug)}`,
        label: item.name,
      }))
    const caseLabels = [
      ...new Set(
        caseResult.docs
          .map((item) => item.industry?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ].sort()
    executiveGroups = [
      {
        key: 'products',
        label: canonicalNavigation.find((item) => item.key === 'products')?.label || defaultExecutiveNavigation[1].label,
        href: '/products',
        children: productChildren,
      },
      { key: 'news', label: canonicalNavigation.find((item) => item.key === 'news')?.label || defaultExecutiveNavigation[2].label, href: '/news', children: newsChildren },
      {
        key: 'cases',
        label: canonicalNavigation.find((item) => item.key === 'cases')?.label || defaultExecutiveNavigation[3].label,
        href: '/cases',
        children: caseLabels.map((label) => ({
          href: `/cases?industry=${encodeURIComponent(label)}`,
          label,
        })),
      },
    ]
  }
  const homepageFooter = site.fixedPages?.footer
  const executiveFooter = homepageFooter as
    | (typeof homepageFooter & {
        backgroundImage?: { url?: string | null } | number | null
        backgroundOverlay?: number | null
      })
    | undefined
  const footerBackground =
    typeof executiveFooter?.backgroundImage === 'object'
      ? executiveFooter.backgroundImage?.url || ''
      : ''
  const footerOverlay = Math.max(
    0,
    Math.min(0.85, Number(executiveFooter?.backgroundOverlay ?? 0.65)),
  )
  const socialLinks = (homepageFooter?.socialLinks || {}) as Record<string, string>
  const activeSocialLinks = Object.entries(socialLinks).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1]),
  )
  const toSiteHref = (href: string) => siteHref(siteSlug, lang, href === '/' ? '' : href)

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.branding.companyName,
    url: `${getBaseURL(site, siteSlug)}/${lang}`,
    email: site.contact?.email,
    sameAs: site.contact?.linkedin ? [site.contact.linkedin] : [],
  }

  return (
    <html
      className={GeistSans.variable}
      data-theme="light"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      lang={lang}
      suppressHydrationWarning
    >
      <body>
        <div
          className={`site-shell ${templateClass}`}
          data-template={templateKey}
          style={{ '--site-primary': primary, '--site-accent': accent } as React.CSSProperties}
        >
          {isExecutive ? (
            <ExecutiveTenantHeader
              companyName={site.branding.companyName}
              headerText={site.branding.headerText || ''}
              enabledLocales={enabledLocales}
              groups={executiveGroups}
              locale={lang}
              logo={logo?.url || undefined}
              navigation={canonicalNavigation}
              siteSlug={siteSlug}
            />
          ) : (
            <header className="site-header">
              <div className="site-wrap site-header__inner">
                <CustomerBrand className="site-logo" href={siteHref(siteSlug, lang)} companyName={site.branding.companyName} headerText={site.branding.headerText} logo={logo?.url} />
                <nav className="site-nav" aria-label="Primary navigation">
                  {navigation.map((item) =>
                    item.children?.length ? (
                      <details className="site-nav-menu" key={item.id || item.href}>
                        <summary>{item.label}</summary>
                        <div className="site-nav-menu__panel">
                          <Link href={toSiteHref(item.href)}>{item.label}</Link>
                          {item.children.map((child) => (
                            <Link href={toSiteHref(child.href)} key={child.id || child.href}>
                              {child.label}
                            </Link>
                          ))}
                        </div>
                      </details>
                    ) : (
                      <Link href={toSiteHref(item.href)} key={item.id || item.href}>
                        {item.label}
                      </Link>
                    ),
                  )}
                  <div className="site-languages">
                    {enabledLocales.map((locale) => (
                      <Link href={siteHref(siteSlug, locale)} key={locale}>
                        {locale}
                      </Link>
                    ))}
                  </div>
                  <Link className="site-quote" href={siteHref(siteSlug, lang, '/contact')}>
                    {t.quote}
                  </Link>
                </nav>
                <details className="site-mobile-menu">
                  <summary aria-label={menuLabel}>{menuLabel}</summary>
                  <div>
                    {navigation.map((item) => (
                      <Link href={toSiteHref(item.href)} key={`mobile-${item.id || item.href}`}>
                        {item.label}
                      </Link>
                    ))}
                    {enabledLocales.map((locale) => (
                      <Link href={siteHref(siteSlug, locale)} key={`mobile-${locale}`}>
                        {locale.toUpperCase()}
                      </Link>
                    ))}
                    <Link className="site-quote" href={siteHref(siteSlug, lang, '/contact')}>
                      {t.quote}
                    </Link>
                  </div>
                </details>
              </div>
            </header>
          )}
          {isExecutive ? (
            <ExecutiveTenantQuoteDialog
              locale={lang}
              requiredFields={inquiryRequiredFields}
              site={siteSlug}
            />
          ) : null}
          {children}
          {isExecutive ? (
            <footer className="ed-footer">
              <div
                className="ed-footer__background"
                style={
                  footerBackground ? { backgroundImage: `url(${footerBackground})` } : undefined
                }
              />
              <div
                className="ed-footer__shade"
                style={{ background: `rgba(14, 21, 20, ${footerOverlay})` }}
              />
              <div className="ed-container ed-footer__content">
                <div className="ed-footer__brand">
                  <a
                    aria-label={site.branding.companyName}
                    className="ed-brand"
                    href={siteHref(siteSlug, lang)}
                  >
                    {logo?.url ? (
                      <Image
                        alt=""
                        className="ed-brand__logo"
                        height={54}
                        src={logo.url}
                        unoptimized
                        width={170}
                      />
                    ) : (
                      <span aria-hidden="true" className="ed-brand__mark">
                        {site.branding.companyName.slice(0, 1)}
                      </span>
                    )}
                    <span className="ed-brand__wordmark">
                      <strong>{site.branding.companyName}</strong>
                    </span>
                  </a>
                  {homepageFooter?.intro || site.branding.tagline ? (
                    <p>{homepageFooter?.intro || site.branding.tagline}</p>
                  ) : null}
                  {site.contact?.email ? (
                    <a className="ed-footer__email" href={`mailto:${site.contact.email}`}>
                      {site.contact.email}
                    </a>
                  ) : null}
                </div>
                <div className="ed-footer__links">
                  <strong>{lang === 'zh' ? '快速导航' : 'Quick navigation'}</strong>
                  {canonicalNavigation.map((item) => (
                    <Link href={toSiteHref(item.href)} key={`footer-${item.key}`}>
                      {item.label}
                    </Link>
                  ))}
                </div>
                {executiveGroups
                  .filter((group) => group.key === 'products')
                  .map((group) => (
                    <div className="ed-footer__links" key="footer-products">
                      <strong>{group.label}</strong>
                      {group.children.slice(0, 8).map((item) => (
                        <Link href={toSiteHref(item.href)} key={item.href}>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ))}
                <div className="ed-footer__contact">
                  <strong>{lang === 'zh' ? '联系方式' : 'Contact'}</strong>
                  {site.contact?.phone ? <p>{site.contact.phone}</p> : null}
                  {site.contact?.whatsapp ? <p>WhatsApp: {site.contact.whatsapp}</p> : null}
                  {site.contact?.address ? <p>{site.contact.address}</p> : null}
                  {activeSocialLinks.map(([platform, href]) => (
                    <a href={href} key={platform} rel="noopener noreferrer" target="_blank">
                      {platform}
                    </a>
                  ))}
                </div>
                {site.contact?.whatsappQRCode &&
                typeof site.contact.whatsappQRCode === 'object' &&
                site.contact.whatsappQRCode.url ? (
                  <div className="ed-footer__qr">
                    <Image
                      alt="WhatsApp QR code"
                      height={112}
                      src={site.contact.whatsappQRCode.url}
                      unoptimized
                      width={112}
                    />
                    <strong>WhatsApp</strong>
                  </div>
                ) : site.contact?.wechatQRCode &&
                  typeof site.contact.wechatQRCode === 'object' &&
                  site.contact.wechatQRCode.url ? (
                  <div className="ed-footer__qr">
                    <Image
                      alt="WeChat QR code"
                      height={112}
                      src={site.contact.wechatQRCode.url}
                      unoptimized
                      width={112}
                    />
                    <strong>WeChat</strong>
                  </div>
                ) : null}
              </div>
              <div className="ed-container ed-footer__bottom">
                <span>
                  © {new Date().getFullYear()} {site.branding.companyName}
                </span>
                {site.contact?.address ? <span>{site.contact.address}</span> : null}
              </div>
            </footer>
          ) : (
            <footer className="site-footer">
              <div className="site-wrap site-footer__grid">
                <div>
                  <strong>{site.branding.companyName}</strong>
                  {homepageFooter?.intro || footer?.footerIntro || site.contact?.address ? (
                    <p>{homepageFooter?.intro || footer?.footerIntro || site.contact?.address}</p>
                  ) : null}
                </div>
                <div>
                  <strong>{lang === 'zh' ? '快速导航' : 'Quick links'}</strong>
                  {footer?.quickLinks?.map((link) => (
                    <Link href={toSiteHref(link.href)} key={link.id || link.href}>
                      {link.label}
                    </Link>
                  ))}
                </div>
                <div>
                  <strong>{lang === 'zh' ? '联系方式' : 'Contact'}</strong>
                  {site.contact?.email ? <span>{site.contact.email}</span> : null}
                  {site.contact?.phone ? <span>{site.contact.phone}</span> : null}
                  {site.contact?.whatsapp ? <span>{site.contact.whatsapp}</span> : null}
                  {activeSocialLinks.map(([platform, href]) => (
                    <a href={href} key={platform} rel="noopener noreferrer" target="_blank">
                      {platform}
                    </a>
                  ))}
                </div>
              </div>
              <div className="site-wrap site-footer__copyright">
                © {new Date().getFullYear()} {site.branding.companyName}
              </div>
            </footer>
          )}
        </div>
        <script
          dangerouslySetInnerHTML={{ __html: jsonLD(organization) }}
          type="application/ld+json"
        />
      </body>
    </html>
  )
}
