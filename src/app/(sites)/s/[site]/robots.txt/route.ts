import { getSite } from '@/platform/site'

export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site: siteSlug } = await params
  const site = await getSite(siteSlug, 'en')
  if (!site) return new Response('Not found', { status: 404 })
  const origin = site.primaryDomain ? `https://${site.primaryDomain}` : `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3100'}/s/${siteSlug}`
  const body = site.seo?.indexingEnabled
    ? `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
