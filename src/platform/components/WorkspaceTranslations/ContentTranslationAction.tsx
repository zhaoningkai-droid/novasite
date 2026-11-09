'use client'

import { useEffect } from 'react'
import { Languages, Loader2 } from 'lucide-react'
import {
  translationViewLabel,
  type TranslationStatusLabel,
} from '../../product-translation/job-view'
import type { TranslationResource } from '../../content-translation/resources'
import { TranslationReviewAction } from './TranslationReviewAction'
import { useContentTranslation } from './useContentTranslation'
import './content-translation.scss'

type Props = {
  companySlug: string
  resource: TranslationResource
  id?: number
  disabled?: boolean
  refreshKey?: string
  onLockedChange?: (locked: boolean) => void
  onStatusChange?: (status: TranslationStatusLabel) => void
}

export function ContentTranslationAction({
  companySlug,
  resource,
  id,
  disabled = false,
  refreshKey = '',
  onLockedChange,
  onStatusChange,
}: Props) {
  const translation = useContentTranslation(companySlug, resource, id ? [id] : [], refreshKey)
  const view = id ? translation.views[id] : undefined
  const locked = Boolean(view?.locked)
  const status = translationViewLabel(view)
  const failed = view?.languages.filter((language) => language.status === 'failed' && language.message) || []
  useEffect(() => { onLockedChange?.(locked) }, [locked, onLockedChange])
  useEffect(() => { onStatusChange?.(status) }, [status, onStatusChange])
  return <div className="content-translation-action">
    {id && <span aria-live="polite" aria-atomic="true">{status}{view?.total ? ` · ${view.completed}/${view.total}` : ''}</span>}
    <button type="button" disabled={disabled || !id || !translation.ready || !view?.canTranslate || locked || translation.submitting} title={disabled ? '请先保存当前修改，再翻译已保存的内容' : undefined} onClick={() => id && void translation.translate([id])}>
      {locked || translation.submitting ? <Loader2 size={16} aria-hidden="true" /> : <Languages size={16} aria-hidden="true" />}{view?.status === 'failed' || view?.status === 'partial' ? '继续翻译' : '翻译'}
    </button>
    {id && <TranslationReviewAction companySlug={companySlug} resource={resource} documentID={id}
      review={view?.review} disabled={disabled || locked} onQueued={translation.markReviewed} />}
    {!locked && failed.length > 0 && (
      <details>
        <summary>查看失败原因</summary>
        <ul>{failed.map((language) => <li key={language.locale}>{language.locale.toUpperCase()} · {language.message}</li>)}</ul>
      </details>
    )}
    {view?.status === 'queued' && view.retryAt && (
      <small role="status">预计 {new Date(view.retryAt).toLocaleString()} 后自动重试</small>
    )}
    {translation.notice && <small role="status">{translation.notice}</small>}
    {translation.error && <small role="alert">{translation.error}</small>}
  </div>
}
