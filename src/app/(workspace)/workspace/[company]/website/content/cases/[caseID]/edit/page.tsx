import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { CaseWorkspaceEditor } from '@/platform/components/CaseWorkspaceEditor/CaseWorkspaceEditor'
import { richTextToPlainText } from '@/platform/rich-text'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export default async function EditCasePage({ params }: { params: Promise<{ caseID: string; company: string }> }) {
  const { caseID, company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()

  const payload = await getPayload({ config })
  const [categories, result] = await Promise.all([
    payload.find({ collection: 'case-categories', pagination: false, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, sort: 'sortOrder', user, where: { tenant: { equals: company.id } } }),
    payload.find({ collection: 'cases', depth: 1, draft: true, limit: 1, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, user, where: { and: [{ id: { equals: Number(caseID) } }, { tenant: { equals: company.id } }] } }),
  ])
  const item = result.docs[0]
  if (!item) notFound()

  return <CaseWorkspaceEditor
    categories={categories.docs.map((category) => ({ id: category.id, name: category.name || '未命名分类' }))}
    companySlug={slug}
    initial={{
      category: typeof item.category === 'number' ? item.category : typeof item.category === 'object' && item.category ? item.category.id : undefined,
      content: richTextToPlainText(item.content),
      country: item.country || '',
      cover: typeof item.cover === 'object' && item.cover ? { id: item.cover.id, thumbnailURL: item.cover.thumbnailURL, url: item.cover.url } : undefined,
      featured: Boolean(item.featured),
      id: item.id,
      industry: item.industry || '',
      sortOrder: item.sortOrder || 0,
      status: item._status === 'published' ? 'published' : 'draft',
      summary: item.summary || '',
      title: item.title || '',
    }}
  />
}
