'use client'

import { useEffect } from 'react'

import './transient-notice.scss'

export function TransientNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDismiss, 2800)
    return () => window.clearTimeout(timer)
  }, [message, onDismiss])

  if (!message) return null
  return <p className="transient-notice" role="status">{message}</p>
}
