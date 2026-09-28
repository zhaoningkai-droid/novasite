import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { NewsWorkspaceEditor } from '@/platform/components/NewsWorkspaceEditor/NewsWorkspaceEditor'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

const plain = (value: unknown): string => {
  const parts: string[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const item = node as { children?: unknown[]; text?: unknown }
    if (typeof item.text === 'string') parts.push(item.text)
    item.children?.forEach(visit)
  }
  visit(value)
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

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
      limit: 100,
      locale: 'zh',
      overrideAccess: false,
      sort: 'sortOrder',
      user,
      where: { tenant: { equals: company.id } },
    }),
    payload.find({
      collection: 'news',
      depth: 1,
      limit: 1,
      locale: 'zh',
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
        category: typeof news.category === 'number' ? news.category : undefined,
        content: plain(news.content),
        cover: typeof news.cover === 'object' && news.cover ? { id: news.cover.id, thumbnailURL: news.cover.thumbnailURL, url: news.cover.url } : undefined,
        featured: Boolean(news.featured),
        id: news.id,
        sortOrder: news.sortOrder || 0,
        summary: news.summary || '',
        title: news.title || '',
      }}
    />
  )
}
