'use client'

import { FormEvent, useState } from 'react'

type Labels = { send: string; sending: string; sent: string; error: string }

export function RFQForm({ labels, requiredFields = {}, site }: { labels: Labels; requiredFields?: Record<string, boolean>; site: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('sending')
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form).entries())
    const response = await fetch('/api/submit-inquiry', {
      body: JSON.stringify({ ...data, site, sourcePage: window.location.href }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
    if (response.ok) {
      form.reset()
      setState('sent')
    } else setState('error')
  }

  const required = { name: true, company: false, email: true, phone: true, message: true, ...requiredFields }
  const mark = (name: keyof typeof required) => required[name] ? ' *' : ''
  return <form className="site-rfq" onSubmit={submit}>
    <label><span>Name{mark('name')}</span><input autoComplete="name" name="name" required={required.name} /></label>
    <label><span>Company{mark('company')}</span><input autoComplete="organization" name="company" required={required.company} /></label>
    <label><span>Business email{mark('email')}</span><input autoComplete="email" name="email" required={required.email} type="email" /></label>
    <label><span>WhatsApp / Phone{mark('phone')}</span><input autoComplete="tel" name="phone" required={required.phone} /></label>
    <label><span>Country</span><input autoComplete="country-name" name="country" /></label>
    <label><span>Product / Model</span><input name="product" /></label>
    <label><span>Capacity (kVA)</span><input inputMode="numeric" name="capacity" /></label>
    <label className="site-rfq__message"><span>Project requirements{mark('message')}</span><textarea minLength={required.message ? 10 : undefined} name="message" required={required.message} rows={6} /></label>
    <label className="site-rfq__trap" aria-hidden="true"><span>Website</span><input autoComplete="off" name="website" tabIndex={-1} /></label>
    <div className="site-rfq__footer"><button className="site-button" disabled={state === 'sending'} type="submit">{state === 'sending' ? labels.sending : labels.send}</button>{state === 'sent' && <p role="status">{labels.sent}</p>}{state === 'error' && <p className="site-rfq__error" role="alert">{labels.error}</p>}</div>
  </form>
}
