import { getPayload } from 'payload'

import config from '../src/payload.config'

const tenantSlug = process.env.TENANT_SLUG?.trim()
if (!tenantSlug) throw new Error('缺少 TENANT_SLUG。')

const payload = await getPayload({ config })
const tenantResult = await payload.find({ collection: 'tenants', limit: 1, overrideAccess: true, where: { slug: { equals: tenantSlug } } })
const tenant = tenantResult.docs[0]
if (!tenant) throw new Error('未找到目标公司。')

const definitions = [
  { category: 'product-categories', content: 'products', slugs: ['standard-fasteners', 'non-standard-custom', 'stainless-fasteners', 'high-strength-fasteners', 'surface-treatment', 'hardware-accessories'] },
  { category: 'news-categories', content: 'news', slugs: ['company-news', 'technical-knowledge', 'procurement-guide'] },
  { category: 'case-categories', content: 'cases', slugs: ['customer-cases', 'exhibitions'] },
  { category: 'categories', content: 'posts', slugs: ['technical-blog', 'selection-guide'] },
] as const

let removed = 0
for (const definition of definitions) {
  const categories = await payload.find({
    collection: definition.category,
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: { and: [{ tenant: { equals: tenant.id } }, { slug: { in: definition.slugs } }] },
  })
  for (const category of categories.docs) {
    const relation = definition.category === 'categories' ? { categories: { contains: category.id } } : { category: { equals: category.id } }
    const content = await payload.find({ collection: definition.content, depth: 0, limit: 1, overrideAccess: true, where: { and: [{ tenant: { equals: tenant.id } }, relation] } as never })
    if (content.totalDocs === 0) {
      await payload.delete({ collection: definition.category, id: category.id, overrideAccess: true })
      removed += 1
    }
  }
}

console.log(JSON.stringify({ tenant: tenant.slug, removed }, null, 2))
