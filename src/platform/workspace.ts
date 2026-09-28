import { getPayload } from 'payload'

import config from '@payload-config'
import type { Tenant, User } from '@/payload-types'

export type WorkspaceCompany = Pick<Tenant, 'id' | 'name' | 'slug' | 'status' | 'primaryDomain' | 'updatedAt'>

export const getAccessibleWorkspaceCompanies = async (user: User): Promise<WorkspaceCompany[]> => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'tenants',
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: false,
    select: { name: true, slug: true, status: true, primaryDomain: true, updatedAt: true },
    sort: 'name',
    user,
  })

  return result.docs.map((company) => ({
    id: company.id,
    name: company.name,
    slug: company.slug,
    status: company.status,
    primaryDomain: company.primaryDomain,
    updatedAt: company.updatedAt,
  }))
}

/**
 * Resolve one company through Payload access control. The URL is never trusted
 * by itself: a signed-in user can only open a company returned by this query.
 */
export const getAccessibleWorkspaceCompanyBySlug = async (user: User, slug: string): Promise<WorkspaceCompany | null> => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'tenants',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    select: { name: true, slug: true, status: true, primaryDomain: true, updatedAt: true },
    sort: 'name',
    user,
    where: { slug: { equals: slug } },
  })
  const company = result.docs[0]

  return company ? {
    id: company.id,
    name: company.name,
    slug: company.slug,
    status: company.status,
    primaryDomain: company.primaryDomain,
    updatedAt: company.updatedAt,
  } : null
}
