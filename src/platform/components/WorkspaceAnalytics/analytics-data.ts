export type AnalyticsRange = 7 | 30 | 90
export type AnalyticsCounts = { blog: number; cases: number; news: number; products: number }
export type LeadSample = { createdAt: string; utmSource?: string | null }
export type LeadAnalytics = {
  status: 'ready' | 'forbidden' | 'unavailable'
  count: number | null
  daily: { date: string; count: number }[]
  sources: { label: string; count: number }[]
}

const DAY = 86_400_000
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000

export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRange {
  return value === '7' ? 7 : value === '90' ? 90 : 30
}

/** One stable snapshot, including today, using the workspace's Shanghai calendar. */
export function analyticsWindow(range: AnalyticsRange, now: Date) {
  const today = new Date(now.getTime() + SHANGHAI_OFFSET).toISOString().slice(0, 10)
  const midnight = new Date(`${today}T00:00:00+08:00`).getTime()
  const start = midnight - (range - 1) * DAY
  return {
    start: new Date(start).toISOString(),
    end: now.toISOString(),
    dates: Array.from({ length: range }, (_, index) =>
      new Date(start + index * DAY + SHANGHAI_OFFSET).toISOString().slice(0, 10)),
  }
}

export function summarizeLeads(samples: LeadSample[], range: AnalyticsRange, now: Date): LeadAnalytics {
  const window = analyticsWindow(range, now)
  const days = new Map(window.dates.map((date) => [date, 0]))
  const sources = new Map<string, number>()
  let count = 0
  for (const sample of samples) {
    const timestamp = Date.parse(sample.createdAt)
    if (!Number.isFinite(timestamp) || timestamp < Date.parse(window.start) || timestamp > now.getTime()) continue
    const date = new Date(timestamp + SHANGHAI_OFFSET).toISOString().slice(0, 10)
    if (!days.has(date)) continue
    days.set(date, (days.get(date) || 0) + 1)
    // Only aggregate channel labels; do not send contact details or URLs to the browser.
    const source = sample.utmSource?.trim().slice(0, 80) || '未记录来源'
    sources.set(source, (sources.get(source) || 0) + 1)
    count += 1
  }
  return {
    status: 'ready',
    count,
    daily: Array.from(days, ([date, dailyCount]) => ({ date, count: dailyCount })),
    sources: Array.from(sources, ([label, sourceCount]) => ({ label, count: sourceCount }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN')),
  }
}

/** Prevent spreadsheet formulas in exported tenant names and UTM source labels. */
export function csvCell(value: string | number) {
  const text = String(value)
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
