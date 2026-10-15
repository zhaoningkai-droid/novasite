'use client'

import { useRef } from 'react'

type Pending = { fingerprint: string; key: string }
const requestID = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Keep a retry's identity after a lost response without storing visitor content. */
export function useInquirySubmission() {
  const inFlight = useRef(false)
  const pending = useRef<Pending | undefined>(undefined)
  return async (form: HTMLFormElement, site: string) => {
    if (inFlight.current) return false
    inFlight.current = true
    try {
      const formData = Object.fromEntries(new FormData(form).entries())
      const sourcePage = window.location.href
      const sourceURL = new URL(sourcePage)
      // Existing attribution fields follow the same submission/retry identity.
      const data = { ...formData,
        utmSource: formData.utmSource || sourceURL.searchParams.get('utm_source') || '',
        utmCampaign: formData.utmCampaign || sourceURL.searchParams.get('utm_campaign') || '' }
      const serialized = JSON.stringify({ site, sourcePage, data: Object.entries(data).sort(([a], [b]) => a.localeCompare(b)) })
      const persistentIdentity = Boolean(crypto.subtle)
      const digest = persistentIdentity ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized)) : undefined
      // LAN HTTP previews may not expose SubtleCrypto. Retain content only in
      // component memory there; never persist raw visitor content in storage.
      const fingerprint = digest ? Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('') : serialized
      const storageKey = `novasite:inquiry:${site}:${window.location.pathname}`
      if (pending.current?.fingerprint !== fingerprint) {
        let remembered: Pending | undefined
        if (persistentIdentity) try { remembered = JSON.parse(sessionStorage.getItem(storageKey) || 'null') || undefined } catch { /* Storage can be unavailable in private browsing. */ }
        pending.current = remembered?.fingerprint === fingerprint && /^[a-f0-9-]{36}$/i.test(remembered.key)
          ? remembered : { fingerprint, key: requestID() }
      }
      const attempt = pending.current
      if (persistentIdentity) try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)) } catch { /* The in-memory identity still protects a retry. */ }
      const response = await fetch('/api/submit-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Inquiry-Request-ID': attempt.key },
        body: JSON.stringify({ ...data, site, sourcePage }),
        signal: AbortSignal.timeout(30_000),
      })
      const acknowledgement: unknown = await response.json().catch(() => null)
      if (!response.ok || !acknowledgement || typeof acknowledgement !== 'object'
        || !('ok' in acknowledgement) || acknowledgement.ok !== true) {
        // A login/error page can return HTTP 200; keep the form and retry key
        // until the inquiry endpoint explicitly acknowledges the submission.
        throw new Error('Inquiry submission failed')
      }
      // Only a successful acknowledgement starts a new logical submission.
      pending.current = undefined
      try { sessionStorage.removeItem(storageKey) } catch { /* No visitor data was stored. */ }
      form.reset()
      return true
    } finally {
      inFlight.current = false
    }
  }
}
