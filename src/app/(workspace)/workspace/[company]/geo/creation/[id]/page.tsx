import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { GeoCreation } from '@/platform/components/GeoWorkspace/GeoCreation'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
export const metadata: Metadata = { title: 'GEO文章创作' }
export default async function GeoCreationPage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string; id: string }>
  searchParams?: Promise<{ view?: string }>
}) {
  const { company: slug, id } = await params
  const search = await searchParams
  const { user } = await getMeUser({
    nullUserRedirect: '/admin/login?redirect=/workspace/companies',
  })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  return (
    <GeoCreation company={company} recordId={id} readOnly={search?.view === '1'} key={company.id} />
  )
}
