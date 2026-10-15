import type { ReactNode } from 'react'
import type { SiteLocale } from '@/platform/site-locales'
import type { Banner } from '@/platform/new-templates/Carousel'

export const industryKeys = ['power-705-v1', 'autoparts-571-v1'] as const
export type IndustryKey = (typeof industryKeys)[number]
export const isIndustryKey = (key: string): key is IndustryKey =>
  industryKeys.some((value) => value === key)

export type IndustryLink = { label: string; href: string; children?: IndustryLink[] }
export type IndustryCard = {
  id: string | number
  title: string
  summary?: string | null
  image?: string
  href: string
  date?: string | null
  category?: string
}
export type IndustryContact = {
  address?: string | null
  phone?: string | null
  email?: string | null
  whatsapp?: string | null
  qr?: { label: string; image: string }[]
}
export type IndustryPageModel = {
  kind: 'home' | 'catalog' | 'product' | 'article' | 'about' | 'faqs' | 'contact'
  section?: 'products' | 'news' | 'cases' | 'blog'
  locale: SiteLocale
  base: string
  company: string
  site: string
  title: string
  summary?: string | null
  image?: string
  demo?: boolean
  catalogFirst?: boolean
  preview?: boolean
  requiredFields?: Record<string, boolean>
  banners?: Banner[]
  intro?: { title: string; text: string; image?: string }
  modules?: { title: string; text?: string | null; image?: string }[]
  stats?: { label: string; value?: string | null; unit?: string | null; image?: string }[]
  products?: IndustryCard[]
  cases?: IndustryCard[]
  news?: IndustryCard[]
  cards?: IndustryCard[]
  categories?: IndustryLink[]
  activeCategory?: string
  pagination?: { page: number; totalPages: number; totalDocs: number }
  faqs?: { id: string | number; question: string; answer: ReactNode; answerText?: string }[]
  content?: ReactNode
  images?: string[]
  model?: string | null
  parameters?: { label: string; value: string }[]
  datasheet?: string
  productId?: number
  contact?: IndustryContact
  showInquiry?: boolean
  inquiryTitle?: string | null
  inquiryDescription?: string | null
  video?: { src: string; title: string; embed?: boolean }
  certificates?: string | null
}

export function requestedPage(value?: string | string[]): number {
  const input = Array.isArray(value) ? value[0] : value
  if (!input || !/^\d+$/.test(input)) return 1
  const number = Number(input)
  return Number.isSafeInteger(number) && number > 0 ? number : 1
}

export function safeDate(value?: string | null): string | undefined {
  if (!value) return
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
}
