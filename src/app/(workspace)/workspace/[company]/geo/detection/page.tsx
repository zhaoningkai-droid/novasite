import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { GeoDetection } from '@/platform/components/GeoWorkspace/GeoDetection'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export const metadata: Metadata = { title: '检测任务与证据' }
export default async function GeoDetectionPage({
  params,
}: {
  params: Promise<{ company: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/login?redirect=/workspace/companies' })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  return <GeoDetection company={company} key={company.id} />
}
