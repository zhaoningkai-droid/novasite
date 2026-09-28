// Shared by public rendering and authenticated previews. Reject active/foreign-site URLs.
export function templateHref(base: string, value: string): string | null {
  const href = value.trim()
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href
  if (href.startsWith('#')) return href
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\u0000-\u001f]/.test(href)) return null
  const ownSite = /^\/s\/[^/]+\/(en|zh|ru|id)(\/.*|\?.*|$)/.exec(href)
  if (ownSite) return `${base}${ownSite[2] || ''}`
  if (href.startsWith('/s/') || href.startsWith('/template-preview/')) return null
  return `${base}${href === '/' ? '' : href.replace(/^\/faq(?=[?#]|$)/, '/faqs')}`
}
