import type { ReactNode } from 'react'
import { sortedNavigation } from '@/platform/navigation-model'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Tenant, User } from '@/payload-types'
import type { SiteLocale } from '@/platform/site-locales'
import { templateCopy } from '@/platform/new-templates/copy'
import { templateHref } from '@/platform/new-templates/links'
import { IndustryShell } from './Shell'
import { industryMediaURL } from './tenant'
import type { IndustryKey, IndustryLink } from './model'

export async function IndustryTenantShell({
  site,
  locale,
  base,
  templateKey,
  children,
  preview,
  user,
}: {
  site: Tenant
  locale: SiteLocale
  base: string
  templateKey: IndustryKey
  children: ReactNode
  preview?: boolean
  user?: User
}) {
  const payload = await getPayload({ config })
  const access = { overrideAccess: !user, user, locale, depth: 0 }
  const where = { tenant: { equals: site.id } }
  const [nav, products, news, cases] = await Promise.all([
    payload.find({
      ...access,
      collection: 'site-navigation',
      limit: 1,
      where: { and: [where, { localeCode: { equals: locale } }] },
    }),
    payload.find({
      ...access,
      collection: 'product-categories',
      pagination: false,
      sort: 'sortOrder',
      where,
    }),
    payload.find({
      ...access,
      collection: 'news-categories',
      pagination: false,
      sort: 'sortOrder',
      where,
    }),
    payload.find({
      ...access,
      collection: 'case-categories',
      pagination: false,
      sort: 'sortOrder',
      where,
    }),
  ])
  const t = templateCopy(locale)
  const href = (value: string) => templateHref(base, value)
  const group = (docs: typeof products.docs | typeof news.docs, section: string) =>
    docs.map((item) => ({
      label: item.name,
      href: `${base}/${section}?category=${encodeURIComponent(item.slug || '')}`,
    }))
  const groups: Record<string, IndustryLink[]> = {
    products: group(products.docs, 'products'),
    news: group(news.docs, 'news'),
    cases: group(cases.docs, 'cases'),
  }
  const document = nav.docs[0]
  const defaults = ['home', 'products', 'news', 'cases', 'about', 'faqs', 'contact'] as const
  const links: IndustryLink[] = document?.items?.length
    ? sortedNavigation(document.items).flatMap((item) => {
        const destination = item.href ? href(item.href || '') : ''
        if (destination === null) return []
        const section = ['products', 'news', 'cases'].find(
          (value) => destination.split('?')[0] === `${base}/${value}`,
        )
        const children = item.children?.length
          ? item.children.flatMap((child) => {
              const destination = href(child.href || '')
              return destination ? [{ label: child.label, href: destination }] : []
            })
          : section
            ? groups[section]
            : []
        return [{ label: item.label, href: destination, children }]
      })
    : defaults.map((key) => ({
        label: t[key],
        href: key === 'home' ? base : `${base}/${key}`,
        children: groups[key],
      }))
  const footer = site.fixedPages?.footer
  const quickLinks = (
    document?.quickLinks?.length ? document.quickLinks : footer?.quickLinks || []
  ).flatMap((item) => {
    if (!item.label) return []
    const destination = href(item.href || '')
    return destination ? [{ label: item.label, href: destination }] : []
  })
  return (
    <IndustryShell
      templateKey={templateKey}
      company={site.branding.companyName}
      headerText={site.branding.headerText || ''}
      tagline={site.branding.tagline}
      logo={industryMediaURL(site.branding.logo)}
      locale={locale}
      base={base}
      languages={site.enabledLocales?.length ? site.enabledLocales : [locale]}
      links={links}
      footerIntro={footer?.intro || document?.footerIntro}
      quickLinks={quickLinks}
      model={{
        kind: 'home',
        locale,
        base,
        company: site.branding.companyName,
        site: site.slug,
        title: t.quote,
        preview,
        contact: site.contact,
        requiredFields: site.fixedPages?.homepage?.inquiryRequiredFields as Record<string, boolean>,
      }}
    >
      {children}
    </IndustryShell>
  )
}
