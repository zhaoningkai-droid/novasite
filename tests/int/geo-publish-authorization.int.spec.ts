import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createGeoPublishAuthorization } from '../../src/platform/geo/publish-authorization'
import { dispatchOneGeoPlan } from '../../src/platform/geo/plan-store'

const admin = { id: 1, roles: ['site-admin'], tenants: [{ tenant: 7 }] }
function fixture(user: unknown = admin, tenant: unknown = { id: 7 }) {
  const findByID = vi.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(tenant)
  return { findByID, authorize: createGeoPublishAuthorization({ findByID } as unknown as Pick<Payload, 'findByID'>) }
}

describe('GEO worker authorization: permission denial versus lookup failure', () => {
  it('allows assigned administrators but rejects another company', async () => {
    expect(await fixture().authorize(1, 7)).toEqual(admin)
    expect(await fixture().authorize(1, 8)).toBeNull()
  })
  it.each([
    [null, { id: 7 }],
    [admin, null],
    [{ ...admin, roles: ['viewer'] }, { id: 7 }],
    [{ ...admin, expiresAt: '2000-01-01T00:00:00Z' }, { id: 7 }],
  ])('denies missing, expired, or unauthorized identities', async (user, tenant) => {
    expect(await fixture(user, tenant).authorize(1, 7)).toBeNull()
  })
  it.each([1, 2])('does not convert lookup %i failure into permission revocation', async (lookup) => {
    const { findByID, authorize } = fixture()
    findByID.mockReset()
    if (lookup === 2) findByID.mockResolvedValueOnce(admin)
    findByID.mockRejectedValueOnce(new Error('temporary database outage'))
    await expect(authorize(1, 7)).rejects.toThrow('temporary database outage')
  })
  it('rolls back a due plan without pausing or creating a failure record on lookup outage', async () => {
    const { findByID, authorize } = fixture()
    findByID.mockReset().mockRejectedValue(new Error('temporary database outage'))
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('SELECT p.*') ? [{ actor_id: 1, tenant_id: 7 }] : [] }))
    const release = vi.fn()
    const pool = { connect: async () => ({ query, release }) }
    await expect(dispatchOneGeoPlan(pool as never, { authorize, canAuto: () => true })).rejects.toThrow('temporary database outage')
    expect(query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK')
    expect(query.mock.calls.some(([sql]) => /INSERT|UPDATE platform_geo/.test(sql))).toBe(false)
    expect(release).toHaveBeenCalledOnce()
  })
})
