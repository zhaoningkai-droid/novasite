'use client'

import { useEffect } from 'react'

export function useAnalyticsRefresh(refresh: () => void, pending: boolean, scope: string) {
  useEffect(() => {
    let lastRefresh = Date.now()
    const update = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine || pending ||
        Date.now() - lastRefresh < 60_000) return
      lastRefresh = Date.now()
      refresh()
    }
    const timer = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('online', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('online', update)
    }
  }, [refresh, pending, scope])
}
