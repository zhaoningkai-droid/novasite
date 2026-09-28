import { getPayload } from 'payload'

import config from '@payload-config'
import { NewsWorkspaceEditor } from '@/platform/components/NewsWorkspaceEditor/NewsWorkspaceEditor'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export default async function NewNewsPage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params
  const { user } = await getMeUser({
    nullUserRedirect: '/admin/login?redirect=/workspace/companies',
  })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null
  const payload = await getPayload({ config })
  const categories = await payload.find({
    collection: 'news-categories',
    limit: 100,
    locale: 'zh',
    overrideAccess: false,
    sort: 'sortOrder',
    user,
    where: { tenant: { equals: company.id } },
  })
  return (
    <NewsWorkspaceEditor
      categories={categories.docs.map((item) => ({ id: item.id, name: item.name || '未命名分类' }))}
      companySlug={slug}
    />
  )
}
