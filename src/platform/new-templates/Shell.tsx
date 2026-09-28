import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Tenant, User } from '@/payload-types'
import { locales, type SiteLocale } from '@/platform/site'
import { templateCopy } from './copy'
import { templateHref } from './links'
import type { NewTemplate } from './registry'

export async function TemplateShell({
  site,
  locale,
  template,
  base,
  children,
  preview,
  user,
}: {
  site: Tenant
  locale: SiteLocale
  template: NewTemplate
  base: string
  children: ReactNode
  preview?: boolean
  user?: User
}) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'site-navigation',
    depth: 0,
    limit: 1,
    overrideAccess: !user,
    user,
    where: { and: [{ tenant: { equals: site.id } }, { localeCode: { equals: locale } }] },
  })
  const t = templateCopy(locale)
  const document = result.docs[0]
  const fallback = ['products', 'cases', 'news', 'blog', 'about', 'contact', 'faqs'] as const
  const navigation = document?.items?.length
    ? document.items
    : fallback.map((key) => ({
        label: t[key],
        href: `/${key}`,
        children: [],
      }))
  const href = (value: string) => templateHref(base, value)
  const logo = typeof site.branding.logo === 'object' ? site.branding.logo : null
  const enabled = site.enabledLocales?.length ? site.enabledLocales : locales
  const footer = site.fixedPages?.footer
  const quick = document?.quickLinks?.length ? document.quickLinks : footer?.quickLinks || []
  const social = Object.entries(footer?.socialLinks || {}).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && /^https?:\/\//i.test(entry[1]),
  )
  const menu = (
    <>
      {navigation.map((item, i) =>
        item.children?.length ? (
          <details key={i} className="nt-dropdown">
            <summary>{item.label}</summary>
            <div>
              {href(item.href) ? <Link href={href(item.href)!}>{item.label}</Link> : null}
              {item.children.map((child, j) =>
                href(child.href) ? (
                  <Link key={j} href={href(child.href)!}>
                    {child.label}
                  </Link>
                ) : null,
              )}
            </div>
          </details>
        ) : href(item.href) ? (
          <Link key={i} href={href(item.href)!}>
            {item.label}
          </Link>
        ) : null,
      )}
      <div className="nt-languages">
        {enabled.map((lang) => (
          <Link
            key={lang}
            href={base.replace(/\/(en|zh|ru|id)$/, `/${lang}`)}
            aria-current={locale === lang ? 'true' : undefined}
          >
            {lang.toUpperCase()}
          </Link>
        ))}
      </div>
    </>
  )
  return (
    <div
      className={`nt-shell nt-${template.tone}`}
      data-template={template.key}
      style={{ '--nt-primary': template.primary, '--nt-accent': template.accent } as CSSProperties}
    >
      <a className="nt-skip" href="#nt-main">
        {t.skip}
      </a>
      {preview ? (
        <div className="nt-preview">
          {template.name} · {t.preview}
        </div>
      ) : null}
      {template.tone === 'power' || template.tone === 'autoparts' ? (
        <div className="nt-topbar nt-wrap">
          <span>{site.branding.tagline || site.branding.companyName}</span>
          <div>
            {site.contact?.phone ? (
              <a href={`tel:${site.contact.phone}`}>{site.contact.phone}</a>
            ) : null}
            {site.contact?.email ? (
              <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
            ) : null}
          </div>
        </div>
      ) : null}
      <header className="nt-header">
        <div className="nt-wrap nt-header-inner">
          <Link className="nt-logo" href={base}>
            {logo?.url ? (
              <img
                alt={logo.alt || site.branding.companyName}
                src={logo.url}
                width="160"
                height="60"
              />
            ) : (
              <strong>{site.branding.companyName}</strong>
            )}
          </Link>
          <nav className="nt-navigation" aria-label={t.menu}>
            {menu}
          </nav>
          <details className="nt-mobile">
            <summary>{t.menu}</summary>
            <nav aria-label={t.menu}>{menu}</nav>
          </details>
          <Link className="nt-button nt-header-quote" href={`${base}/contact`}>
            {t.quote}
          </Link>
        </div>
      </header>
      {children}
      <footer className="nt-footer">
        <div className="nt-wrap nt-footer-grid">
          <div>
            <strong>{site.branding.companyName}</strong>
            <p>{footer?.intro || document?.footerIntro || site.branding.tagline}</p>
          </div>
          {quick.length ? (
            <div>
              <h2>{t.links}</h2>
              {quick.map((link, i) =>
                href(link.href) ? (
                  <Link key={i} href={href(link.href)!}>
                    {link.label}
                  </Link>
                ) : null,
              )}
            </div>
          ) : null}
          <div>
            <h2>{t.contact}</h2>
            {site.contact?.email ? (
              <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
            ) : null}
            {site.contact?.phone ? (
              <a href={`tel:${site.contact.phone}`}>{site.contact.phone}</a>
            ) : null}
            {site.contact?.whatsapp ? (
              <a href={`https://wa.me/${site.contact.whatsapp.replace(/\D/g, '')}`}>WhatsApp</a>
            ) : null}
            {site.contact?.address ? <p>{site.contact.address}</p> : null}
            {social.map(([name, url]) => (
              <a key={name} href={url} target="_blank" rel="noopener noreferrer">
                {name}
              </a>
            ))}
          </div>
        </div>
        <div className="nt-wrap nt-copyright">
          © {new Date().getFullYear()} {site.branding.companyName}
        </div>
      </footer>
    </div>
  )
}
