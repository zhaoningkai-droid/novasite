import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertGeoRequestOrigin } from '../../src/platform/geo/request-origin'

afterEach(() => vi.unstubAllEnvs())
const request = (origin: string, extra: Record<string, string> = {}) =>
  new Request('http://0.0.0.0:3000/api/workspace/company/geo/ai', {
    method: 'POST', headers: { origin, ...extra },
  })

describe('GEO origin validation behind the production proxy', () => {
  it('accepts the configured HTTPS admin even when the upstream request URL is HTTP', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://admin.o669.com')
    expect(() => assertGeoRequestOrigin(request('https://admin.o669.com'))).not.toThrow()
  })
  it('rejects unrelated origins, wrong protocols, and forged forwarded identity', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://admin.o669.com')
    for (const origin of ['https://external.example', 'http://admin.o669.com', 'http://0.0.0.0:3000'])
      expect(() => assertGeoRequestOrigin(request(origin, {
        'x-forwarded-host': new URL(origin).host, 'x-forwarded-proto': new URL(origin).protocol.slice(0, -1),
      }))).toThrow('请求来源无效')
    expect(() => assertGeoRequestOrigin(request('https://admin.o669.com', {
      'sec-fetch-site': 'cross-site',
    }))).toThrow('请求来源无效')
  })
  it('keeps local development working when no public URL is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')
    expect(() => assertGeoRequestOrigin(new Request('http://localhost:3100/api/geo', {
      headers: { origin: 'http://localhost:3100' },
    }))).not.toThrow()
  })
})
