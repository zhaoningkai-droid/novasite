/** Public resource names are an allowlist, never arbitrary collection names. */
export const translationResources = {
  news: { collection: 'news', slot: 1, label: '新闻' },
  cases: { collection: 'cases', slot: 2, label: '案例' },
  posts: { collection: 'posts', slot: 3, label: '博客' },
  'product-categories': { collection: 'product-categories', slot: 4, label: '产品分类' },
  'news-categories': { collection: 'news-categories', slot: 5, label: '新闻分类' },
  'case-categories': { collection: 'case-categories', slot: 6, label: '案例分类' },
  categories: { collection: 'categories', slot: 7, label: '博客分类' },
  faqs: { collection: 'faqs', slot: 8, label: '常见问题' },
  about: { collection: 'tenants', slot: 9, label: '关于我们' },
  homepage: { collection: 'tenants', slot: 10, label: '首页与页脚' },
  navigation: { collection: 'site-navigation', slot: 11, label: '网站导航' },
  'navigation-items': { collection: 'site-navigation', slot: 13, label: '导航栏目' },
  settings: { collection: 'tenants', slot: 12, label: '网站名称与SEO' },
} as const
export type TranslationResource = keyof typeof translationResources
export const isTranslationResource = (value: string): value is TranslationResource =>
  Object.prototype.hasOwnProperty.call(translationResources, value)

// Existing product tasks use positive IDs. Content tasks occupy a disjoint, reversible
// negative namespace in the same durable queue; no business/schema migration is needed.
export function contentTaskKey(resource: TranslationResource, id: number) {
  const key = -(id * 32 + translationResources[resource].slot)
  if (!Number.isSafeInteger(id) || id < 1 || key < -2147483648)
    throw new Error('内容编号无效。')
  return key
}
