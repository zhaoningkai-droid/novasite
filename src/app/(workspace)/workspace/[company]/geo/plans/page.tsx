import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { GeoPlans } from '@/platform/components/GeoWorkspace/GeoPlans'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
export const metadata: Metadata = { title: 'GEO发布计划' }
export default async function GeoPlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>
  searchParams?: Promise<{
    q?: string
    sourceMode?: string
    sourceID?: string
    planID?: string
  }>
}) {
  const { company: slug } = await params
  const filters = await searchParams
  const { user } = await getMeUser({
    nullUserRedirect: '/admin/login?redirect=/workspace/companies',
  })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  const sourceMode = ['articles', 'tasks'].includes(filters?.sourceMode || '')
    ? (filters?.sourceMode as 'articles' | 'tasks')
    : ''
  const sourceID = sourceMode ? filters?.sourceID || '' : ''
  return (
    <GeoPlans
      company={company}
      canManageSite={userHasRole(user, ['super-admin', 'site-admin'])}
      initialQuery={filters?.q || ''}
      initialSourceMode={sourceMode}
      initialSourceID={sourceID}
      initialPlanID={filters?.planID || ''}
      key={company.id}
    />
  )
}
