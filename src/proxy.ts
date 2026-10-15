import { NextRequest, NextResponse } from 'next/server'
import { classifyPlatformHost, isCustomerPagePath, platformDomainsEnabled, platformDomainSettings } from './platform/platform-hosts'
import { isSiteLocale } from './platform/site-locales'
import { managedMediaFilename, mediaAccessControlEnabled, privateMediaHeaders } from './platform/storage/access-mode'

const previewSite = process.env.NOVASITE_TUNNEL_SITE_SLUG || 'volttrans'
const previewLocale = process.env.NOVASITE_TUNNEL_LOCALE || 'zh'

/**
 * Route the bare application root to the selected customer site. Explicit
 * application routes (admin, workspace, API and /s/*) remain unchanged.
 * Cloudflare Tunnel forwards the local Host header, so this cannot rely on a
 * trycloudflare.com hostname check.
 */
export function proxy(request: NextRequest) {
  if (platformDomainsEnabled()) return hostedRequest(request)
  const mediaResponse = controlledMediaRouting(request)
  if (mediaResponse) return mediaResponse

  if (request.nextUrl.pathname === '/admin' || request.nextUrl.pathname.startsWith('/admin/')) {
    const destination = request.nextUrl.clone()
    const redirectTo = request.nextUrl.searchParams.get('redirect') || '/workspace/companies'
    destination.pathname = '/login'
    destination.search = ''
    destination.searchParams.set('redirect', redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/workspace/companies')
    return NextResponse.redirect(destination)
  }

  if (request.nextUrl.pathname === '/') {
    const destination = request.nextUrl.clone()
    destination.pathname = `/s/${previewSite}/${previewLocale}`
    return NextResponse.redirect(destination)
  }

  return NextResponse.next()
}

const unavailable = (status = 404) => new NextResponse(status === 503 ? 'Service unavailable' : 'Not found', { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } })
const atPath = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

/** Prevent public-directory aliases and optimizer caches from bypassing a fresh
 * file authorization. Static demo assets and external photography are unaffected.
 */
function controlledMediaRouting(request: NextRequest, headers = request.headers, host?: string) {
  if (!mediaAccessControlEnabled()) return null
  const pathname = request.nextUrl.pathname
  const alias = atPath(pathname, '/media')
  const optimized = pathname === '/_next/image'
  if (!alias && !optimized) return null
  const source = alias ? pathname : request.nextUrl.searchParams.get('url')
  let filename = managedMediaFilename(source, headers.get('host'))
  // remotePatterns can allow several ports on the same host. An optimizer URL
  // using a different authority must not retain an old cached managed file.
  if (!filename && optimized && source) {
    try {
      const candidate = new URL(source, request.nextUrl.origin)
      if (['http:', 'https:'].includes(candidate.protocol)) filename = managedMediaFilename(candidate.pathname)
    } catch { /* Malformed optimizer input remains the optimizer's own error. */ }
  }
  if (!filename) return alias ? unavailable() : null
  if (!['GET', 'HEAD'].includes(request.method)) return unavailable(405)
  const destination = host ? new URL(`https://${host}/`) : request.nextUrl.clone()
  destination.pathname = `/api/media/file/${encodeURIComponent(filename)}`
  destination.search = ''
  const response = alias ? NextResponse.rewrite(destination, { request: { headers } }) : NextResponse.redirect(destination, 307)
  privateMediaHeaders(response.headers)
  return response
}

function hostedRequest(request: NextRequest) {
  let entry: ReturnType<typeof classifyPlatformHost>
  try { entry = classifyPlatformHost(request.headers.get('host')) } catch { return unavailable(503) }
  const path = request.nextUrl.pathname
  const headers = new Headers(request.headers)
  headers.delete('x-novasite-site-slug')
  headers.delete('x-forwarded-host')
  const next = () => NextResponse.next({ request: { headers } })
  const rewrite = (pathname: string) => {
    const destination = request.nextUrl.clone()
    destination.pathname = pathname
    return NextResponse.rewrite(destination, { request: { headers } })
  }
  const redirect = (pathname: string, status: 307 | 308 = 307) => {
    const destination = new URL(`https://${entry.host}${pathname}`)
    destination.search = request.nextUrl.search
    return NextResponse.redirect(destination, status)
  }

  // Docker exposes only Caddy, so these operator endpoints have no public ingress.
  if (entry.kind === 'internal') return path === '/health' || path === '/api/platform/tls-authorization' ? next() : unavailable()
  if (entry.kind === 'unknown') return unavailable()
  if (path === '/api/platform/tls-authorization' || atPath(path, '/site-entry')) return unavailable()
  if (entry.kind === 'root') {
    if (path !== '/') return unavailable()
    return NextResponse.redirect(new URL(`https://${platformDomainSettings().admin}/login`))
  }
  const mediaResponse = controlledMediaRouting(request, headers, entry.host)
  if (mediaResponse) return mediaResponse
  if (entry.kind === 'admin') {
    if (path === '/robots.txt') return new NextResponse('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin')
      const authenticated = request.headers.get('cookie')?.includes('payload-token=')
      if ((origin && origin !== `https://${entry.host}`) || (authenticated && !origin)) return unavailable(403)
    }
    if (path === '/') return redirect('/workspace/companies')
    if (atPath(path, '/admin')) {
      const destination = new URL(`https://${entry.host}/login`)
      const value = request.nextUrl.searchParams.get('redirect') || '/workspace/companies'
      destination.searchParams.set('redirect', value.startsWith('/') && !value.startsWith('//') ? value : '/workspace/companies')
      return NextResponse.redirect(destination)
    }
    // Legacy shared /search, /posts and arbitrary /[slug] are not part of V1.
    const allowed = ['/login', '/logout', '/workspace', '/api', '/health', '/_next', '/s', '/template-demo', '/template-preview', '/template-demos', '/images', '/fonts', '/assets']
    if (!allowed.some((prefix) => atPath(path, prefix)) && !['/favicon.ico', '/favicon.svg', '/logo.svg', '/logo.png', '/robots.txt'].includes(path)) return unavailable()
    const response = next()
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return response
  }

  headers.set('x-novasite-site-slug', entry.slug)
  const readOnly = request.method === 'GET' || request.method === 'HEAD'
  if (path === '/api/submit-inquiry') {
    const origin = request.headers.get('origin')
    if ((origin && origin !== `https://${entry.host}`) || !['POST', 'OPTIONS'].includes(request.method)) return unavailable(403)
    return next()
  }
  if (readOnly && (atPath(path, '/_next/static') || path === '/_next/image' || atPath(path, '/api/media/file') || ['/template-demos', '/images', '/fonts', '/assets'].some((prefix) => atPath(path, prefix)) || ['/favicon.ico', '/favicon.svg', '/logo.svg', '/logo.png'].includes(path))) return next()
  if (!readOnly || /%(?:2f|5c)/i.test(path) || path.includes('\\')) return unavailable()
  if (path === '/sitemap.xml') return rewrite(`/s/${entry.slug}/sitemap.xml`)
  if (path === '/robots.txt') return rewrite(`/s/${entry.slug}/robots.txt`)

  // Existing template links keep their /s prefix in the admin preview. On a
  // customer host they converge on clean language URLs without exposing other sites.
  if (atPath(path, '/s')) {
    const match = path.match(/^\/s\/([^/]+)(\/.*)?$/)
    if (!match || match[1] !== entry.slug) return unavailable()
    const suffix = match[2] || '/'
    if (suffix === '/sitemap.xml' || suffix === '/robots.txt') return redirect(suffix, 308)
    const locale = suffix.split('/')[1]
    if (locale && !isSiteLocale(locale)) return unavailable()
    return redirect(suffix, 308)
  }
  const segments = path.split('/')
  if (isSiteLocale(segments[1])) {
    const rest = segments.slice(2).join('/')
    if (!isCustomerPagePath(rest ? `/${rest}` : '')) return unavailable()
    return rewrite(`/s/${entry.slug}${path}`)
  }
  if (!isCustomerPagePath(path)) return unavailable()
  // Default language is resolved by a server route, not a DB fetch in Proxy.
  return rewrite(`/site-entry/${entry.slug}${path === '/' ? '' : path}`)
}

export const config = {
  matcher: '/:path*',
}
