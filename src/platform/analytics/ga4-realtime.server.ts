import { Ga4ApiError, ga4Post } from './ga4-auth.server'
import { ga4Target, type Ga4Site } from './ga4-config'
import { ga4RealtimeEvent } from './ga4-realtime-key.server'

export type Ga4Realtime = {
  status: 'ready' | 'unavailable' | 'not_configured'
  views: number | null
  users: number | null
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
  if (!target) return { status: 'not_configured', views: null, users: null }
  const event = ga4RealtimeEvent(target)
  const key = JSON.stringify([target, process.env.GA4_CREDENTIALS_FILE])
  const existing = cache.get(key)
  if (existing && existing.until > Date.now()) return existing.result
  const entry = { until: Date.now() + 30_000, result: Promise.resolve<Ga4Realtime>(
    { status: 'unavailable', views: null, users: null },
  ) }
  entry.result = ga4Post(`properties/${target.propertyId}:runRealtimeReport`, {
    metrics: [{ name: 'eventCount' }, { name: 'activeUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: event } },
    },
  }).then((report) => {
    if (!Array.isArray(report.metricHeaders) || report.metricHeaders.length !== 2)
      throw new Ga4ApiError('unavailable')
    const values = report.rows?.[0]?.metricValues
    return {
      status: 'ready' as const, views: count(values?.[0]?.value),
      users: count(values?.[1]?.value), fetchedAt: new Date().toISOString(),
    }
  }).catch(() => {
    entry.until = Date.now() + 15_000
    return { status: 'unavailable', views: null, users: null } as Ga4Realtime
  })
  if (cache.size >= 100) cache.delete(cache.keys().next().value!)
  cache.set(key, entry)
  return entry.result
}
