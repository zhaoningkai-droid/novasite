'use client'

import Link from 'next/link'
import { ArrowUpRight, Globe2, Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'
import { WorkspacePermissionsProvider } from './WorkspacePermissions'
import { WorkspaceCompanySwitcher } from './WorkspaceCompanySwitcher'
import { WorkspaceSideNavigation } from './WorkspaceSideNavigation'
import { WorkspaceTopNavigation } from './WorkspaceTopNavigation'

const pageName = (pathname: string) => {
  const route = pathname.split('/website/')[1] || 'analytics'
  const base = route.startsWith('content/news') ? '新闻文章'
    : route.startsWith('content/cases') ? '案例'
      : route.startsWith('content/blog') ? '博客'
        : route.startsWith('content/') ? '产品'
          : route === 'content' ? '产品'
            : ({ analytics: '网站数据', inquiries: '询盘收件箱', homepage: '首页', categories: '分类管理', about: '关于我们', faqs: '常见问题', contact: '联系我们', navigation: '网站导航', sites: '站点与模板' } as Record<string, string>)[route] || '独立站工作台'
  if (route.endsWith('/edit')) return `编辑${base}`
  if (route.endsWith('/new')) return `新增${base}`
  if (route.endsWith('/translations')) return `${base}语言管理`
  return base
}

type Props = {
  children: ReactNode
  companies: WorkspaceCompany[]
  currentCompany: WorkspaceCompany
  canEditContent: boolean
  canManageSite: boolean
  canManageInquiries?: boolean
}

export function WorkspaceFrame({ children, companies, currentCompany, canEditContent, canManageSite, canManageInquiries = false }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const currentPageName = pageName(pathname)
  const closeSidebar = () => { setMobileOpen(false); menuRef.current?.focus() }

  useEffect(() => {
    document.title = `${currentPageName} · ${currentCompany.name} | NovaSite 独立站管理`
  }, [currentCompany.name, currentPageName])

  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sidebarRef.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"], a')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileOpen(false); menuRef.current?.focus() }
      if (event.key !== 'Tab') return
      const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled)',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keydown)
    }
  }, [mobileOpen])

  return (
    <WorkspacePermissionsProvider canEditContent={canEditContent} canManageSite={canManageSite}>
    <div className="workspace-shell" data-workspace-company={currentCompany.slug}>
      <a className="workspace-shell__skip" href="#workspace-main">跳到页面内容</a>
      <header className="workspace-shell__header">
        <Link aria-label="NovaSite 公司列表" className="workspace-shell__brand"
          href="/workspace/companies">
          <span className="workspace-shell__brand-mark"><Globe2 size={21} aria-hidden="true" /></span>
          <span><strong>NovaSite</strong></span>
        </Link>
        <WorkspaceTopNavigation companySlug={currentCompany.slug} />
        <div className="workspace-shell__company">
          <WorkspaceCompanySwitcher companies={companies} currentCompany={currentCompany} />
        </div>
      </header>
      <div className="workspace-shell__body">
        {mobileOpen && <button className="workspace-shell__scrim" onClick={closeSidebar}
          aria-label="关闭功能导航" type="button" />}
        <div className={mobileOpen ? 'workspace-shell__sidebar is-open' : 'workspace-shell__sidebar'}
          id="workspace-navigation" ref={sidebarRef}
          role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined}
          aria-label={mobileOpen ? '独立站功能导航' : undefined}>
          <button className="workspace-shell__mobile-close" onClick={closeSidebar}
            aria-label="关闭功能导航" type="button"><X size={20} /></button>
          <WorkspaceSideNavigation canEditContent={canEditContent} canManageSite={canManageSite}
            canManageInquiries={canManageInquiries}
            companySlug={currentCompany.slug} companyName={currentCompany.name}
            onNavigate={() => setMobileOpen(false)} />
        </div>
        <div className="workspace-shell__workarea">
          <div className="workspace-shell__context">
            <button aria-controls="workspace-navigation" aria-expanded={mobileOpen}
              aria-label="打开功能导航" className="workspace-shell__mobile-menu"
              onClick={() => setMobileOpen(true)} ref={menuRef} type="button"><Menu size={20} /></button>
            <a className="workspace-shell__preview" href={`/s/${currentCompany.slug}/zh`}
              target="_blank" rel="noopener noreferrer">
              <Globe2 size={15} aria-hidden="true" />预览网站<ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          <main className="workspace-shell__content" id="workspace-main" tabIndex={-1}>
            <div className="workspace-shell__page" key={pathname}>{children}</div>
          </main>
        </div>
      </div>
    </div>
    </WorkspacePermissionsProvider>
  )
}
