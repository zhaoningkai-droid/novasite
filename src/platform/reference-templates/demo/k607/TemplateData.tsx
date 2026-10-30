'use client'
import { createContext, useContext, type ReactNode } from 'react'
import type {
  IndustryPageModel,
  IndustryLink,
  IndustryContact,
} from '@/platform/industry-templates/model'
export type K607SiteData = {
  base: string
  company: string
  logo?: string
  tagline?: string | null
  headerText?: string
  locale: string
  languages: string[]
  links: IndustryLink[]
  quickLinks: IndustryLink[]
  contact: IndustryContact
  socials: { label: string; href: string }[]
}
const SiteData = createContext<K607SiteData | null>(null)
const PageData = createContext<IndustryPageModel | null>(null)
export function K607SiteProvider({
  value,
  children,
}: {
  value: K607SiteData
  children: ReactNode
}) {
  return <SiteData.Provider value={value}>{children}</SiteData.Provider>
}
export function K607PageProvider({
  value,
  children,
}: {
  value: IndustryPageModel
  children: ReactNode
}) {
  return <PageData.Provider value={value}>{children}</PageData.Provider>
}
export const useK607Site = () => useContext(SiteData)
export const useK607Page = () => useContext(PageData)
export function pageLinks(m: IndustryPageModel) {
  const p = m.pagination
  if (!p || p.totalPages < 2) return []
  return Array.from({ length: p.totalPages }, (_, i) => ({
    text: String(i + 1),
    title: String(i + 1),
    href: `${m.base}/${m.kind === 'faqs' ? 'faqs' : m.section}?${new URLSearchParams({ ...(m.activeCategory ? { category: m.activeCategory } : {}), page: String(i + 1) })}`,
  }))
}
