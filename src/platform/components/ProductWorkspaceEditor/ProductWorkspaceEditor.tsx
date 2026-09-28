'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Bold,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageUp,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Save,
  Sparkles,
  Table2,
  TriangleAlert,
  Underline,
  X,
} from 'lucide-react'
import { ClipboardEvent, useEffect, useRef, useState } from 'react'

import { sanitizeRichHTML } from '@/platform/sanitizeRichHTML'
import {
  WorkspaceMediaBrowser,
  WorkspaceMediaImage,
} from '../WorkspaceMediaPicker/WorkspaceMediaBrowser'
import {
  allowWorkspaceNavigation,
  useWorkspaceUnsaved,
} from '../WorkspaceEditor/useWorkspaceUnsaved'
import {
  createWorkspaceDraftKey,
  readWorkspaceResponse,
  workspaceErrorMessage,
} from '../WorkspaceEditor/workspaceResponse'
import '../WorkspaceEditor/content-entry-editor.scss'
import './product-workspace-editor.scss'

type Category = { id: number; name: string }
type Media = WorkspaceMediaImage
type Initial = {
  category?: number
  detailHTML?: string
  gallery?: Media[]
  id?: number
  keywords?: string
  sortOrder?: number
  summary?: string
  tags?: string[]
  title?: string
}
type Props = { categories: Category[]; companySlug: string; initial?: Initial }
const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim()
const escapeHTML = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const imageDimensions = (file: File) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const source = URL.createObjectURL(file)
    const image = new window.Image()
    const cleanup = () => {
      clearTimeout(timer)
      URL.revokeObjectURL(source)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('图片读取超时，请重新选择图片。'))
    }, 10000)
    image.onload = () => {
      cleanup()
      resolve({ width: image.width, height: image.height })
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('图片内容无法读取，请更换有效图片。'))
    }
    image.src = source
  })

export function ProductWorkspaceEditor(props: Props) {
  return (
    <ProductWorkspaceForm {...props} key={`${props.companySlug}:${props.initial?.id || 'new'}`} />
  )
}

function ProductWorkspaceForm({ categories, companySlug, initial = {} }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.title || '')
  const [category, setCategory] = useState(String(initial.category || ''))
  const [keywords, setKeywords] = useState(initial.keywords || '')
  const [summary, setSummary] = useState(initial.summary || '')
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder ?? 0))
  const [tags, setTags] = useState(initial.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [gallery, setGallery] = useState<Media[]>(initial.gallery || [])
  const [detailHTML, setDetailHTML] = useState(() => sanitizeRichHTML(initial.detailHTML || ''))
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [savedID, setSavedID] = useState(initial.id)
  const savedIDRef = useRef(initial.id)
  const savingRef = useRef(false)
  const uploadingRef = useRef(false)
  const galleryRef = useRef(gallery)
  const request = useRef<AbortController | null>(null)
  const draftKey = useRef(createWorkspaceDraftKey())
  const editorRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const selectionRef = useRef<Range | null>(null)
  const initialHTML = useRef(detailHTML)
  const savedDetail = useRef(detailHTML)
  const detailTouched = useRef(false)
  const values = {
    category,
    detailHTML,
    gallery: gallery.map((item) => item.id),
    keywords,
    sortOrder,
    summary,
    tagInput,
    tags,
    title,
  }
  const [savedSignature, setSavedSignature] = useState(() => JSON.stringify(values))
  const dirty = JSON.stringify(values) !== savedSignature
  const busy = saving || uploading
  useWorkspaceUnsaved(dirty, busy)

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHTML.current
  }, [])
  useEffect(() => {
    galleryRef.current = gallery
  }, [gallery])
  useEffect(
    () => () => {
      request.current?.abort()
    },
    [],
  )
  useEffect(() => {
    const remember = () => {
      const selection = window.getSelection()
      if (
        selection?.rangeCount &&
        editorRef.current?.contains(selection.anchorNode) &&
        editorRef.current.contains(selection.focusNode)
      )
        selectionRef.current = selection.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', remember)
    return () => document.removeEventListener('selectionchange', remember)
  }, [])
  const notice = (text: string, error = false) => {
    setMessage(text)
    setErrorMessage(error)
  }
  const updateGallery = (next: Media[]) => {
    galleryRef.current = next
    setGallery(next)
  }
  const addTag = () => {
    const value = tagInput.trim()
    if (!value) return
    if (tags.length >= 12 && !tags.includes(value)) return notice('产品标签最多 12 个。', true)
    if (!tags.includes(value)) setTags((current) => [...current, value])
    setTagInput('')
  }
  const syncDetail = () => {
    detailTouched.current = true
    setDetailHTML(sanitizeRichHTML(editorRef.current?.innerHTML || ''))
  }
  const format = (command: string, value?: string) => {
    const editor = editorRef.current
    if (!editor || busy) return
    editor.focus()
    const selection = window.getSelection()
    const range = selectionRef.current
    if (range && editor.contains(range.commonAncestorContainer)) {
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    document.execCommand(command, false, value)
    syncDetail()
  }
  const insertGalleryImage = () => {
    const item = gallery[0]
    const source = item?.url || item?.thumbnailURL
    if (!source) return notice('请先上传或选择产品图片。', true)
    format(
      'insertHTML',
      sanitizeRichHTML(`<img src="${escapeHTML(source)}" alt="${escapeHTML(item.alt || title)}">`),
    )
  }
  const pasteRichContent = (event: ClipboardEvent<HTMLDivElement>) => {
    const html = event.clipboardData.getData('text/html')
    const text = event.clipboardData.getData('text/plain')
    if (!html && !text) return
    event.preventDefault()
    const safe = html
      ? sanitizeRichHTML(html)
      : text
          .split(/\n{2,}/)
          .map((part) => `<p>${escapeHTML(part).replace(/\n/g, '<br>')}</p>`)
          .join('')
    format('insertHTML', safe)
  }
  const uploadFiles = async (files: File[]) => {
    if (uploadingRef.current || savingRef.current) return
    const slots = 5 - galleryRef.current.length
    if (slots <= 0) return notice('产品图片最多 5 张，可先移除一张再上传。', true)
    const queue = files.slice(0, slots)
    if (!queue.length) return
    uploadingRef.current = true
    setUploading(true)
    setMessage('')
    const controller = new AbortController()
    request.current = controller
    let successful = 0
    let nonSquare = false
    const failures: string[] = []
    try {
      for (const [index, file] of queue.entries()) {
        if (controller.signal.aborted) break
        setUploadProgress(`${index + 1} / ${queue.length}`)
        try {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
            throw new Error(`${file.name}：仅支持 JPG、PNG 或 WebP。`)
          if (!file.size || file.size > 500 * 1024)
            throw new Error(`${file.name}：文件须大于 0 且不能超过 500KB。`)
          const dimensions = await imageDimensions(file)
          if (controller.signal.aborted) break
          const body = new FormData()
          body.set('file', file)
          body.set('alt', title || file.name)
          body.set('productImage', 'true')
          const response = await fetch(`/api/workspace/${companySlug}/media`, {
            body,
            method: 'POST',
            signal: controller.signal,
          })
          const result = await readWorkspaceResponse<{ media?: Media; message?: string }>(response)
          if (!response.ok || !result.media) throw new Error(result.message || '图片上传失败。')
          if (controller.signal.aborted) break
          updateGallery([...galleryRef.current, result.media].slice(0, 5))
          successful += 1
          if (dimensions.width !== 800 || dimensions.height !== 800) nonSquare = true
        } catch (error) {
          if (!controller.signal.aborted)
            failures.push(workspaceErrorMessage(error, '图片上传失败，请重试。'))
        }
      }
      if (!controller.signal.aborted)
        notice(
          [
            successful ? `已上传 ${successful} 张图片，保存产品后生效。` : '',
            nonSquare ? '建议使用 800×800 图片获得更整齐的展示。' : '',
            files.length > slots ? `本次最多可加入 ${slots} 张，超出部分未上传。` : '',
            ...failures,
          ]
            .filter(Boolean)
            .join(' '),
          failures.length > 0,
        )
    } finally {
      uploadingRef.current = false
      if (!controller.signal.aborted) {
        setUploading(false)
        setUploadProgress('')
      }
    }
  }
  const save = async (continueAdding = false) => {
    if (savingRef.current || uploadingRef.current) return
    const pendingTag = tagInput.trim()
    const nextTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags
    const html = sanitizeRichHTML(editorRef.current?.innerHTML || '')
    const nextErrors: Record<string, string> = {}
    if (!category) nextErrors.category = '请选择产品分类'
    if (!title.trim()) nextErrors.title = '请输入产品名称'
    if (!nextTags.length) nextErrors.tags = '请填写至少一个产品标签'
    if (nextTags.length > 12) nextErrors.tags = '产品标签最多 12 个'
    if (!gallery.length) nextErrors.gallery = '请上传或选择至少一张产品图片'
    if (!plainText(html) && !/<img\b/.test(html)) nextErrors.detail = '请输入产品详情'
    if (!/^\d+$/.test(sortOrder) || !Number.isSafeInteger(Number(sortOrder)))
      nextErrors.sortOrder = '排序请填写 0 或正整数'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      notice('还有必填内容未完成，请按字段下方的提示补充。', true)
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      )
      return
    }
    const id = savedIDRef.current
    const payload = {
      category: Number(category),
      continueAdding,
      detailHTML: html,
      detailChanged: detailTouched.current && html !== savedDetail.current,
      gallery: gallery.map((item) => item.id),
      idempotencyKey: id ? undefined : draftKey.current,
      keywords,
      sortOrder: Number(sortOrder),
      summary,
      tags: nextTags,
      title,
    }
    savingRef.current = true
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(
        `/api/workspace/${companySlug}/products/manage${id ? `/${id}` : ''}`,
        {
          body: JSON.stringify(payload),
          headers: { 'content-type': 'application/json' },
          method: id ? 'PATCH' : 'POST',
        },
      )
      const result = await readWorkspaceResponse<{ id?: number; message?: string }>(response)
      if (!response.ok) throw new Error(result.message || '保存未完成，请检查产品资料。')
      if (!id && (!Number.isInteger(result.id) || Number(result.id) < 1))
        throw new Error('保存响应缺少产品编号，请重试。已填写的内容已保留。')
      if (result.id) {
        savedIDRef.current = result.id
        setSavedID(result.id)
      }
      savedDetail.current = html
      detailTouched.current = false
      setTags(nextTags)
      setTagInput('')
      setDetailHTML(html)
      setSavedSignature(
        JSON.stringify({ ...values, detailHTML: html, tagInput: '', tags: nextTags }),
      )
      notice(result.message || '产品已保存。')
      if (continueAdding) {
        allowWorkspaceNavigation()
        setTitle('')
        setCategory('')
        setKeywords('')
        setSummary('')
        setSortOrder('0')
        setTags([])
        setTagInput('')
        updateGallery([])
        setDetailHTML('')
        savedIDRef.current = undefined
        setSavedID(undefined)
        savedDetail.current = ''
        draftKey.current = createWorkspaceDraftKey()
        if (editorRef.current) editorRef.current.innerHTML = ''
        setSavedSignature(
          JSON.stringify({
            category: '',
            detailHTML: '',
            gallery: [],
            keywords: '',
            sortOrder: '0',
            summary: '',
            tagInput: '',
            tags: [],
            title: '',
          }),
        )
        notice('上一件产品已保存，可以继续添加。')
        router.push(`/workspace/${companySlug}/website/content/new`)
        router.refresh()
      } else if (!id && result.id)
        window.history.replaceState(
          {},
          '',
          `/workspace/${companySlug}/website/content/${result.id}/edit`,
        )
    } catch (error) {
      notice(workspaceErrorMessage(error), true)
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }
  const generate = () => {
    const name = title.trim() || '产品'
    if (!summary.trim()) setSummary(`${name}，查看产品信息，并联系我们了解规格、交付与服务。`)
    if (editorRef.current && !plainText(editorRef.current.innerHTML)) {
      editorRef.current.innerHTML = `<h2>${escapeHTML(name)}</h2><p>请补充产品用途、规格、材料与应用场景。</p>`
      syncDetail()
    }
    notice('已填入文案起稿模板，请核对并补充真实产品信息后保存。')
  }
  const invalid = (field: string) => ({
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': errors[field] ? `product-${field}-error` : undefined,
  })
  const fieldError = (field: string) =>
    errors[field] && (
      <small className="ws-entry-editor__field-error" id={`product-${field}-error`}>
        {errors[field]}
      </small>
    )
  const moveImage = (index: number, direction: number) => {
    const next = [...gallery]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    updateGallery(next)
  }
  const checks = [
    { label: '产品名称', complete: Boolean(title.trim()) },
    { label: '产品分类', complete: Boolean(category) },
    { label: '产品标签', complete: Boolean(tags.length || tagInput.trim()) },
    { label: '产品图片', complete: Boolean(gallery.length) },
    { label: '产品详情', complete: Boolean(plainText(detailHTML) || /<img\b/.test(detailHTML)) },
  ]
  return (
    <section className="product-editor ws-entry-editor">
      <header className="ws-entry-editor__header product-editor__header">
        <div>
          <Link
            className="ws-entry-editor__back"
            href={`/workspace/${companySlug}/website/content`}
          >
            <ArrowLeft size={15} />
            返回产品管理
          </Link>
          <h1>{savedID ? '编辑产品' : '新增产品'}</h1>
          <p>
            先完善图文，再设置分类与标签。带 <em>*</em> 的内容为必填。
          </p>
        </div>
        <div className="ws-entry-editor__actions product-editor__actions">
          <span className={`ws-entry-editor__save-state${dirty ? ' is-dirty' : ''}`}>
            {busy
              ? uploading
                ? `图片上传中 ${uploadProgress}`
                : '正在保存…'
              : dirty
                ? '有未保存修改'
                : savedID
                  ? '当前产品已保存'
                  : '开始编辑产品'}
          </span>
          <button
            className="ws-entry-editor__secondary"
            disabled={busy}
            onClick={generate}
            type="button"
          >
            <Sparkles size={15} />
            生成文案草稿
          </button>
          <button
            className="ws-entry-editor__secondary"
            disabled={busy}
            onClick={() => void save(true)}
            type="button"
          >
            保存并继续添加
            <ArrowRight size={15} />
          </button>
          <button
            className="ws-entry-editor__primary"
            disabled={busy}
            form="product-editor-form"
            type="submit"
          >
            {saving ? (
              <Loader2 size={16} className="ws-entry-editor__spinner" />
            ) : (
              <Save size={16} />
            )}
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
      <form
        id="product-editor-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
        ref={formRef}
      >
        <fieldset className="ws-entry-editor__layout" disabled={saving}>
          <div className="ws-entry-editor__main">
            <section className="ws-entry-editor__card">
              <div className="ws-entry-editor__card-heading">
                <span>01</span>
                <div>
                  <h2>基础信息</h2>
                  <p>名称和描述用于访客快速认识产品。</p>
                </div>
              </div>
              <label className="ws-entry-editor__field">
                <b>
                  产品名称 <em>*</em>
                </b>
                <input
                  {...invalid('title')}
                  aria-label="产品名称"
                  maxLength={100}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="输入产品名称"
                  required
                  value={title}
                />
                <small className="ws-entry-editor__counter">{title.length} / 100</small>
                {fieldError('title')}
              </label>
              <label className="ws-entry-editor__field">
                <b>
                  产品描述 <small>选填</small>
                </b>
                <textarea
                  aria-label="产品描述"
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="概括用途、规格或特点"
                  rows={4}
                  value={summary}
                />
                <small>展示于产品列表中，建议保持简洁</small>
              </label>
            </section>
            <section
              {...invalid('gallery')}
              className="ws-entry-editor__card product-editor__image-section"
              tabIndex={-1}
            >
              <div className="ws-entry-editor__card-heading">
                <span>02</span>
                <div>
                  <h2>
                    产品图片 <em>*</em>
                    <small>{gallery.length} / 5</small>
                  </h2>
                  <p>建议 800×800，单张最大 500KB；第一张作为主图。</p>
                </div>
              </div>
              <div className="product-editor__gallery">
                {gallery.map((item, index) => (
                  <figure key={item.id}>
                    <div className="product-editor__gallery-image">
                      <Image
                        alt={item.alt || title || '产品图片'}
                        fill
                        sizes="150px"
                        src={item.thumbnailURL || item.url || ''}
                        unoptimized
                      />
                      <em>{index === 0 ? '主图' : `图片 ${index + 1}`}</em>
                    </div>
                    <figcaption>
                      <button
                        aria-label={`图片 ${index + 1} 向前移动`}
                        disabled={busy || index === 0}
                        onClick={() => moveImage(index, -1)}
                        type="button"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        aria-label={`图片 ${index + 1} 向后移动`}
                        disabled={busy || index === gallery.length - 1}
                        onClick={() => moveImage(index, 1)}
                        type="button"
                      >
                        <ChevronRight size={14} />
                      </button>
                      <button
                        aria-label={`移除图片 ${index + 1}`}
                        disabled={busy}
                        onClick={() =>
                          updateGallery(gallery.filter((image) => image.id !== item.id))
                        }
                        type="button"
                      >
                        <X size={14} />
                      </button>
                    </figcaption>
                  </figure>
                ))}
                {gallery.length < 5 && (
                  <label
                    aria-disabled={busy}
                    className={`product-editor__upload-card${busy ? ' is-disabled' : ''}`}
                  >
                    {uploading ? (
                      <Loader2 className="ws-entry-editor__spinner" size={24} />
                    ) : (
                      <ImageUp size={26} />
                    )}
                    <strong>{uploading ? `上传中 ${uploadProgress}` : '上传产品图片'}</strong>
                    <small>JPG / PNG / WebP</small>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      aria-label="上传产品图片"
                      disabled={busy}
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.currentTarget.files || [])
                        event.currentTarget.value = ''
                        void uploadFiles(files)
                      }}
                      type="file"
                    />
                  </label>
                )}
              </div>
              <div className="product-editor__gallery-footer">
                <WorkspaceMediaBrowser
                  companySlug={companySlug}
                  disabled={busy || gallery.length >= 5}
                  onSelect={(item) => {
                    if (
                      galleryRef.current.length < 5 &&
                      !galleryRef.current.some((image) => image.id === item.id)
                    )
                      updateGallery([...galleryRef.current, item])
                  }}
                  selectedIDs={gallery.map((item) => item.id)}
                />
                <small>上传与移除图片后，点击保存产品才会应用。</small>
              </div>
              {fieldError('gallery')}
            </section>
            <section className="ws-entry-editor__card product-editor__detail-section">
              <div className="ws-entry-editor__card-heading">
                <span>03</span>
                <div>
                  <h2>
                    产品详情 <em>*</em>
                  </h2>
                  <p>支持文字排版、列表、表格和产品图片。</p>
                </div>
              </div>
              <div aria-label="产品详情排版工具" className="product-editor__toolbar" role="toolbar">
                <button
                  aria-label="加粗"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format('bold')}
                  type="button"
                >
                  <Bold size={16} />
                </button>
                <button
                  aria-label="斜体"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format('italic')}
                  type="button"
                >
                  <Italic size={16} />
                </button>
                <button
                  aria-label="下划线"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format('underline')}
                  type="button"
                >
                  <Underline size={16} />
                </button>
                <select
                  aria-label="段落样式"
                  defaultValue="p"
                  onChange={(event) => format('formatBlock', event.target.value)}
                >
                  <option value="p">正文</option>
                  <option value="h2">标题</option>
                  <option value="h3">小标题</option>
                </select>
                <select
                  aria-label="字号"
                  defaultValue="3"
                  onChange={(event) => format('fontSize', event.target.value)}
                >
                  <option value="1">14px</option>
                  <option value="3">16px</option>
                  <option value="5">20px</option>
                </select>
                <select
                  aria-label="文字颜色"
                  defaultValue="#18233b"
                  onChange={(event) => format('foreColor', event.target.value)}
                >
                  <option value="#18233b">深色</option>
                  <option value="#315be8">蓝色</option>
                  <option value="#c63850">红色</option>
                </select>
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format('justifyLeft')}
                  type="button"
                >
                  左对齐
                </button>
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format('justifyCenter')}
                  type="button"
                >
                  居中
                </button>
                <button
                  aria-label="无序列表"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format('insertUnorderedList')}
                  type="button"
                >
                  <List size={16} />
                </button>
                <button
                  aria-label="有序列表"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => format('insertOrderedList')}
                  type="button"
                >
                  <ListOrdered size={16} />
                </button>
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    format(
                      'insertHTML',
                      '<table><tbody><tr><th>参数</th><th>数值</th></tr><tr><td>请输入</td><td>请输入</td></tr></tbody></table>',
                    )
                  }
                  type="button"
                >
                  <Table2 size={15} />
                  表格
                </button>
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={insertGalleryImage}
                  type="button"
                >
                  <ImageUp size={15} />
                  插入主图
                </button>
              </div>
              <div
                {...invalid('detail')}
                aria-label="产品详情"
                aria-multiline="true"
                aria-required="true"
                className="product-editor__rich"
                contentEditable={!saving}
                onInput={syncDetail}
                onPaste={pasteRichContent}
                ref={editorRef}
                role="textbox"
                suppressContentEditableWarning
                tabIndex={0}
              />
              <div className="product-editor__rich-footer">
                <small>从文档粘贴时会清理不支持的样式</small>
                <small>{plainText(detailHTML).length} 字</small>
              </div>
              {fieldError('detail')}
            </section>
          </div>
          <aside className="ws-entry-editor__aside">
            <section className="ws-entry-editor__card">
              <h2>分类与展示</h2>
              <label className="ws-entry-editor__field">
                <b>
                  产品分类 <em>*</em>
                </b>
                <select
                  {...invalid('category')}
                  aria-label="产品分类"
                  onChange={(event) => setCategory(event.target.value)}
                  required
                  value={category}
                >
                  <option value="">请选择产品分类</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {fieldError('category')}
                {!categories.length && <small>暂无分类，请先到分类管理添加。</small>}
              </label>
              <div className="ws-entry-editor__field">
                <b>
                  产品标签 <em>*</em>
                </b>
                <div className="product-editor__tags">
                  {tags.map((tag) => (
                    <button
                      aria-label={`移除标签 ${tag}`}
                      key={tag}
                      onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                      type="button"
                    >
                      {tag}
                      <X size={12} />
                    </button>
                  ))}
                </div>
                <div className="product-editor__tag-input">
                  <input
                    {...invalid('tags')}
                    aria-label="新增产品标签"
                    maxLength={40}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        addTag()
                      }
                    }}
                    placeholder="输入标签后回车"
                    value={tagInput}
                  />
                  <button disabled={busy || !tagInput.trim()} onClick={addTag} type="button">
                    添加
                  </button>
                </div>
                <small>至少 1 个，最多 12 个</small>
                {fieldError('tags')}
              </div>
              <label className="ws-entry-editor__field">
                <b>产品排序</b>
                <input
                  {...invalid('sortOrder')}
                  aria-label="产品排序"
                  min={0}
                  onChange={(event) => setSortOrder(event.target.value)}
                  step={1}
                  type="number"
                  value={sortOrder}
                />
                <small>数字越小，列表位置越靠前</small>
                {fieldError('sortOrder')}
              </label>
              <label className="ws-entry-editor__field">
                <b>
                  关键词 <small>选填</small>
                </b>
                <input
                  aria-label="关键词"
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="多个关键词用逗号隔开"
                  value={keywords}
                />
              </label>
            </section>
            <section className="ws-entry-editor__card ws-entry-editor__checklist">
              <h2>保存前检查</h2>
              <p>检查产品资料是否完整。</p>
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
          <span>{dirty ? '修改尚未保存' : '产品内容已就绪'}</span>
          <button className="ws-entry-editor__primary" disabled={busy} type="submit">
            <Save size={16} />
            {saving ? '保存中…' : uploading ? '图片上传中…' : '保存'}
          </button>
        </footer>
      </form>
    </section>
  )
}
