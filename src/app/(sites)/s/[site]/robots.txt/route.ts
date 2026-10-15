import { getBaseURL, getSite } from '@/platform/site'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site: siteSlug } = await params
  const site = await getSite(siteSlug, 'en')
  if (!site) return new Response('Not found', { status: 404 })
  const origin = getBaseURL(site, siteSlug)
  const body = site.status === 'published' && site.seo?.indexingEnabled
    ? `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /workspace/\nDisallow: /template-demo/\nDisallow: /template-preview/\nSitemap: ${origin}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}
