'use client'

import { useEffect, useRef, useState } from 'react'
import { Languages, LoaderCircle, X } from 'lucide-react'

import './workspace-translation-assistant.scss'

const locales = [
  ['zh', '简体中文'], ['en', 'English'], ['ru', 'Русский'], ['id', 'Bahasa Indonesia'],
] as const

export function WorkspaceTranslationAssistant({ companySlug }: { companySlug: string }) {
  const [open, setOpen] = useState(false)
  const [sourceLocale, setSourceLocale] = useState('zh')
  const [targetLocale, setTargetLocale] = useState('en')
  const [text, setText] = useState('')
  const [translation, setTranslation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('textarea')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { request.current?.abort(); setOpen(false); trigger.current?.focus() }
      if (event.key !== 'Tab') return
      const focusable = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled)')
      if (!focusable?.length) return
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault(); focusable[focusable.length - 1].focus()
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault(); focusable[0].focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [open])
  const close = () => { setOpen(false); trigger.current?.focus() }
  const translate = async () => {
    if (!text.trim()) { setMessage('请先输入需要翻译的内容。'); return }
    if (sourceLocale === targetLocale) { setMessage('原文和目标语言不能相同。'); return }
    const active = new AbortController()
    request.current = active
    setBusy(true); setMessage(''); setTranslation('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/ai/translate`, {
        method: 'POST', signal: active.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceLocale, targetLocale, text }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || '翻译失败，请稍后重试。')
      setTranslation(result.translation)
      setMessage('译文已生成。复制后粘贴到需要填写的内容里。')
    } catch (error) {
      if (!active.signal.aborted) setMessage(error instanceof Error ? error.message : '网络连接失败，原文没有变化。')
    } finally { if (request.current === active) { request.current = null; setBusy(false) } }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(translation); setMessage('译文已复制，可以粘贴到任意文本框。') }
    catch { setMessage('无法自动复制，请选中译文后复制。') }
  }

  return <>
    <button ref={trigger} aria-haspopup="dialog" className="workspace-translation-assistant__trigger"
      onClick={() => { setOpen(true); setMessage('') }} type="button"><Languages size={16} />AI 翻译</button>
    {open && <div className="workspace-translation-assistant__backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) close()
    }}>
      <section ref={panel} aria-label="AI 翻译助手" aria-modal="true" className="workspace-translation-assistant" role="dialog">
        <header><div><Languages size={20} /><div><h2>AI 翻译助手</h2><p>翻译任意文本；检查后复制到对应内容框。</p></div></div>
          <button aria-label="关闭 AI 翻译" disabled={busy} onClick={close} type="button"><X size={19} /></button></header>
        <div className="workspace-translation-assistant__languages">
          <label>原文语言<select value={sourceLocale} disabled={busy} onChange={(event) => setSourceLocale(event.target.value)}>
            {locales.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <label>目标语言<select value={targetLocale} disabled={busy} onChange={(event) => setTargetLocale(event.target.value)}>
            {locales.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        </div>
        <label className="workspace-translation-assistant__text">需要翻译的内容<textarea maxLength={8000} rows={8}
          value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder="粘贴或输入要翻译的产品、新闻、页面等文字。最多 8000 字符。" />
          <small>{text.length} / 8000</small></label>
        {translation && <label className="workspace-translation-assistant__text">译文预览<textarea rows={8}
          value={translation} onChange={(event) => setTranslation(event.target.value)} /></label>}
        {message && <p role={translation ? 'status' : 'alert'}>{message}</p>}
        <footer>{translation && <button className="is-secondary" disabled={busy} onClick={() => void copy()} type="button">复制译文</button>}
          <button className="is-primary" disabled={busy || !text.trim()} onClick={() => void translate()} type="button">
            {busy ? <><LoaderCircle className="workspace-translation-assistant__spinner" size={16} />正在翻译…</> : translation ? '重新翻译' : '生成译文'}
          </button></footer>
      </section>
    </div>}
  </>
}
