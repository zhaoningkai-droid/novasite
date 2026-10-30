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

/** Operator-approved bindings only. A tenant's editable primaryDomain never authorizes ingress. */
export function configuredCustomerDomains(): Record<string, { primary: string; aliases: string[] }> {
  const raw = process.env.PLATFORM_CUSTOM_DOMAINS
  if (!raw) return Object.create(null)
  if (raw.length > 16384) throw new Error('Custom domain configuration is too large.')
  const input: unknown = JSON.parse(raw)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid custom domain map.')
  const { root, reserved } = platformDomainSettings()
  const result: Record<string, { primary: string; aliases: string[] }> = Object.create(null)
  const occupied = new Set<string>()
  const entries = Object.entries(input)
  if (entries.length > 100) throw new Error('Too many custom domain bindings.')
  for (const [slug, value] of entries) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) || reserved.has(slug)) throw new Error('Invalid bound tenant.')
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid custom domain binding.')
    const item = value as { primary?: unknown; aliases?: unknown }
    const aliases = item.aliases === undefined ? [] : item.aliases
    if (!Array.isArray(aliases) || aliases.length > 10) throw new Error('Invalid custom domain aliases.')
    const hosts = [item.primary, ...aliases].map((value) => {
      if (typeof value !== 'string' || value.includes(':')) throw new Error('A bound domain must be a hostname.')
      const host = normalizeHostname(value)
      if (!host || !host.includes('.') || host === root || host.endsWith(`.${root}`) || host.endsWith('.local') || /^[0-9.]+$/.test(host) || occupied.has(host)) throw new Error('Invalid or duplicate bound domain.')
      occupied.add(host)
      return host
    })
    result[slug] = { primary: hosts[0], aliases: hosts.slice(1) }
  }
  return result
}

export function configuredCustomerOrigin(slug: string): string | null {
  if (!platformDomainsEnabled()) return null
  const binding = configuredCustomerDomains()[slug]
  return binding ? `https://${binding.primary}` : null
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
  if (!host.endsWith(`.${root}`)) {
    const match = Object.entries(configuredCustomerDomains()).find(([, binding]) => binding.primary === host || binding.aliases.includes(host))
    return match ? { kind: 'tenant', host, slug: match[0] } : { kind: 'unknown', host }
  }
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
