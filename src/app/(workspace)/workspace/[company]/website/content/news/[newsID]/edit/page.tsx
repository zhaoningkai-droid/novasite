import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { NewsWorkspaceEditor } from '@/platform/components/NewsWorkspaceEditor/NewsWorkspaceEditor'
import { richTextToPlainText } from '@/platform/rich-text'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export default async function EditNewsPage({
  params,
}: {
  params: Promise<{ company: string; newsID: string }>
}) {
  const { company: slug, newsID } = await params
  const { user } = await getMeUser({
    nullUserRedirect: '/admin/login?redirect=/workspace/companies',
  })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null
  const payload = await getPayload({ config })
  const [categories, result] = await Promise.all([
    payload.find({
      collection: 'news-categories',
      pagination: false,
      locale: company.defaultLocale, fallbackLocale: false,
      overrideAccess: false,
      sort: 'sortOrder',
      user,
      where: { tenant: { equals: company.id } },
    }),
    payload.find({
      collection: 'news',
      depth: 1,
      draft: true,
      limit: 1,
      locale: company.defaultLocale, fallbackLocale: false,
      overrideAccess: false,
      user,
      where: { and: [{ id: { equals: Number(newsID) } }, { tenant: { equals: company.id } }] },
    }),
  ])
  const news = result.docs[0]
  if (!news) notFound()
  return (
    <NewsWorkspaceEditor
      categories={categories.docs.map((item) => ({ id: item.id, name: item.name || '未命名分类' }))}
      companySlug={slug}
      initial={{
        category: typeof news.category === 'number' ? news.category : typeof news.category === 'object' && news.category ? news.category.id : undefined,
        content: richTextToPlainText(news.content),
        cover: typeof news.cover === 'object' && news.cover ? { id: news.cover.id, thumbnailURL: news.cover.thumbnailURL, url: news.cover.url } : undefined,
        featured: Boolean(news.featured),
        id: news.id,
        sortOrder: news.sortOrder || 0,
        summary: news.summary || '',
        status: news._status === 'published' ? 'published' : 'draft',
        title: news.title || '',
      }}
    />
  )
}
