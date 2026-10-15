import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getMeUser } from '@/utilities/getMeUser'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { isSiteLocale } from '@/platform/site'
import { LegacyHome } from '@/platform/legacy-templates/LegacyHome'
import { LegacyShell } from '@/platform/legacy-templates/LegacyShell'
import { LegacyPreviewGuard } from '@/platform/legacy-templates/LegacyPreviewGuard'
import { getLegacyTemplate } from '@/platform/legacy-template-catalog'
import { getNewTemplate } from '@/platform/new-templates/registry'
import { TemplateShell } from '@/platform/new-templates/Shell'
import { renderTemplatePage } from '@/platform/new-templates/render'
import { isIndustryKey } from '@/platform/industry-templates/model'
export const dynamic = 'force-dynamic'
type Props = {
  params: Promise<{ company: string; key: string; lang: string; path?: string[] }>
  searchParams: Promise<{ category?: string | string[]; page?: string | string[] }>
}
export default async function TemplatePreview({ params, searchParams }: Props) {
  const { company: slug, key, lang, path } = await params
  if (!isSiteLocale(lang)) notFound()
  const template = getNewTemplate(key)
  const legacy = getLegacyTemplate(key)
  if (!template && !legacy) notFound()
  const { user } = await getMeUser({ nullUserRedirect: '/login' })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) notFound()
  if (key === 'executive-industrial-pro-v1' || isIndustryKey(key)) {
    if (key === 'executive-industrial-pro-v1' && path?.length) notFound()
    const payload = await getPayload({ config })
    const published = await payload.find({
      collection: 'templates',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      user,
      where: { and: [{ key: { equals: key } }, { status: { equals: 'published' } }] },
    })
    if (!published.docs[0]) notFound()
    const demoLang = isIndustryKey(key)
      ? lang === 'ru'
        ? 'en'
        : lang
      : lang === 'en'
        ? 'en'
        : 'zh'
    const query = await searchParams
    const values = new URLSearchParams()
    for (const name of ['category', 'page'] as const) {
      const value = query[name]
      if (value) values.set(name, Array.isArray(value) ? value[0] : value)
    }
    redirect(
      `/template-demo/${key}/${demoLang}${path?.length ? `/${path.join('/')}` : ''}${
        values.size ? `?${values}` : ''
      }`,
    )
  }
  const payload = await getPayload({ config })
  const site = await payload.findByID({
    collection: 'tenants',
    id: company.id,
    depth: 2,
    locale: lang,
    overrideAccess: false,
    user,
  })
  if (!site.enabledLocales?.includes(lang)) notFound()
  if (legacy) {
    if (path?.length) notFound()
    const templates = await payload.find({
      collection: 'templates',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      user,
      where: { and: [{ key: { equals: key } }, { status: { equals: 'published' } }] },
    })
    if (!templates.docs[0]) notFound()
    const previewSite = { ...site, selectedTemplate: templates.docs[0] }
    return (
      <LegacyPreviewGuard companySlug={slug} locale={lang}>
        <aside className="legacy-preview-notice">
          {legacy.name} · 首页预览（不会切换当前模板；内容链接打开当前网站；询盘提交已禁用）
        </aside>
        <LegacyShell site={previewSite} locale={lang}>
          {await LegacyHome({ site: previewSite, locale: lang })}
        </LegacyShell>
      </LegacyPreviewGuard>
    )
  }
  if (!template) notFound()
  const base = `/template-preview/${slug}/${key}/${lang}`
  return (
    <TemplateShell site={site} locale={lang} template={template} base={base} preview user={user}>
      {await renderTemplatePage({
        site,
        locale: lang,
        template,
        base,
        path,
        search: await searchParams,
        preview: true,
        user,
      })}
    </TemplateShell>
  )
}
