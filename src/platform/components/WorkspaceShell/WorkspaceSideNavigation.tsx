'use client'

import Link from 'next/link'
import {
  BarChart3, ChevronDown, CircleHelp, ContactRound, FolderTree, Globe2,
  LayoutDashboard, LibraryBig, MenuSquare, Settings2, UsersRound,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const configurationItems = [
  { key: 'homepage', label: '首页管理', icon: LayoutDashboard },
  { key: 'categories', label: '分类管理', icon: FolderTree },
  { key: 'content', label: '内容管理', icon: LibraryBig },
  { key: 'about', label: '关于我们', icon: UsersRound },
  { key: 'faqs', label: '常见问题', icon: CircleHelp },
  { key: 'contact', label: '联系我们', icon: ContactRound },
  { key: 'navigation', label: '网站导航', icon: MenuSquare },
]

type Props = { companySlug: string; companyName?: string; onNavigate?: () => void }

export function WorkspaceSideNavigation({ companySlug, companyName, onNavigate }: Props) {
  const pathname = usePathname()
  const [configurationOpen, setConfigurationOpen] = useState(true)
  const base = `/workspace/${companySlug}/website`
  return (
    <aside className="workspace-side-navigation" aria-label="独立站功能导航">
      <div className="workspace-side-navigation__workspace">
        <span className="workspace-side-navigation__avatar" aria-hidden="true">
          {(companyName || companySlug).slice(0, 1).toUpperCase()}
        </span>
        <div><strong>{companyName || companySlug}</strong><small>独立站运营</small></div>
      </div>
      <nav>
        <p className="workspace-side-navigation__caption">工作空间</p>
        <Link aria-current={pathname === `${base}/analytics` ? 'page' : undefined}
          className="workspace-side-navigation__primary" href={`${base}/analytics`}
          onClick={onNavigate}><BarChart3 size={18} aria-hidden="true" /><span>网站数据</span></Link>
        <button aria-controls="website-configuration" aria-expanded={configurationOpen}
          className="workspace-side-navigation__group"
          onClick={() => setConfigurationOpen((value) => !value)} type="button">
          <span><Settings2 size={18} aria-hidden="true" />网站配置</span>
          <ChevronDown className={configurationOpen ? 'is-open' : ''} size={15} aria-hidden="true" />
        </button>
        {configurationOpen && <div id="website-configuration"
          className="workspace-side-navigation__children">
          {configurationItems.map(({ key, label, icon: Icon }) => (
            <Link aria-current={pathname === `${base}/${key}` ||
              (key === 'content' && pathname.startsWith(`${base}/content/`)) ? 'page' : undefined}
              href={`${base}/${key}`} key={key} onClick={onNavigate}>
              <Icon size={17} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </div>}
        <p className="workspace-side-navigation__caption">网站与品牌</p>
        <Link aria-current={pathname === `${base}/sites` ? 'page' : undefined}
          className="workspace-side-navigation__primary" href={`${base}/sites`}
          onClick={onNavigate}><Globe2 size={18} aria-hidden="true" /><span>站点管理</span></Link>
      </nav>
      <div className="workspace-side-navigation__footer">
        <span className="workspace-side-navigation__status-dot" />
        <span>当前公司的独立数据空间</span>
      </div>
    </aside>
  )
}
