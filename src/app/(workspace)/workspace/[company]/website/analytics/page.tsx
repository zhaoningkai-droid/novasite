import { WorkspaceAnalytics } from '@/platform/components/WorkspaceAnalytics/WorkspaceAnalytics'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Props = { params: Promise<{ company: string }> }

export default async function CompanyWorkspacePage({ params }: Props) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)

  // The parent workspace layout already validates this path. Keep this guard for direct rendering safety.
  if (!company) return null
  return <WorkspaceAnalytics company={company} />
}
