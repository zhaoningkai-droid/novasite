import { isCustomerPagePath } from '../platform-hosts'
import type { Ga4Target } from './ga4-config'

export type Ga4BrowserTarget = Omit<Ga4Target, 'propertyId'> & { realtimeEventName?: string }
declare global {
  interface Window {
    dataLayer?: unknown[]
    novasiteGa4?: { slug: string; lead: (identity: string) => void }
  }
}

/** Check the actual browser location as well as the server's host check. */
export function ga4BrowserAllowed(target: Ga4BrowserTarget, location: string) {
  try {
    const url = new URL(location)
    if (url.origin !== target.origin || url.protocol !== 'https:') return false
    let path = url.pathname
    if (target.mode === 'test_preview') {
      if (!target.pathPrefix || !path.startsWith(target.pathPrefix)) return false
      path = path.slice(target.pathPrefix.length - 1)
    } else if (/^\/(?:s|admin|workspace|login|template-demo|api)(?:\/|$)/.test(path)) return false
    const localized = path.match(/^\/(?:zh|en|ru|id|es|ar|de)(\/.*)?$/)
    if (localized) path = localized[1] || '/'
    else if (target.mode === 'test_preview') return false
    return isCustomerPagePath(path)
  } catch { return false }
}

/** Never forward form/query text, hashes, telephone numbers, or full outbound URLs. */
export function ga4PageLocation(location: string) {
  const url = new URL(location)
  const query = new URLSearchParams()
  for (const name of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = url.searchParams.get(name)
    if (value && /^[a-zA-Z0-9_.~-]{1,100}$/.test(value)) query.set(name, value)
  }
  return url.origin + url.pathname + (query.size ? `?${query}` : '')
}

export function trackGa4Inquiry(slug: string, requestIdentity: string) {
  if (typeof window !== 'undefined' && window.novasiteGa4?.slug === slug)
    window.novasiteGa4.lead(requestIdentity)
}
