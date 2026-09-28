import { getPayload } from 'payload'
import config from '@payload-config'
import { AboutEditor } from '@/platform/components/AboutEditor/AboutEditor'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

export default async function AboutWorkspacePage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params; const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' }); const company = await getAccessibleWorkspaceCompanyBySlug(user, slug); if (!company) return null
  const payload = await getPayload({ config }); const tenant = await payload.findByID({ collection: 'tenants', id: company.id, depth: 1, locale: 'zh', overrideAccess: false, user }); const about = tenant.fixedPages?.about as any
  return <AboutEditor companySlug={slug} initial={{ title: about?.title || '', intro: about?.intro || '', modules: Array.isArray(about?.modules) ? about.modules.map((item: any) => ({ id: item.id, title: item.title || '', description: item.description || '', image: typeof item.image === 'object' && item.image ? { id: item.image.id, thumbnailURL: item.image.thumbnailURL, url: item.image.url } : undefined, sortOrder: Number(item.sortOrder) || 0 })) : [] }}/>
}
