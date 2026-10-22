'use client'

import Link from 'next/link'
import {
  CircleHelp,
  FileText,
  FolderOpen,
  SearchCheck,
  Send,
  ChartNoAxesCombined,
  ChevronDown,
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
import { geoKeywordPath, isGeoWorkspace, isKnowledgeWorkspace } from '@/platform/geo/navigation'

type Props = {
  canEditContent: boolean
  canManageSite: boolean
  canManageInquiries?: boolean
  companySlug: string
  companyName?: string
  onNavigate?: () => void
}

export function WorkspaceSideNavigation({
  companySlug,
  canEditContent,
  canManageSite,
  canManageInquiries = false,
  onNavigate,
}: Props) {
  const pathname = usePathname()
  if (isKnowledgeWorkspace(pathname))
    return (
      <aside className="workspace-side-navigation" aria-label="企业知识库功能导航">
        <nav>
          {canEditContent && (
            <Link
              className="workspace-side-navigation__link"
              aria-current="page"
              href={`/workspace/${encodeURIComponent(companySlug)}/knowledge`}
              onClick={onNavigate}
            >
              <FolderOpen size={16} aria-hidden="true" />
              <span>企业知识库</span>
            </Link>
          )}
        </nav>
      </aside>
    )
  if (isGeoWorkspace(pathname)) {
    const geoBase = `/workspace/${companySlug}/geo`
    const creationActive = pathname.includes('/geo/creation') || pathname.includes('/geo/articles')
    const publishActive = ['/geo/publish', '/geo/plans', '/geo/records'].some((part) =>
      pathname.includes(part),
    )
    return (
      <aside
        className="workspace-side-navigation workspace-side-navigation--geo"
        aria-label="GEO优化功能导航"
      >
        <nav>
          {canEditContent && (
            <>
              <Link
                aria-current={pathname.startsWith(geoKeywordPath(companySlug)) ? 'page' : undefined}
                className="workspace-side-navigation__link"
                href={geoKeywordPath(companySlug)}
                onClick={onNavigate}
              >
                <SearchCheck size={16} aria-hidden="true" />
                <span>GEO优化词</span>
              </Link>
              <Link
                className="workspace-side-navigation__link"
                href={`${geoBase}/materials`}
                onClick={onNavigate}
                aria-current={pathname.includes('/geo/materials') ? 'page' : undefined}
              >
                <FolderOpen size={16} aria-hidden="true" />
                <span>素材库</span>
              </Link>
              <details className="workspace-side-navigation__group" open>
                <summary className={creationActive ? 'is-active' : ''}>
                  <FileText size={16} aria-hidden="true" />
                  <span>内容创作</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </summary>
                <Link
                  className="workspace-side-navigation__link is-child"
                  href={`${geoBase}/creation`}
                  onClick={onNavigate}
                  aria-current={creationActive ? 'page' : undefined}
                >
                  文章创作
                </Link>
              </details>
              <details className="workspace-side-navigation__group" open>
                <summary className={publishActive ? 'is-active' : ''}>
                  <Send size={16} aria-hidden="true" />
                  <span>内容发布</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </summary>
                {[
                  ['publish', '文章发布'],
                  ['plans', '发布计划'],
                  ['records', '发布记录'],
                ].map(([path, label]) => (
                  <Link
                    key={path}
                    className="workspace-side-navigation__link is-child"
                    href={`${geoBase}/${path}`}
                    onClick={onNavigate}
                    aria-current={pathname.includes(`/geo/${path}`) ? 'page' : undefined}
                  >
                    {label}
                  </Link>
                ))}
              </details>
              <Link
                className="workspace-side-navigation__link"
                href={`${geoBase}/visibility`}
                onClick={onNavigate}
                aria-current={pathname.includes('/geo/visibility') ? 'page' : undefined}
              >
                <ChartNoAxesCombined size={16} aria-hidden="true" />
                <span>GEO报表</span>
              </Link>
            </>
          )}
        </nav>
      </aside>
    )
  }
  const base = `/workspace/${companySlug}/website`
  const path = pathname.slice(base.length)
  const items = [
    {
      href: `${base}/analytics`,
      label: '网站数据',
      icon: LayoutDashboard,
      active: path === '/analytics',
    },
    ...(canManageInquiries
      ? [
          {
            href: `${base}/inquiries`,
            label: '询盘收件箱',
            icon: Inbox,
            active: path === '/inquiries',
          },
        ]
      : []),
    ...(canEditContent
      ? [
          {
            href: `${base}/homepage`,
            label: '首页管理',
            icon: LayoutDashboard,
            active: path === '/homepage',
          },
          {
            href: `${base}/categories`,
            label: '分类管理',
            icon: FolderTree,
            active: path === '/categories',
          },
          {
            href: `${base}/content`,
            label: '内容管理',
            icon: Package,
            active: path.startsWith('/content'),
          },
          { href: `${base}/about`, label: '关于我们', icon: UsersRound, active: path === '/about' },
          { href: `${base}/faqs`, label: '常见问题', icon: CircleHelp, active: path === '/faqs' },
          {
            href: `${base}/contact`,
            label: '联系我们',
            icon: ContactRound,
            active: path === '/contact',
          },
          {
            href: `${base}/navigation`,
            label: '网站导航',
            icon: MenuSquare,
            active: path === '/navigation',
          },
        ]
      : []),
    ...(canManageSite
      ? [{ href: `${base}/sites`, label: '站点与模板', icon: Globe2, active: path === '/sites' }]
      : []),
  ]

  return (
    <aside className="workspace-side-navigation" aria-label="独立站功能导航">
      <nav>
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link
            aria-current={active ? 'page' : undefined}
            className="workspace-side-navigation__link"
            href={href}
            key={href}
            onClick={onNavigate}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
