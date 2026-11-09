'use client'

import { useEffect, useRef, useState } from 'react'
import { Languages, LoaderCircle, RotateCcw, X } from 'lucide-react'

import './ai-translate-field.scss'
import type { SiteLocale } from '@/platform/site-locales'

export type TranslationSource = { code: SiteLocale; label: string; value: string }
type Props = {
  companySlug: string
  productID: number
  field: 'title' | 'summary'
  defaultSourceLocale?: SiteLocale
  sources: TranslationSource[]
  targetLocale: SiteLocale
  targetValue: string
  onApply: (translation: string) => void
}

type Preview = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown'
  translation: string | null
  matchesSource: boolean
  original?: string
  message?: string
}

export function AITranslateField(props: Props) {
  const [open, setOpen] = useState(false)
  const [sourceLocale, setSourceLocale] = useState<SiteLocale>(
    props.sources.find((item) => item.code === props.defaultSourceLocale && item.code !== props.targetLocale)?.code ||
    props.sources.find((item) => item.code !== props.targetLocale && item.value.trim())?.code ||
    props.sources.find((item) => item.code !== props.targetLocale)?.code || 'zh',
  )
  const sourceText = props.sources.find((item) => item.code === sourceLocale)?.value || ''
  const scopeKey = JSON.stringify([props.companySlug, props.productID, props.field, sourceLocale, props.targetLocale, sourceText])
  return (
    <div className="ai-translate-field">
      <button className="ai-translate-field__trigger" onClick={() => setOpen((value) => !value)} type="button">
        <Languages size={15} aria-hidden="true" /> AI 翻译
      </button>
      {open && (
        <section aria-label="AI 翻译预览" className="ai-translate-field__panel">
          <header>
            <strong>预览译文</strong>
            <button aria-label="关闭翻译预览" onClick={() => setOpen(false)} type="button">
              <X size={15} />
            </button>
          </header>
          <label>
            原文语言
            <select value={sourceLocale} onChange={(event) => setSourceLocale(event.target.value as SiteLocale)}>
              {props.sources.filter((item) => item.code !== props.targetLocale).map((item) => (
                <option key={item.code} value={item.code}>{item.label}{item.value.trim() ? '' : '（空）'}</option>
              ))}
            </select>
          </label>
          <PreviewBody {...props} key={scopeKey} sourceLocale={sourceLocale} sourceText={sourceText}
            onApply={(value) => { props.onApply(value); setOpen(false) }} />
        </section>
      )}
    </div>
  )
}

function PreviewBody({
  companySlug, productID, field, sourceLocale, sourceText, targetLocale, targetValue, onApply,
}: Props & { sourceLocale: SiteLocale; sourceText: string }) {
  const [job, setJob] = useState<Preview | null>(null)
  const [edited, setEdited] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmedJobID, setConfirmedJobID] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const waiting = job?.status === 'queued' || job?.status === 'running'
  const needsConfirmation = job?.matchesSource && job.status === 'unknown'
  const confirmed = needsConfirmation && confirmedJobID === job.id
  const translation = edited ?? job?.translation ?? ''
  const limit = field === 'title' ? 120 : 360
  const endpoint = `/api/workspace/${encodeURIComponent(companySlug)}/ai/translate/preview`

  useEffect(() => {
    if (submitting) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const read = async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          body: JSON.stringify({ action: 'find', productID, field, sourceLocale, targetLocale, text: sourceText }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || '预览暂时无法读取。')
        if (controller.signal.aborted) return
        const preview = data.preview as Preview | null
        setJob(preview)
        setError('')
        if (preview?.status === 'queued' || preview?.status === 'running') timer = setTimeout(() => void read(), 2500)
      } catch (failure) {
        if (controller.signal.aborted) return
        setError(failure instanceof Error ? failure.message : '预览暂时无法读取。')
        timer = setTimeout(() => void read(), 8000)
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void read()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [endpoint, productID, field, sourceLocale, targetLocale, sourceText, submitting])

  useEffect(() => () => request.current?.abort(), [])

  const generate = async () => {
    if (request.current || !sourceText.trim() || (needsConfirmation && !confirmed)) return
    const controller = new AbortController()
    request.current = controller
    setConfirmedJobID(null)
    setSubmitting(true)
    setEdited(null)
    setError('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        body: JSON.stringify({ action: confirmed ? 'retry-unknown' : 'generate', acknowledged: confirmed || undefined,
          productID, field, sourceLocale, targetLocale, text: sourceText,
          previousID: job?.matchesSource ? job.id : undefined }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '翻译提交失败，请刷新查看。')
      if (!controller.signal.aborted) setJob(data.preview as Preview)
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '提交结果暂时无法确认。')
    } finally {
      if (!controller.signal.aborted) { request.current = null; setSubmitting(false) }
    }
  }

  return (
    <>
      {targetValue.trim() && <p className="ai-translate-field__warning">目标语言已有内容。点击「填入此字段」会替换当前草稿。</p>}
      {waiting && <p role="status">{job.status === 'queued' ? '已排队' : '正在翻译'}，可以离开页面。</p>}
      {job?.matchesSource === false && (
        <p className="ai-translate-field__warning">这是另一份原文的预览。请核对旧原文，或基于当前内容重新生成。</p>
      )}
      {job?.original && <details><summary>查看旧原文</summary><p>{job.original}</p></details>}
      {job?.status === 'succeeded' ? (
        <textarea aria-label="译文预览" onChange={(event) => setEdited(event.target.value)} value={translation} />
      ) : !waiting && (
        <p className="ai-translate-field__placeholder">{loading ? '正在找回预览…' : '后台预览保存 7 天。填入字段后，仍需保存表单才会更新产品。'}</p>
      )}
      {job?.message && <p className="ai-translate-field__error">{job.message}</p>}
      {needsConfirmation && (
        <label className="ai-translate-field__confirmation">
          <input checked={confirmed} disabled={submitting} onChange={(event) => setConfirmedJobID(event.target.checked ? job.id : null)} type="checkbox" />
          我确认重试，可能再次调用 AI
        </label>
      )}
      {error && <p className="ai-translate-field__error" role="alert">{error}</p>}
      {translation.length > limit && <p className="ai-translate-field__warning">请将译文缩短至 {limit} 字符再填入。</p>}
      <footer>
        <button disabled={loading || submitting || !sourceText.trim() || (job?.matchesSource && waiting) || (needsConfirmation && !confirmed)}
          onClick={() => void generate()} type="button">
          {submitting ? <><LoaderCircle className="ai-translate-field__spin" size={15} />正在提交…</>
            : needsConfirmation ? '确认后重试'
              : job?.status === 'succeeded' && job.matchesSource ? <><RotateCcw size={14} />重新翻译</>
              : '生成译文'}
        </button>
        <button className="is-primary" disabled={job?.status !== 'succeeded' || !job.matchesSource || !translation.trim() || translation.length > limit || submitting}
          onClick={() => onApply(translation)} type="button">填入此字段</button>
      </footer>
    </>
  )
}
