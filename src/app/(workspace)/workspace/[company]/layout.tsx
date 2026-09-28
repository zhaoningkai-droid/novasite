import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { userHasRole } from '@/access/roles'
import { WorkspaceShell } from '@/platform/components/WorkspaceShell/WorkspaceShell'
import { getAccessibleWorkspaceCompanies } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Props = { children: ReactNode; params: Promise<unknown> }

export default async function CompanyWorkspaceLayout({ children, params }: Props) {
  const { company: slug } = await params as { company: string }
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const companies = await getAccessibleWorkspaceCompanies(user)
  const company = companies.find((item) => item.slug === slug)

  // The URL is scoped through user permissions, then matched to the chosen company cookie.
  if (!company) notFound()
  const selectedCompanyID = Number((await cookies()).get('payload-tenant')?.value)
  if (selectedCompanyID !== company.id) redirect('/workspace/companies')

  return <WorkspaceShell companies={companies} currentCompany={company} canEditContent={userHasRole(user, ['super-admin', 'site-admin', 'editor'])} canManageSite={userHasRole(user, ['super-admin', 'site-admin'])}>{children}</WorkspaceShell>
}
