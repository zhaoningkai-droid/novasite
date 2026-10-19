import type { AnalyticsRange } from '../components/WorkspaceAnalytics/analytics-data'
import { analyticsWindow } from '../components/WorkspaceAnalytics/analytics-data'
import { Ga4ApiError, ga4Post } from './ga4-auth.server'
import { ga4Target, type Ga4Site, type Ga4Target } from './ga4-config'
import { ga4Unavailable, type Ga4Traffic } from './ga4-types'

type Row = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }
type Report = { rows?: Row[]; metadata?: { timeZone?: string; subjectToThresholding?: boolean } }
const number = (row: Row | undefined, index: number) => {
  const value = Number(row?.metricValues?.[index]?.value || 0)
  return Number.isFinite(value) && value >= 0 ? value : 0
}
const dimension = (row: Row, index = 0) => row.dimensionValues?.[index]?.value || ''
const cache = new Map<string, { until: number; result: Promise<Ga4Traffic> }>()

/** Filter shared-host preview traffic by both hostname and the exact company path. */
export function ga4TrafficFilter(target: Ga4Target) {
  const expressions: unknown[] = [{ filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: new URL(target.origin).hostname } } }]
  if (target.pathPrefix) expressions.push({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: target.pathPrefix } } })
  return { andGroup: { expressions } }
}

async function query(target: Ga4Target, range: AnalyticsRange, now: Date): Promise<Ga4Traffic> {
  const dates = analyticsWindow(range, now).dates
  const base = { property: `properties/${target.propertyId}`, dateRanges: [{ startDate: dates[0], endDate: dates.at(-1) }], dimensionFilter: ga4TrafficFilter(target), keepEmptyRows: true }
  const metrics = (...names: string[]) => names.map((name) => ({ name }))
  const requests = [
    { ...base, metrics: metrics('screenPageViews', 'totalUsers') },
    { ...base, dimensions: [{ name: 'date' }], metrics: metrics('screenPageViews', 'totalUsers'), orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 90 },
    { ...base, dimensions: [{ name: 'sessionSourceMedium' }], metrics: metrics('sessions'), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 },
    { ...base, dimensions: [{ name: 'pagePath' }], metrics: metrics('screenPageViews'), orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10 },
    { ...base, dimensions: [{ name: 'eventName' }], metrics: metrics('eventCount'), dimensionFilter: { andGroup: { expressions: [base.dimensionFilter, { filter: { fieldName: 'eventName', inListFilter: { values: ['generate_lead', 'whatsapp_click'] } } }] } } },
  ]
  const [batch, lifetime]: [{ reports: Report[] }, Report] = await Promise.all([
    ga4Post(`properties/${target.propertyId}:batchRunReports`, { requests }),
    ga4Post(`properties/${target.propertyId}:runReport`, { ...base, dateRanges: [{ startDate: '2020-01-01', endDate: dates.at(-1) }], metrics: metrics('screenPageViews') }),
  ])
  if (!Array.isArray(batch.reports) || batch.reports.length !== requests.length) throw new Ga4ApiError('unavailable')
  const [totals, daily, sources, pages, conversions] = batch.reports
  const byDate = new Map(daily.rows?.map((row) => [dimension(row), row]))
  const events = new Map(conversions.rows?.map((row) => [dimension(row), number(row, 0)]))
  return {
    status: 'ready', mode: target.mode, fetchedAt: now.toISOString(), timeZone: totals.metadata?.timeZone || 'Asia/Shanghai',
    message: target.mode === 'test_preview' ? 'GA4 测试资源：仅统计指定公司的管理域预览，与正式客户统计分开。' : '来自当前公司 GA4。报表有处理延迟，访客数按 GA4 用户口径统计。',
    views: number(totals.rows?.[0], 0), users: number(totals.rows?.[0], 1), totalViews: number(lifetime.rows?.[0], 0),
    conversions: events.get('generate_lead') || 0, whatsappClicks: events.get('whatsapp_click') || 0,
    daily: dates.map((date) => ({ date, views: number(byDate.get(date.replaceAll('-', '')), 0), users: number(byDate.get(date.replaceAll('-', '')), 1) })),
    sources: (sources.rows || []).map((row) => ({ label: dimension(row).slice(0, 160) || '未识别来源', sessions: number(row, 0) })),
    pages: (pages.rows || []).map((row) => ({ path: dimension(row).split('?')[0].slice(0, 250), views: number(row, 0) })),
  }
}

/** Call only after the workspace has checked access to this company. No client-supplied property IDs. */
export async function readGa4Traffic(site: Ga4Site, range: AnalyticsRange, now = new Date()): Promise<Ga4Traffic> {
  const target = ga4Target(site)
  if (!target) return ga4Unavailable('not_configured', '尚未接入 GA4，或尚未配置正式主域名和两个 GA4 编号。')
  if (!process.env.GA4_CREDENTIALS_FILE) return ga4Unavailable('missing_credentials', 'GA4 读取凭据尚未配置，请联系平台管理员。')
  const key = JSON.stringify([target, range, analyticsWindow(range, now).dates[0], analyticsWindow(range, now).dates.at(-1)])
  const existing = cache.get(key)
  if (existing && existing.until > Date.now()) return existing.result
  const entry = { until: Date.now() + 120_000, result: Promise.resolve<Ga4Traffic>(ga4Unavailable('unavailable', 'GA4 暂不可用。')) }
  entry.result = query(target, range, now).catch((error) => {
    entry.until = Date.now() + 15_000
    const category = error instanceof Ga4ApiError ? error.category : 'unavailable'
    const messages = { missing_credentials: 'GA4 私有凭据无法读取，请联系平台管理员。', permission_denied: 'GA4 授权不足，请核对媒体资源编号、只读权限和 Data API 是否启用。', unavailable: 'GA4 暂时无法读取，请稍后刷新；询盘和内容管理仍可使用。' }
    return ga4Unavailable(category, messages[category])
  })
  if (cache.size >= 100) cache.delete(cache.keys().next().value!)
  cache.set(key, entry)
  return entry.result
}
