import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const collections = ['products', 'news', 'cases', 'posts', 'leads', 'pages'] as const

for (const tenant of [1, 2]) {
  const site = await payload.findByID({ collection: 'tenants', id: tenant, locale: 'zh', depth: 0, overrideAccess: true })
  console.log(`站点 ${tenant}: ${site.name}`)
  for (const collection of collections) {
    const result = await payload.find({ collection, locale: 'zh', depth: 0, limit: 100, sort: 'id', overrideAccess: true, where: { tenant: { equals: tenant } } })
    console.log(`  ${collection}: ${result.totalDocs}`)
    if (collection === 'cases') {
      for (const item of result.docs) console.log(`    ${item.id} | ${item.title} | ${item.slug}`)
    }
  }
}
