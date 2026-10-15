'use client'

import Link from 'next/link'
import {
  CircleHelp,
  ContactRound,
  FolderTree,
  Globe2,
  LayoutDashboard,
  Inbox,
  MenuSquare,
  Package,
  UsersRound,
} from 'lucide-react'
import { usePathname } from 'next/navigation'

type Props = {
  canEditContent: boolean
  canManageSite: boolean
  canManageInquiries?: boolean
  companySlug: string
  companyName?: string
  onNavigate?: () => void
}

export function WorkspaceSideNavigation({ companySlug, canEditContent, canManageSite, canManageInquiries = false, onNavigate }: Props) {
  const pathname = usePathname()
  const base = `/workspace/${companySlug}/website`
  const path = pathname.slice(base.length)
  const items = [
    { href: `${base}/analytics`, label: '网站数据', icon: LayoutDashboard, active: path === '/analytics' },
    ...(canManageInquiries ? [{ href: `${base}/inquiries`, label: '询盘收件箱', icon: Inbox, active: path === '/inquiries' }] : []),
    ...(canEditContent ? [
      { href: `${base}/homepage`, label: '首页管理', icon: LayoutDashboard, active: path === '/homepage' },
      { href: `${base}/categories`, label: '分类管理', icon: FolderTree, active: path === '/categories' },
      { href: `${base}/content`, label: '内容管理', icon: Package, active: path.startsWith('/content') },
      { href: `${base}/about`, label: '关于我们', icon: UsersRound, active: path === '/about' },
      { href: `${base}/faqs`, label: '常见问题', icon: CircleHelp, active: path === '/faqs' },
      { href: `${base}/contact`, label: '联系我们', icon: ContactRound, active: path === '/contact' },
      { href: `${base}/navigation`, label: '网站导航', icon: MenuSquare, active: path === '/navigation' },
    ] : []),
    ...(canManageSite ? [{ href: `${base}/sites`, label: '站点与模板', icon: Globe2, active: path === '/sites' }] : []),
  ]

  return (
    <aside className="workspace-side-navigation" aria-label="独立站功能导航">
      <nav>
        {items.map(({ href, label, icon: Icon, active }) => <Link aria-current={active ? 'page' : undefined}
          className="workspace-side-navigation__link" href={href} key={href} onClick={onNavigate}>
          <Icon size={18} aria-hidden="true" /><span>{label}</span>
        </Link>)}
      </nav>
    </aside>
  )
}
