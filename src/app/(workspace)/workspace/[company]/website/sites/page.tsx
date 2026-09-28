import { getLegacyTemplate } from '@/platform/legacy-template-catalog'
import { getPayload } from 'payload'

import config from '@payload-config'
import { SiteManager } from '@/platform/components/SiteManager/SiteManager'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

const templateDisplayName = (template: { key?: string; name?: string; version?: string } | null | undefined) => {
  if (!template) return '默认工业模板'
  const legacy = getLegacyTemplate(template.key || '')
  if (legacy) return `${legacy.name}（${template.version || '1.0.0'}）`
  return template.name || '默认工业模板'
}

export default async function SitesPage({ params }: { params: Promise<{ company: string }> }) {
  const { company: slug } = await params
  const { user } = await getMeUser({ nullUserRedirect: '/admin/login?redirect=/workspace/companies' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null

  const payload = await getPayload({ config })
  const [site, templatesResult, changesResult] = await Promise.all([
    payload.findByID({ collection: 'tenants', id: company.id, depth: 1, locale: 'zh', overrideAccess: false, showHiddenFields: true, user }),
    payload.find({
      collection: 'templates',
      depth: 0,
      limit: 20,
      overrideAccess: false,
      sort: 'name',
      user,
      where: { status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'site-template-changes',
      depth: 1,
      limit: 20,
      overrideAccess: true,
      sort: '-createdAt',
      where: { tenant: { equals: company.id } },
    }),
  ])
  const selectedTemplate = typeof site.selectedTemplate === 'object' ? site.selectedTemplate : null
  const revision = site.templateRevision || 0

  return <SiteManager
    companySlug={slug}
    createdAt={site.createdAt}
    templateName={templateDisplayName(selectedTemplate)}
    templateHistory={changesResult.docs.map((change) => ({
      id: change.id,
      operation: change.operation,
      fromTemplate: typeof change.fromTemplate === 'object' ? change.fromTemplate?.name || '默认模板' : '默认模板',
      toTemplate: typeof change.toTemplate === 'object' ? change.toTemplate?.name || '默认模板' : '默认模板',
      fromVersion: change.fromVersion || '',
      toVersion: change.toVersion || '',
      fromRevision: change.fromRevision,
      toRevision: change.toRevision,
      createdAt: change.createdAt,
      canRollback: change.toRevision === revision,
    }))}
    templates={templatesResult.docs.map((template) => ({
      description: template.description || '',
      id: template.id,
      key: template.key,
      name: template.name,
      version: template.version,
    }))}
    initial={{
      name: site.name,
      companyName: site.branding.companyName || '',
      primaryDomain: site.primaryDomain || '',
      previewDomain: site.previewDomain || '',
      defaultLocale: site.defaultLocale || 'zh',
      enabledLocales: site.enabledLocales || ['zh', 'en', 'ru', 'id'],
      status: site.status,
      selectedTemplate: selectedTemplate?.id || (typeof site.selectedTemplate === 'number' ? site.selectedTemplate : undefined),
      logo: typeof site.branding.logo === 'object' ? site.branding.logo?.id : site.branding.logo || undefined,
      logoURL: typeof site.branding.logo === 'object' ? site.branding.logo?.url || '' : '',
      favicon: typeof site.branding.favicon === 'object' ? site.branding.favicon?.id : site.branding.favicon || undefined,
      faviconURL: typeof site.branding.favicon === 'object' ? site.branding.favicon?.url || '' : '',
      titleSuffix: site.seo?.titleSuffix || '',
      defaultDescription: site.seo?.defaultDescription || '',
      indexingEnabled: site.seo?.indexingEnabled === true,
      templateRevision: revision,
    }}
  />
}
