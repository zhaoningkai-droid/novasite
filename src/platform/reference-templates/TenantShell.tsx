import type { ReactNode } from 'react'
import { sortedNavigation } from '@/platform/navigation-model'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Tenant, User } from '@/payload-types'
import type { SiteLocale } from '@/platform/site-locales'
import { templateCopy } from '@/platform/new-templates/copy'
import { templateHref } from '@/platform/new-templates/links'
import { K607SiteProvider } from './demo/k607/TemplateData'
import { DemoLinks } from './demo/DemoLink'
import './demo/k607/base.css'
import './demo/isolation.css'
import './demo/k607/customer-data.css'
import { K712SiteProvider } from './demo/k712/TemplateData'
import './demo/k712/base.css'
import './demo/k712/inner.css'
import './demo/k712/customer-data.css'
import { industryMediaURL } from '@/platform/industry-templates/tenant'
import type { IndustryLink } from '@/platform/industry-templates/model'
import type { ReferenceKey } from './keys'

export async function ReferenceTenantShell({
  site,
  locale,
  base,
  templateKey,
  children,
  user,
}: {
  site: Tenant
  locale: SiteLocale
  base: string
  templateKey: ReferenceKey
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
  const Provider = templateKey === 'plush-607-v1' ? K607SiteProvider : K712SiteProvider
  return (
    <div
      className={`clone-demo-root clone-demo-${templateKey === 'plush-607-v1' ? 'k607' : 'k712'}`}
      data-template={templateKey}
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <Provider
        value={{
          base,
          company: site.branding.companyName,
          headerText: site.branding.headerText || '',
          tagline: site.branding.tagline,
          logo: industryMediaURL(site.branding.logo),
          locale,
          languages: site.enabledLocales || [locale],
          links,
          quickLinks,
          contact: {
            ...site.contact,
            qr: [
              { label: 'WhatsApp', image: industryMediaURL(site.contact?.whatsappQRCode) },
              {
                label: 'WeChat',
                image: industryMediaURL(site.contact?.wechatInternationalQRCode),
              },
              { label: '微信', image: industryMediaURL(site.contact?.wechatQRCode) },
            ].filter((q) => q.image),
          },
          socials: Object.entries(footer?.socialLinks || {}).flatMap(([label, href]) =>
            typeof href === 'string' && /^https?:/.test(href) ? [{ label, href }] : [],
          ),
        }}
      >
        <DemoLinks base={base} aliases>
          {children}
        </DemoLinks>
      </Provider>
    </div>
  )
}
