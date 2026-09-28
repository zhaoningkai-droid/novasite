'use client'
import { useState } from 'react'
import { templateCopy } from './copy'
import type { SiteLocale } from '@/platform/site'
type Item = { id: number; title: string; summary?: string | null; image: string; href: string }
export function ProductShowcase({ items, locale }: { items: Item[]; locale: SiteLocale }) {
  const [active, setActive] = useState(0)
  const item = items[active] || items[0]
  if (!item) return null
  return (
    <div className="nt-showcase">
      <div className="nt-showcase-menu" role="group" aria-label={templateCopy(locale).products}>
        {items.map((p, i) => (
          <button type="button" key={p.id} aria-pressed={active === i} onClick={() => setActive(i)}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            {p.title}
            <span>→</span>
          </button>
        ))}
      </div>
      <div className="nt-showcase-stage">
        {item.image ? (
          <img alt={item.title} src={item.image} width="900" height="650" loading="lazy" />
        ) : null}
        <div>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <a className="nt-button" href={item.href}>
            {templateCopy(locale).detail}
          </a>
        </div>
      </div>
    </div>
  )
}
