import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { GeoVisibility } from '@/platform/components/GeoWorkspace/GeoVisibility'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export const metadata: Metadata = { title: 'GEO搜索词追踪' }
export default async function GeoVisibilityPage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  return <GeoVisibility company={company} key={company.id} />
}
