'use client'

import Image from 'next/image'
import { ImageUp, Loader2, Trash2 } from 'lucide-react'
import { ChangeEvent, useEffect, useRef, useState } from 'react'

import { WorkspaceMediaBrowser } from '../WorkspaceMediaPicker/WorkspaceMediaBrowser'
import { readWorkspaceResponse, workspaceErrorMessage } from '../WorkspaceEditor/workspaceResponse'
import './content-cover-uploader.scss'

export type ContentCover = { id: number; thumbnailURL?: string | null; url?: string | null }

type Props = {
  companySlug: string
  disabled?: boolean
  label: string
  onBusyChange?: (busy: boolean) => void
  onChange: (cover?: ContentCover) => void
  value?: ContentCover
}

export function ContentCoverUploader({
  companySlug,
  disabled = false,
  label,
  onBusyChange,
  onChange,
  value,
}: Props) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const busy = useRef(false)
  const request = useRef<AbortController | null>(null)
  const busyListener = useRef(onBusyChange)
  useEffect(() => {
    busyListener.current = onBusyChange
  }, [onBusyChange])
  useEffect(
    () => () => {
      request.current?.abort()
      busyListener.current?.(false)
    },
    [companySlug],
  )
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy.current || disabled) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(true)
      setMessage('仅支持 JPG、PNG 或 WebP 图片。')
      return
    }
    if (file.size === 0 || file.size > 500 * 1024) {
      setError(true)
      setMessage('图片文件须大于 0 且不能超过 500KB。')
      return
    }
    busy.current = true
    setUploading(true)
    onBusyChange?.(true)
    setMessage('')
    const controller = new AbortController()
    request.current = controller
    try {
      const body = new FormData()
      body.set('file', file)
      body.set('alt', label)
      body.set('productImage', 'true')
      const response = await fetch(`/api/workspace/${companySlug}/media`, {
        body,
        method: 'POST',
        signal: controller.signal,
      })
      const result = await readWorkspaceResponse<{ media?: ContentCover; message?: string }>(
        response,
      )
      if (!response.ok || !result.media?.id) throw new Error(result.message || '图片上传失败。')
      if (controller.signal.aborted) return
      onChange(result.media)
      setError(false)
      setMessage('图片已上传。保存内容后，将应用为封面。')
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(true)
        setMessage(workspaceErrorMessage(failure, '图片上传失败，请检查网络后重试。'))
      }
    } finally {
      busy.current = false
      if (!controller.signal.aborted) {
        setUploading(false)
        onBusyChange?.(false)
      }
    }
  }
  const source = value?.thumbnailURL || value?.url
  return (
    <section className={`content-cover-uploader${uploading ? ' is-uploading' : ''}`}>
      <div className="content-cover-uploader__heading">
        <b>{label}</b>
        <small>建议 800×800 · JPG / PNG / WebP · 最大 500KB</small>
      </div>
      {source ? (
        <div className="content-cover-uploader__preview">
          <div className="content-cover-uploader__image">
            <Image
              alt={label}
              fill
              sizes="(max-width: 720px) 70vw, 260px"
              src={source}
              unoptimized
            />
          </div>
          <div className="content-cover-uploader__actions">
            <label className={uploading || disabled ? 'is-disabled' : ''}>
              {uploading ? <Loader2 size={15} /> : <ImageUp size={15} />}更换图片
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-label={`更换${label}`}
                disabled={uploading || disabled}
                onChange={upload}
                type="file"
              />
            </label>
            <button
              aria-label={`移除${label}`}
              disabled={uploading || disabled}
              onClick={() => {
                onChange(undefined)
                setMessage('封面已移除，保存内容后生效。')
                setError(false)
              }}
              type="button"
            >
              <Trash2 size={15} />
              移除
            </button>
          </div>
        </div>
      ) : (
        <label className={`content-cover-uploader__empty${disabled ? ' is-disabled' : ''}`}>
          {uploading ? (
            <Loader2 size={25} className="content-cover-uploader__spinner" />
          ) : (
            <ImageUp size={26} strokeWidth={1.6} />
          )}
          <strong>{uploading ? '图片上传中…' : '点击上传封面'}</strong>
          <small>上传后点击保存，将封面应用到内容</small>
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label={`上传${label}`}
            disabled={uploading || disabled}
            onChange={upload}
            type="file"
          />
        </label>
      )}
      <WorkspaceMediaBrowser
        companySlug={companySlug}
        disabled={uploading || disabled}
        onSelect={(item) => {
          onChange(item)
          setMessage('已选择公司图片，保存内容后生效。')
          setError(false)
        }}
        selectedIDs={value ? [value.id] : []}
      />
      {message && (
        <p
          className={
            error ? 'content-cover-uploader__message is-error' : 'content-cover-uploader__message'
          }
          role={error ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
    </section>
  )
}
