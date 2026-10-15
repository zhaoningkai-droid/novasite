'use client'

import { FileText, Loader2, Search, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MAX_PRODUCT_DATASHEET_BYTES, PRODUCT_DATASHEET_MIME } from '@/platform/storage/file-policy'
import { readWorkspaceResponse, workspaceErrorMessage } from '../WorkspaceEditor/workspaceResponse'
import './product-datasheet.scss'

export type ProductDatasheet = {
  id: number
  filename?: string | null
  filesize?: number | null
  mimeType?: string | null
  url?: string | null
}
type LibraryResult = {
  docs?: ProductDatasheet[]
  page?: number
  totalPages?: number
  message?: string
}
type Props = {
  companySlug: string
  disabled: boolean
  value: ProductDatasheet | null
  onChange: (value: ProductDatasheet | null) => void
  onBusyChange: (busy: boolean) => void
}
const fileSize = (size?: number | null) => size
  ? size < 1024 * 1024 ? `${Math.ceil(size / 1024)}KB`
    : `${(size / (1024 * 1024)).toFixed(1)}MB`
  : ''
const fileURL = (value?: string | null) => {
  if (!value) return undefined
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? value : undefined
  } catch { return undefined }
}

export function ProductDatasheetField({
  companySlug, disabled, value, onChange, onBusyChange,
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [uploadError, setUploadError] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [documents, setDocuments] = useState<ProductDatasheet[]>([])
  const [loading, setLoading] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const uploadingRef = useRef(false)
  const uploadRequest = useRef<AbortController | null>(null)
  const libraryRequest = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const titleID = useId()
  const href = fileURL(value?.url)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      uploadRequest.current?.abort()
      libraryRequest.current?.abort()
      onBusyChange(false)
    }
  }, [onBusyChange])

  const load = useCallback(async (text: string, nextPage = 1) => {
    libraryRequest.current?.abort()
    const controller = new AbortController()
    libraryRequest.current = controller
    setLoading(true)
    setLibraryError('')
    try {
      const response = await fetch(
        `/api/workspace/${companySlug}/media?type=pdf&query=${encodeURIComponent(text)}` +
          `&page=${nextPage}`,
        { cache: 'no-store', signal: controller.signal },
      )
      const result = await readWorkspaceResponse<LibraryResult>(response)
      if (!response.ok) throw new Error(result.message || 'PDF 媒体库读取失败。')
      if (controller.signal.aborted) return
      setDocuments((result.docs || []).filter((item) => item.mimeType === PRODUCT_DATASHEET_MIME))
      setPage(result.page || nextPage)
      setPages(Math.max(1, result.totalPages || 1))
    } catch (error) {
      if (!controller.signal.aborted)
        setLibraryError(workspaceErrorMessage(error, 'PDF 媒体库读取失败，请重试。'))
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [companySlug])

  useEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!element.open) element.showModal()
    search.current?.focus()
    return () => {
      libraryRequest.current?.abort()
      if (element.open) element.close()
      document.body.style.overflow = previousOverflow
      trigger.current?.focus()
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => void load(query), 250)
    return () => { clearTimeout(timer); libraryRequest.current?.abort() }
  }, [load, open, query])

  const upload = async (file: File) => {
    if (disabled || uploadingRef.current) return
    setUploadError(false)
    setFeedback('')
    if (!/\.pdf$/i.test(file.name) ||
        !['', PRODUCT_DATASHEET_MIME, 'application/octet-stream'].includes(file.type)) {
      setUploadError(true)
      setFeedback('请选择 PDF 格式的产品资料。')
      return
    }
    if (!file.size || file.size > MAX_PRODUCT_DATASHEET_BYTES) {
      setUploadError(true)
      setFeedback('PDF 文件须大于 0 且不超过 10MB。')
      return
    }
    uploadingRef.current = true
    setUploading(true)
    onBusyChange(true)
    const controller = new AbortController()
    uploadRequest.current = controller
    const timeout = setTimeout(() => controller.abort(), 90_000)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('alt', file.name)
      form.set('productDatasheet', 'true')
      const response = await fetch(`/api/workspace/${companySlug}/media`, {
        body: form, method: 'POST', signal: controller.signal,
      })
      const result = await readWorkspaceResponse<{ media?: ProductDatasheet; message?: string }>(
        response,
      )
      if (!response.ok || !result.media?.id || result.media.mimeType !== PRODUCT_DATASHEET_MIME)
        throw new Error(result.message || 'PDF 上传失败。')
      if (!mounted.current || controller.signal.aborted) return
      onChange(result.media)
      setFeedback('PDF 已加入当前公司媒体库，保存产品后应用。')
    } catch (error) {
      if (!mounted.current) return
      setUploadError(true)
      setFeedback(controller.signal.aborted
        ? '上传响应超时。可以先从媒体库查找该文件，再决定是否重新上传。'
        : workspaceErrorMessage(error, 'PDF 上传失败，请重试。'))
    } finally {
      clearTimeout(timeout)
      uploadingRef.current = false
      if (mounted.current) {
        setUploading(false)
        onBusyChange(false)
      }
    }
  }
  const close = () => setOpen(false)

  return <div className="product-datasheet">
    {value ? <div className="product-datasheet__selected">
      <FileText aria-hidden="true" size={24} />
      <div>
        <strong>{value.filename || `已关联资料 #${value.id}`}</strong>
        <small>{fileSize(value.filesize) || '当前产品已关联的文件'}</small>
      </div>
      {href && <a href={href} rel="noopener noreferrer" target="_blank">查看文件</a>}
      <button disabled={disabled || uploading} onClick={() => {
        onChange(null)
        setUploadError(false)
        setFeedback('已移除产品关联，保存后生效；媒体库原文件仍保留。')
      }} type="button">移除关联</button>
    </div> : <p className="product-datasheet__empty">未关联产品资料，客户站不会显示下载按钮。</p>}
    <div className="product-datasheet__actions">
      <button disabled={disabled || uploading} onClick={() => input.current?.click()} type="button">
        {uploading ? <Loader2 aria-hidden="true" size={16} />
          : <Upload aria-hidden="true" size={16} />}
        {uploading ? 'PDF 上传中…' : value ? '上传替换 PDF' : '上传 PDF'}
      </button>
      <input accept=".pdf,application/pdf" aria-label="上传产品资料 PDF" hidden ref={input}
        disabled={disabled || uploading} onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void upload(file)
        }} type="file" />
      <button disabled={disabled || uploading} onClick={() => {
        setDocuments([])
        setLoading(true)
        setLibraryError('')
        setQuery('')
        setPage(1)
        setPages(1)
        setOpen(true)
      }} ref={trigger} type="button">从公司媒体库选择 PDF</button>
    </div>
    <small className="product-datasheet__hint">仅支持 PDF，上传上限 10MB。替换和移除关联不会删除文件。</small>
    {feedback && <p className={uploadError ? 'product-datasheet__error' : ''}
      role={uploadError ? 'alert' : 'status'}>{feedback}</p>}
    <dialog aria-labelledby={titleID} className="product-datasheet__library"
      onCancel={close} onClose={close} ref={dialog}>
      <header><div><h2 id={titleID}>选择公司产品资料</h2>
        <p>这里只显示当前公司的 PDF 文件。</p></div>
        <button aria-label="关闭 PDF 媒体库" onClick={close} type="button">
          <X aria-hidden="true" size={20} />
        </button></header>
      <label className="product-datasheet__search"><Search aria-hidden="true" size={17} />
        <input aria-label="搜索公司 PDF 文件" onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); void load(query) }
          }} placeholder="搜索文件名称或说明" ref={search} value={query} /></label>
      {libraryError && <div className="product-datasheet__error" role="alert">
        <p>{libraryError}</p><button onClick={() => void load(query, page)} type="button">重试</button>
      </div>}
      <div aria-busy={loading} className="product-datasheet__files">
        {loading ? <p role="status">正在加载 PDF 文件…</p> : libraryError ? null
          : documents.length ? documents.map((item) => <button disabled={disabled || value?.id === item.id}
            key={item.id} onClick={() => {
              onChange(item)
              setFeedback('已选择当前公司 PDF，保存产品后应用。')
              setUploadError(false)
              close()
            }} type="button"><FileText aria-hidden="true" size={23} />
            <span><strong>{item.filename || `资料 #${item.id}`}</strong>
              <small>{fileSize(item.filesize) || 'PDF 文件'}</small></span>
            <small>{value?.id === item.id ? '已选择' : '选择'}</small></button>)
          : <p>{query ? '没有符合搜索条件的 PDF 文件。' : '当前公司暂无 PDF，请先上传产品资料。'}</p>}
      </div>
      <nav aria-label="PDF 文件分页" className="product-datasheet__pagination">
        <button disabled={loading || page <= 1} onClick={() => void load(query, page - 1)}
          type="button">上一页</button><span>{page} / {pages}</span>
        <button disabled={loading || page >= pages} onClick={() => void load(query, page + 1)}
          type="button">下一页</button>
      </nav>
    </dialog>
  </div>
}
