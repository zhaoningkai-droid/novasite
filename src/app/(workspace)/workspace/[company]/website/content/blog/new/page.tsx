import { getPayload } from 'payload'
import config from '@payload-config'
import { BlogWorkspaceEditor } from '@/platform/components/BlogWorkspaceEditor/BlogWorkspaceEditor'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
export default async function NewBlogPage({ params }: { params: Promise<{ company: string }> }) { const { company: slug } = await params; const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' }); const company = await getAccessibleWorkspaceCompanyBySlug(user, slug); if (!company) return null; const payload = await getPayload({ config }); const categories = await payload.find({ collection: 'categories', limit: 100, locale: 'zh', overrideAccess: false, sort: 'sortOrder', user, where: { tenant: { equals: company.id } } }); return <BlogWorkspaceEditor categories={categories.docs.map((item) => ({ id: item.id, title: item.title || '未命名分类' }))} companySlug={slug}/> }
