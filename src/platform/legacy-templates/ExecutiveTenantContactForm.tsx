'use client'

import { useState, type FormEvent } from 'react'

import type { SiteLocale } from '@/platform/site-locales'
import { templateCopy } from '@/platform/new-templates/copy'
import { inquiryRequiredFields } from '@/platform/inquiry/required-fields'
import { useInquirySubmission } from '@/platform/inquiry/useInquirySubmission'

const addressLabels: Record<SiteLocale, string> = {
  zh: '地址',
  en: 'Address',
  es: 'Dirección',
  ar: 'العنوان',
  id: 'Alamat',
  de: 'Adresse',
  ru: 'Адрес',
}

export function ExecutiveTenantContactForm({
  locale,
  site,
  requiredFields = {},
}: {
  locale: SiteLocale
  site: string
  requiredFields?: Record<string, boolean>
}) {
  const t = templateCopy(locale)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const required = inquiryRequiredFields(requiredFields)
  const submitInquiry = useInquirySubmission()
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === 'sending') return
    const form = event.currentTarget
    setStatus('sending')
    try {
      if (await submitInquiry(form, site)) setStatus('sent')
    } catch {
      setStatus('error')
    }
  }
  const mark = (name: keyof typeof required) => (required[name] ? ' *' : '')

  return (
    <>
      {status === 'sent' ? (
        <p aria-live="polite" className="ed-contact-success" role="status">
          {t.sent}
        </p>
      ) : null}
      <form className="ed-contact-form" onSubmit={submit}>
        {required.company ? <label><span>{t.company} *</span><input autoComplete="organization" maxLength={180} name="company" required /></label> : null}
        <label>
          <span>
            {t.name}
            {mark('name')}
          </span>
          <input autoComplete="name" maxLength={120} name="name" required={required.name} />
        </label>
        <label>
          <span>
            {t.phone}
            {mark('phone')}
          </span>
          <input autoComplete="tel" maxLength={80} name="phone" required={required.phone} />
        </label>
        <label>
          <span>{addressLabels[locale]}</span>
          <input autoComplete="street-address" maxLength={300} name="address" />
        </label>
        <label>
          <span>
            {t.email}
            {mark('email')}
          </span>
          <input
            autoComplete="email"
            maxLength={200}
            name="email"
            required={required.email}
            type="email"
          />
        </label>
        <label className="ed-contact-form__message">
          <span>
            {t.message}
            {mark('message')}
          </span>
          <textarea
            maxLength={4000}
            minLength={required.message ? 10 : undefined}
            name="message"
            required={required.message}
            rows={4}
          />
        </label>
        <label aria-hidden="true" className="ed-contact-honeypot">
          <span>Website</span>
          <input autoComplete="off" name="website" tabIndex={-1} />
        </label>
        {status === 'error' ? (
          <p className="ed-contact-error" role="alert">
            {t.error}
          </p>
        ) : null}
        <button className="ed-button ed-button--blue" disabled={status === 'sending'} type="submit">
          {status === 'sending' ? t.sending : t.send}
        </button>
      </form>
    </>
  )
}
