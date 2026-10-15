import type { SiteLocale } from './site-locales'

/** Build a tenant site URL without importing server-only Payload modules. */
export const siteHref = (site: string, locale: SiteLocale, path = '') =>
  `/s/${site}/${locale}${path}`

/** Optional display input can be a bare domain or a full HTTP(S) address. */
export function optionalSiteOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  try {
    const input = value.trim()
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : null
  } catch { return null }
}
