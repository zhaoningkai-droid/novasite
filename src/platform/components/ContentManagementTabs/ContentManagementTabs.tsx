import { BookOpen, FolderKanban, Newspaper, Package } from 'lucide-react'
import Link from 'next/link'

import './content-management-tabs.scss'

type Tab = 'products' | 'news' | 'cases' | 'blog'

export function ContentManagementTabs({
  active,
  companySlug,
}: {
  active: Tab
  companySlug: string
}) {
  const tabs = [
    {
      key: 'products',
      label: '产品管理',
      href: '/workspace/' + companySlug + '/website/content',
      icon: Package,
    },
    {
      key: 'news',
      label: '新闻文章',
      href: '/workspace/' + companySlug + '/website/content/news',
      icon: Newspaper,
    },
    {
      key: 'cases',
      label: '案例管理',
      href: '/workspace/' + companySlug + '/website/content/cases',
      icon: FolderKanban,
    },
    {
      key: 'blog',
      label: '博客管理',
      href: '/workspace/' + companySlug + '/website/content/blog',
      icon: BookOpen,
    },
  ]
  return (
    <nav aria-label="内容管理类型" className="content-management-tabs">
      {tabs.map((tab) => {
        const Icon = tab.icon
        return (
          <Link
            aria-current={active === tab.key ? 'page' : undefined}
            className={
              'content-management-tabs__item' +
              (active === tab.key ? ' content-management-tabs__item--active' : '')
            }
            href={tab.href}
            key={tab.key}
          >
            <Icon aria-hidden="true" size={17} />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
