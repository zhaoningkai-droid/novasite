import { getPayload } from 'payload'

import config from '@payload-config'
import { WorkspaceCategories, type CategoryKind, type WorkspaceCategory } from '@/platform/components/WorkspaceCategories/WorkspaceCategories'
import { getWorkspaceCategoryRows, workspaceCategoryConfig } from '@/platform/workspace-category-service'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Props = { params: Promise<{ company: string }> }

export default async function WorkspaceCategoriesPage({ params }: Props) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null
  const payload = await getPayload({ config })
  const entries = await Promise.all((Object.keys(workspaceCategoryConfig) as CategoryKind[]).map(async (kind) => [
    kind, await getWorkspaceCategoryRows(payload, kind, company.id, user),
  ] as const))
  const categories = Object.fromEntries(entries) as Record<CategoryKind, WorkspaceCategory[]>
  return <WorkspaceCategories categories={categories} companyName={company.name} endpoint={`/api/workspace/${slug}/categories`} />
}
