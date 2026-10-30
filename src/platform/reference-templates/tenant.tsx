import { getPayload } from 'payload'
import config from '@payload-config'
import { loadIndustryTenantPage } from '@/platform/industry-templates/tenant'
import { K607Page } from './K607Page'
import { K712Page } from './K712Page'
import type { ReferenceKey } from './keys'
type Options = Parameters<typeof loadIndustryTenantPage>[0] & { template: { key: ReferenceKey } }
// Read tenant content once, then render the same template components used by the sample demo.
export async function renderReferenceTenantPage(options: Options) {
  const model = await loadIndustryTenantPage(options)
  if (model.kind !== 'home' && !model.image)
    model.image = options.site.branding.navigationBannerURL || undefined
  if (model.kind === 'home') {
    const payload = await getPayload({ config })
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
    model.categories = categories.docs.map((item) => ({
      label: item.name,
      href: `${options.base}/products?category=${encodeURIComponent(item.slug || '')}`,
    }))
    if (options.template.key === 'plush-712-v1')
      model.productGroups = categories.docs
        .filter((category) => !category.parent)
        .map((category) => {
          const ids = new Set([category.id])
          let changed = true
          while (changed) {
            changed = false
            for (const c of categories.docs) {
              const parent = typeof c.parent === 'number' ? c.parent : c.parent?.id
              if (parent && ids.has(parent) && !ids.has(c.id)) {
                ids.add(c.id)
                changed = true
              }
            }
          }
          return {
            label: category.name,
            href: `${options.base}/products?category=${encodeURIComponent(category.slug || '')}`,
            items: (model.products || []).filter((p) => ids.has(Number(p.category))),
          }
        })
  }
  {
    const payload = await getPayload({ config })
    const access = {
      locale: options.locale,
      overrideAccess: !options.user,
      user: options.user,
      depth: 1,
    }
    const where = { tenant: { equals: options.site.id } }
    if (model.kind === 'product') {
      const [product, categories, cases] = await Promise.all([
        payload.findByID({ ...access, collection: 'products', id: model.productId! }),
        payload.find({
          ...access,
          collection: 'product-categories',
          where,
          pagination: false,
          sort: 'sortOrder',
        }),
        payload.find({
          ...access,
          collection: 'cases',
          where: { and: [where, { _status: { equals: 'published' } }] },
          limit: 4,
          sort: 'sortOrder',
        }),
      ])
      model.tags = product.tags?.map((t) => t.label).filter(Boolean) as string[]
      model.publishedAt = product.publishedAt
      model.categories = categories.docs.map((c) => ({
        label: c.name,
        href: `${options.base}/products?category=${encodeURIComponent(c.slug || '')}`,
      }))
      model.cases = cases.docs.map((c) => ({
        id: c.id,
        title: c.title,
        href: `${options.base}/cases/${c.slug}`,
        image: typeof c.cover === 'object' && c.cover ? c.cover.url || '' : undefined,
      }))
    }
    if (model.kind === 'article') {
      const collection =
        model.section === 'blog' ? 'posts' : model.section === 'cases' ? 'cases' : 'news'
      const items = await payload.find({
        ...access,
        collection,
        where: { and: [where, { _status: { equals: 'published' } }] },
        pagination: false,
        sort: '-publishedAt',
      })
      if (options.template.key === 'plush-712-v1') {
        const categoryCollection =
          collection === 'posts'
            ? 'categories'
            : collection === 'cases'
              ? 'case-categories'
              : 'news-categories'
        const categories = await payload.find({
          ...access,
          collection: categoryCollection,
          where,
          pagination: false,
          sort: 'sortOrder',
        })
        model.categories = categories.docs.map((c) => ({
          label: 'name' in c ? c.name : c.title,
          href: `${options.base}/${model.section}?category=${encodeURIComponent(c.slug || '')}`,
        }))
      }
      const i = items.docs.findIndex((c) => c.slug === options.path?.[1])
      const item = (n: number) =>
        items.docs[n]
          ? {
              label: items.docs[n].title,
              href: `${options.base}/${model.section}/${items.docs[n].slug}`,
            }
          : undefined
      model.previous = item(i - 1)
      model.next = item(i + 1)
    }
    return options.template.key === 'plush-607-v1' ? (
      <K607Page model={model} />
    ) : (
      <K712Page model={model} />
    )
  }
}
