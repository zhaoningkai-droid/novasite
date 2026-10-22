import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { userHasRole } from '@/access/roles'
import { getMeUser } from '@/utilities/getMeUser'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { KnowledgeWorkspace } from '@/platform/components/KnowledgeWorkspace/KnowledgeWorkspace'
export const metadata: Metadata = { title: '企业知识库' }
export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>
  searchParams: Promise<{ document?: string }>
}) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/login?redirect=/workspace/companies' })
  if (!userHasRole(user, ['super-admin', 'site-admin', 'editor'])) notFound()
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  return (
    <KnowledgeWorkspace
      key={company.id}
      company={company}
      initialDocumentID={(await searchParams).document}
    />
  )
}
