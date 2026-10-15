import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { getBaseURL, getSite, isSiteLocale } from '@/platform/site'

export const dynamic = 'force-dynamic'
const xmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const xmlResponse = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site: siteSlug } = await params
  const site = await getSite(siteSlug, 'en')
  if (!site || site.status !== 'published' || site.seo?.indexingEnabled !== true) return new Response('Not found', { status: 404 })
  const enabled = [...new Set((site.enabledLocales || []).filter(isSiteLocale))]
  if (!enabled.length) return new Response('Not found', { status: 404 })
  const base = getBaseURL(site, siteSlug)
  const payload = await getPayload({ config: configPromise })
  type Entry = { path: string; updatedAt?: string }
  const load = async (collection: 'products' | 'news' | 'cases' | 'posts', path: string): Promise<Entry[]> => {
    const entries: Entry[] = []
    let page = 1
    while (true) {
      const result = await payload.find({
        collection, locale: site.defaultLocale, fallbackLocale: false, draft: false,
        depth: 0, limit: 1000, page, overrideAccess: true,
        select: { slug: true, updatedAt: true },
        where: { and: [{ tenant: { equals: site.id } }, { _status: { equals: 'published' } }] },
      })
      for (const entry of result.docs) if (entry.slug) entries.push({ path: `${path}/${encodeURIComponent(entry.slug)}`, updatedAt: entry.updatedAt })
      if (!result.hasNextPage) break
      page += 1
    }
    return entries
  }
  const groups = await Promise.all([load('products', '/products'), load('news', '/news'), load('cases', '/cases'), load('posts', '/blog')])
  const entries: Entry[] = ['', '/products', '/news', '/cases', '/about', '/faqs', '/contact', '/blog'].map((path) => ({ path, updatedAt: site.updatedAt }))
  entries.push(...groups.flat())
  const records = enabled.flatMap((locale) => entries.map((entry) => ({ ...entry, locale })))
  const pageSize = 5000
  const pages = Math.ceil(records.length / pageSize)
  const part = new URL(request.url).searchParams.get('part')
  if (!part && pages > 1) return xmlResponse(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Array.from({ length: pages }, (_, index) => `<sitemap><loc>${xmlEscape(`${base}/sitemap.xml?part=${index + 1}`)}</loc></sitemap>`).join('')}</sitemapindex>`)
  if (part && (!/^[1-9]\d*$/.test(part) || Number(part) > pages)) return new Response('Not found', { status: 404 })
  const at = part ? Number(part) - 1 : 0
  const urls = records.slice(at * pageSize, (at + 1) * pageSize).map((entry) => {
    const alternate = enabled.map((locale) => `<xhtml:link rel="alternate" hreflang="${locale}" href="${xmlEscape(`${base}/${locale}${entry.path}`)}"/>`).join('')
    const defaultLink = enabled.includes(site.defaultLocale) ? `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(`${base}/${site.defaultLocale}${entry.path}`)}"/>` : ''
    const updated = entry.updatedAt && !Number.isNaN(Date.parse(entry.updatedAt)) ? `<lastmod>${new Date(entry.updatedAt).toISOString()}</lastmod>` : ''
    return `<url><loc>${xmlEscape(`${base}/${entry.locale}${entry.path}`)}</loc>${updated}${alternate}${defaultLink}</url>`
  })
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`)
}
