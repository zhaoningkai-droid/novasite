'use client'

import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn } from 'lucide-react'

import type { SiteLocale } from '@/platform/site-locales'
import styles from './contact-qr-codes.module.css'

type Item = { label: string; src: string }

const messages: Record<SiteLocale, { enlarge: string; close: string; scan: string }> = {
  zh: { enlarge: '点击放大', close: '关闭', scan: '请使用对应应用扫描二维码' },
  en: { enlarge: 'Enlarge', close: 'Close', scan: 'Scan with the corresponding app' },
  de: { enlarge: 'Vergrößern', close: 'Schließen', scan: 'Mit der entsprechenden App scannen' },
  es: { enlarge: 'Ampliar', close: 'Cerrar', scan: 'Escanea con la aplicación correspondiente' },
  ru: { enlarge: 'Увеличить', close: 'Закрыть', scan: 'Сканируйте в соответствующем приложении' },
  ar: { enlarge: 'تكبير', close: 'إغلاق', scan: 'امسح الرمز باستخدام التطبيق المناسب' },
  id: { enlarge: 'Perbesar', close: 'Tutup', scan: 'Pindai dengan aplikasi yang sesuai' },
}

export function ContactQRCodes({ items, locale }: { items: Item[]; locale: SiteLocale }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [selected, setSelected] = useState<Item | null>(null)
  const titleID = useId()
  const t = messages[locale]
  const close = () => dialog.current?.close()

  if (!items.length) return null

  return (
    <div className={styles.list} data-contact-qr-codes>
      {items.map((item) => (
        <button
          aria-haspopup="dialog"
          aria-label={`${item.label} · ${t.enlarge}`}
          className={styles.card}
          key={`${item.label}-${item.src}`}
          onClick={(event) => {
            trigger.current = event.currentTarget
            setSelected(item)
          }}
          type="button"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`${item.label} QR code`} height={112} src={item.src} width={112} />
          <span className={styles.label}>{item.label}</span>
          <span className={styles.hint}><ZoomIn aria-hidden="true" size={12} />{t.enlarge}</span>
        </button>
      ))}
      {selected && typeof document !== 'undefined' ? createPortal(
        <dialog
          aria-labelledby={titleID}
          className={styles.dialog}
          onClick={(event) => { if (event.target === event.currentTarget) close() }}
          onClose={() => {
            setSelected(null)
            trigger.current?.focus()
          }}
          ref={(element) => {
            dialog.current = element
            if (element && !element.open) element.showModal()
          }}
        >
          <div className={styles.panel}>
            <header>
              <h2 id={titleID}>{selected.label}</h2>
              <button aria-label={t.close} onClick={close} type="button">
                <X aria-hidden="true" size={22} />
              </button>
            </header>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`${selected.label} QR code`} height={480} src={selected.src} width={480} />
            <p>{t.scan}</p>
          </div>
        </dialog>, document.body,
      ) : null}
    </div>
  )
}
