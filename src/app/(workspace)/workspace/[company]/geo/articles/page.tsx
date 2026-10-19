import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { GeoArticles } from '@/platform/components/GeoWorkspace/GeoArticles'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
export const metadata: Metadata = { title: 'GEO创作记录' }
export default async function GeoArticlesPage({ params, searchParams }: { searchParams: Promise<{ taskID?: string }>; params: Promise<{ company: string }> }) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  return <GeoArticles taskFilter={(await searchParams).taskID} company={company} key={company.id} />
}
