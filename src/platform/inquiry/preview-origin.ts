import { isCustomerPagePath, type PlatformHost } from '@/platform/platform-hosts'
import { isSiteLocale } from '@/platform/site-locales'

/** Published sites have public inquiry forms, including their admin-host preview URL.
 * The endpoint still resolves the tenant and published status from the database.
 */
export function isPublishedPreviewInquiry(
  host: PlatformHost,
  headers: Headers,
  sourcePage: string,
  siteSlug: string,
) {
  if (host.kind !== 'admin') return false
  try {
    const expectedOrigin = `https://${host.host}`
    const page = new URL(sourcePage)
    const referer = new URL(headers.get('referer') || '')
    if (
      headers.get('origin') !== expectedOrigin ||
      page.origin !== expectedOrigin ||
      referer.origin !== expectedOrigin ||
      referer.pathname !== page.pathname
    )
      return false
    const [, prefix, slug, locale, ...tail] = page.pathname.split('/')
    return (
      prefix === 's' &&
      slug === siteSlug &&
      isSiteLocale(locale) &&
      isCustomerPagePath(tail.length ? `/${tail.join('/')}` : '')
    )
  } catch {
    return false
  }
}
