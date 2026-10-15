import config from '@payload-config'
import { getPayload } from 'payload'
import { classifyPlatformHost, isCustomerPagePath, platformDomainsEnabled } from '@/platform/platform-hosts'
import { isSiteLocale } from '@/platform/site-locales'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ site: string; path?: string[] }> }) {
  const { site: slug, path = [] } = await params
  if (!platformDomainsEnabled()) return new Response('Not found', { status: 404 })
  const host = classifyPlatformHost(request.headers.get('host'))
  const suffix = path.length ? `/${path.map((part) => encodeURIComponent(part)).join('/')}` : ''
  if (host.kind !== 'tenant' || host.slug !== slug || !isCustomerPagePath(suffix)) return new Response('Not found', { status: 404 })
  const payload = await getPayload({ config })
  const found = await payload.find({ collection: 'tenants', depth: 0, limit: 1, overrideAccess: true,
    select: { status: true, defaultLocale: true, enabledLocales: true },
    where: { and: [{ slug: { equals: slug } }, { status: { in: ['building', 'published'] } }] } })
  const site = found.docs[0]
  if (site?.status === 'building') return new Response(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>网站正在建设中</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f8fa;color:#203229;font:16px/1.7 system-ui,sans-serif}main{padding:36px;text-align:center}h1{font-size:clamp(24px,5vw,36px)}p{color:#64716b}</style></head><body><main><h1>网站正在建设中</h1><p>This website is coming soon.</p></main></body></html>`, {
    status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" },
  })
  if (!site || !isSiteLocale(site.defaultLocale) || !site.enabledLocales?.includes(site.defaultLocale)) return new Response('Not found', { status: 404 })
  const query = new URL(request.url).search
  return new Response(null, { status: 307, headers: { Location: `/${site.defaultLocale}${suffix}${query}`, 'Cache-Control': 'no-store' } })
}
