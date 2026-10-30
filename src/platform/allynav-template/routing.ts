import { sample } from './data'

export const allyDemoSections = new Set([
  'products',
  'solutions',
  'about',
  'about-us',
  'news',
  'blog',
  'contact',
  'faqs',
  'downloads',
  'search',
  'videos',
  'events',
  'support',
  'get-technical-support',
  'privacy-policy',
  'terms-of-use',
  'site-map',
])

// Keep unknown detail IDs and excessive path segments out of the shared renderer.
export function isAllyDemoPath(path: string[]) {
  if (!path.length) return true
  if (!allyDemoSections.has(path[0]) || path.length > 2) return false
  if (path.length === 1) return true
  if (path[0] === 'products') return sample.products.some((item) => item.slug === path[1])
  if (['news', 'blog', 'events'].includes(path[0]))
    return sample.news.some((item) => item.slug === path[1])
  return false
}

// These views reuse the customer's existing CMS content; no sample data is copied in.
export function allyCustomerSourcePath(path: string[]) {
  if (!path.length) return path
  const section = path[0]
  const simple: Record<string, string> = {
    'about-us': 'about',
    support: 'faqs',
    'get-technical-support': 'contact',
    'privacy-policy': 'about',
    'terms-of-use': 'about',
    'site-map': 'about',
  }
  if (section in simple) return [simple[section], ...path.slice(1)]
  if (section === 'solutions') return ['cases', ...path.slice(1)]
  if (section === 'events') return ['news', ...path.slice(1)]
  if (section === 'videos') return path.length === 1 ? [] : path
  if (['downloads', 'search'].includes(section)) return path.length === 1 ? ['products'] : path
  return path
}
