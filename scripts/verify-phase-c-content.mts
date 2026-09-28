import { mkdir, writeFile } from 'node:fs/promises'

import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const output = 'docs/evidence/phase-c/after'
await mkdir(output, { recursive: true })

const collections = ['product-categories', 'products', 'categories', 'posts', 'news-categories', 'news', 'case-categories', 'cases'] as const
const counts = await Promise.all(collections.map(async (collection) => {
  const result = await payload.find({ collection, limit: 1, depth: 0, overrideAccess: true })
  return `${collection}: ${result.totalDocs}`
}))

const tenantReport = await Promise.all([1, 2].map(async (tenant) => {
  const [productCategories, products, posts, news, cases] = await Promise.all([
    payload.find({ collection: 'product-categories', where: { tenant: { equals: tenant } }, locale: 'zh', limit: 100, sort: 'sortOrder', depth: 0, overrideAccess: true }),
    payload.find({ collection: 'products', where: { tenant: { equals: tenant } }, locale: 'zh', limit: 100, sort: 'id', depth: 0, overrideAccess: true }),
    payload.find({ collection: 'posts', where: { tenant: { equals: tenant } }, locale: 'zh', limit: 100, sort: 'id', depth: 0, overrideAccess: true }),
    payload.find({ collection: 'news', where: { tenant: { equals: tenant } }, locale: 'zh', limit: 100, sort: 'id', depth: 0, overrideAccess: true }),
    payload.find({ collection: 'cases', where: { tenant: { equals: tenant } }, locale: 'zh', limit: 100, sort: 'id', depth: 0, overrideAccess: true }),
  ])
  const names = (items: Array<{ title?: string; name?: string; slug: string }>) => items.map((item) => `- ${item.title || item.name} (${item.slug})`).join('\n')
  return [`客户站点 ID ${tenant}`, `产品分类 (${productCategories.totalDocs})\n${names(productCategories.docs)}`, `产品 (${products.totalDocs})\n${names(products.docs)}`, `博客 (${posts.totalDocs})\n${names(posts.docs)}`, `新闻 (${news.totalDocs})\n${names(news.docs)}`, `案例 (${cases.totalDocs})\n${names(cases.docs)}`].join('\n\n')
}))

const pageLocales = await Promise.all(['en', 'zh', 'ru', 'id'].map(async (locale) => {
  const page = await payload.find({ collection: 'pages', where: { tenant: { equals: 2 } }, locale: locale as 'en' | 'zh' | 'ru' | 'id', limit: 1, depth: 0, overrideAccess: true })
  const heroText = JSON.stringify(page.docs[0]?.hero?.richText || '').slice(0, 180)
  return `${locale}: ${page.docs[0]?.title || 'missing'} | ${heroText}`
}))

await writeFile(`${output}/record-counts.txt`, `${counts.join('\n')}\n`)
await writeFile(`${output}/tenant-content-zh.txt`, `${tenantReport.join('\n\n====================\n\n')}\n`)
await writeFile(`${output}/page-locales.txt`, `${pageLocales.join('\n')}\n`)
console.log(`${output}/record-counts.txt`)
