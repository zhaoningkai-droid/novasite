import { afterEach, describe, expect, it, vi } from 'vitest'
import { ga4Target, ga4TrackingTarget } from '../../src/platform/analytics/ga4-config'
import { ga4BrowserAllowed, ga4PageLocation } from '../../src/platform/analytics/ga4-browser'

// User requirements: one approved test preview only, other previews/local sites excluded,
// formal tracking requires the company's actual published domain; never send form text.
const env = {
  NODE_ENV: 'production', GA4_ENABLED: 'true', PLATFORM_ADMIN_HOST: 'admin.example.com', PLATFORM_ROOT_DOMAIN: 'example.com',
  GA4_PREVIEW_TEST_ENABLED: 'true', GA4_PREVIEW_TEST_SLUG: 'approved',
  GA4_PREVIEW_TEST_ORIGIN: 'https://admin.example.com', GA4_PREVIEW_TEST_MEASUREMENT_ID: 'G-EXAMPLE1', GA4_PREVIEW_TEST_PROPERTY_ID: '123456',
// Only GA4-related keys are supplied; never inherit real credentials into the policy fixture.
} as unknown as NodeJS.ProcessEnv
const site = { slug: 'approved', status: 'building' }
const formal = { slug: 'customer', status: 'published', primaryDomain: 'https://customer.example.com', seo: { googleAnalyticsId: 'G-EXAMPLE2', googleAnalyticsPropertyId: '234567' } }

afterEach(() => vi.unstubAllEnvs())
describe('GA4 collection boundaries', () => {
  it('allows only the explicitly approved preview, never an inferred neighbor', () => {
    const target = ga4TrackingTarget(site, 'admin.example.com', env)!
    expect(target.mode).toBe('test_preview')
    for (const path of ['/s/approved/zh', '/s/approved/en/products/item'])
      expect(ga4BrowserAllowed(target, `https://admin.example.com${path}`)).toBe(true)
    for (const path of ['/s/other/zh', '/s/approved-more/zh', '/workspace/approved', '/login', '/s/approved/zh/api', '/template-demo/approved/zh'])
      expect(ga4BrowserAllowed(target, `https://admin.example.com${path}`)).toBe(false)
    expect(ga4Target({ slug: 'other', status: 'building' }, env)).toBeNull()
  })
  it('does not collect from local development, wrong origins, or suspended sites', () => {
    expect(ga4TrackingTarget(site, 'admin.example.com', { ...env, NODE_ENV: 'development' })).toBeNull()
    expect(ga4TrackingTarget(site, 'localhost:3100', env)).toBeNull()
    expect(ga4Target({ ...site, status: 'suspended' }, env)).toBeNull()
    const target = ga4Target(site, env)!
    expect(ga4BrowserAllowed(target, 'http://admin.example.com/s/approved/zh')).toBe(false)
    expect(ga4BrowserAllowed(target, 'https://elsewhere.example.com/s/approved/zh')).toBe(false)
  })
  it('requires an explicit published formal domain and both IDs', () => {
    expect(ga4TrackingTarget(formal, 'customer.example.com', env)?.mode).toBe('production')
    for (const candidate of [{ ...formal, primaryDomain: '' }, { ...formal, status: 'building' }, { ...formal, seo: {} }, { ...formal, primaryDomain: 'https://admin.example.com' }])
      expect(ga4Target(candidate, env)).toBeNull()
    expect(ga4TrackingTarget(formal, 'admin.example.com', env)).toBeNull()
    const target = ga4Target(formal, env)!
    expect(ga4BrowserAllowed(target, 'https://customer.example.com/en/products/item')).toBe(true)
    expect(ga4BrowserAllowed(target, 'https://customer.example.com/workspace')).toBe(false)
    expect(ga4BrowserAllowed(target, 'https://customer.example.com/s/customer/zh')).toBe(false)
  })
  it('keeps the master switch off by default and removes personal query/hash data', () => {
    expect(ga4Target(site, { ...env, GA4_ENABLED: 'false' })).toBeNull()
    expect(ga4PageLocation('https://customer.example.com/en?email=private%40example.com&name=Visitor&utm_source=google&utm_medium=cpc&utm_campaign=Spring_26#phone'))
      .toBe('https://customer.example.com/en?utm_source=google&utm_medium=cpc&utm_campaign=Spring_26')
  })
})
