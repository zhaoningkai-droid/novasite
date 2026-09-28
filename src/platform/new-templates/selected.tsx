import type { Tenant } from '@/payload-types'
import type { SiteLocale } from '@/platform/site'
import { getNewTemplate } from './registry'
import { renderTemplatePage } from './render'
export const selectedNewTemplate = (site: Tenant) =>
  getNewTemplate(typeof site.selectedTemplate === 'object' ? site.selectedTemplate?.key : undefined)
export async function renderSelectedTemplate(
  site: Tenant,
  locale: SiteLocale,
  path: string[] = [],
  search: { category?: string | string[]; page?: string | string[] } = {},
) {
  const template = selectedNewTemplate(site)
  if (!template) return null
  return renderTemplatePage({
    site,
    locale,
    template,
    path,
    search,
    base: `/s/${site.slug}/${locale}`,
  })
}
