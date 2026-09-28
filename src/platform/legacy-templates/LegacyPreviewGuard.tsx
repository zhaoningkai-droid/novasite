'use client'
import { useEffect, useRef, type ReactNode } from 'react'

export function LegacyPreviewGuard({ children, companySlug, locale }: {
  children: ReactNode; companySlug: string; locale: string
}) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>('form button[type="submit"]')
    buttons?.forEach((button) => { button.disabled = true; button.title = '预览中不能提交询盘' })
  }, [])
  return <div ref={root} onSubmitCapture={(event) => {
    event.preventDefault(); event.stopPropagation()
  }} onClickCapture={(event) => {
    const anchor = (event.target as Element).closest('a')
    if (anchor?.getAttribute('href')?.startsWith(`/s/${companySlug}/${locale}`)) {
      event.preventDefault()
      window.open(anchor.href, '_blank', 'noopener,noreferrer')
    }
  }}>{children}</div>
}
