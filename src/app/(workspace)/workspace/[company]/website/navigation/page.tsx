import { getPayload } from 'payload'
import config from '@payload-config'
import { NavigationEditor } from '@/platform/components/NavigationEditor/NavigationEditor'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
import { defaultNavigation } from '@/platform/navigation-model'

export default async function NavigationPage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null
  const payload = await getPayload({ config })
  const result = await payload.find({ collection: 'site-navigation', depth: 0, limit: 1, overrideAccess: false, user,
    where: { and: [{ tenant: { equals: company.id } }, { localeCode: { equals: 'zh' } }] } })
  const doc = result.docs[0]
  return <NavigationEditor companySlug={slug} initial={{ localeCode: 'zh', updatedAt: doc?.updatedAt,
    footerIntro: doc?.footerIntro || '', quickLinks: doc?.quickLinks || [],
    items: doc ? (doc.items || []).map((item) => ({ ...item,
      sortOrder: item.sortOrder ?? 0, children: item.children || [] }))
      : defaultNavigation.map((item) => ({ ...item, id: `nav-${crypto.randomUUID()}`, children: [] })),
  }} />
}
