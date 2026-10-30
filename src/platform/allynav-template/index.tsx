import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import config from '@payload-config'
import { loadIndustryTenantPage, industryMediaURL } from '@/platform/industry-templates/tenant'
import type { IndustryLink } from '@/platform/industry-templates/model'
import { defaultNavigation, sortedNavigation } from '@/platform/navigation-model'
import { templateHref } from '@/platform/new-templates/links'
import { AllyTemplate } from './Template'
import { getSite, isSiteLocale } from '@/platform/site'
import { isAllyKey } from './key'
import { isAllyDemoPath, allyCustomerSourcePath } from './routing'

type TenantOptions = Parameters<typeof loadIndustryTenantPage>[0]
// Independent demonstration: no tenant, session, CMS query or customer data is loaded here.
export function AllyDemo({ locale, path = [] }: { locale: string; path?: string[] }) {
  if (!['zh', 'en'].includes(locale) || !isAllyDemoPath(path)) notFound()
  return <AllyTemplate base={`/template-demo/allynav-v1/${locale}`} path={path.join('/')} />
}

export async function renderAllyTenantPage(options: TenantOptions) {
  const path = options.path || []
  const sourcePath = allyCustomerSourcePath(path)
  const model = await loadIndustryTenantPage({ ...options, path: sourcePath })
  if (model.kind !== 'home' && !model.image)
    model.image = options.site.branding.navigationBannerURL || undefined
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'site-navigation',
    depth: 0,
    limit: 1,
    overrideAccess: !options.user,
    user: options.user,
    where: {
      and: [{ tenant: { equals: options.site.id } }, { localeCode: { equals: options.locale } }],
    },
  })
  // productCard carries category IDs. Resolve labels inside the same tenant and locale.
  if (model.products?.length || model.section === 'products') {
    const categories = await payload.find({
      collection: 'product-categories',
      depth: 0,
      pagination: false,
      locale: options.locale,
      overrideAccess: !options.user,
      user: options.user,
      sort: 'sortOrder',
      where: { tenant: { equals: options.site.id } },
    })
    const labels = new Map(categories.docs.map((item) => [String(item.id), item.name]))
    const labelCards = (items: typeof model.products) =>
      items?.map((item) => ({
        ...item,
        category: item.category ? labels.get(item.category) || undefined : undefined,
      }))
    model.products = labelCards(model.products)
    if (model.section === 'products') model.cards = labelCards(model.cards)
    model.categories = categories.docs.map((item) => ({
      label: item.name,
      href: `${options.base}/products?category=${encodeURIComponent(item.slug || '')}`,
    }))
  }
  const navigation = result.docs[0]?.items?.length
    ? sortedNavigation(result.docs[0].items)
    : defaultNavigation
  const links: IndustryLink[] = navigation.flatMap((item) => {
    const href = templateHref(options.base, item.href)
    return href
      ? [
          {
            label: item.label,
            href,
            children:
              'children' in item
                ? item.children?.flatMap((child) => {
                    const childHref = templateHref(options.base, child.href)
                    return childHref ? [{ label: child.label, href: childHref }] : []
                  })
                : [],
          },
        ]
      : []
  })
  return (
    <AllyTemplate
      model={model}
      base={options.base}
      path={path.join('/')}
      siteData={{
        logo: industryMediaURL(options.site.branding.logo) || undefined,
        links,
        languages: options.site.enabledLocales?.length
          ? options.site.enabledLocales
          : [options.locale],
      }}
    />
  )
}

// Extra functional views are available only for this template, never as generic pages.
export async function AllyCustomerUtilityPage({
  params,
  section,
}: {
  params: Promise<{ site: string; lang: string }>
  section: 'solutions' | 'downloads' | 'search'
}) {
  const { site: slug, lang } = await params
  if (!isSiteLocale(lang)) notFound()
  const site = await getSite(slug, lang)
  if (!site || typeof site.selectedTemplate !== 'object' || !isAllyKey(site.selectedTemplate?.key))
    notFound()
  return renderAllyTenantPage({
    site,
    locale: lang,
    base: `/s/${slug}/${lang}`,
    path: [section],
    template: { key: 'allynav-v1' },
  })
}
