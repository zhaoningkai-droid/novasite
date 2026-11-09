import type { TranslationContent } from './content'
import type { SiteLocale } from '../site-locales'

export type LanguageTranslationState = {
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  message?: string
  code?: string
  done?: number
  total?: number
  checkpoint?: Record<string, string>
  prepared?: TranslationContent
  retryAt?: string
  retryCount?: number
  providerInFlight?: boolean
  stage?: 'prepare' | 'provider' | 'save'
}
export type TranslationReview = {
  jobID: string
  revision: string
  locales: SiteLocale[]
}

export type ProductTranslationView = {
  productID: number
  jobID?: string
  locked: boolean
  retryAt?: string
  needsAction?: boolean
  review?: TranslationReview
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

export type TranslationStatusLabel = '未翻译' | '翻译中' | '已完成' | '部分完成' | '翻译失败' | '等待重试' | '待确认'

// Keep row labels compact. The translation action can show language-specific errors.
export function translationViewLabel(view?: ProductTranslationView, fallback?: unknown): TranslationStatusLabel {
  if (view?.retryAt && view.status === 'queued') return '等待重试'
  if (view?.locked || view?.status === 'queued' || view?.status === 'running') return '翻译中'
  if (view?.needsAction) return '待确认'
  if (view?.status === 'completed') return '已完成'
  if (view?.total && view.status === 'partial') return '部分完成'
  if (view?.total && view.status === 'failed') return '翻译失败'
  if (!view && (fallback === '翻译中' || fallback === '已完成')) return fallback
  return '未翻译'
}
