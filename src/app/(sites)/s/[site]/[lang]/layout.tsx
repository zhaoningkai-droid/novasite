import { selectedNewTemplate } from '@/platform/new-templates/selected'
import { TemplateShell } from '@/platform/new-templates/Shell'
import '@/platform/new-templates/templates.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { copy, getBaseURL, getSite, isSiteLocale, jsonLD, locales, siteHref } from '@/platform/site'
import { GeistSans } from 'geist/font/sans'

import '../../../../(frontend)/globals.css'
import './site.css'
import './atelier.css'

type Props = { children: React.ReactNode; params: Promise<{ lang: string; site: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) return {}
  const site = await getSite(siteSlug, lang)
  if (!site) return {}
  const enabledLocales = site.enabledLocales?.length ? site.enabledLocales : locales
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
      languages: Object.fromEntries(enabledLocales.map((locale) => [locale, `${baseURL}/${locale}`])),
    },
    robots: site.seo?.indexingEnabled ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title, description, type: 'website', url: `${baseURL}/${lang}` },
    icons: favicon ? { icon: favicon } : undefined,
    verification: site.seo?.googleSiteVerification ? { google: site.seo.googleSiteVerification } : undefined,
  }
}

export default async function SiteLayout({ children, params }: Props) {
  const { lang, site: siteSlug } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(siteSlug, lang)
  if (!site) notFound()
  const enabledLocales = site.enabledLocales?.length ? site.enabledLocales : locales
  if (!enabledLocales.includes(lang)) notFound()
  const newTemplate = selectedNewTemplate(site)
  if (newTemplate) return (
    <html className={GeistSans.variable} data-theme="light" lang={lang} suppressHydrationWarning>
      <body><TemplateShell site={site} locale={lang} template={newTemplate}
        base={`/s/${siteSlug}/${lang}`}>{children}</TemplateShell></body>
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
  const navigationDocument = await payload.find({ collection: 'site-navigation', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { localeCode: { equals: lang } }] } })
  const storedNavigation = navigationDocument.docs[0]?.items?.length ? navigationDocument.docs[0].items : [
    { label: t.products, href: '/products' }, { label: t.news, href: '/news' }, { label: t.cases, href: '/cases' }, { label: t.blog, href: '/blog' }, { label: t.about, href: '/about' }, { label: t.contact, href: '/contact' },
  ]
  const faqLabel = lang === 'zh' ? '常见问题' : lang === 'ru' ? 'Частые вопросы' : lang === 'id' ? 'Pertanyaan umum' : 'FAQ'
  const menuLabel = lang === 'zh' ? '菜单' : lang === 'ru' ? 'Меню' : lang === 'id' ? 'Menu' : 'Menu'
  // Old workspaces used `/faq`; normalize it on output so it stays a single working FAQ entry.
  const navigation = [...storedNavigation, { href: '/faqs', label: faqLabel }].reduce<typeof storedNavigation>((items, item) => {
    const href = item.href === '/faq' ? '/faqs' : item.href
    return items.some((existing) => existing.href === href) ? items : [...items, { ...item, href }]
  }, [])
  const footer = navigationDocument.docs[0]
  const homepageFooter = site.fixedPages?.footer
  const socialLinks = (homepageFooter?.socialLinks || {}) as Record<string, string>
  const activeSocialLinks = Object.entries(socialLinks).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1]))
  const toSiteHref = (href: string) => siteHref(siteSlug, lang, href === '/' ? '' : href)

  const organization = {
    '@context': 'https://schema.org', '@type': 'Organization', name: site.branding.companyName,
    url: `${getBaseURL(site, siteSlug)}/${lang}`, email: site.contact?.email,
    sameAs: site.contact?.linkedin ? [site.contact.linkedin] : [],
  }

  return (
    <html className={GeistSans.variable} data-theme="light" lang={lang} suppressHydrationWarning>
      <body>
        <div
          className={`site-shell ${templateClass}`}
          data-template={templateKey}
          style={{ '--site-primary': primary, '--site-accent': accent } as React.CSSProperties}
        >
          <header className="site-header"><div className="site-wrap site-header__inner">
            <Link className="site-logo" href={siteHref(siteSlug, lang)}>{logo?.url ? <img alt={logo.alt || site.branding.companyName} src={logo.url} /> : null}{site.branding.companyName}<span>.</span></Link>
            <nav className="site-nav" aria-label="Primary navigation">
              {navigation.map((item) => item.children?.length ? <details className="site-nav-menu" key={item.id || item.href}><summary>{item.label}</summary><div className="site-nav-menu__panel"><Link href={toSiteHref(item.href)}>{item.label}</Link>{item.children.map((child) => <Link href={toSiteHref(child.href)} key={child.id || child.href}>{child.label}</Link>)}</div></details> : <Link href={toSiteHref(item.href)} key={item.id || item.href}>{item.label}</Link>)}
              <div className="site-languages">{enabledLocales.map((locale) => <Link href={siteHref(siteSlug, locale)} key={locale}>{locale}</Link>)}</div>
              <Link className="site-quote" href={siteHref(siteSlug, lang, '/contact')}>{t.quote}</Link>
            </nav>
            <details className="site-mobile-menu">
              <summary aria-label={menuLabel}>{menuLabel}</summary>
              <div>
                {navigation.map((item) => <Link href={toSiteHref(item.href)} key={`mobile-${item.id || item.href}`}>{item.label}</Link>)}
                {enabledLocales.map((locale) => <Link href={siteHref(siteSlug, locale)} key={`mobile-${locale}`}>{locale.toUpperCase()}</Link>)}
                <Link className="site-quote" href={siteHref(siteSlug, lang, '/contact')}>{t.quote}</Link>
              </div>
            </details>
          </div></header>
          {children}
          <footer className="site-footer"><div className="site-wrap site-footer__grid"><div><strong>{site.branding.companyName}</strong>{homepageFooter?.intro || footer?.footerIntro || site.contact?.address ? <p>{homepageFooter?.intro || footer?.footerIntro || site.contact?.address}</p> : null}</div><div><strong>{lang === 'zh' ? '快速导航' : 'Quick links'}</strong>{footer?.quickLinks?.map((link) => <Link href={toSiteHref(link.href)} key={link.id || link.href}>{link.label}</Link>)}</div><div><strong>{lang === 'zh' ? '联系方式' : 'Contact'}</strong>{site.contact?.email ? <span>{site.contact.email}</span> : null}{site.contact?.phone ? <span>{site.contact.phone}</span> : null}{site.contact?.whatsapp ? <span>{site.contact.whatsapp}</span> : null}{activeSocialLinks.map(([platform, href]) => <a href={href} key={platform} rel="noopener noreferrer" target="_blank">{platform}</a>)}</div></div><div className="site-wrap site-footer__copyright">© {new Date().getFullYear()} {site.branding.companyName}</div></footer>
        </div>
        <script dangerouslySetInnerHTML={{ __html: jsonLD(organization) }} type="application/ld+json" />
      </body>
    </html>
  )
}
