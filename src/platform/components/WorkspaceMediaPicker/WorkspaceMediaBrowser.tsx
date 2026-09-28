'use client'

import Image from 'next/image'
import { Check, ChevronLeft, ChevronRight, ImageIcon, Loader2, Search, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { readWorkspaceResponse, workspaceErrorMessage } from '../WorkspaceEditor/workspaceResponse'
import './workspace-media-browser.scss'

export type WorkspaceMediaImage = {
  alt?: string | null
  filename?: string | null
  filesize?: number | null
  id: number
  mimeType?: string | null
  thumbnailURL?: string | null
  url?: string | null
}
type Result = { docs?: WorkspaceMediaImage[]; message?: string; page?: number; totalPages?: number }
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const isWorkspaceImage = (item: WorkspaceMediaImage) =>
  (item.mimeType
    ? allowedTypes.has(item.mimeType)
    : /\.(jpe?g|png|webp)$/i.test(item.filename || '')) &&
  (!item.filesize || item.filesize <= 500 * 1024)

export function WorkspaceMediaBrowser({
  companySlug,
  disabled,
  label = '从媒体库选择',
  onSelect,
  selectedIDs = [],
}: {
  companySlug: string
  disabled?: boolean
  label?: string
  onSelect: (item: WorkspaceMediaImage) => void
  selectedIDs?: number[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [images, setImages] = useState<WorkspaceMediaImage[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  const titleID = useId()
  const load = useCallback(
    async (text: string, nextPage = 1) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setLoading(true)
      setError('')
      try {
        const response = await fetch(
          `/api/workspace/${companySlug}/media?query=${encodeURIComponent(text)}` +
            `&page=${nextPage}`,
          { signal: controller.signal },
        )
        const result = await readWorkspaceResponse<Result>(response)
        if (!response.ok) throw new Error(result.message || '媒体库读取失败，请重试。')
        if (controller.signal.aborted) return
        setImages((result.docs || []).filter(isWorkspaceImage))
        setPage(result.page || nextPage)
        setTotalPages(result.totalPages || 1)
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(workspaceErrorMessage(failure, '媒体库读取失败，请检查网络后重试。'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [companySlug],
  )
  useEffect(() => {
    if (open) {
      dialog.current?.showModal()
      search.current?.focus()
      void load('', 1)
    } else {
      request.current?.abort()
      dialog.current?.close()
    }
    return () => {
      request.current?.abort()
    }
  }, [load, open])
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <>
      <button
        className="workspace-media-browser__trigger"
        disabled={disabled}
        onClick={() => {
          setQuery('')
          setOpen(true)
        }}
        ref={trigger}
        type="button"
      >
        <ImageIcon size={15} />
        {label}
      </button>
      <dialog
        aria-labelledby={titleID}
        className="workspace-media-browser"
        onCancel={close}
        onClose={close}
        ref={dialog}
      >
        <header>
          <div>
            <h2 id={titleID}>选择公司图片</h2>
            <p>复用当前公司的图片，支持 JPG、PNG、WebP，单张不超过 500KB。</p>
          </div>
          <button
            aria-label="关闭媒体库"
            className="workspace-media-browser__close"
            onClick={close}
            type="button"
          >
            <X size={19} />
          </button>
        </header>
        <div className="workspace-media-browser__search">
          <Search size={17} />
          <input
            aria-label="搜索公司图片"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void load(query)
              }
            }}
            placeholder="搜索图片名称或说明"
            ref={search}
            value={query}
          />
          <button onClick={() => void load(query)} type="button">
            搜索
          </button>
        </div>
        {error && (
          <div className="workspace-media-browser__error" role="alert">
            <span>{error}</span>
            <button onClick={() => void load(query, page)} type="button">
              重试
            </button>
          </div>
        )}
        <div aria-busy={loading} className="workspace-media-browser__body">
          {loading ? (
            <div className="workspace-media-browser__empty" role="status">
              <Loader2 size={25} className="workspace-media-browser__spinner" />
              正在加载公司图片…
            </div>
          ) : images.length ? (
            <div className="workspace-media-browser__grid">
              {images.map((item) => (
                <button
                  className={selectedIDs.includes(item.id) ? 'is-selected' : ''}
                  disabled={selectedIDs.includes(item.id)}
                  key={item.id}
                  onClick={() => {
                    onSelect(item)
                    close()
                  }}
                  type="button"
                >
                  <span className="workspace-media-browser__image">
                    <Image
                      alt={item.alt || item.filename || '公司图片'}
                      fill
                      sizes="(max-width: 600px) 40vw, 170px"
                      src={item.thumbnailURL || item.url || ''}
                      unoptimized
                    />
                    {selectedIDs.includes(item.id) && (
                      <em>
                        <Check size={13} />
                        已选择
                      </em>
                    )}
                  </span>
                  <strong title={item.alt || item.filename || '未命名图片'}>
                    {item.alt || item.filename || '未命名图片'}
                  </strong>
                  <small>{item.filename || '图片文件'}</small>
                </button>
              ))}
            </div>
          ) : (
            !error && (
              <div className="workspace-media-browser__empty">
                <ImageIcon size={28} />
                <b>{query ? '没有符合条件的图片' : '本页暂无可选图片'}</b>
                <span>
                  {query
                    ? '试试其他名称，或关闭窗口上传新图片。'
                    : '可上传图片，或翻页查看其他图片。'}
                </span>
              </div>
            )
          )}
        </div>
        <footer>
          <span>仅显示当前公司符合要求的图片</span>
          <div>
            <button
              aria-label="媒体上一页"
              disabled={loading || page <= 1}
              onClick={() => void load(query, page - 1)}
              type="button"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {page} / {Math.max(1, totalPages)}
            </span>
            <button
              aria-label="媒体下一页"
              disabled={loading || page >= totalPages}
              onClick={() => void load(query, page + 1)}
              type="button"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </dialog>
    </>
  )
}
