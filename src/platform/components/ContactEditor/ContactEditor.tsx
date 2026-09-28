'use client'

import Image from 'next/image'
import { ImageUp, Save, Trash2, X } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { useWorkspacePermissions } from '../WorkspaceShell/WorkspacePermissions'
import './contact-editor.scss'

type QRField = 'whatsappQRCode' | 'wechatInternationalQRCode' | 'wechatQRCode'
export type ContactValues = {
  address: string; email: string; intro: string; phone: string
  showInquiryForm: boolean; title: string; whatsapp: string
  whatsappQRCode?: number | null; whatsappQRCodeURL?: string
  wechatInternationalQRCode?: number | null; wechatInternationalQRCodeURL?: string
  wechatQRCode?: number | null; wechatQRCodeURL?: string
}
const qrFields: { field: QRField; label: string }[] = [
  { field: 'whatsappQRCode', label: 'WhatsApp' },
  { field: 'wechatInternationalQRCode', label: 'WeChat' },
  { field: 'wechatQRCode', label: '微信' },
]

export function ContactEditor({ companySlug, initial }: {
  companySlug: string; initial: ContactValues
}) {
  const { canManageSite } = useWorkspacePermissions()
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<QRField | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const busy = saving || uploading !== null
  const dirty = JSON.stringify(value) !== JSON.stringify(saved)
  useWorkspaceUnsaved(dirty, busy)
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !canManageSite) return
    if (![value.address, value.email, value.phone].every((item) => item.trim())) {
      setError(true)
      setStatus('请填写地址、邮箱和电话。')
      return
    }
    setSaving(true)
    setStatus('')
    setError(false)
    try {
      const response = await fetch(`/api/workspace/${companySlug}/contact`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || '保存失败。')
      setSaved(value)
      setStatus(result.message || '联系信息已保存。')
    } catch (error) {
      setError(true)
      setStatus(error instanceof Error ? error.message : '网络连接失败，内容尚未保存。')
    } finally { setSaving(false) }
  }
  const upload = async (file: File, field: QRField, label: string) => {
    if (busy || !canManageSite) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(true)
      setStatus('二维码图片仅支持 JPG、PNG 或 WebP。')
      return
    }
    if (!file.size || file.size > 500 * 1024) {
      setError(true)
      setStatus('二维码图片须大于0且不超过500KB，请压缩后重新上传。')
      return
    }
    setUploading(field)
    setStatus('')
    setError(false)
    const form = new FormData()
    form.set('file', file)
    form.set('alt', `${label} 二维码`)
    // Use the same server-side format and size policy as product images.
    form.set('productImage', 'true')
    try {
      const response = await fetch(`/api/workspace/${companySlug}/media`, {
        method: 'POST', body: form,
      })
      const result = await response.json()
      if (!response.ok || !result.media?.id) {
        throw new Error(result.message || '图片上传失败。')
      }
      setValue((current) => ({
        ...current, [field]: result.media.id, [`${field}URL`]: result.media.url || '',
      }))
      setStatus(`${label} 二维码已上传，点击“保存”后在网站展示。`)
    } catch (error) {
      setError(true)
      setStatus(error instanceof Error ? error.message : '图片上传失败，请重试。')
    } finally { setUploading(null) }
  }
  return <section className="workspace-fixed-editor contact-editor">
    <header>
      <div><p>网站配置 / 联系我们</p><h1>联系我们</h1><span>{canManageSite ? '统一管理网站联系信息和二维码；地址、邮箱、电话必填。' : '当前账号可查看联系信息，站点管理员可以修改。'}</span></div>
      <button disabled={busy || !canManageSite} form="contact-settings" type="submit">
        <Save size={17} aria-hidden="true" />{saving ? '保存中…' : uploading ? '上传中…' : '保存联系信息'}
      </button>
    </header>
    {status && <div className={error ? 'contact-editor__feedback is-error' : 'contact-editor__feedback'} role={error ? 'alert' : 'status'}><span>{status}</span>
      <button aria-label="关闭提示" onClick={() => setStatus('')} type="button"><X size={16} /></button></div>}
    <form id="contact-settings" onSubmit={(event) => void save(event)}>
      <div className="contact-editor__panel">
        <div className="contact-editor__section-heading"><h2>联系资料</h2><small>{dirty ? '有未保存修改' : '所有信息仅归属当前公司'}</small></div>
        <fieldset className="contact-editor__fields" disabled={busy || !canManageSite}>
        <div className="contact-editor__rows">
          <div className="contact-editor__row">
            <label htmlFor="contact-address"><span aria-hidden="true">*</span> 地址</label>
            <input autoComplete="street-address" id="contact-address" required
              onChange={(event) => setValue({ ...value, address: event.target.value })}
              value={value.address} />
          </div>
          <div className="contact-editor__row">
            <label htmlFor="contact-email"><span aria-hidden="true">*</span> 邮箱</label>
            <input autoComplete="email" id="contact-email" required type="email"
              onChange={(event) => setValue({ ...value, email: event.target.value })}
              value={value.email} />
          </div>
          <div className="contact-editor__row">
            <label htmlFor="contact-phone"><span aria-hidden="true">*</span> 电话</label>
            <input autoComplete="tel" id="contact-phone" required type="tel"
              onChange={(event) => setValue({ ...value, phone: event.target.value })}
              value={value.phone} />
          </div>
          <div className="contact-editor__row">
            <label htmlFor="contact-whatsapp">WhatsApp</label>
            <input id="contact-whatsapp" type="tel" placeholder="选填"
              onChange={(event) => setValue({ ...value, whatsapp: event.target.value })}
              value={value.whatsapp} />
          </div>
          <div className="contact-editor__row contact-editor__qr-row">
            <span className="contact-editor__row-label">二维码</span>
            <div className="contact-editor__qrs">{qrFields.map(({ field, label }) => {
              const url = value[`${field}URL`]
              return <div className="contact-editor__qr" key={field}>
                <span>{label}</span>
                <label className={`contact-editor__upload ${url ? 'has-image' : ''}`}>
                  {url ? <Image alt={`${label} 二维码`} height={240} width={240}
                    unoptimized src={url} /> : <span>
                    <ImageUp size={26} aria-hidden="true" />
                    <strong>{uploading === field ? '上传中…' : '上传二维码'}</strong>
                    <small>JPG、PNG、WebP<br />推荐 800×800 · 最大500KB</small>
                  </span>}
                  <input accept="image/jpeg,image/png,image/webp" disabled={busy}
                    aria-label={`${url ? '替换' : '上传'} ${label} 二维码`} type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void upload(file, field, label)
                      event.target.value = ''
                    }} />
                  {url ? <em>点击替换图片</em> : null}
                </label>
                {value[field] ? <button className="contact-editor__remove" disabled={busy}
                  type="button" onClick={() => setValue({
                    ...value, [field]: null, [`${field}URL`]: '',
                  })}><Trash2 size={14} aria-hidden="true" />移除图片</button> : null}
              </div>
            })}</div>
          </div>
        </div>
        <details className="contact-editor__advanced">
          <summary>联系页展示设置</summary>
          <label>联系页标题<input onChange={(event) => setValue({
            ...value, title: event.target.value,
          })} value={value.title} /></label>
          <label>联系页说明<textarea onChange={(event) => setValue({
            ...value, intro: event.target.value,
          })} value={value.intro} /></label>
          <label className="contact-editor__toggle">
            <input checked={value.showInquiryForm} type="checkbox" onChange={(event) =>
              setValue({ ...value, showInquiryForm: event.target.checked })} />
            在联系页显示询盘表单
          </label>
        </details>
        </fieldset>
      </div>
    </form>
  </section>
}
