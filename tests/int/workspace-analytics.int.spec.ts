import { describe, expect, it } from 'vitest'

import { analyticsWindow, csvCell, parseAnalyticsRange, summarizeLeads } from '../../src/platform/components/WorkspaceAnalytics/analytics-data'

// Scenarios come from the user's request to retain website data without inaccurate metrics:
// exact selected ranges, timezone boundaries, empty states and reliable spreadsheet export.
describe('website data aggregation', () => {
  const now = new Date('2026-09-29T01:30:00.000Z')

  it('limits URL ranges to 7, 30 and 90 days and rejects duplicated or unsafe inputs', () => {
    expect(parseAnalyticsRange('7')).toBe(7)
    expect(parseAnalyticsRange('90')).toBe(90)
    expect(parseAnalyticsRange(undefined)).toBe(30)
    expect(parseAnalyticsRange(['7', '90'])).toBe(30)
    expect(parseAnalyticsRange('-999')).toBe(30)
  })

  it.each([7, 30, 90] as const)('includes exactly %i Shanghai dates, ending today', (range) => {
    const window = analyticsWindow(range, now)
    expect(window.dates).toHaveLength(range)
    expect(window.dates.at(-1)).toBe('2026-09-29')
    expect(window.start).toMatch(/T16:00:00.000Z$/)
    expect(window.end).toBe(now.toISOString())
  })

  it('includes the first midnight, excludes older/future/invalid records, and reconciles chart totals', () => {
    const stats = summarizeLeads([
      { createdAt: '2026-09-22T15:59:59.999Z', utmSource: 'old' },
      { createdAt: '2026-09-22T16:00:00.000Z', utmSource: 'google' },
      { createdAt: '2026-09-28T15:59:59.999Z', utmSource: ' google ' },
      { createdAt: '2026-09-28T16:00:00.000Z', utmSource: '' },
      { createdAt: now.toISOString() },
      { createdAt: '2026-09-29T01:30:00.001Z', utmSource: 'future' },
      { createdAt: 'invalid', utmSource: 'invalid' },
    ], 7, now)
    expect(stats.count).toBe(4)
    expect(stats.daily.find((day) => day.date === '2026-09-23')?.count).toBe(1)
    expect(stats.daily.find((day) => day.date === '2026-09-28')?.count).toBe(1)
    expect(stats.daily.at(-1)?.count).toBe(2)
    expect(stats.sources).toContainEqual({ label: 'google', count: 2 })
    expect(stats.sources).toContainEqual({ label: '未记录来源', count: 2 })
    expect(stats.daily.reduce((sum, day) => sum + day.count, 0)).toBe(stats.count)
    expect(stats.sources.reduce((sum, source) => sum + source.count, 0)).toBe(stats.count)
  })

  it('returns a true zero for an empty inquiry set without generating traffic metrics', () => {
    const stats = summarizeLeads([], 30, now)
    expect(stats.count).toBe(0)
    expect(stats.daily.every((day) => day.count === 0)).toBe(true)
    expect(stats.sources).toEqual([])
    expect(stats).not.toHaveProperty('pv')
    expect(stats).not.toHaveProperty('uv')
  })

  it('escapes CSV quotes and protects formula-like source labels', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""')
    expect(csvCell('=HYPERLINK("test")')).toBe('"\'=HYPERLINK(""test"")"')
    expect(csvCell('  @SUM(1)')).toBe('"\'  @SUM(1)"')
    expect(csvCell(3)).toBe('"3"')
  })
})
