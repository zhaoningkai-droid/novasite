'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Save,
  TriangleAlert,
} from 'lucide-react'
import { FormEvent, useRef, useState } from 'react'

import { ContentCover, ContentCoverUploader } from '../ContentCoverUploader/ContentCoverUploader'
import { useWorkspaceUnsaved } from './useWorkspaceUnsaved'
import {
  createWorkspaceDraftKey,
  readWorkspaceResponse,
  workspaceErrorMessage,
} from './workspaceResponse'
import './content-entry-editor.scss'

type Kind = 'news' | 'cases' | 'blog'
export type ContentEntryInitial = {
  category?: number
  content?: string
  country?: string
  cover?: ContentCover
  description?: string
  featured?: boolean
  id?: number
  industry?: string
  sortOrder?: number
  summary?: string
  title?: string
}
type Props = {
  categories: { id: number; name: string }[]
  companySlug: string
  initial?: ContentEntryInitial
  kind: Kind
}
const names: Record<Kind, string> = { blog: '博客', cases: '案例', news: '新闻' }
const signature = (values: object) => JSON.stringify(values)

export function ContentEntryEditor({ categories, companySlug, initial = {}, kind }: Props) {
  const name = names[kind]
  const [category, setCategory] = useState(String(initial.category || ''))
  const [title, setTitle] = useState(initial.title || '')
  const [summary, setSummary] = useState(initial.summary || initial.description || '')
  const [content, setContent] = useState(initial.content || '')
  const [country, setCountry] = useState(initial.country || '')
  const [industry, setIndustry] = useState(initial.industry || '')
  const [cover, setCover] = useState<ContentCover | undefined>(initial.cover)
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder ?? 0))
  const [featured, setFeatured] = useState(Boolean(initial.featured))
  const [savedID, setSavedID] = useState(initial.id)
  const savedIDRef = useRef(initial.id)
  const savedContentRef = useRef(initial.content || '')
  const [editingBody, setEditingBody] = useState(!initial.id)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const savingRef = useRef(false)
  const draftKey = useRef(createWorkspaceDraftKey())
  const formRef = useRef<HTMLFormElement>(null)
  const values = {
    category,
    content,
    country,
    cover: cover?.id || null,
    featured,
    industry,
    sortOrder,
    summary,
    title,
  }
  const [savedSignature, setSavedSignature] = useState(() => signature(values))
  const dirty = signature(values) !== savedSignature
  const busy = saving || uploading
  useWorkspaceUnsaved(dirty, busy)

  const invalid = (field: string) => ({
    'aria-describedby': errors[field] ? `${kind}-${field}-error` : undefined,
    'aria-invalid': Boolean(errors[field]),
  })
  const fieldError = (field: string) =>
    errors[field] && (
      <small className="ws-entry-editor__field-error" id={`${kind}-${field}-error`}>
        {errors[field]}
      </small>
    )
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (savingRef.current || uploading) return
    const nextErrors: Record<string, string> = {}
    if (!category) nextErrors.category = `请选择${name}分类`
    if (!title.trim()) nextErrors.title = `请输入${name}${kind === 'cases' ? '名称' : '标题'}`
    if (!summary.trim()) nextErrors.summary = `请输入${name}摘要`
    if ((!savedIDRef.current || content !== savedContentRef.current) && !content.trim())
      nextErrors.content = `请输入${name}正文`
    if (kind === 'cases' && !country.trim()) nextErrors.country = '请输入项目国家'
    if (kind !== 'blog' && (!/^\d+$/.test(sortOrder) || !Number.isSafeInteger(Number(sortOrder))))
      nextErrors.sortOrder = '排序请填写 0 或正整数'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setMessage('还有必填内容未完成，请按字段下方的提示补充。')
      setErrorMessage(true)
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
      return
    }
    const id = savedIDRef.current
    const bodyChanged = !id || content !== savedContentRef.current
    const body = {
      category: Number(category),
      ...(bodyChanged ? { bodyText: content } : {}),
      cover: cover?.id ?? null,
      ...(kind === 'cases' ? { country, industry } : {}),
      ...(kind !== 'blog'
        ? { featured, sortOrder: Number(sortOrder), summary }
        : { description: summary }),
      ...(!id ? { idempotencyKey: draftKey.current } : {}),
      title,
    }
    savingRef.current = true
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(
        `/api/workspace/${companySlug}/${kind}/manage${id ? `/${id}` : ''}`,
        {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: id ? 'PATCH' : 'POST',
        },
      )
      const result = await readWorkspaceResponse<{ id?: number; message?: string }>(response)
      if (!response.ok) throw new Error(result.message || '保存未完成，请检查后重试。')
      if (!id && (!Number.isInteger(result.id) || Number(result.id) < 1))
        throw new Error('保存响应缺少内容编号，请稍后重试。已填写的内容已保留。')
      if (result.id) {
        savedIDRef.current = result.id
        setSavedID(result.id)
      }
      savedContentRef.current = content
      setSavedSignature(signature(values))
      setErrorMessage(false)
      setMessage(result.message || '当前内容已保存。')
      if (!id && result.id)
        window.history.replaceState(
          {},
          '',
          `/workspace/${companySlug}/website/content/${kind}/${result.id}/edit`,
        )
    } catch (error) {
      setErrorMessage(true)
      setMessage(workspaceErrorMessage(error))
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }
  const checks = [
    { label: `${name}${kind === 'cases' ? '名称' : '标题'}`, complete: Boolean(title.trim()) },
    { label: `${name}分类`, complete: Boolean(category) },
    { label: `${name}摘要`, complete: Boolean(summary.trim()) },
    {
      label: '正文内容',
      complete:
        Boolean(content.trim()) ||
        Boolean(savedID && !editingBody && content === savedContentRef.current),
    },
    ...(kind === 'cases' ? [{ label: '项目国家', complete: Boolean(country.trim()) }] : []),
  ]
  return (
    <section className={`ws-entry-editor ${kind === 'cases' ? 'case' : kind}-editor`}>
      <header className="ws-entry-editor__header">
        <div>
          <Link
            className="ws-entry-editor__back"
            href={`/workspace/${companySlug}/website/content/${kind}`}
          >
            <ArrowLeft size={15} />
            返回{name}管理
          </Link>
          <h1>{savedID ? `编辑${name}` : `新增${name}`}</h1>
          <p>
            将内容、图片和展示设置分开维护，带 <em>*</em> 的内容为必填。
          </p>
        </div>
        <div className="ws-entry-editor__actions">
          <span className={`ws-entry-editor__save-state${dirty ? ' is-dirty' : ''}`}>
            {busy
              ? '处理中…'
              : dirty
                ? '有未保存修改'
                : savedID
                  ? '当前内容已保存'
                  : '开始编辑内容'}
          </span>
          <button
            className="ws-entry-editor__primary"
            disabled={busy}
            form={`${kind}-editor-form`}
            type="submit"
          >
            {busy ? <Loader2 size={16} className="ws-entry-editor__spinner" /> : <Save size={16} />}
            {saving ? '保存中…' : uploading ? '图片上传中…' : '保存'}
          </button>
        </div>
      </header>
      {message && (
        <div
          className={`ws-entry-editor__feedback${errorMessage ? ' is-error' : ''}`}
          role={errorMessage ? 'alert' : 'status'}
        >
          {errorMessage ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}
          <span>{message}</span>
        </div>
      )}
      <form id={`${kind}-editor-form`} noValidate onSubmit={save} ref={formRef}>
        <fieldset className="ws-entry-editor__layout" disabled={saving}>
          <div className="ws-entry-editor__main">
            <section className="ws-entry-editor__card" aria-labelledby={`${kind}-basic-heading`}>
              <div className="ws-entry-editor__card-heading">
                <span>01</span>
                <div>
                  <h2 id={`${kind}-basic-heading`}>基础信息</h2>
                  <p>让访客一眼了解这篇内容。</p>
                </div>
              </div>
              <label className="ws-entry-editor__field">
                <b>
                  {name}
                  {kind === 'cases' ? '名称' : '标题'}
                  <em> *</em>
                </b>
                <input
                  {...invalid('title')}
                  aria-label={`${name}${kind === 'cases' ? '名称' : '标题'}`}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  placeholder={`输入清晰、具体的${name}${kind === 'cases' ? '名称' : '标题'}`}
                  value={title}
                />
                <small className="ws-entry-editor__counter">{title.length} / 120</small>
                {fieldError('title')}
              </label>
              {kind === 'cases' && (
                <div className="ws-entry-editor__field-row">
                  <label className="ws-entry-editor__field">
                    <b>
                      项目国家 <em>*</em>
                    </b>
                    <input
                      {...invalid('country')}
                      aria-label="项目国家"
                      onChange={(event) => setCountry(event.target.value)}
                      placeholder="例如：德国"
                      required
                      value={country}
                    />
                    {fieldError('country')}
                  </label>
                  <label className="ws-entry-editor__field">
                    <b>
                      应用行业 <small>选填</small>
                    </b>
                    <input
                      aria-label="应用行业"
                      onChange={(event) => setIndustry(event.target.value)}
                      placeholder="例如：工业设备"
                      value={industry}
                    />
                  </label>
                </div>
              )}
              <label className="ws-entry-editor__field">
                <b>
                  {name}摘要 <em>*</em>
                </b>
                <textarea
                  {...invalid('summary')}
                  aria-label={`${name}摘要`}
                  onChange={(event) => setSummary(event.target.value)}
                  required
                  placeholder="概括主要内容，用于列表展示"
                  rows={4}
                  value={summary}
                />
                <small>摘要会显示在内容列表中，不需要重复整篇正文</small>
                {fieldError('summary')}
              </label>
            </section>
            <section className="ws-entry-editor__card" aria-labelledby={`${kind}-body-heading`}>
              <div className="ws-entry-editor__card-heading">
                <span>02</span>
                <div>
                  <h2 id={`${kind}-body-heading`}>正文内容</h2>
                  <p>按段落整理内容，阅读更清楚。</p>
                </div>
                {savedID && (
                  <button
                    className="ws-entry-editor__secondary"
                    onClick={() => setEditingBody((value) => !value)}
                    type="button"
                  >
                    {editingBody ? '查看正文' : '编辑正文文本'}
                  </button>
                )}
              </div>
              {savedID && (
                <p className="ws-entry-editor__body-note">
                  {editingBody
                    ? '这里编辑正文文本。修改并保存后，正文将按文字段落重新排版。'
                    : '当前为正文文字预览。仅修改其他信息时，会保留原正文及排版。'}
                </p>
              )}
              <label className="ws-entry-editor__field">
                <b>
                  {name}
                  {kind === 'cases' ? '详情' : '正文'}
                  <em> *</em>
                </b>
                <textarea
                  {...invalid('content')}
                  aria-label={`${name}${kind === 'cases' ? '详情' : '正文'}`}
                  className="ws-entry-editor__body-input"
                  onChange={(event) => setContent(event.target.value)}
                  readOnly={!editingBody}
                  placeholder="在这里写正文，使用换行区分段落"
                  rows={14}
                  value={content}
                />
                <small className="ws-entry-editor__counter">{content.length} 字</small>
                {fieldError('content')}
              </label>
            </section>
          </div>
          <aside className="ws-entry-editor__aside">
            <section className="ws-entry-editor__card">
              <h2>展示设置</h2>
              <label className="ws-entry-editor__field">
                <b>
                  {name}分类 <em>*</em>
                </b>
                <select
                  {...invalid('category')}
                  aria-label={`${name}分类`}
                  onChange={(event) => setCategory(event.target.value)}
                  required
                  value={category}
                >
                  <option value="">请选择{name}分类</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {fieldError('category')}
                {!categories.length && <small>暂无分类，请先到分类管理添加。</small>}
              </label>
              <ContentCoverUploader
                companySlug={companySlug}
                disabled={saving}
                label={`${name}封面图`}
                onBusyChange={setUploading}
                onChange={setCover}
                value={cover}
              />
              {kind !== 'blog' && (
                <>
                  <label className="ws-entry-editor__field">
                    <b>{name}排序</b>
                    <input
                      {...invalid('sortOrder')}
                      aria-label={`${name}排序`}
                      min={0}
                      step={1}
                      onChange={(event) => setSortOrder(event.target.value)}
                      type="number"
                      value={sortOrder}
                    />
                    <small>数字越小，列表位置越靠前</small>
                    {fieldError('sortOrder')}
                  </label>
                  <label className="ws-entry-editor__switch">
                    <span>
                      <b>推荐到首页</b>
                      <small>在首页{name}模块展示</small>
                    </span>
                    <input
                      aria-label={`推荐首页${name}模块`}
                      checked={featured}
                      onChange={(event) => setFeatured(event.target.checked)}
                      role="switch"
                      type="checkbox"
                    />
                  </label>
                </>
              )}
            </section>
            <section className="ws-entry-editor__card ws-entry-editor__checklist">
              <h2>
                <FileText size={17} />
                内容检查
              </h2>
              <p>保存前检查必填信息。</p>
              {checks.map((item) => (
                <div className={item.complete ? 'is-complete' : ''} key={item.label}>
                  <span>{item.complete ? <Check size={13} /> : null}</span>
                  {item.label}
                  <small>{item.complete ? '已填写' : '待填写'}</small>
                </div>
              ))}
            </section>
          </aside>
        </fieldset>
        <footer className="ws-entry-editor__footer">
          <span>{dirty ? '修改尚未保存' : '本页内容已就绪'}</span>
          <button className="ws-entry-editor__primary" disabled={busy} type="submit">
            <Save size={16} />
            {saving ? '保存中…' : uploading ? '图片上传中…' : '保存'}
          </button>
        </footer>
      </form>
    </section>
  )
}
