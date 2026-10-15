import { notFound } from 'next/navigation'

import { ExecutiveTemplatePages } from '@/platform/legacy-templates/ExecutiveTemplatePages'
import type { ExecutiveDemoLocale } from '@/platform/legacy-templates/executive-demo-data'
import { IndustryDemo, industryDemoLocales } from '@/platform/industry-templates/demo'
import { isIndustryKey } from '@/platform/industry-templates/model'
import type { SiteLocale } from '@/platform/site-locales'

type Props = {
  params: Promise<{ key: string; lang: string; path: string[] }>
  searchParams: Promise<{ category?: string | string[]; page?: string | string[] }>
}

const kinds = new Set(['products', 'news', 'cases', 'about', 'faqs', 'contact'])

export default async function ExecutiveTemplateDemoPage({ params, searchParams }: Props) {
  const [{ key, lang, path }, query] = await Promise.all([params, searchParams])
  if (isIndustryKey(key) && industryDemoLocales.some((locale) => locale === lang))
    return (
      <IndustryDemo
        templateKey={key}
        locale={lang as Exclude<SiteLocale, 'ru'>}
        path={path}
        search={query}
      />
    )
  if (
    key !== 'executive-industrial-pro-v1' ||
    (lang !== 'zh' && lang !== 'en') ||
    !kinds.has(path[0])
  )
    notFound()
  const pageValue = Array.isArray(query.page) ? query.page[0] : query.page
  const page = pageValue && /^\d+$/.test(pageValue) ? Math.max(1, Number(pageValue)) : 1
  const category = Array.isArray(query.category) ? query.category[0] : query.category

  return (
    <ExecutiveTemplatePages
      category={category}
      locale={lang as ExecutiveDemoLocale}
      page={page}
      path={path}
    />
  )
}
