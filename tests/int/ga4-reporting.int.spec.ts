// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../src/platform/analytics/ga4-auth.server', () => ({
  ga4Post: api.post,
  Ga4ApiError: class extends Error { constructor(public category: string) { super(category) } },
}))
import { Ga4ApiError } from '../../src/platform/analytics/ga4-auth.server'
import { readGa4Traffic } from '../../src/platform/analytics/ga4-reports.server'

// Requirements: property-bound reports, shared-host tenant isolation, true zero versus failure,
// deduplicated UV totals and conversions distinct from real database inquiries. No network/DB.
beforeEach(() => {
  api.post.mockReset()
  for (const [name, value] of Object.entries({ GA4_ENABLED: 'true', GA4_CREDENTIALS_FILE: '/unused/mock-only.json', GA4_PREVIEW_TEST_ENABLED: 'true', GA4_PREVIEW_TEST_SLUG: 'approved', GA4_PREVIEW_TEST_ORIGIN: 'https://admin.example.com', GA4_PREVIEW_TEST_MEASUREMENT_ID: 'G-EXAMPLE1', GA4_PREVIEW_TEST_PROPERTY_ID: '123456' })) vi.stubEnv(name, value)
})
afterEach(() => vi.unstubAllEnvs())
const row = (dimensions: string[], metrics: number[]) => ({ dimensionValues: dimensions.map((value) => ({ value })), metricValues: metrics.map((value) => ({ value: String(value) })) })
const now = new Date('2026-10-16T04:00:00.000Z')

describe('GA4 readonly reports', () => {
  it('filters every report to the bound property, hostname and exact tenant prefix', async () => {
    api.post.mockImplementation(async (path: string) => path.endsWith(':batchRunReports') ? { reports: [
      { rows: [row([], [8, 3])], metadata: { timeZone: 'Asia/Shanghai' } },
      { rows: [row(['20261016'], [4, 2]), row(['20261015'], [4, 2])] },
      { rows: [row(['google / organic'], [3])] },
      { rows: [row(['/s/approved/zh/products/part'], [5])] },
      { rows: [row(['generate_lead'], [2]), row(['whatsapp_click'], [4])] },
    ] } : { rows: [row([], [20])] })
    const result = await readGa4Traffic({ slug: 'approved', status: 'building' }, 7, now)
    expect(result).toMatchObject({ status: 'ready', mode: 'test_preview', users: 3, views: 8, totalViews: 20, conversions: 2, whatsappClicks: 4 })
    expect(result.daily).toHaveLength(7)
    expect(result.daily.at(-1)).toMatchObject({ date: '2026-10-16', views: 4, users: 2 })
    expect(result.sources).toEqual([{ label: 'google / organic', sessions: 3 }])
    expect(api.post).toHaveBeenCalledTimes(2)
    for (const [path, body] of api.post.mock.calls) {
      expect(path).toMatch(/^properties\/123456:/)
      const requests = body.requests || [body]
      for (const request of requests) {
        const encoded = JSON.stringify(request.dimensionFilter)
        expect(encoded).toContain('admin.example.com')
        expect(encoded).toContain('/s/approved/')
        expect(request.property).toBe('properties/123456')
      }
    }
  })
  it('reports an authorized empty resource as actual zero', async () => {
    api.post.mockImplementation(async (path: string) => path.endsWith(':batchRunReports') ? { reports: Array.from({ length: 5 }, () => ({})) } : {})
    const result = await readGa4Traffic({ slug: 'approved' }, 30, now)
    expect(result).toMatchObject({ status: 'ready', views: 0, users: 0, conversions: 0 })
    expect(result.daily).toHaveLength(30)
  })
  it('never presents authorization failures as zero or exposes Google response content', async () => {
    api.post.mockRejectedValue(new Ga4ApiError('permission_denied'))
    const result = await readGa4Traffic({ slug: 'approved' }, 90, now)
    expect(result).toMatchObject({ status: 'permission_denied', views: null, users: null, totalViews: null })
    expect(result.daily).toEqual([])
    expect(JSON.stringify(result)).not.toContain('mock-only')
  })
  it('does not call Google for other unconfigured companies', async () => {
    expect((await readGa4Traffic({ slug: 'other' }, 7)).status).toBe('not_configured')
    expect(api.post).not.toHaveBeenCalled()
  })
})
