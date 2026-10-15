'use client'

import { useEffect, useRef, useState } from 'react'
import { Languages, LoaderCircle, RotateCcw, X } from 'lucide-react'

import './ai-translate-field.scss'
import type { SiteLocale } from '@/platform/site-locales'

export type TranslationSource = { code: SiteLocale; label: string; value: string }
type Props = {
  companySlug: string
  defaultSourceLocale?: SiteLocale
  sources: TranslationSource[]
  targetLocale: TranslationSource['code']
  targetValue: string
  onApply: (translation: string) => void
}

export function AITranslateField({
  companySlug,
  defaultSourceLocale,
  sources,
  targetLocale,
  targetValue,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false)
  const [sourceLocale, setSourceLocale] = useState<TranslationSource['code']>(
    sources.find((item) => item.code === defaultSourceLocale && item.code !== targetLocale)?.code ||
      sources.find((item) => item.code !== targetLocale && item.value.trim())?.code ||
      sources.find((item) => item.code !== targetLocale)?.code ||
      'zh',
  )
  const [translation, setTranslation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const source = sources.find((item) => item.code === sourceLocale)
  const requestIdentity = `${targetLocale}:${sourceLocale}:${source?.value || ''}`
  const currentIdentity = useRef(requestIdentity)
  currentIdentity.current = requestIdentity

  useEffect(() => () => controller.current?.abort(), [])

  const generate = async () => {
    if (!source?.value.trim()) {
      setError('所选原文为空，请改选有内容的语言。')
      return
    }
    controller.current?.abort()
    const active = new AbortController()
    controller.current = active
    const identity = requestIdentity
    setBusy(true)
    setError('')
    setTranslation('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/ai/translate`, {
        method: 'POST',
        signal: active.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceLocale, targetLocale, text: source.value }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(
          typeof result.message === 'string' ? result.message : '翻译失败，请稍后重试。',
        )
      if (active.signal.aborted || currentIdentity.current !== identity) return
      if (typeof result.translation !== 'string' || !result.translation.trim())
        throw new Error('译文为空，请重试。')
      setTranslation(result.translation)
    } catch (failure) {
      if (!active.signal.aborted)
        setError(failure instanceof Error ? failure.message : '网络连接失败，原文没有变化。')
    } finally {
      if (controller.current === active) {
        controller.current = null
        setBusy(false)
      }
    }
  }

  return (
    <div className="ai-translate-field">
      <button
        className="ai-translate-field__trigger"
        disabled={busy}
        onClick={() => {
          setOpen((value) => !value)
          setError('')
          setTranslation('')
        }}
        type="button"
      >
        <Languages size={15} aria-hidden="true" />
        AI 翻译
      </button>
      {open && (
        <section aria-label="AI 翻译预览" className="ai-translate-field__panel">
          <header>
            <strong>预览译文</strong>
            <button
              aria-label="关闭翻译预览"
              onClick={() => {
                controller.current?.abort()
                setBusy(false)
                setOpen(false)
                setTranslation('')
              }}
              type="button"
            >
              <X size={15} />
            </button>
          </header>
          <label>
            原文语言
            <select
              disabled={busy}
              onChange={(event) => {
                setSourceLocale(event.target.value as TranslationSource['code'])
                setTranslation('')
                setError('')
              }}
              value={sourceLocale}
            >
              {sources
                .filter((item) => item.code !== targetLocale)
                .map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                    {item.value.trim() ? '' : '（空）'}
                  </option>
                ))}
            </select>
          </label>
          {targetValue.trim() && (
            <p className="ai-translate-field__warning">
              目标语言已有内容。生成后需要你手动选择“填入此字段”才会替换当前草稿。
            </p>
          )}
          {translation ? (
            <textarea
              aria-label="译文预览"
              onChange={(event) => setTranslation(event.target.value)}
              value={translation}
            />
          ) : (
            <p className="ai-translate-field__placeholder">
              原文只会发送到翻译服务用于生成预览，不会自动保存。
            </p>
          )}
          {error && (
            <p className="ai-translate-field__error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button disabled={busy} onClick={() => void generate()} type="button">
              {busy ? (
                <>
                  <LoaderCircle className="ai-translate-field__spin" size={15} />
                  正在翻译…
                </>
              ) : translation ? (
                <>
                  <RotateCcw size={14} />
                  重新翻译
                </>
              ) : (
                '生成译文'
              )}
            </button>
            <button
              className="is-primary"
              disabled={!translation || busy}
              onClick={() => {
                onApply(translation)
                setOpen(false)
                setTranslation('')
              }}
              type="button"
            >
              填入此字段
            </button>
          </footer>
        </section>
      )}
    </div>
  )
}
