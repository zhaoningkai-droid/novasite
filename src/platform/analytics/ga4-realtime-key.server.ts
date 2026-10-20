import { createHash } from 'node:crypto'
import type { Ga4Target } from './ga4-config'

// Realtime has no hostname/pagePath filters. A companion view event isolates the
// exact company and origin without custom-dimension registration or shared IDs.
export function ga4RealtimeEvent(target: Ga4Target) {
  const scope = JSON.stringify([target.slug, target.origin, target.pathPrefix])
  return `ns_pv_${createHash('sha256').update(scope).digest('hex').slice(0, 24)}`
}
