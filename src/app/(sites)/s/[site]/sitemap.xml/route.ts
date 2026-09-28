import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getBaseURL, locales } from '@/platform/site'

const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site: siteSlug } = await params
  const payload = await getPayload({ config: configPromise })
  const sites = await payload.find({ collection: 'tenants', locale: 'en', depth: 0, limit: 1, overrideAccess: true, where: { slug: { equals: siteSlug } } })
  const site = sites.docs[0]
  if (!site) return new Response('Not found', { status: 404 })
  const base = getBaseURL(site, siteSlug)
  const products = await payload.find({ collection: 'products', locale: 'all', depth: 0, pagination: false, limit: 1000, overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } })
  const posts = await payload.find({ collection: 'posts', locale: 'all', depth: 0, pagination: false, limit: 1000, overrideAccess: true, where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] } })
  const enabledLocales = site.enabledLocales?.length ? site.enabledLocales : locales
  const urls = enabledLocales.flatMap((locale) => [
    `${base}/${locale}`,
    `${base}/${locale}/products`,
    `${base}/${locale}/blog`,
    ...products.docs.map((product) => `${base}/${locale}/products/${product.slug}`),
    ...posts.docs.map((post) => `${base}/${locale}/blog/${post.slug}`),
  ])
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${xmlEscape(url)}</loc></url>`).join('')}</urlset>`
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
