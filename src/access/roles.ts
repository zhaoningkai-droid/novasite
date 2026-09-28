import type { Access, FieldAccess } from 'payload'

import type { User } from '@/payload-types'

export type PlatformRole = 'super-admin' | 'site-admin' | 'editor' | 'sales' | 'viewer'

export const userHasRole = (user: unknown, roles: PlatformRole[]): boolean => {
  const typedUser = user as User | null | undefined
  return Boolean(typedUser?.roles?.some((role) => roles.includes(role)))
}

/** Limit a non-platform user to the companies explicitly assigned to them. */
export const assignedTenants: Access = ({ req }) => {
  if (userHasRole(req.user, ['super-admin'])) return true

  const tenantIDs = (req.user as User | undefined)?.tenants
    ?.map((row) => typeof row.tenant === 'number' ? row.tenant : row.tenant?.id)
    .filter((id): id is number => typeof id === 'number') || []

  return tenantIDs.length ? { id: { in: tenantIDs } } : false
}

export const superAdmins: Access = ({ req }) => userHasRole(req.user, ['super-admin'])

export const siteAdmins: Access = ({ req }) =>
  userHasRole(req.user, ['super-admin', 'site-admin'])

export const contentEditors: Access = ({ req }) =>
  userHasRole(req.user, ['super-admin', 'site-admin', 'editor'])

export const salesUsers: Access = ({ req }) =>
  userHasRole(req.user, ['super-admin', 'site-admin', 'sales'])

export const superAdminField: FieldAccess = ({ req }) =>
  userHasRole(req.user, ['super-admin'])

export const selfOrSuperAdmin: Access = ({ req }) => {
  if (userHasRole(req.user, ['super-admin'])) return true
  if (!req.user) return false
  return { id: { equals: req.user.id } }
}
