'use client'
import { useState, type FormEvent } from 'react'
import type { SiteLocale } from '@/platform/site'
import { templateCopy } from './copy'
import { inquiryRequiredFields, inquiryTextLimits } from '../inquiry/required-fields'
import { useInquirySubmission } from '../inquiry/useInquirySubmission'
export function Inquiry({
  site,
  locale,
  preview = false,
  requiredFields = {},
  product = '',
  productId,
  demo = false,
  address = false,
}: {
  site: string
  locale: SiteLocale
  preview?: boolean
  requiredFields?: Record<string, boolean>
  product?: string
  productId?: number
  demo?: boolean
  address?: boolean
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const t = templateCopy(locale)
  const submitInquiry = useInquirySubmission()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if ((preview && !demo) || state === 'sending') return
    if (demo) {
      setState('sent')
      return
    }
    const form = event.currentTarget
    setState('sending')
    try {
      if (await submitInquiry(form, site)) setState('sent')
    } catch {
      setState('error')
    }
  }
  // The existing Leads collection always requires name/email/message. Never claim optional.
  const required: Record<string, boolean> = inquiryRequiredFields(requiredFields)
  const fields = ['name', 'company', 'email', 'phone', 'country', 'product'] as const
  const addressLabels = {
    zh: '访客地址',
    en: 'Your address',
    es: 'Su dirección',
    ar: 'عنوانك',
    id: 'Alamat Anda',
    de: 'Ihre Adresse',
    ru: 'Ваш адрес',
  }
  return (
    <form className="nt-inquiry" onSubmit={submit}>
      {fields.map((field) => (
        <label key={field}>
          {t[field]}
          {required[field] ? ' *' : ''}
          <input
            name={field}
            type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
            required={Boolean(required[field])}
            maxLength={inquiryTextLimits[field]}
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
      {address ? (
        <label>
          {addressLabels[locale]}
          <input name="address" autoComplete="street-address" maxLength={inquiryTextLimits.address} />
        </label>
      ) : null}
      <label className="nt-inquiry-message">
        {t.message} *<textarea name="message" required minLength={10} maxLength={inquiryTextLimits.message} rows={5} />
      </label>
      <label hidden aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      <div className="nt-inquiry-message">
        <button
          className="nt-button"
          type="submit"
          disabled={(preview && !demo) || state === 'sending'}
        >
          {state === 'sending' ? t.sending : t.send}
        </button>
        <p role={state === 'error' ? 'alert' : 'status'}>
          {demo
            ? locale === 'zh'
              ? state === 'sent'
                ? '演示提交成功，没有发送或保存真实询盘。'
                : '演示表单，不发送真实询盘。'
              : state === 'sent'
                ? 'Demo complete. No inquiry was sent or saved.'
                : 'Demo form. No real inquiry is sent.'
            : preview
              ? t.previewForm
              : state === 'sent'
                ? t.sent
                : state === 'error'
                  ? t.error
                  : ''}
        </p>
      </div>
    </form>
  )
}
