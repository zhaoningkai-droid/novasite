'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Languages, LoaderCircle, X } from 'lucide-react'

import './workspace-translation-assistant.scss'

const locales = [
  ['zh', '简体中文'], ['en', 'English'], ['ru', 'Русский'], ['id', 'Bahasa Indonesia'],
] as const
type Locale = typeof locales[number][0]
type Preview = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown'
  text: string
  sourceLocale: Locale
  targetLocale: Locale
  translation: string | null
  message: string | null
}

export function WorkspaceTranslationAssistant({ companySlug }: { companySlug: string }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => { setOpen(false); trigger.current?.focus() }, [])

  return <>
    <button ref={trigger} aria-haspopup="dialog" className="workspace-translation-assistant__trigger"
      onClick={() => setOpen(true)} type="button"><Languages size={16} />AI 翻译</button>
    {open && <AssistantDialog key={companySlug} companySlug={companySlug} close={close} />}
  </>
}

function AssistantDialog({ companySlug, close }: { companySlug: string; close: () => void }) {
  const [sourceLocale, setSourceLocale] = useState<Locale>('zh')
  const [targetLocale, setTargetLocale] = useState<Locale>('en')
  const [text, setText] = useState('')
  const [job, setJob] = useState<Preview | null>(null)
  const [edited, setEdited] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [confirmedID, setConfirmedID] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const panel = useRef<HTMLElement>(null)
  const request = useRef<AbortController | null>(null)
  const waiting = job?.status === 'queued' || job?.status === 'running'
  const matches = job?.text === text.trim() && job.sourceLocale === sourceLocale && job.targetLocale === targetLocale
  const unknown = matches && job.status === 'unknown'
  const confirmed = unknown && confirmedID === job.id
  const translation = matches ? edited ?? job.translation ?? '' : ''
  const locked = loading || submitting || waiting
  const endpoint = `/api/workspace/${encodeURIComponent(companySlug)}/ai/translate/preview`

  const readOrSubmit = useCallback(async (input: Record<string, unknown>, signal: AbortSignal) => {
    const response = await fetch(endpoint, {
      method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, field: 'assistant' }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '暂时无法连接翻译助手。')
    return result.preview as Preview | null
  }, [endpoint])

  const adopt = useCallback((preview: Preview | null) => {
    setJob(preview)
    if (preview) {
      setText(preview.text)
      setSourceLocale(preview.sourceLocale)
      setTargetLocale(preview.targetLocale)
    }
    setEdited(null)
    setConfirmedID(null)
  }, [])

  useEffect(() => {
    if (!loading && !waiting) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const preview = await readOrSubmit({ action: 'latest' }, controller.signal)
        if (controller.signal.aborted) return
        adopt(preview)
        setError('')
        setLoading(false)
        if (preview?.status === 'queued' || preview?.status === 'running')
          timer = setTimeout(() => void refresh(), 2500)
      } catch {
        if (controller.signal.aborted) return
        setError('暂时无法读取任务，正在重新连接。')
        timer = setTimeout(() => void refresh(), 5000)
      }
    }
    // On reopening, read immediately. After a confirmed submit, wait for the worker.
    if (loading) void refresh()
    else timer = setTimeout(() => void refresh(), 2500)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [adopt, loading, readOrSubmit, waiting])

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('button')?.focus()
    return () => request.current?.abort()
  }, [])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !request.current) close()
      if (event.key !== 'Tab') return
      const focusable = panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled)',
      )
      if (!focusable?.length) return
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault(); focusable[focusable.length - 1].focus()
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault(); focusable[0].focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [close])

  const translate = async () => {
    if (locked || request.current || !text.trim() || sourceLocale === targetLocale || (unknown && !confirmed)) return
    const active = new AbortController()
    request.current = active
    setSubmitting(true); setMessage(''); setError(''); setConfirmedID(null)
    const scope = { sourceLocale, targetLocale, text }
    const previousID = matches ? job.id : undefined
    try {
      const preview = await readOrSubmit({
        ...scope, action: confirmed ? 'retry-unknown' : 'generate', previousID, acknowledged: confirmed || undefined,
      }, active.signal)
      if (!active.signal.aborted) adopt(preview)
    } catch (failure) {
      if (active.signal.aborted) return
      // A lost response can follow a successful commit. Look up the job without submitting again.
      const recovered = await readOrSubmit({ ...scope, action: 'find' }, active.signal).catch(() => null)
      if (active.signal.aborted) return
      if (recovered && recovered.id !== previousID && recovered.text === text.trim()) adopt(recovered)
      else setError(failure instanceof Error && failure.name === 'Error' && !(failure instanceof TypeError)
        ? failure.message : '暂时无法确认提交结果。重新打开助手可查看后台记录。')
    } finally {
      if (request.current === active) { request.current = null; setSubmitting(false) }
    }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(translation); setMessage('译文已复制，可以粘贴到任意文本框。') }
    catch { setMessage('无法自动复制，请选中译文后复制。') }
  }
  const updateInput = () => { setEdited(null); setConfirmedID(null); setMessage(''); setError('') }
  const status = loading ? '正在查找最近的翻译…'
    : waiting ? (job.status === 'queued' ? '已排队，可以离开页面。' : '正在翻译，可以离开页面。')
      : matches ? job.message || (job.status === 'succeeded' ? '译文已生成，可复制使用。' : '') : ''

  return <div className="workspace-translation-assistant__backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !request.current) close()
  }}>
    <section ref={panel} aria-label="AI 翻译助手" aria-modal="true" className="workspace-translation-assistant" role="dialog">
      <header><div><Languages size={20} /><div><h2>AI 翻译助手</h2><p>最近的翻译可在关闭后找回，保留 7 天。</p></div></div>
        <button aria-label="关闭 AI 翻译" disabled={submitting} onClick={close} type="button"><X size={19} /></button></header>
      <div className="workspace-translation-assistant__languages">
        <label>原文语言<select value={sourceLocale} disabled={locked} onChange={(event) => { setSourceLocale(event.target.value as Locale); updateInput() }}>
          {locales.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label>目标语言<select value={targetLocale} disabled={locked} onChange={(event) => { setTargetLocale(event.target.value as Locale); updateInput() }}>
          {locales.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      </div>
      <label className="workspace-translation-assistant__text">需要翻译的内容<textarea maxLength={8000} rows={8}
        value={text} disabled={locked} onChange={(event) => { setText(event.target.value); updateInput() }}
        placeholder="粘贴或输入要翻译的产品、新闻、页面等文字。最多 8000 字符。" />
        <small>{text.length} / 8000</small></label>
      {matches && job.status === 'succeeded' && <label className="workspace-translation-assistant__text">译文预览<textarea rows={8}
        value={translation} disabled={submitting} onChange={(event) => setEdited(event.target.value)} /></label>}
      {unknown && <label className="workspace-translation-assistant__confirmation">
        <input type="checkbox" checked={confirmed} disabled={submitting} onChange={(event) => setConfirmedID(event.target.checked ? job.id : null)} />
        我确认重试，可能再次调用 AI
      </label>}
      {(message || status) && <p role="status">{message || status}</p>}
      {!locked && sourceLocale === targetLocale && <p>请选择不同的原文和目标语言。</p>}
      {error && <p role="alert">{error}</p>}
      <footer>{translation && <button className="is-secondary" disabled={submitting} onClick={() => void copy()} type="button">复制译文</button>}
        <button className="is-primary" disabled={locked || !text.trim() || sourceLocale === targetLocale || (unknown && !confirmed)}
          onClick={() => void translate()} type="button">
          {submitting ? <><LoaderCircle className="workspace-translation-assistant__spinner" size={16} />正在提交…</>
            : unknown ? '确认后重试' : matches && job.status === 'succeeded' ? '重新翻译' : '生成译文'}
        </button></footer>
    </section>
  </div>
}
