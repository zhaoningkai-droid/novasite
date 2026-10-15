'use client'

import { ArrowUpRight, ChevronDown, Globe2, Menu } from 'lucide-react'
import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

import { siteHref } from '@/platform/site-url'
import type { SiteLocale } from '@/platform/site-locales'
import { CustomerBrand } from '@/platform/components/CustomerBrand/CustomerBrand'

export type ExecutiveNavigationGroup = {
  key: 'products' | 'news' | 'cases'
  label: string
  href: string
  children: Array<{ href: string; label: string }>
}

type Props = {
  headerText?: string
  companyName: string
  logo?: string
  locale: SiteLocale
  enabledLocales: SiteLocale[]
  siteSlug: string
  navigation: Array<{ href: string; key: string; label: string }>
  groups: ExecutiveNavigationGroup[]
}

const names: Record<string, Record<string, string>> = {
  zh: { home: '主页', products: '产品', news: '新闻', cases: '案例', about: '关于我们', faq: '常见问题', contact: '联系我们', language: '语言', explore: '快速导航' },
  en: { home: 'Home', products: 'Products', news: 'News', cases: 'Cases', about: 'About us', faq: 'FAQ', contact: 'Contact', language: 'Language', explore: 'Explore' },
  es: { home: 'Inicio', products: 'Productos', news: 'Noticias', cases: 'Casos', about: 'Nosotros', faq: 'Preguntas frecuentes', contact: 'Contacto', language: 'Idioma', explore: 'Explorar' },
  ar: { home: 'الرئيسية', products: 'المنتجات', news: 'الأخبار', cases: 'المشاريع', about: 'من نحن', faq: 'الأسئلة الشائعة', contact: 'اتصل بنا', language: 'اللغة', explore: 'استكشف' },
  id: { home: 'Beranda', products: 'Produk', news: 'Berita', cases: 'Proyek', about: 'Tentang Kami', faq: 'Pertanyaan Umum', contact: 'Kontak', language: 'Bahasa', explore: 'Jelajahi' },
  de: { home: 'Startseite', products: 'Produkte', news: 'Nachrichten', cases: 'Referenzen', about: 'Über uns', faq: 'Häufige Fragen', contact: 'Kontakt', language: 'Sprache', explore: 'Entdecken' },
  ru: { home: 'Главная', products: 'Продукция', news: 'Новости', cases: 'Проекты', about: 'О нас', faq: 'Частые вопросы', contact: 'Контакты', language: 'Язык', explore: 'Разделы' },
}
const languageNames: Record<string, string> = { zh: '简体中文', en: 'English', es: 'Español', ar: 'العربية', id: 'Bahasa Indonesia', de: 'Deutsch', ru: 'Русский' }
const languageFlags: Record<string, string> = { zh: '🇨🇳', en: '🇬🇧', es: '🇪🇸', ar: '🇦🇪', id: '🇮🇩', de: '🇩🇪', ru: '🇷🇺' }

export function ExecutiveTenantHeader({ companyName, headerText = '', enabledLocales, groups, locale, logo, navigation, siteSlug }: Props) {
  const labels = names[locale] || names.en
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [languageOpen, setLanguageOpen] = useState(false)
  const pathname = usePathname()
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navHref = (path: string) => /^https?:\/\//.test(path) ? path : siteHref(siteSlug, locale, path === '/' ? '' : path)
  const active = (path: string) => pathname === navHref(path)
  const localePath = pathname?.startsWith(`/s/${siteSlug}/${locale}`) ? pathname.slice(`/s/${siteSlug}/${locale}`.length) : ''
  const showGroup = (key: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpenMenu(key)
    setLanguageOpen(false)
  }
  const hideGroupSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpenMenu(null), 120)
  }

  return <header className="ed-header ed-header--tenant">
    <div className="ed-header__inner">
      <CustomerBrand className="ed-brand" companyName={companyName} headerText={headerText} logo={logo} href={siteHref(siteSlug, locale)} />
      <nav aria-label={locale === 'zh' ? '主导航' : 'Main navigation'} className="ed-nav">
        {navigation.map((item) => {
          if (!item.href) return <span className="ed-nav__label" key={item.key}>{item.label}</span>
          const group = groups.find((entry) => entry.key === item.key)
          if (!group || !group.children.length) return <a aria-current={active(item.href) ? 'page' : undefined} className={active(item.href) ? 'is-current' : ''} href={navHref(item.href)} key={`${item.key}-${item.href}`}>{item.label}</a>
          const open = openMenu === group.key
          return <div className="ed-nav-group" data-open={open || undefined} key={group.key}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null) }}
            onMouseEnter={() => showGroup(group.key)} onMouseLeave={hideGroupSoon}>
            <button aria-controls={`tenant-menu-${group.key}`} aria-expanded={open} className={active(item.href) ? 'is-current' : ''} onClick={() => open ? setOpenMenu(null) : showGroup(group.key)} onFocus={() => showGroup(group.key)} onKeyDown={(event) => { if (event.key === 'Escape') setOpenMenu(null) }} type="button">
              {item.label}<ChevronDown aria-hidden="true" size={14} />
            </button>
            <div aria-hidden={!open} className="ed-mega-menu" id={`tenant-menu-${group.key}`} inert={!open}>
              <div className="ed-mega-menu__intro"><span>{labels.explore}</span><h2>{item.label}</h2></div>
              <div className="ed-mega-menu__items">{group.children.map((child) => <a href={navHref(child.href)} key={`${child.href}-${child.label}`}>
                <ArrowUpRight aria-hidden="true" size={15} />{child.label}
              </a>)}</div>
            </div>
          </div>
        })}
      </nav>
      <div className="ed-language" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setLanguageOpen(false) }}>
        <button aria-expanded={languageOpen} aria-haspopup="true" onClick={() => { setLanguageOpen((current) => !current); setOpenMenu(null) }} type="button">
          <Globe2 aria-hidden="true" size={17} /><span>{languageNames[locale] || locale.toUpperCase()}</span><ChevronDown aria-hidden="true" size={14} />
        </button>
        {languageOpen ? <div className="ed-language__menu" role="menu">{enabledLocales.map((option) => <a aria-current={option === locale ? 'page' : undefined}
          href={siteHref(siteSlug, option, localePath)} key={option} role="menuitem"><span className="ed-language__flag" aria-hidden="true">{languageFlags[option] || '🌐'}</span>{languageNames[option] || option.toUpperCase()}</a>)}</div> : null}
      </div>
      <details className="ed-mobile-menu">
        <summary aria-label={locale === 'zh' ? '打开菜单' : 'Open menu'}><Menu aria-hidden="true" size={22} /></summary>
        <div className="ed-mobile-menu__panel">{navigation.map((item) => item.href ? <a href={navHref(item.href)} key={`mobile-${item.key}`}>{item.label}</a> : <span key={`mobile-${item.key}`}>{item.label}</span>)}
          {groups.filter((group) => group.children.length).map((group) => <details key={`mobile-group-${group.key}`}><summary>{group.label}<ChevronDown aria-hidden="true" size={15} /></summary>
            <div>{group.children.map((child) => <a href={navHref(child.href)} key={`mobile-${child.href}`}>{child.label}</a>)}</div></details>)}
          <div className="ed-mobile-menu__languages">{enabledLocales.map((option) => <a href={siteHref(siteSlug, option)} key={`mobile-lang-${option}`}>{option.toUpperCase()}</a>)}</div>
        </div>
      </details>
    </div>
  </header>
}
