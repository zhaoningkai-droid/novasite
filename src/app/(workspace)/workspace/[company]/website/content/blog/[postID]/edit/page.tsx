import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import config from '@payload-config'
import { BlogWorkspaceEditor } from '@/platform/components/BlogWorkspaceEditor/BlogWorkspaceEditor'
import { richTextToPlainText } from '@/platform/rich-text'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export default async function EditBlogPage({ params }: { params: Promise<{ company: string; postID: string }> }) {
  const { company: slug, postID } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()

  const payload = await getPayload({ config })
  const [categories, result] = await Promise.all([
    payload.find({ collection: 'categories', pagination: false, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, sort: 'sortOrder', user, where: { tenant: { equals: company.id } } }),
    payload.find({ collection: 'posts', depth: 1, draft: true, limit: 1, locale: company.defaultLocale, fallbackLocale: false, overrideAccess: false, user, where: { and: [{ id: { equals: Number(postID) } }, { tenant: { equals: company.id } }] } }),
  ])
  const post = result.docs[0]
  if (!post) notFound()
  const firstCategory = Array.isArray(post.categories) ? post.categories[0] : undefined

  return <BlogWorkspaceEditor
    categories={categories.docs.map((item) => ({ id: item.id, title: item.title || '未命名分类' }))}
    companySlug={slug}
    initial={{
      category: typeof firstCategory === 'number' ? firstCategory : typeof firstCategory === 'object' && firstCategory ? firstCategory.id : undefined,
      content: richTextToPlainText(post.content),
      cover: typeof post.heroImage === 'object' && post.heroImage ? { id: post.heroImage.id, thumbnailURL: post.heroImage.thumbnailURL, url: post.heroImage.url } : undefined,
      description: post.meta?.description || '',
      id: post.id,
      status: post._status === 'published' ? 'published' : 'draft',
      title: post.title || '',
    }}
  />
}
