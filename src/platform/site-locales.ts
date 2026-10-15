export const locales = ['zh', 'en', 'es', 'ar', 'id', 'de', 'ru'] as const

export type SiteLocale = (typeof locales)[number]

export const localeOptions: ReadonlyArray<{ code: SiteLocale; label: string }> = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: '英语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ar', label: '阿拉伯语' },
  { code: 'id', label: '印尼语' },
  { code: 'de', label: '德语' },
  { code: 'ru', label: '俄语' },
]

export const productTranslationTargets = [
  'en',
  'es',
  'ar',
  'id',
  'de',
] as const satisfies readonly SiteLocale[]

export const localeEnglishNames: Record<SiteLocale, string> = {
  zh: 'Simplified Chinese',
  en: 'English',
  es: 'Spanish',
  ar: 'Arabic',
  id: 'Indonesian',
  de: 'German',
  ru: 'Russian',
}

export const isSiteLocale = (value: string): value is SiteLocale =>
  locales.includes(value as SiteLocale)

/** Translation follows this company's enabled sites; it never opens new language sites. */
export function companyTranslationTargets(company: {
  defaultLocale?: string | null
  enabledLocales?: readonly string[] | null
}): SiteLocale[] {
  return [...new Set(company.enabledLocales || [])].filter(
    (locale): locale is SiteLocale => isSiteLocale(locale) && locale !== company.defaultLocale,
  )
}
