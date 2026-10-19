import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { GeoPublishing } from '@/platform/components/GeoWorkspace/GeoPublishing'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
export const metadata: Metadata = { title: 'GEO文章发布' }
export default async function GeoPublishingPage({ params, searchParams }: { searchParams: Promise<{ articleID?: string; mode?: string }>; params: Promise<{ company: string }> }) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  const query = await searchParams
  return <GeoPublishing view="compose" initialArticleID={query.articleID}
    initialMode={query.mode === 'auto' ? 'auto' : 'manual'}
    canManageSite={userHasRole(user, ['super-admin', 'site-admin'])} company={company} key={company.id} />
}
