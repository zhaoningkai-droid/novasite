import { NextRequest, NextResponse } from 'next/server'

const previewSite = process.env.NOVASITE_TUNNEL_SITE_SLUG || 'volttrans'
const previewLocale = process.env.NOVASITE_TUNNEL_LOCALE || 'zh'

/**
 * Route the bare application root to the selected customer site. Explicit
 * application routes (admin, workspace, API and /s/*) remain unchanged.
 * Cloudflare Tunnel forwards the local Host header, so this cannot rely on a
 * trycloudflare.com hostname check.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/admin' || request.nextUrl.pathname.startsWith('/admin/')) {
    const destination = request.nextUrl.clone()
    const redirectTo = request.nextUrl.searchParams.get('redirect') || '/workspace/companies'
    destination.pathname = '/login'
    destination.search = ''
    destination.searchParams.set('redirect', redirectTo.startsWith('/') ? redirectTo : '/workspace/companies')
    return NextResponse.redirect(destination)
  }

  if (request.nextUrl.pathname === '/') {
    const destination = request.nextUrl.clone()
    destination.pathname = `/s/${previewSite}/${previewLocale}`
    return NextResponse.redirect(destination)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
