'use client'

import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState } from 'react'

import './featured-product-toggle.scss'

export function FeaturedToggle({
  endpoint,
  initial,
  label,
}: {
  endpoint: string
  initial: boolean
  label: string
}) {
  const router = useRouter()
  const messageID = useId()
  const [featured, setFeatured] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => setFeatured(initial), [initial])

  const toggle = async () => {
    if (saving) return
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(endpoint, {
        body: JSON.stringify({ featured: !featured }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
        signal: AbortSignal.timeout(15_000),
      })
      const result = (await response.json().catch(() => null)) as {
        featured?: boolean
        message?: string
      } | null
      if (!response.ok) {
        setMessage(result?.message || '推荐设置失败，请刷新确认后重试。')
        return
      }
      if (typeof result?.featured !== 'boolean') {
        setMessage('服务返回异常，请刷新确认推荐状态。')
        return
      }
      setFeatured(result.featured)
      router.refresh()
    } catch {
      setMessage('连接中断或请求超时，请刷新确认推荐状态后重试。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="workspace-featured-control">
      <button
        aria-busy={saving}
        aria-checked={featured}
        aria-describedby={message ? messageID : undefined}
        aria-label={`${label} 首页推荐`}
        className={`featured-product-toggle${featured ? ' featured-product-toggle--active' : ''}`}
        disabled={saving}
        onClick={() => void toggle()}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="featured-product-toggle__track">
          {saving ? <LoaderCircle size={12} /> : <i />}
        </span>
        <span>{saving ? '保存中…' : featured ? '已推荐' : '未推荐'}</span>
      </button>
      {message && (
        <span className="workspace-featured-control__error" id={messageID} role="alert">
          {message}
          <button onClick={() => router.refresh()} type="button">
            <RefreshCw aria-hidden="true" size={12} />
            刷新确认
          </button>
        </span>
      )}
    </span>
  )
}
