'use client'
import { createContext, useContext, type ReactNode } from 'react'
import type { IndustryPageModel } from '@/platform/industry-templates/model'
import type { K607SiteData as TemplateSiteData } from '../k607/TemplateData'
const SiteData = createContext<TemplateSiteData | null>(null)
const PageData = createContext<IndustryPageModel | null>(null)
export function K712SiteProvider({
  value,
  children,
}: {
  value: TemplateSiteData
  children: ReactNode
}) {
  return <SiteData.Provider value={value}>{children}</SiteData.Provider>
}
export function K712PageProvider({
  value,
  children,
}: {
  value: IndustryPageModel
  children: ReactNode
}) {
  return <PageData.Provider value={value}>{children}</PageData.Provider>
}
export const useK712Site = () => useContext(SiteData)
export const useK712Page = () => useContext(PageData)
export function homeSections(m: IndustryPageModel | null) {
  return m
    ? [
        0,
        ...(m.intro ? [1] : []),
        ...(m.video ? [2] : []),
        ...(m.products?.length ? [3] : []),
        ...(m.stats?.length ? [4] : []),
        ...(m.cases?.length ? [5] : []),
        ...(m.news?.length ? [6] : []),
        7,
      ]
    : [0, 1, 2, 3, 4, 5, 6, 7]
}
