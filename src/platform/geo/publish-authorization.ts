import type { Payload } from 'payload'
import { userHasRole } from '../../access/roles'

/** A failed lookup is not evidence that an actor lost permission. */
export function createGeoPublishAuthorization(payload: Pick<Payload, 'findByID'>) {
  return async (actorID: number, tenantID: number) => {
    // Worker-only identity lookup. Tenant membership and roles are checked below.
    // disableErrors returns null for a missing record; infrastructure errors still throw.
    const user = await payload.findByID({
      collection: 'users', id: actorID, depth: 0, overrideAccess: true, disableErrors: true,
    })
    if (!user) return null
    const tenant = await payload.findByID({
      collection: 'tenants', id: tenantID, depth: 0, overrideAccess: true, disableErrors: true,
    })
    if (!tenant) return null
    if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) return null
    const allowed = userHasRole(user, ['super-admin']) || (
      userHasRole(user, ['site-admin', 'editor']) && user.tenants?.some((row) =>
        Number(typeof row.tenant === 'object' && row.tenant ? row.tenant.id : row.tenant) === tenantID,
      )
    )
    return allowed ? user : null
  }
}
