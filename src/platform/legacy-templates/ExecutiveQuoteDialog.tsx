'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { ExecutiveDemoLocale } from './executive-demo-data'

type QuoteEvent = CustomEvent<{ product?: string }>

export const openExecutiveQuote = (product?: string) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('executive:openQuote', { detail: { product } }))
}

export function ExecutiveQuoteDialog({ locale }: { locale: ExecutiveDemoLocale }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const [product, setProduct] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const en = locale === 'en'

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as QuoteEvent).detail
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setProduct(detail?.product || '')
      setSubmitted(false)
      if (!dialogRef.current?.open) dialogRef.current?.showModal()
      window.setTimeout(
        () => dialogRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(),
        0,
      )
    }
    window.addEventListener('executive:openQuote', handleOpen)
    return () => window.removeEventListener('executive:openQuote', handleOpen)
  }, [])

  const close = () => dialogRef.current?.close()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    setSubmitted(true)
    event.currentTarget.reset()
  }

  return (
    <dialog
      aria-labelledby="ed-quote-title"
      className="ed-quote-dialog"
      onClick={(event) => {
        if (event.target === dialogRef.current) close()
      }}
      onClose={() => {
        setSubmitted(false)
        window.setTimeout(() => triggerRef.current?.focus(), 0)
      }}
      ref={dialogRef}
    >
      <div className="ed-quote-dialog__panel">
        <header className="ed-quote-dialog__header">
          <div>
            <span className="ed-eyebrow ed-eyebrow--green">
              {en ? 'PROJECT INQUIRY' : '项目咨询'}
            </span>
            <h2 id="ed-quote-title">{en ? 'Request a quotation' : '获取项目报价'}</h2>
          </div>
          <button
            aria-label={en ? 'Close quotation form' : '关闭报价表单'}
            className="ed-dialog-close"
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        {submitted ? (
          <div aria-live="polite" className="ed-quote-dialog__success" role="status">
            <strong>{en ? 'Demo complete' : '演示完成'}</strong>
            <p>
              {en
                ? 'Nothing was sent or saved. On a customer site, this form uses that site’s inquiry settings.'
                : '本次仅展示弹窗效果，没有发送或保存信息。客户网站会按该站点的询盘设置提交。'}
            </p>
            <button className="ed-button ed-button--blue" onClick={close} type="button">
              {en ? 'Done' : '完成'}
            </button>
          </div>
        ) : (
          <form className="ed-quote-form" onSubmit={submit}>
            {product ? (
              <p className="ed-quote-form__product">
                {en ? 'Product' : '咨询产品'}：<strong>{product}</strong>
              </p>
            ) : null}
            <label>
              <span>
                {en ? 'Name' : '姓名'} <b>*</b>
              </span>
              <input autoComplete="name" maxLength={120} name="name" required />
            </label>
            <label>
              <span>
                {en ? 'Email' : '邮箱'} <b>*</b>
              </span>
              <input autoComplete="email" maxLength={200} name="email" required type="email" />
            </label>
            <label>
              <span>
                {en ? 'WhatsApp / Phone' : 'WhatsApp / 电话'} <b>*</b>
              </span>
              <input autoComplete="tel" maxLength={80} name="phone" required />
            </label>
            <label>
              <span>{en ? 'Company' : '公司'}</span>
              <input autoComplete="organization" maxLength={180} name="company" />
            </label>
            <label className="ed-quote-form__message">
              <span>
                {en ? 'Project requirements' : '项目需求'} <b>*</b>
              </span>
              <textarea
                maxLength={4000}
                minLength={10}
                name="message"
                placeholder={
                  en
                    ? 'Share drawings, size, quantity, materials or destination.'
                    : '请介绍图纸、尺寸、数量、材料或项目地点。'
                }
                required
                rows={4}
              />
            </label>
            <p className="ed-quote-dialog__demo-note">
              {en
                ? 'Template demo only. No message will be sent.'
                : '模板演示表单，不会发送或保存个人信息。'}
            </p>
            <button className="ed-button ed-button--blue ed-quote-form__submit" type="submit">
              {en ? 'Submit inquiry' : '提交询盘'}
            </button>
          </form>
        )}
      </div>
    </dialog>
  )
}
