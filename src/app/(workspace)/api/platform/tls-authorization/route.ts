import config from '@payload-config'
import { getPayload } from 'payload'
import { classifyPlatformHost, platformDomainsEnabled } from '@/platform/platform-hosts'

export const dynamic = 'force-dynamic'

/** Caddy's on-demand TLS allowlist; never approves arbitrary customer domains. */
export async function GET(request: Request) {
  const deny = () => new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  if (!platformDomainsEnabled()) return deny()
  try {
    if (classifyPlatformHost(request.headers.get('host')).kind !== 'internal') return deny()
    const domain = new URL(request.url).searchParams.get('domain')
    // Certificate names are hostnames, not URLs or host:port authorities.
    if (!domain || domain.includes(':')) return deny()
    const entry = classifyPlatformHost(domain)
    if (entry.kind === 'root' || entry.kind === 'admin') return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    if (entry.kind !== 'tenant') return deny()
    const payload = await getPayload({ config })
    // An existing building site needs a valid HTTPS entry too. Its public
    // route only renders a construction notice, never unpublished content.
    const found = await payload.find({ collection: 'tenants', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ slug: { equals: entry.slug } }, { status: { in: ['building', 'published'] } }] } })
    return found.docs.length ? new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } }) : deny()
  } catch {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
