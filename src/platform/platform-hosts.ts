/** Server-only deployment settings. Never infer a tenant from forwarded headers. */
export const platformDomainsEnabled = () => process.env.PLATFORM_DOMAINS_ENABLED === 'true'

export function normalizeHostname(authority: string | null | undefined): string | null {
  if (!authority || authority.length > 260 || /[\s,@/\\?#]/.test(authority)) return null
  const match = authority.toLowerCase().match(/^([a-z0-9.-]+)(?::([0-9]{1,5}))?$/)
  if (!match) return null
  const host = match[1].replace(/\.$/, '')
  if (host.length > 253 || host.split('.').some((part) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return null
  if (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535)) return null
  return host
}

export function platformDomainSettings() {
  const root = normalizeHostname(process.env.PLATFORM_ROOT_DOMAIN)
  const admin = normalizeHostname(process.env.PLATFORM_ADMIN_HOST)
  if (!root || !admin || !root.includes('.') || admin === root || !admin.endsWith(`.${root}`))
    throw new Error('Set PLATFORM_ROOT_DOMAIN and its separate PLATFORM_ADMIN_HOST before enabling platform domains.')
  const reserved = new Set(['www', 'admin', 'api', 'assets', 'cdn', 'mail', 'preview', 'localhost', admin.slice(0, -(root.length + 1))])
  return { root, admin, reserved }
}

export type PlatformHost =
  | { kind: 'admin'; host: string }
  | { kind: 'root'; host: string }
  | { kind: 'tenant'; host: string; slug: string }
  | { kind: 'internal'; host: string }
  | { kind: 'unknown'; host: string | null }

export function classifyPlatformHost(authority: string | null | undefined): PlatformHost {
  const host = normalizeHostname(authority)
  if (!host) return { kind: 'unknown', host: null }
  if (['app', 'localhost', '127.0.0.1'].includes(host)) return { kind: 'internal', host }
  const { root, admin, reserved } = platformDomainSettings()
  if (host === admin) return { kind: 'admin', host }
  if (host === root) return { kind: 'root', host }
  if (!host.endsWith(`.${root}`)) return { kind: 'unknown', host }
  const slug = host.slice(0, -(root.length + 1))
  if (reserved.has(slug) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return { kind: 'unknown', host }
  return { kind: 'tenant', host, slug }
}

export function temporarySiteOrigin(slug: string): string | null {
  if (!platformDomainsEnabled()) return null
  const { root } = platformDomainSettings()
  const candidate = classifyPlatformHost(`${slug}.${root}`)
  return candidate.kind === 'tenant' ? `https://${candidate.host}` : null
}

export const isCustomerPagePath = (path: string) => path === '' || path === '/' ||
  /^\/(?:products|news|cases|blog)(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%-]+)?\/?$/.test(path) ||
  /^\/(?:about|faqs|contact)\/?$/.test(path)
