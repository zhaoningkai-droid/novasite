import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import config from '@payload-config'
import { CompanySelection } from '@/platform/components/CompanySelection/CompanySelection'
import { getAccessibleWorkspaceCompanies } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export default async function CompaniesPage() {
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const payload = await getPayload({ config })
  const [companies, templatesResult] = await Promise.all([
    getAccessibleWorkspaceCompanies(user),
    payload.find({
      collection: 'templates',
      depth: 0,
      limit: 20,
      overrideAccess: false,
      sort: 'name',
      user,
      where: { status: { equals: 'published' } },
    }),
  ])
  const cookieStore = await cookies()
  const selectedCompanyID = Number(cookieStore.get('payload-tenant')?.value)
  const initialCompanyID = companies.some((company) => company.id === selectedCompanyID) ? selectedCompanyID : undefined

  return <CompanySelection
    companies={companies}
    initialCompanyID={initialCompanyID}
    templates={templatesResult.docs.map((template) => ({
      id: template.id,
      key: template.key,
      name: template.name,
      version: template.version,
    }))}
  />
}
