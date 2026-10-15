import type { SiteLocale } from '../site-locales'

export type LanguageTranslationState = {
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  message?: string
  code?: string
  done?: number
  total?: number
  checkpoint?: Record<string, string>
}
export type ProductTranslationView = {
  productID: number
  jobID?: string
  locked: boolean
  canTranslate: boolean
  status: 'pending' | 'queued' | 'running' | 'completed' | 'partial' | 'failed'
  completed: number
  total: number
  languages: Array<{
    locale: SiteLocale
    status: LanguageTranslationState['status']
    message?: string
  }>
}

export type TranslationStatusLabel = '未翻译' | '翻译中' | '已完成'

// All workspace modules share these three labels. Legacy cell content must never
// render per-language details, whether the status is shown in a row or its dialog.
export function translationViewLabel(view?: ProductTranslationView, fallback?: unknown): TranslationStatusLabel {
  if (view?.locked || view?.status === 'queued' || view?.status === 'running') return '翻译中'
  if (view?.status === 'completed') return '已完成'
  if (!view && (fallback === '翻译中' || fallback === '已完成')) return fallback
  return '未翻译'
}
