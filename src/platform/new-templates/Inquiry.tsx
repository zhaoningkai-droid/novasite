'use client'
import { useState, type FormEvent } from 'react'
import type { SiteLocale } from '@/platform/site'
import { templateCopy } from './copy'
export function Inquiry({
  site,
  locale,
  preview = false,
  requiredFields = {},
  product = '',
  productId,
}: {
  site: string
  locale: SiteLocale
  preview?: boolean
  requiredFields?: Record<string, boolean>
  product?: string
  productId?: number
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const t = templateCopy(locale)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (preview || state === 'sending') return
    const form = event.currentTarget
    setState('sending')
    try {
      const response = await fetch('/api/submit-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(form)),
          site,
          sourcePage: window.location.href,
        }),
      })
      if (!response.ok) throw new Error('Inquiry failed')
      form.reset()
      setState('sent')
    } catch {
      setState('error')
    }
  }
  // The existing Leads collection always requires name/email/message. Never claim optional.
  const required: Record<string, boolean> = {
    phone: true,
    ...requiredFields,
    name: true,
    email: true,
    message: true,
  }
  const fields = ['name', 'company', 'email', 'phone', 'country', 'product'] as const
  return (
    <form className="nt-inquiry" onSubmit={submit}>
      {fields.map((field) => (
        <label key={field}>
          {t[field]}
          {required[field] ? ' *' : ''}
          <input
            name={field}
            type={field === 'email' ? 'email' : 'text'}
            required={Boolean(required[field])}
            defaultValue={field === 'product' ? product : undefined}
            autoComplete={
              {
                name: 'name',
                company: 'organization',
                email: 'email',
                phone: 'tel',
                country: 'country-name',
                product: 'off',
              }[field]
            }
          />
        </label>
      ))}
      <label className="nt-inquiry-message">
        {t.message} *<textarea name="message" required minLength={10} rows={5} />
      </label>
      <label hidden aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      <div className="nt-inquiry-message">
        <button className="nt-button" type="submit" disabled={preview || state === 'sending'}>
          {state === 'sending' ? t.sending : t.send}
        </button>
        <p role={state === 'error' ? 'alert' : 'status'}>
          {preview ? t.previewForm : state === 'sent' ? t.sent : state === 'error' ? t.error : ''}
        </p>
      </div>
    </form>
  )
}
