import { Ga4ApiError, ga4Post } from './ga4-auth.server'
import { ga4Target, type Ga4Site } from './ga4-config'
import { ga4RealtimeEvent } from './ga4-realtime-key.server'

export type Ga4Realtime = {
  status: 'ready' | 'unavailable' | 'not_configured'
  views: number | null
  fetchedAt?: string
}
const cache = new Map<string, { until: number; result: Promise<Ga4Realtime> }>()
const count = (value?: string) => {
  const number = Number(value || 0)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

/** The caller must first authorize access to this company, just like core reports. */
export async function readGa4Realtime(site: Ga4Site): Promise<Ga4Realtime> {
  const target = ga4Target(site)
  if (!target) return { status: 'not_configured', views: null }
  const event = ga4RealtimeEvent(target)
  const key = JSON.stringify([target, process.env.GA4_CREDENTIALS_FILE])
  const existing = cache.get(key)
  if (existing && existing.until > Date.now()) return existing.result
  const entry = { until: Date.now() + 30_000, result: Promise.resolve<Ga4Realtime>(
    { status: 'unavailable', views: null },
  ) }
  entry.result = ga4Post(`properties/${target.propertyId}:runRealtimeReport`, {
    // Google does not support activeUsers with an eventName filter in Realtime.
    // Keep the company boundary instead of falling back to property-wide users.
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: event } },
    },
  }).then((report) => {
    // An authorized, entirely empty realtime response can contain only `kind`.
    const empty = report.kind === 'analyticsData#runRealtimeReport' &&
      !report.rows?.length && !report.metricHeaders?.length
    if (!empty && (!Array.isArray(report.metricHeaders) || report.metricHeaders.length !== 1 ||
      report.metricHeaders[0]?.name !== 'eventCount'))
      throw new Ga4ApiError('unavailable')
    const values = report.rows?.[0]?.metricValues
    return {
      status: 'ready' as const, views: count(values?.[0]?.value),
      fetchedAt: new Date().toISOString(),
    }
  }).catch(() => {
    entry.until = Date.now() + 15_000
    return { status: 'unavailable', views: null } as Ga4Realtime
  })
  if (cache.size >= 100) cache.delete(cache.keys().next().value!)
  cache.set(key, entry)
  return entry.result
}
