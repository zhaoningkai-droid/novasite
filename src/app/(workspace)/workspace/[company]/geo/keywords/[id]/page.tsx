import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { GeoKeywords } from '@/platform/components/GeoWorkspace/GeoKeywords'
import { geoID } from '@/platform/geo/keywords'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export const metadata: Metadata = { title: 'GEO优化词配置' }
export default async function GeoKeywordDetail({ params }: {
  params: Promise<{ company: string; id: string }>
}) {
  const { company: slug, id } = await params
  try { geoID(id) } catch { notFound() }
  const { user } = await getMeUser({
    nullUserRedirect: '/admin/login?redirect=/workspace/companies',
  })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  return <GeoKeywords company={company} recordId={id} key={`${company.id}-${id}`} />
}
