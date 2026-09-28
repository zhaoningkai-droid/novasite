import { mkdir, writeFile } from 'node:fs/promises'

import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const locales = ['en', 'zh', 'ru', 'id'] as const
const outputDirectory = 'docs/evidence/phase-e'
const collections = ['pages', 'products', 'posts', 'news', 'cases', 'leads'] as const

const sites = await Promise.all([1, 2].map(async (tenantID) => {
  const site = await payload.findByID({ collection: 'tenants', id: tenantID, locale: 'zh', depth: 0, overrideAccess: true })
  const counts = Object.fromEntries(await Promise.all(collections.map(async (collection) => {
    const result = await payload.find({ collection, locale: 'zh', depth: 0, limit: 100, overrideAccess: true, where: { tenant: { equals: tenantID } } })
    return [collection, result.totalDocs]
  })))
  const products = await payload.find({ collection: 'products', locale: 'zh', depth: 0, limit: 100, overrideAccess: true, where: { tenant: { equals: tenantID } } })
  const specifications = await payload.find({ collection: 'product-specifications', depth: 0, limit: 100, overrideAccess: true, where: { tenant: { equals: tenantID } } })
  const navigation = await payload.find({ collection: 'site-navigation', depth: 0, limit: 100, overrideAccess: true, where: { tenant: { equals: tenantID } } })
  return {
    tenantID,
    siteName: site.branding.companyName,
    slug: site.slug,
    counts,
    productSlugs: products.docs.map((product) => product.slug),
    navigationLanguages: navigation.docs.map((item) => item.localeCode).sort(),
    productSpecificationRecords: specifications.totalDocs,
    expectedProductSpecificationRecords: products.totalDocs * locales.length,
    everySpecificationRecordBelongsToThisTenant: specifications.docs.every((item) => item.tenant === tenantID),
  }
}))

const productSlugsDoNotOverlap = sites[0].productSlugs.every((slug) => !sites[1].productSlugs.includes(slug))
const report = {
  checkedAt: new Date().toISOString(),
  sites,
  productSlugsDoNotOverlap,
  everySiteHasAllFourNavigationLanguages: sites.every((site) => locales.every((locale) => site.navigationLanguages.includes(locale))),
  everySiteHasCompleteProductSpecifications: sites.every((site) => site.productSpecificationRecords === site.expectedProductSpecificationRecords && site.everySpecificationRecordBelongsToThisTenant),
}

await mkdir(outputDirectory, { recursive: true })
await writeFile(`${outputDirectory}/multisite-audit.json`, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
