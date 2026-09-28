'use client'

import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, Save, TriangleAlert } from 'lucide-react'
import { FormEvent, useRef, useState } from 'react'

import { useWorkspaceUnsaved } from './useWorkspaceUnsaved'
import { readWorkspaceResponse, workspaceErrorMessage } from './workspaceResponse'
import './content-entry-editor.scss'
import './workspace-editor.scss'

export type WorkspaceEditorField = {
  label: string
  maxLength: number
  name: string
  required?: boolean
  value: string
}
type SaveResult = { errors?: Record<string, string>; message?: string }
type Props = { fields: WorkspaceEditorField[]; returnHref: string; saveURL: string; title: string }
const valuesFromFields = (fields: WorkspaceEditorField[]) =>
  Object.fromEntries(fields.map((field) => [field.name, field.value]))

export function WorkspaceEditor(props: Props) {
  return <WorkspaceBasicForm {...props} key={props.saveURL} />
}
function WorkspaceBasicForm({ fields, returnHref, saveURL, title }: Props) {
  const [savedValues, setSavedValues] = useState(() => valuesFromFields(fields))
  const [values, setValues] = useState(() => valuesFromFields(fields))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [hasError, setHasError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const submitted = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const isDirty = fields.some((field) => values[field.name] !== savedValues[field.name])
  useWorkspaceUnsaved(isDirty, isSaving)
  const cancel = () => {
    if (isDirty && !window.confirm('确定放弃当前修改，并恢复上次保存的内容吗？')) return
    setValues(savedValues)
    setErrors({})
    setHasError(false)
    setFeedback('已恢复为最近一次保存的内容。')
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitted.current) return
    const validation: Record<string, string> = {}
    fields.forEach((field) => {
      if (field.required && !values[field.name].trim())
        validation[field.name] = `请输入${field.label}`
    })
    setErrors(validation)
    if (Object.keys(validation).length) {
      setHasError(true)
      setFeedback('请补全带星号的必填内容。')
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
      return
    }
    const snapshot = { ...values }
    submitted.current = true
    setFeedback('')
    setIsSaving(true)
    try {
      const response = await fetch(saveURL, {
        body: JSON.stringify(snapshot),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      const result = await readWorkspaceResponse<SaveResult>(response)
      if (!response.ok) {
        setErrors(result.errors || {})
        throw new Error(result.message || '保存未完成，请检查后重试。已填写的内容已保留。')
      }
      setSavedValues(snapshot)
      setHasError(false)
      setFeedback(result.message || '保存成功。')
    } catch (error) {
      setHasError(true)
      setFeedback(workspaceErrorMessage(error))
    } finally {
      submitted.current = false
      setIsSaving(false)
    }
  }
  return (
    <section className="workspace-editor ws-entry-editor" aria-label="内容编辑表单">
      <header className="ws-entry-editor__header">
        <div>
          <Link className="ws-entry-editor__back" href={returnHref}>
            <ArrowLeft size={15} />
            返回内容管理
          </Link>
          <h1>{title}</h1>
          <p>维护这条内容的基础信息。</p>
        </div>
        <span className={`ws-entry-editor__save-state${isDirty ? ' is-dirty' : ''}`}>
          {isSaving ? '正在保存…' : isDirty ? '有未保存修改' : '当前内容已保存'}
        </span>
      </header>
      {feedback && (
        <div
          className={`ws-entry-editor__feedback${hasError ? ' is-error' : ''}`}
          role={hasError ? 'alert' : 'status'}
        >
          {hasError ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}
          <span>{feedback}</span>
        </div>
      )}
      <form className="ws-entry-editor__card" noValidate onSubmit={submit} ref={form}>
        <fieldset disabled={isSaving}>
          {fields.map((field) => (
            <label className="ws-entry-editor__field" key={field.name}>
              <b>
                {field.label}
                {field.required && <em aria-hidden="true"> *</em>}
              </b>
              <input
                aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
                aria-invalid={Boolean(errors[field.name])}
                maxLength={field.maxLength}
                name={field.name}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, [field.name]: event.target.value }))
                }
                required={field.required}
                value={values[field.name]}
              />
              <small className="ws-entry-editor__counter">
                {values[field.name].length} / {field.maxLength}
              </small>
              {errors[field.name] && (
                <small className="ws-entry-editor__field-error" id={`${field.name}-error`}>
                  {errors[field.name]}
                </small>
              )}
            </label>
          ))}
        </fieldset>
        <footer>
          <button
            className="ws-entry-editor__secondary"
            disabled={isSaving || !isDirty}
            onClick={cancel}
            type="button"
          >
            <RotateCcw size={15} />
            恢复上次保存
          </button>
          <button className="ws-entry-editor__primary" disabled={isSaving} type="submit">
            {isSaving ? (
              <Loader2 size={16} className="ws-entry-editor__spinner" />
            ) : (
              <Save size={16} />
            )}
            {isSaving ? '保存中…' : '保存'}
          </button>
        </footer>
      </form>
    </section>
  )
}
