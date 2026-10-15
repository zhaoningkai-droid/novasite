/** Keep local compatibility until files and permissions have been rehearsed. */
export const mediaAccessControlEnabled = () => process.env.MEDIA_ACCESS_CONTROL_ENABLED === 'true'

export const validMediaFilename = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 255 &&
  value !== '.' && value !== '..' && !/[\/\\\u0000-\u001f\u007f]/.test(value)

/** Only application-managed paths on explicitly trusted authorities count as references. */
export function managedMediaFilename(value: unknown, authority?: string | null): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null
  try {
    const relative = value.startsWith('/') && !value.startsWith('//')
    const url = new URL(value, 'https://media-path.invalid')
    if (!relative) {
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
      const trusted = new Set<string>()
      if (authority && !/[\s,@/\\?#]/.test(authority)) trusted.add(authority.toLowerCase())
      for (const configured of [process.env.NEXT_PUBLIC_SERVER_URL]) {
        if (!configured) continue
        const origin = new URL(configured)
        if (!origin.username && !origin.password && ['http:', 'https:'].includes(origin.protocol)) trusted.add(origin.host.toLowerCase())
      }
      if (process.env.PLATFORM_DOMAINS_ENABLED === 'true' && process.env.PLATFORM_ADMIN_HOST)
        trusted.add(process.env.PLATFORM_ADMIN_HOST.toLowerCase())
      if (!trusted.has(url.host.toLowerCase())) return null
    }
    const match = url.pathname.match(/^\/(?:api\/media\/file|media)\/([^/]+)$/)
    if (!match) return null
    const filename = decodeURIComponent(match[1])
    return validMediaFilename(filename) ? filename : null
  } catch { return null }
}

export function privateMediaHeaders(headers = new Headers()) {
  headers.set('Cache-Control', 'private, no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  const vary = new Set((headers.get('Vary') || '').split(',').map((value) => value.trim()).filter(Boolean))
  vary.add('Cookie'); vary.add('Authorization')
  headers.set('Vary', [...vary].join(', '))
  if (headers.get('Content-Type')?.split(';')[0] === 'image/svg+xml')
    headers.set('Content-Security-Policy', "sandbox; script-src 'none'")
  return headers
}
