import { notFound } from 'next/navigation'

import { ExecutiveTemplateDemo } from '@/platform/legacy-templates/ExecutiveTemplateDemo'
import type { ExecutiveDemoLocale } from '@/platform/legacy-templates/executive-demo-data'
import { IndustryDemo, industryDemoLocales } from '@/platform/industry-templates/demo'
import { isIndustryKey } from '@/platform/industry-templates/model'
import type { SiteLocale } from '@/platform/site-locales'

export const dynamic = 'force-static'

type Props = { params: Promise<{ key: string; lang: string }> }

export default async function TemplateDemoPage({ params }: Props) {
  const { key, lang } = await params
  if (isIndustryKey(key) && industryDemoLocales.some((locale) => locale === lang))
    return <IndustryDemo templateKey={key} locale={lang as Exclude<SiteLocale, 'ru'>} />
  if (key !== 'executive-industrial-pro-v1' || (lang !== 'zh' && lang !== 'en')) notFound()

  return <ExecutiveTemplateDemo locale={lang as ExecutiveDemoLocale} />
}
