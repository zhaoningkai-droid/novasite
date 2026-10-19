// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { resolveGeoSourceAddresses } from '../../src/platform/geo/source-fetch'

// Regression for the reproduced local fake-IP DNS failure; keep private source rejection.
describe('GEO public source DNS', () => {
  it('uses verified public DNS for a local proxy fake-IP answer', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        Status: 0,
        Answer: [{ type: 1, data: '104.21.40.185' }],
      }),
    )
    expect(
      await resolveGeoSourceAddresses('public.example', {
        lookup: async () => [{ address: '198.18.1.84', family: 4 }],
        fetcher,
      }),
    ).toEqual([{ address: '104.21.40.185', family: 4 }])
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://cloudflare-dns.com/dns-query?name=public.example&type=A',
    )
  })
  it('rejects private and mixed answers without trying another resolver', async () => {
    for (const values of [['10.0.0.1'], ['198.18.1.1', '127.0.0.1'], ['8.8.8.8', '10.0.0.1']]) {
      const fetcher = vi.fn()
      await expect(
        resolveGeoSourceAddresses('private.example', {
          lookup: async () => values.map((address) => ({ address, family: 4 })),
          fetcher,
        }),
      ).rejects.toMatchObject({ code: 'PRIVATE_SOURCE' })
      expect(fetcher).not.toHaveBeenCalled()
    }
  })
  it('rejects a private answer returned by the independent resolver', async () => {
    await expect(
      resolveGeoSourceAddresses('rebind.example', {
        lookup: async () => [{ address: '::ffff:198.18.1.84', family: 6 }],
        fetcher: async () =>
          Response.json({
            Status: 0,
            Answer: [{ type: 1, data: '169.254.169.254' }],
          }),
      }),
    ).rejects.toMatchObject({ code: 'PRIVATE_SOURCE' })
  })
  it('preserves a normal public result without an external lookup', async () => {
    const fetcher = vi.fn()
    expect(
      await resolveGeoSourceAddresses('normal.example', {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        fetcher,
      }),
    ).toEqual([{ address: '8.8.8.8', family: 4 }])
    expect(fetcher).not.toHaveBeenCalled()
  })
})
