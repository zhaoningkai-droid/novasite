'use client'

import Image from 'next/image'
import { Check, ChevronLeft, ChevronRight, ImageUp, Loader2, Search } from 'lucide-react'
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'

import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { readWorkspaceResponse, workspaceErrorMessage } from '../WorkspaceEditor/workspaceResponse'
import { isWorkspaceImage, WorkspaceMediaImage } from './WorkspaceMediaBrowser'
import './workspace-media-picker.scss'

type Props = { companySlug: string; initialMedia: WorkspaceMediaImage[]; productID: number }
type Result = { docs?: WorkspaceMediaImage[]; message?: string; page?: number; totalPages?: number }

export function WorkspaceMediaPicker({ companySlug, initialMedia, productID }: Props) {
  const [items, setItems] = useState(initialMedia)
  const [gallery, setGallery] = useState(initialMedia.map((item) => item.id))
  const [query, setQuery] = useState('')
  const [alt, setAlt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const request = useRef<AbortController | null>(null)
  const mutation = useRef(false)
  useWorkspaceUnsaved(Boolean(file || alt.trim()), mutating)
  const notice = (text: string, failed = false) => {
    setFeedback(text)
    setError(failed)
  }
  const load = useCallback(
    async (text = '', nextPage = 1) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setLoading(true)
      try {
        const response = await fetch(
          `/api/workspace/${companySlug}/media?query=${encodeURIComponent(text)}&page=${nextPage}`,
          { signal: controller.signal },
        )
        const result = await readWorkspaceResponse<Result>(response)
        if (!response.ok) throw new Error(result.message || '媒体库读取失败。')
        if (controller.signal.aborted) return
        setItems((result.docs || []).filter(isWorkspaceImage))
        setPage(result.page || nextPage)
        setPages(result.totalPages || 1)
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(true)
          setFeedback(workspaceErrorMessage(failure, '媒体库读取失败，请检查网络后重试。'))
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    },
    [companySlug],
  )
  useEffect(() => {
    void load()
    return () => request.current?.abort()
  }, [load])
  const bind = async (mediaID: number, mode: 'add' | 'remove' | 'replace') => {
    if (mutation.current) return
    if (mode === 'add' && gallery.length >= 5)
      return notice('产品图片最多 5 张，请先移除一张。', true)
    if (mode === 'remove' && gallery.length <= 1)
      return notice('产品至少保留一张图片，请先添加其他图片再移除。', true)
    if (
      mode === 'replace' &&
      gallery.length > 1 &&
      !window.confirm(`将用这张图片替换当前产品的 ${gallery.length} 张图片，确定继续吗？`)
    )
      return
    mutation.current = true
    setMutating(true)
    setFeedback('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/products/${productID}/media`, {
        body: JSON.stringify({ mediaID, mode }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      const result = await readWorkspaceResponse<{ gallery?: number[]; message?: string }>(response)
      if (!response.ok) throw new Error(result.message || '图片绑定失败。')
      setGallery(result.gallery || [])
      notice(result.message || '图片已保存。')
    } catch (failure) {
      notice(workspaceErrorMessage(failure, '图片绑定失败，请检查网络后重试。'), true)
    } finally {
      mutation.current = false
      setMutating(false)
    }
  }
  const upload = async () => {
    if (mutation.current) return
    if (!file) return notice('请选择要上传的图片。', true)
    if (!alt.trim()) return notice('请填写图片说明，方便以后查找。', true)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      return notice('仅支持 JPG、PNG 或 WebP 图片。', true)
    if (!file.size || file.size > 500 * 1024) return notice('图片须大于 0 且不超过 500KB。', true)
    const form = new FormData()
    form.set('file', file)
    form.set('alt', alt.trim())
    form.set('productImage', 'true')
    mutation.current = true
    setMutating(true)
    setFeedback('')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/media`, {
        body: form,
        method: 'POST',
      })
      const result = await readWorkspaceResponse<{ media?: WorkspaceMediaImage; message?: string }>(
        response,
      )
      if (!response.ok || !result.media) throw new Error(result.message || '图片上传失败。')
      setFile(null)
      setAlt('')
      setQuery('')
      await load('', 1)
      notice('图片已上传到公司媒体库，选择“绑定到产品”后应用。')
    } catch (failure) {
      notice(workspaceErrorMessage(failure, '图片上传失败，请检查网络后重试。'), true)
    } finally {
      mutation.current = false
      setMutating(false)
    }
  }
  return (
    <section className="workspace-media-picker" aria-label="产品图片媒体库">
      <header>
        <div>
          <h2>产品图片</h2>
          <p>当前绑定 {gallery.length} / 5 张。绑定、替换与移除会立即保存。</p>
        </div>
        <span>当前公司媒体</span>
      </header>
      <div className="workspace-media-picker__toolbar">
        <Search size={16} />
        <input
          aria-label="搜索媒体"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void load(query)
            }
          }}
          placeholder="搜索图片名称或说明"
          value={query}
        />
        <button disabled={mutating} onClick={() => void load(query)} type="button">
          搜索
        </button>
      </div>
      <div className="workspace-media-picker__upload">
        <label>
          图片说明
          <input
            aria-label="图片说明"
            disabled={mutating}
            onChange={(event) => setAlt(event.target.value)}
            placeholder="为图片填写容易查找的说明"
            value={alt}
          />
        </label>
        <label className="workspace-media-picker__file">
          <ImageUp size={17} />
          {file ? file.name : '选择图片'}
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="上传图片"
            disabled={mutating}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setFile(event.currentTarget.files?.[0] || null)
              event.currentTarget.value = ''
            }}
            type="file"
          />
        </label>
        <button disabled={mutating || !file} onClick={() => void upload()} type="button">
          {mutating ? '处理中…' : '上传到媒体库'}
        </button>
        <small>JPG / PNG / WebP · 最大 500KB</small>
      </div>
      {feedback && (
        <p
          className={`workspace-media-picker__notice${error ? ' is-error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {feedback}
        </p>
      )}
      <div aria-busy={loading} className="workspace-media-picker__grid">
        {loading ? (
          <div className="workspace-media-picker__empty" role="status">
            <Loader2 size={24} />
            正在加载媒体…
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id}>
              <div className="workspace-media-picker__image">
                {item.thumbnailURL || item.url ? (
                  <Image
                    alt={item.alt || item.filename || '媒体图片'}
                    fill
                    sizes="200px"
                    src={item.thumbnailURL || item.url || ''}
                    unoptimized
                  />
                ) : (
                  <span>图片无法预览</span>
                )}
                {gallery.includes(item.id) && (
                  <em>
                    <Check size={12} />
                    已绑定
                  </em>
                )}
              </div>
              <strong title={item.alt || item.filename || '未命名图片'}>
                {item.alt || item.filename || '未命名图片'}
              </strong>
              <small>{item.filename || '图片文件'}</small>
              <div className="workspace-media-picker__item-actions">
                {gallery.includes(item.id) ? (
                  <button
                    disabled={mutating}
                    onClick={() => void bind(item.id, 'remove')}
                    type="button"
                  >
                    移除关联
                  </button>
                ) : (
                  <>
                    <button
                      disabled={mutating || gallery.length >= 5}
                      onClick={() => void bind(item.id, 'add')}
                      type="button"
                    >
                      绑定到产品
                    </button>
                    <button
                      disabled={mutating}
                      onClick={() => void bind(item.id, 'replace')}
                      type="button"
                    >
                      替换全部图片
                    </button>
                  </>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {!loading && items.length === 0 && (
        <p className="workspace-media-picker__empty">
          暂无符合条件的图片，可调整搜索词或上传图片。
        </p>
      )}
      <footer>
        <span>仅显示当前公司符合产品图要求的图片</span>
        <div>
          <button
            aria-label="媒体上一页"
            disabled={loading || mutating || page <= 1}
            onClick={() => void load(query, page - 1)}
            type="button"
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            {page} / {pages}
          </span>
          <button
            aria-label="媒体下一页"
            disabled={loading || mutating || page >= pages}
            onClick={() => void load(query, page + 1)}
            type="button"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </footer>
    </section>
  )
}
