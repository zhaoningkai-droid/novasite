'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ga4BrowserAllowed, ga4PageLocation, type Ga4BrowserTarget } from './ga4-browser'
import './ga4-consent.css'

const words = {
  zh: ['允许使用访问统计，帮助我们改善网站？', '允许统计', '拒绝', '访问统计设置'],
  en: ['Allow analytics to help us improve this website?', 'Allow analytics', 'Decline', 'Analytics settings'],
  ru: ['Разрешить аналитику для улучшения сайта?', 'Разрешить', 'Отказаться', 'Настройки аналитики'],
  id: ['Izinkan analitik untuk membantu meningkatkan situs ini?', 'Izinkan', 'Tolak', 'Pengaturan analitik'],
  es: ['¿Permitir analíticas para mejorar este sitio?', 'Permitir', 'Rechazar', 'Ajustes de analíticas'],
  ar: ['هل تسمح بالتحليلات لتحسين هذا الموقع؟', 'السماح', 'رفض', 'إعدادات التحليلات'],
  de: ['Analysen zur Verbesserung dieser Website erlauben?', 'Erlauben', 'Ablehnen', 'Analyse-Einstellungen'],
} as const

export function Ga4Collector({ target, locale }: { target: Ga4BrowserTarget; locale: string }) {
  const pathname = usePathname()
  const [consent, setConsent] = useState<'unknown' | 'accepted' | 'declined'>('unknown')
  const [eligible, setEligible] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [loadedKey, setLoadedKey] = useState('')
  const lastPage = useRef('')
  const storageKey = `novasite:analytics:${target.slug}:${target.measurementId}`
  const t = words[locale as keyof typeof words] || words.en

  useEffect(() => {
    setEligible(ga4BrowserAllowed(target, window.location.href))
    try {
      const stored = localStorage.getItem(storageKey)
      setConsent(stored === 'accepted' || stored === 'declined' ? stored : 'unknown')
    } catch { setConsent('unknown') }
    setLoadedKey(storageKey)
  }, [pathname, storageKey, target])

  useEffect(() => {
    if (loadedKey !== storageKey || !eligible || consent !== 'accepted' || !ga4BrowserAllowed(target, window.location.href)) return
    const globals = window as unknown as Record<string, unknown>
    globals[`ga-disable-${target.measurementId}`] = false
    window.dataLayer ||= []
    // Google's command queue expects an Arguments object, not a custom data-layer event.
    // eslint-disable-next-line prefer-rest-params
    function gtag(..._args: unknown[]) { window.dataLayer!.push(arguments) }
    // Basic opt-in: no Google script/request exists before the visitor accepts.
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
    gtag('js', new Date())
    gtag('config', target.measurementId, {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_flags: 'SameSite=Lax;Secure', cookie_domain: window.location.hostname,
    })
    setConfigured(true)
    const send = (event: string) => {
      if (!ga4BrowserAllowed(target, window.location.href) || globals[`ga-disable-${target.measurementId}`]) return
      let referrer = ''
      try { referrer = document.referrer ? new URL(document.referrer).origin : '' } catch { /* No referrer. */ }
      gtag('event', event, {
        send_to: target.measurementId, page_location: ga4PageLocation(window.location.href),
        page_referrer: referrer, page_title: document.title,
        novasite_mode: target.mode,
      })
    }
    const page = ga4PageLocation(window.location.href)
    if (lastPage.current !== page) { lastPage.current = page; send('page_view') }
    const bridge = { slug: target.slug, lead: (identity: string) => {
      const key = `${storageKey}:lead:${identity}`
      try { if (sessionStorage.getItem(key)) return } catch { /* In-memory submission guard remains. */ }
      send('generate_lead')
      try { sessionStorage.setItem(key, '1') } catch { /* Analytics must not block the inquiry. */ }
    } }
    window.novasiteGa4 = bridge
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!anchor) return
      try {
        const url = new URL(anchor.getAttribute('href') || '', window.location.origin)
        if (['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(url.hostname) || url.protocol === 'whatsapp:') send('whatsapp_click')
      } catch { /* Ignore non-URL links. */ }
    }
    document.addEventListener('click', click)
    return () => {
      document.removeEventListener('click', click)
      if (window.novasiteGa4 === bridge) delete window.novasiteGa4
      globals[`ga-disable-${target.measurementId}`] = true
    }
  }, [consent, eligible, loadedKey, pathname, storageKey, target])

  const choose = (value: 'accepted' | 'declined' | 'unknown') => {
    setConsent(value)
    try {
      if (value === 'unknown') localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, value)
    } catch { /* Keep the current page's choice. */ }
    if (value !== 'accepted') {
      (window as unknown as Record<string, unknown>)[`ga-disable-${target.measurementId}`] = true
      setConfigured(false)
      for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim()
        if (name === '_ga' || name.startsWith('_ga_')) {
          document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax; Secure`
          document.cookie = `${name}=; Max-Age=0; path=/; domain=${window.location.hostname}; SameSite=Lax; Secure`
        }
      }
    }
  }
  if (!eligible || loadedKey !== storageKey) return null
  return <>
    {consent === 'accepted' && configured && <Script id={`novasite-ga4-${target.measurementId}`} src={`https://www.googletagmanager.com/gtag/js?id=${target.measurementId}`} strategy="afterInteractive" />}
    {consent === 'unknown' ? <aside className="novasite-analytics-consent" aria-label={t[3]}>
      <p>{t[0]}</p><div><button type="button" onClick={() => choose('accepted')}>{t[1]}</button><button type="button" onClick={() => choose('declined')}>{t[2]}</button></div>
    </aside> : <button className="novasite-analytics-settings" type="button" onClick={() => choose('unknown')}>{t[3]}</button>}
  </>
}
