'use client'

import Link from 'next/link'
import { ArrowLeft, Check, CheckCircle2, Globe2, Loader2, Save, TriangleAlert } from 'lucide-react'
import { FormEvent, KeyboardEvent, useRef, useState } from 'react'

import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { readWorkspaceResponse, workspaceErrorMessage } from '../WorkspaceEditor/workspaceResponse'
import '../WorkspaceEditor/content-entry-editor.scss'
import './workspace-translations.scss'

export type TranslationLocale = {
  code: 'en' | 'zh' | 'ru' | 'id'
  complete: boolean
  label: string
  summary: string
  title: string
}
type Props = { locales: TranslationLocale[]; returnHref: string; saveURL: string }
const changed = (item: TranslationLocale, saved?: TranslationLocale) =>
  !saved || item.title !== saved.title || item.summary !== saved.summary

export function WorkspaceTranslations(props: Props) {
  return <TranslationForm {...props} key={props.saveURL} />
}
function TranslationForm({ locales, returnHref, saveURL }: Props) {
  const [items, setItems] = useState(locales)
  const [savedItems, setSavedItems] = useState(locales)
  const [activeCode, setActiveCode] = useState<TranslationLocale['code']>(
    locales.find((item) => item.code === 'zh')?.code || locales[0]?.code || 'zh',
  )
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const savingRef = useRef(false)
  const active = items.find((item) => item.code === activeCode) || items[0]
  const isDirty = items.some((item) =>
    changed(
      item,
      savedItems.find((saved) => saved.code === item.code),
    ),
  )
  useWorkspaceUnsaved(isDirty, saving)
  const update = (key: 'summary' | 'title', value: string) =>
    setItems((current) =>
      current.map((item) => (item.code === active.code ? { ...item, [key]: value } : item)),
    )
  const activate = (code: TranslationLocale['code']) => {
    if (saving) return
    setActiveCode(code)
    setFeedback('')
    setErrors({})
  }
  const keyTabs = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (saving || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    activate(items[next].code)
    document.getElementById(`translation-tab-${items[next].code}`)?.focus()
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current || !active) return
    const fieldErrors: Record<string, string> = {}
    if (!active.title.trim()) fieldErrors.title = '请输入当前语言的产品名称'
    if (!active.summary.trim()) fieldErrors.summary = '请输入当前语言的列表摘要'
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length) {
      setError(true)
      setFeedback('当前语言还有必填内容未完成。')
      document
        .getElementById(fieldErrors.title ? 'translation-title' : 'translation-summary')
        ?.focus()
      return
    }
    const submitted = { ...active }
    savingRef.current = true
    setSaving(true)
    setFeedback('')
    try {
      const response = await fetch(saveURL, {
        body: JSON.stringify({
          locale: submitted.code,
          summary: submitted.summary,
          title: submitted.title,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      const result = await readWorkspaceResponse<{ message?: string }>(response)
      if (!response.ok) throw new Error(result.message || '保存失败，请稍后重试。')
      const saved = { ...submitted, complete: true }
      setSavedItems((current) => current.map((item) => (item.code === saved.code ? saved : item)))
      setItems((current) => current.map((item) => (item.code === saved.code ? saved : item)))
      setError(false)
      setFeedback(result.message || `${submitted.label}内容已保存。`)
    } catch (failure) {
      setError(true)
      setFeedback(workspaceErrorMessage(failure))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  if (!active)
    return (
      <section className="workspace-translations ws-entry-editor">
        <h1>产品四语维护</h1>
        <p>没有可维护的语言，请返回内容管理检查。</p>
        <Link href={returnHref}>返回内容管理</Link>
      </section>
    )
  return (
    <section className="workspace-translations ws-entry-editor" aria-label="四语内容维护">
      <header className="ws-entry-editor__header">
        <div>
          <Link className="ws-entry-editor__back" href={returnHref}>
            <ArrowLeft size={15} />
            返回产品管理
          </Link>
          <h1>产品四语维护</h1>
          <p>切换语言会保留本页输入，每种语言分别保存。</p>
        </div>
        <div className="workspace-translations__summary">
          <Globe2 size={18} />
          <span>
            <b>
              {savedItems.filter((item) => item.complete).length} / {items.length}
            </b>
            种语言已保存并补全
          </span>
        </div>
      </header>
      <div aria-label="选择维护语言" className="workspace-translations__progress" role="tablist">
        {items.map((item, index) => {
          const saved = savedItems.find((value) => value.code === item.code)
          const dirty = changed(item, saved)
          return (
            <button
              aria-controls="translation-panel"
              aria-selected={active.code === item.code}
              className={`workspace-translations__locale${active.code === item.code ? ' workspace-translations__locale--active' : ''}`}
              disabled={saving}
              id={`translation-tab-${item.code}`}
              key={item.code}
              onClick={() => activate(item.code)}
              onKeyDown={(event) => keyTabs(event, index)}
              role="tab"
              tabIndex={active.code === item.code ? 0 : -1}
              type="button"
            >
              <span>
                <strong>{item.label}</strong>
                <small>{item.code.toUpperCase()}</small>
              </span>
              <small
                className={`workspace-translations__state${dirty ? ' is-dirty' : saved?.complete ? ' is-complete' : ''}`}
              >
                {dirty ? (
                  '有未保存修改'
                ) : saved?.complete ? (
                  <>
                    <Check size={12} />
                    已完成
                  </>
                ) : (
                  '待补全'
                )}
              </small>
            </button>
          )
        })}
      </div>
      {feedback && (
        <div
          className={`ws-entry-editor__feedback${error ? ' is-error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {error ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}
          <span>{feedback}</span>
        </div>
      )}
      <form
        aria-labelledby={`translation-tab-${active.code}`}
        className="workspace-translations__form"
        id="translation-panel"
        noValidate
        onSubmit={save}
        role="tabpanel"
      >
        <fieldset disabled={saving}>
          <div className="ws-entry-editor__card-heading">
            <span>
              <Globe2 size={17} />
            </span>
            <div>
              <h2>{active.label}内容</h2>
              <p>产品名称和摘要只会保存到当前语言。</p>
            </div>
          </div>
          <label className="ws-entry-editor__field">
            <b>
              产品名称 <em>*</em>
            </b>
            <input
              aria-describedby={errors.title ? 'translation-title-error' : undefined}
              aria-invalid={Boolean(errors.title)}
              aria-label={`${active.label}产品名称`}
              id="translation-title"
              maxLength={120}
              onChange={(event) => update('title', event.target.value)}
              required
              value={active.title}
            />
            <small className="ws-entry-editor__counter">{active.title.length} / 120</small>
            {errors.title && (
              <small className="ws-entry-editor__field-error" id="translation-title-error">
                {errors.title}
              </small>
            )}
          </label>
          <label className="ws-entry-editor__field">
            <b>
              列表摘要 <em>*</em>
            </b>
            <textarea
              aria-describedby={errors.summary ? 'translation-summary-error' : undefined}
              aria-invalid={Boolean(errors.summary)}
              aria-label={`${active.label}列表摘要`}
              id="translation-summary"
              maxLength={360}
              onChange={(event) => update('summary', event.target.value)}
              required
              rows={6}
              value={active.summary}
            />
            <small className="ws-entry-editor__counter">{active.summary.length} / 360</small>
            {errors.summary && (
              <small className="ws-entry-editor__field-error" id="translation-summary-error">
                {errors.summary}
              </small>
            )}
          </label>
        </fieldset>
        <footer>
          <p>这里维护名称与列表摘要；此页不会修改正文、图片或其他语言。</p>
          <button className="ws-entry-editor__primary" disabled={saving} type="submit">
            {saving ? (
              <Loader2 size={16} className="ws-entry-editor__spinner" />
            ) : (
              <Save size={16} />
            )}
            {saving ? '保存中…' : `保存${active.label}`}
          </button>
        </footer>
      </form>
    </section>
  )
}
