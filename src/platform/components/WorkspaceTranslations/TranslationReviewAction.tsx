'use client'

import { useEffect, useRef, useState } from 'react'
import type { TranslationResource } from '../../content-translation/resources'
import type { TranslationReview } from '../../product-translation/job-view'
import { localeOptions } from '../../site-locales'

type Props = {
  companySlug: string
  resource: 'products' | TranslationResource
  documentID: number
  review?: TranslationReview
  disabled?: boolean
  onQueued: (id: number, jobID: string) => void
}

export function TranslationReviewAction(props: Props) {
  if (!props.review) return null
  return <ReviewForm {...props} review={props.review} key={props.review.jobID + ':' + props.review.revision} />
}

function ReviewForm({ companySlug, resource, documentID, review, disabled, onQueued }: Props & { review: TranslationReview }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)

  useEffect(() => () => pending.current?.abort(), [])

  const confirm = async () => {
    if (disabled || pending.current || !acknowledged) return
    const controller = new AbortController()
    pending.current = controller
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/workspace/${encodeURIComponent(companySlug)}/translations/recovery`, {
        method: 'POST',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource, documentID, jobID: review.jobID, revision: review.revision, acknowledged: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || '暂时无法重新排队，请刷新后查看。')
      if (!controller.signal.aborted) onQueued(documentID, review.jobID)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error && reason.name !== 'TimeoutError'
        ? reason.message : '确认响应超时，请刷新查看任务状态。')
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setSaving(false)
      }
    }
  }
  return (
    <details>
      <summary>处理待确认翻译</summary>
      <p>待确认语言 {review.locales.map((code) => localeOptions.find((option) => option.code === code)?.label || code).join('、')}</p>
      <p>任务编号 <code>{review.jobID}</code></p>
      <p>重新调用可能产生用量，请先核对供应商记录。</p>
      <label>
        <input type="checkbox" checked={acknowledged} disabled={saving || disabled}
          onChange={(event) => setAcknowledged(event.target.checked)} />
        已核对，确认重试这些语言
      </label>
      <button type="button" disabled={!acknowledged || saving || disabled} onClick={() => void confirm()}>
        {saving ? '提交中…' : '确认并重新排队'}
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  )
}
