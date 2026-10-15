'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Menu, X, ChevronDown, ArrowUpRight, Globe } from 'lucide-react'
import { templateCopy } from '@/platform/new-templates/copy'
import { templateLocaleHref } from '@/platform/new-templates/links'
import type { SiteLocale } from '@/platform/site-locales'
import type { IndustryLink } from './model'
import { CustomerBrand } from '@/platform/components/CustomerBrand/CustomerBrand'

const languageNames: Record<SiteLocale, string> = {
  zh: '简体中文',
  en: 'English',
  es: 'Español',
  ar: 'العربية',
  id: 'Bahasa Indonesia',
  de: 'Deutsch',
  ru: 'Русский',
}

export function IndustryHeader({
  company,
  tagline,
  headerText,
  logo,
  base,
  locale,
  languages,
  links,
  quote,
}: {
  company: string
  headerText?: string
  tagline?: string | null
  logo?: string
  base: string
  locale: SiteLocale
  languages: SiteLocale[]
  links: IndustryLink[]
  quote: ReactNode
}) {
  const brandText = headerText === undefined ? company : headerText
  const [mobile, setMobile] = useState(false)
  const [group, setGroup] = useState<number | null>(null)
  const [language, setLanguage] = useState(false)
  const path = usePathname()
  const search = useSearchParams()
  const header = useRef<HTMLElement>(null)
  const t = templateCopy(locale)
  useEffect(() => {
    function dismiss(event: MouseEvent) {
      // Opening the menu replaces its SVG icon. The old click target may already
      // be detached when this document handler runs; retain the original event path.
      if (header.current && !event.composedPath().includes(header.current)) {
        setMobile(false)
        setGroup(null)
        setLanguage(false)
      }
    }
    document.addEventListener('click', dismiss)
    return () => document.removeEventListener('click', dismiss)
  }, [])
  function close() {
    setMobile(false)
    setGroup(null)
    setLanguage(false)
  }
  const suffix = path.startsWith(base) ? path.slice(base.length) : ''
  const query = search.toString()
  return (
    <header
      className="it-header"
      ref={header}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          const active = document.activeElement as HTMLElement | null
          const parent = active?.closest('.it-language') || active?.closest('.it-nav-group')
          const target = parent?.querySelector('button') as HTMLButtonElement | null
          close()
          target?.focus()
        }
      }}
    >
      <div className="it-wrap it-header-row">
        {headerText !== undefined ? <CustomerBrand className="it-brand" companyName={company} headerText={headerText} logo={logo} href={base} onClick={close} /> : <Link aria-label={company} className="it-brand" href={base} onClick={close}>
          {logo ? (
            <img src={logo} width="240" height="66" alt={company} />
          ) : (
            <span className="it-brand-mark" aria-hidden="true">
              ◆
            </span>
          )}
          {brandText ? <span><strong>{brandText}</strong>{headerText === undefined && tagline ? <small>{tagline}</small> : null}</span> : null}
        </Link>}
        <button
          className="it-menu-button"
          type="button"
          aria-label={t.menu}
          aria-expanded={mobile}
          aria-controls="it-navigation"
          onClick={() => setMobile(!mobile)}
        >
          {mobile ? <X size={24} /> : <Menu size={24} />}
        </button>
        <nav
          id="it-navigation"
          className={`it-navigation ${mobile ? 'is-open' : ''}`}
          aria-label={t.menu}
        >
          {links.map((item, index) => {
            const active =
              item.href === base ? path === base : path.startsWith(item.href.split('?')[0])
            return (
              <div
                className="it-nav-group"
                key={`${item.href}-${index}`}
                onMouseEnter={() => {
                  if (window.matchMedia('(hover: hover)').matches) setGroup(index)
                }}
                onMouseLeave={() => setGroup(null)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setGroup(null)
                }}
              >
                <div className="it-nav-label">
                  {item.href ? <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={close}
                    onFocus={() => setGroup(index)}
                  >
                    {item.label}
                  </Link> : <span className="it-nav-text">{item.label}</span>}
                  {item.children?.length ? (
                    <button
                      type="button"
                      aria-label={item.label}
                      aria-expanded={group === index}
                      aria-controls={`it-group-${index}`}
                      onClick={() => setGroup(group === index ? null : index)}
                    >
                      <ChevronDown size={15} />
                    </button>
                  ) : null}
                </div>
                {item.children?.length ? (
                  <div className="it-megamenu" id={`it-group-${index}`} hidden={group !== index}>
                    <strong>{item.label}</strong>
                    <div>
                      {item.children.map((child, i) => (
                        <Link key={`${child.href}-${i}`} href={child.href} onClick={close}>
                          {child.label}
                          <ArrowUpRight size={16} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>
        <div className="it-language">
          <button
            type="button"
            aria-expanded={language}
            aria-controls="it-language-list"
            onClick={() => setLanguage(!language)}
          >
            <Globe size={18} />
            <span>{languageNames[locale]}</span>
            <ChevronDown size={14} />
          </button>
          <div id="it-language-list" hidden={!language}>
            {languages.map((lang) => (
              <Link
                key={lang}
                href={`${templateLocaleHref(base, lang)}${suffix}${query ? `?${query}` : ''}`}
                hrefLang={lang}
                lang={lang}
                aria-current={locale === lang ? 'true' : undefined}
                onClick={close}
              >
                {languageNames[lang]}
              </Link>
            ))}
          </div>
        </div>
        <div className="it-header-quote">{quote}</div>
      </div>
    </header>
  )
}

export function QuoteDialog({
  locale,
  children,
  label,
}: {
  locale: SiteLocale
  children: ReactNode
  label?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const t = templateCopy(locale)
  const quotation = locale === 'zh' ? '获取报价' : t.quote
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])
  return (
    <>
      <button
        className="it-button"
        type="button"
        onClick={() => {
          dialog.current?.showModal()
          setOpen(true)
        }}
      >
        {label || quotation}
        <ArrowUpRight size={17} aria-hidden="true" />
      </button>
      <dialog
        className="it-quote-dialog"
        ref={dialog}
        onClose={() => setOpen(false)}
        aria-label={quotation}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close()
        }}
      >
        <div className="it-dialog-content">
          <div className="it-dialog-heading">
            <h2>{quotation}</h2>
            <button
              type="button"
              aria-label={locale === 'zh' ? '关闭' : 'Close'}
              onClick={() => dialog.current?.close()}
            >
              <X />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  )
}
