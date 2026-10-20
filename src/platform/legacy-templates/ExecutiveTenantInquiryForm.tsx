'use client'

import { ArrowRight } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { inquiryRequiredFields, inquiryTextLimits } from '@/platform/inquiry/required-fields'
import { useInquirySubmission } from '@/platform/inquiry/useInquirySubmission'
import { templateCopy } from '@/platform/new-templates/copy'
import type { SiteLocale } from '@/platform/site-locales'

const fieldCopy: Record<SiteLocale, { name: string; message: string; optional: string }> = {
  zh: { name: '称呼', message: '项目需求', optional: '（选填）' },
  en: { name: 'Name', message: 'Project requirements', optional: ' (optional)' },
  es: { name: 'Nombre', message: 'Requisitos del proyecto', optional: ' (opcional)' },
  ar: { name: 'الاسم', message: 'متطلبات المشروع', optional: ' (اختياري)' },
  id: { name: 'Nama', message: 'Kebutuhan proyek', optional: ' (opsional)' },
  de: { name: 'Name', message: 'Projektanforderungen', optional: ' (optional)' },
  ru: { name: 'Имя', message: 'Требования к проекту', optional: ' (необязательно)' },
}

/** The live homepage uses the demo's form layout, with the real tenant submission endpoint. */
export function ExecutiveTenantInquiryForm({
  locale,
  site,
  requiredFields = {},
}: {
  locale: SiteLocale
  site: string
  requiredFields?: Record<string, boolean>
}) {
  const labels = templateCopy(locale)
  const fields = fieldCopy[locale]
  const required = inquiryRequiredFields(requiredFields, 'executive-industrial-pro-v1')
  const submitInquiry = useInquirySubmission()
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function submit(event: FormEvent<HTMLFormElement>) {
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

  return (
    <form className="ed-inquiry-form" onSubmit={submit}>
      <div className="ed-inquiry-form__row">
        <label>
          {fields.name}
          <input
            autoComplete="name"
            maxLength={inquiryTextLimits.name}
            name="name"
            required={required.name}
          />
        </label>
        <label>
          {labels.email}
          <input
            autoComplete="email"
            maxLength={inquiryTextLimits.email}
            name="email"
            required={required.email}
            type="email"
          />
        </label>
      </div>
      <label>
        {labels.phone}
        {required.phone ? ' *' : fields.optional}
        <input
          autoComplete="tel"
          maxLength={inquiryTextLimits.phone}
          name="phone"
          required={required.phone}
          type="tel"
        />
      </label>
      {required.company ? (
        <label>
          {labels.company} *
          <input
            autoComplete="organization"
            maxLength={inquiryTextLimits.company}
            name="company"
            required
          />
        </label>
      ) : null}
      <label>
        {fields.message}
        <textarea
          maxLength={inquiryTextLimits.message}
          minLength={10}
          name="message"
          required={required.message}
          rows={4}
        />
      </label>
      <label aria-hidden="true" className="ed-contact-honeypot">
        <span>Website</span>
        <input autoComplete="off" name="website" tabIndex={-1} />
      </label>
      <button className="ed-button ed-button--blue" disabled={status === 'sending'} type="submit">
        {status === 'sending' ? labels.sending : labels.send}
        <ArrowRight aria-hidden="true" size={17} />
      </button>
      <p
        aria-live="polite"
        className={
          status === 'error'
            ? 'ed-inquiry-form__message ed-contact-error'
            : 'ed-inquiry-form__message'
        }
        role={status === 'error' ? 'alert' : 'status'}
      >
        {status === 'sent' ? labels.sent : status === 'error' ? labels.error : ''}
      </p>
    </form>
  )
}
