'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

import type { SiteLocale } from '@/platform/site-locales'
import { templateCopy } from '@/platform/new-templates/copy'
import { inquiryRequiredFields } from '@/platform/inquiry/required-fields'
import { useInquirySubmission } from '@/platform/inquiry/useInquirySubmission'

type QuoteRequest = { product?: string; productId?: number }
type QuoteEvent = CustomEvent<QuoteRequest>

export const openExecutiveTenantQuote = (product?: string, productId?: number) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<QuoteRequest>('executive:open-tenant-quote', {
      detail: { product, productId },
    }),
  )
}

export function ExecutiveTenantQuoteTrigger({
  children,
  product,
  productId,
  className = 'ed-button ed-button--blue',
}: {
  children: ReactNode
  product?: string
  productId?: number
  className?: string
}) {
  return (
    <button
      className={className}
      onClick={() => openExecutiveTenantQuote(product, productId)}
      type="button"
    >
      {children}
    </button>
  )
}

export function ExecutiveTenantQuoteDialog({
  site,
  locale,
  requiredFields = {},
}: {
  site: string
  locale: SiteLocale
  requiredFields?: Record<string, boolean>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const [request, setRequest] = useState<QuoteRequest>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const labels = templateCopy(locale)
  const required = inquiryRequiredFields(requiredFields, 'executive-industrial-pro-v1')
  const submitInquiry = useInquirySubmission()

  useEffect(() => {
    const onOpen = (event: Event) => {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setRequest((event as QuoteEvent).detail || {})
      setStatus('idle')
      if (!dialogRef.current?.open) dialogRef.current?.showModal()
      window.setTimeout(
        () => dialogRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(),
        0,
      )
    }
    window.addEventListener('executive:open-tenant-quote', onOpen)
    return () => window.removeEventListener('executive:open-tenant-quote', onOpen)
  }, [])

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

  const close = () => dialogRef.current?.close()
  const mark = (key: keyof typeof required) => (required[key] ? ' *' : '')

  return (
    <dialog
      aria-labelledby="ed-tenant-quote-title"
      className="ed-quote-dialog ed-tenant-quote-dialog"
      onClick={(event) => {
        if (event.target === dialogRef.current) close()
      }}
      onClose={() => window.setTimeout(() => triggerRef.current?.focus(), 0)}
      ref={dialogRef}
    >
      <div className="ed-quote-dialog__panel">
        <header className="ed-quote-dialog__header">
          <div>
            <span className="ed-eyebrow ed-eyebrow--green">
              {locale === 'zh' ? '项目咨询' : 'PROJECT INQUIRY'}
            </span>
            <h2 id="ed-tenant-quote-title">{labels.quote}</h2>
          </div>
          <button
            aria-label={locale === 'zh' ? '关闭询价表单' : 'Close inquiry form'}
            className="ed-dialog-close"
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        {status === 'sent' ? (
          <div aria-live="polite" className="ed-quote-dialog__success" role="status">
            <strong>{locale === 'zh' ? '询盘已提交' : 'Inquiry sent'}</strong>
            <p>{labels.sent}</p>
            <button className="ed-button ed-button--blue" onClick={close} type="button">
              {locale === 'zh' ? '完成' : 'Done'}
            </button>
          </div>
        ) : (
          <form className="ed-quote-form" onSubmit={submit}>
            {request.product ? (
              <p className="ed-quote-form__product">
                {labels.product}：<strong>{request.product}</strong>
              </p>
            ) : null}
            <label>
              <span>
                {labels.name}
                {mark('name')}
              </span>
              <input autoComplete="name" maxLength={120} name="name" required={required.name} />
            </label>
            <label>
              <span>
                {labels.email}
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
            <label>
              <span>
                {labels.phone}
                {mark('phone')}
              </span>
              <input autoComplete="tel" maxLength={80} name="phone" required={required.phone} />
            </label>
            <label>
              <span>
                {labels.company}
                {mark('company')}
              </span>
              <input
                autoComplete="organization"
                maxLength={180}
                name="company"
                required={required.company}
              />
            </label>
            <label className="ed-quote-form__message">
              <span>
                {labels.message}
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
            <label aria-hidden="true" className="ed-tenant-quote-honeypot">
              <span>Website</span>
              <input autoComplete="off" name="website" tabIndex={-1} />
            </label>
            {request.productId ? (
              <input name="productId" type="hidden" value={request.productId} />
            ) : null}
            {request.product ? (
              <input name="product" type="hidden" value={request.product} />
            ) : null}
            {status === 'error' ? (
              <p className="ed-tenant-quote-error" role="alert">
                {labels.error}
              </p>
            ) : null}
            <button
              className="ed-button ed-button--blue ed-quote-form__submit"
              disabled={status === 'sending'}
              type="submit"
            >
              {status === 'sending' ? labels.sending : labels.send}
            </button>
          </form>
        )}
      </div>
    </dialog>
  )
}
