export const defaultNavigation = [
  { href: '/', label: '首页', sortOrder: 0 },
  { href: '/products', label: '产品中心', sortOrder: 0 },
  { href: '/news', label: '新闻资讯', sortOrder: 0 },
  { href: '/cases', label: '案例中心', sortOrder: 0 },
  { href: '/about', label: '关于我们', sortOrder: 0 },
  { href: '/faqs', label: '常见问题', sortOrder: 0 },
  { href: '/contact', label: '联系我们', sortOrder: 0 },
] as const

export const isDefaultNavigation = (href: string) =>
  defaultNavigation.some((item) => item.href === href) || href === '/faq'

export type NavigationLink = { id?: string | null; label: string; href: string }
export type NavigationItem = NavigationLink & {
  children: NavigationLink[]
  sortOrder: number
  translationKey?: number | null
  modifiedAt?: string | null
}
export type NavigationValue = {
  localeCode: string
  footerIntro: string
  items: NavigationItem[]
  quickLinks: NavigationLink[]
  updatedAt?: string
}

export const sortedNavigation = <T extends { sortOrder?: number | null }>(items: T[]) =>
  [...items].sort((a, b) => Number(b.sortOrder ?? 0) - Number(a.sortOrder ?? 0))
