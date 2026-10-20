// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../src/platform/analytics/ga4-auth.server', () => ({
  ga4Post: api.post,
  Ga4ApiError: class extends Error {},
}))
import { readGa4Realtime } from '../../src/platform/analytics/ga4-realtime.server'
import { ga4RealtimeEvent } from '../../src/platform/analytics/ga4-realtime-key.server'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-20T04:00:00Z'))
  api.post.mockReset()
  for (const [key, value] of Object.entries({
    GA4_ENABLED: 'true', GA4_CREDENTIALS_FILE: '/mock.json',
    GA4_PREVIEW_TEST_ENABLED: 'false',
  })) vi.stubEnv(key, value)
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

const site = (slug: string) => ({
  slug, status: 'published', primaryDomain: `https://${slug}.example.com`,
  seo: { googleAnalyticsId: 'G-EXAMPLE1', googleAnalyticsPropertyId: '123456' },
})
const report = (views: number) => ({
  metricHeaders: [{ name: 'eventCount' }],
  rows: [{ metricValues: [{ value: String(views) }] }],
})

describe('company-scoped realtime analytics', () => {
  it('separates companies even with the same property and expires cached results', async () => {
    api.post.mockResolvedValue(report(5))
    expect(await readGa4Realtime(site('alpha'))).toMatchObject({
      status: 'ready', views: 5,
    })
    await readGa4Realtime(site('alpha'))
    expect(api.post).toHaveBeenCalledTimes(1)
    await readGa4Realtime(site('beta'))
    const filters = api.post.mock.calls.map(([, body]) => body.dimensionFilter)
    expect(filters[0]).not.toEqual(filters[1])
    expect(filters[0].filter.fieldName).toBe('eventName')
    expect(filters[0].filter.stringFilter.matchType).toBe('EXACT')
    expect(api.post.mock.calls[0][1].metrics).toEqual([{ name: 'eventCount' }])
    vi.advanceTimersByTime(30_001)
    api.post.mockResolvedValue(report(6))
    expect(await readGa4Realtime(site('alpha'))).toMatchObject({ views: 6 })
  })
  it('keeps denied/malformed realtime data distinct from an authorized zero', async () => {
    api.post.mockRejectedValueOnce(new Error('denied'))
    expect(await readGa4Realtime(site('denied'))).toMatchObject({
      status: 'unavailable', views: null,
    })
    api.post.mockResolvedValueOnce({})
    expect((await readGa4Realtime(site('malformed'))).status).toBe('unavailable')
    api.post.mockResolvedValueOnce({ kind: 'analyticsData#runRealtimeReport' })
    expect(await readGa4Realtime(site('empty'))).toMatchObject({
      status: 'ready', views: 0,
    })
  })
  it('never queries Google for an unconfigured company', async () => {
    expect((await readGa4Realtime({ slug: 'unconfigured' })).status).toBe('not_configured')
    expect(api.post).not.toHaveBeenCalled()
  })
  it('binds the realtime event to both company and collection origin/path', () => {
    const target = {
      slug: 'alpha', origin: 'https://admin.example.com', pathPrefix: '/s/alpha/',
      mode: 'test_preview' as const, measurementId: 'G-EXAMPLE1', propertyId: '123456',
    }
    expect(ga4RealtimeEvent(target)).toMatch(/^[a-z][a-z0-9_]{0,39}$/)
    expect(ga4RealtimeEvent(target)).not.toBe(ga4RealtimeEvent({ ...target, slug: 'beta' }))
    expect(ga4RealtimeEvent(target)).not.toBe(ga4RealtimeEvent({
      ...target, origin: 'https://alpha.example.com', pathPrefix: null,
    }))
  })
})
