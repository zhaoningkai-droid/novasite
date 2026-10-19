import { normalizeHostname } from '../platform-hosts'
import { optionalSiteOrigin } from '../site-url'

export type Ga4Site = {
  slug: string
  status?: string
  primaryDomain?: string | null
  seo?: { googleAnalyticsId?: string | null; googleAnalyticsPropertyId?: string | null } | null
}
export type Ga4Target = {
  slug: string
  measurementId: string
  propertyId: string
  origin: string
  mode: 'production' | 'test_preview'
  pathPrefix: string | null
}

export const ga4MeasurementId = (value: unknown) =>
  typeof value === 'string' && /^G-[A-Z0-9]{4,20}$/.test(value.trim().toUpperCase())
    ? value.trim().toUpperCase() : ''
export const ga4PropertyId = (value: unknown) =>
  typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value.trim()) ? value.trim() : ''

function publicOrigin(value: string | null | undefined) {
  const origin = optionalSiteOrigin(value)
  if (!origin) return null
  const url = new URL(origin), host = normalizeHostname(url.host)
  if (url.protocol !== 'https:' || !host || !host.includes('.') ||
    /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host)) return null
  return origin
}

/** A single explicit, server-controlled preview exception. Never infer it from query parameters. */
export function ga4Target(site: Ga4Site, env: NodeJS.ProcessEnv = process.env): Ga4Target | null {
  if (env.GA4_ENABLED !== 'true' || site.status === 'suspended') return null
  if (env.GA4_PREVIEW_TEST_ENABLED === 'true' && site.slug === env.GA4_PREVIEW_TEST_SLUG) {
    const origin = publicOrigin(env.GA4_PREVIEW_TEST_ORIGIN)
    const measurementId = ga4MeasurementId(env.GA4_PREVIEW_TEST_MEASUREMENT_ID)
    const propertyId = ga4PropertyId(env.GA4_PREVIEW_TEST_PROPERTY_ID)
    if (origin && measurementId && propertyId && /^[a-z0-9][a-z0-9-]*$/.test(site.slug))
      return { slug: site.slug, origin, measurementId, propertyId, mode: 'test_preview', pathPrefix: `/s/${site.slug}/` }
  }
  const origin = publicOrigin(site.primaryDomain)
  const measurementId = ga4MeasurementId(site.seo?.googleAnalyticsId)
  const propertyId = ga4PropertyId(site.seo?.googleAnalyticsPropertyId)
  if (!origin || !measurementId || !propertyId || site.status !== 'published') return null
  // A platform/admin hostname is not a customer's formal domain.
  const host = new URL(origin).hostname
  if (host === normalizeHostname(env.PLATFORM_ADMIN_HOST) || host === normalizeHostname(env.PLATFORM_ROOT_DOMAIN)) return null
  return { slug: site.slug, origin, measurementId, propertyId, mode: 'production', pathPrefix: null }
}

/** A preview configuration must never suppress formal collection after its company binds a domain. */
export function ga4TrackingTarget(site: Ga4Site, authority: string | null, env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return null
  const host = normalizeHostname(authority)
  const candidate = ga4Target(site, env)
  if (candidate && host === new URL(candidate.origin).hostname) return candidate
  const formal = ga4Target(site, { ...env, GA4_PREVIEW_TEST_ENABLED: 'false' })
  return formal && host === new URL(formal.origin).hostname ? formal : null
}
