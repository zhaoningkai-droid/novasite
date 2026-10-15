import { isSiteLocale, type SiteLocale } from '../site-locales'

// Both public and preview bases end in a supported locale.
export function templateLocaleHref(base: string, locale: SiteLocale): string {
  const parts = base.split('/')
  if (!isSiteLocale(parts.at(-1) || '')) return base
  parts[parts.length - 1] = locale
  return parts.join('/')
}

// Shared by public rendering and authenticated previews. Reject active/foreign-site URLs.
export function templateHref(base: string, value: string): string | null {
  const href = value.trim()
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href
  if (href.startsWith('#')) return href
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\u0000-\u001f]/.test(href)) return null
  const ownSite = /^\/s\/([^/]+)\/([^/]+)(\/.*|\?.*|#.*|$)/.exec(href)
  const company = /^\/(?:s|template-preview)\/([^/]+)/.exec(base)?.[1]
  if (ownSite && ownSite[1] === company && isSiteLocale(ownSite[2]))
    return `${base}${ownSite[3] || ''}`
  if (href.startsWith('/s/') || href.startsWith('/template-preview/')) return null
  return `${base}${href === '/' ? '' : href.replace(/^\/faq(?=[?#]|$)/, '/faqs')}`
}
