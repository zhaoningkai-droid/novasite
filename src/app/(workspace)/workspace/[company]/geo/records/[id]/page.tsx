import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { GeoPublishing } from '@/platform/components/GeoWorkspace/GeoPublishing'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
export const metadata: Metadata = { title: 'GEO发布记录详情' }
export default async function GeoPublishingPage({ params }: { params: Promise<{ company: string; id: string }> }) {
  const { company: slug, id } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  return <GeoPublishing view="records" company={company} recordId={id} key={company.id} />
}
