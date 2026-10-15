import { getPayload } from 'payload'
import config from '@payload-config'
import { CaseWorkspaceEditor } from '@/platform/components/CaseWorkspaceEditor/CaseWorkspaceEditor'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
export default async function NewCasePage({ params }: { params: Promise<{ company: string }> }) { const { company: slug } = await params; const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' }); const company = await getAccessibleWorkspaceCompanyBySlug(user, slug); if (!company) return null; const payload = await getPayload({ config }); const categories = await payload.find({ collection: 'case-categories', pagination: false, locale: company.defaultLocale, overrideAccess: false, sort: 'sortOrder', user, where: { tenant: { equals: company.id } } }); return <CaseWorkspaceEditor categories={categories.docs.map((item) => ({ id: item.id, name: item.name || '未命名分类' }))} companySlug={slug}/> }
