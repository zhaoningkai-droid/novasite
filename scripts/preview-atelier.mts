import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { registerHooks } from 'node:module'

registerHooks({ load(url, context, next) {
  if (/\.(css|scss)$/.test(url)) return { format: 'module', source: 'export default {}', shortCircuit: true }
  return next(url, context)
} })
const { SitePageBlocks } = await import('../src/app/(sites)/s/[site]/[lang]/SitePageBlocks')

const payload = await getPayload({ config })
const tenants = await payload.find({ collection: 'tenants', locale: 'zh', depth: 2, limit: 1, where: { slug: { equals: 't' } } })
const site = tenants.docs[0]
if (!site) throw new Error('Test company not found')
const template = await payload.find({ collection: 'templates', where: { key: { equals: 'atelier-industry-v1' } }, limit: 1 })
const collections = ['products', 'cases', 'news', 'posts', 'product-categories'] as const
const [products, cases, news, posts, categories] = await Promise.all(collections.map(collection =>
  payload.find({ collection, locale: 'zh', depth: 2, limit: 8, where: { tenant: { equals: site.id } } })))
// Render real company content with the new template in memory; no tenant data is changed.
const markup = renderToStaticMarkup(React.createElement(SitePageBlocks, {
  site: { ...site, selectedTemplate: template.docs[0] }, siteSlug: 't', locale: 'zh',
  products: products.docs, cases: cases.docs, news: news.docs, posts: posts.docs,
  productCategories: categories.docs, faqs: [], page: { hero: { type: 'lowImpact' }, slug: 'home' },
} as React.ComponentProps<typeof SitePageBlocks>))
const css = await readFile('src/app/(sites)/s/[site]/[lang]/site.css', 'utf8')
const atelier = await readFile('src/app/(sites)/s/[site]/[lang]/atelier.css', 'utf8')
await mkdir('docs/evidence/atelier', { recursive: true })
await writeFile('docs/evidence/atelier/preview.html', `<!doctype html><html lang="zh"><meta charset="utf-8"><base href="http://localhost:3100"><style>body{margin:0}${css}${atelier}</style><div class="site-shell site-shell--atelier">${markup}</div></html>`)
console.log('Preview generated using real company content; template id:', template.docs[0].id)
await payload.destroy()
process.exit(0)
