import { createHash } from 'node:crypto'
import type { Field } from 'payload'
import type { SiteLocale } from '../site-locales'
import { mergeHTML } from '../product-translation/content'
import { sanitizeRichHTML } from '../sanitizeRichHTML'
import type { TranslationContent } from '../product-translation/content'
import type { TranslationResource } from './resources'

type Path = Array<string | number>
type Entry = { path: Path; value: string; overlay: boolean; html?: { parts: string[]; edges: Array<{ index: number; prefix: string; suffix: string }> } }
export type ContentSnapshot = {
  kind: 'workspace-content'
  resource: TranslationResource
  documentID: number
  draft: boolean
  write: Record<string, unknown>
  entries: Entry[]
  content: TranslationContent
}
export const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const clone = <T,>(value: T): T => structuredClone(value)
const valueAt = (value: unknown, path: Path): unknown => path.reduce<unknown>((current, key) =>
  current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
export function setValueAt(target: Record<string, unknown>, path: Path, value: unknown) {
  let current: Record<string, unknown> = target
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]
    if (!current[key] || typeof current[key] !== 'object')
      current[key] = typeof path[index + 1] === 'number' ? [] : {}
    current = current[key] as Record<string, unknown>
  }
  current[path[path.length - 1]] = value
}

type Definition = { path: string; rich?: boolean; overlay?: boolean }
const textFields = (prefix: string, names: string[]) => names.map((name) => ({ path: prefix + name }))
function definitions(resource: TranslationResource): Definition[] {
  if (resource === 'news') return [...textFields('', ['title', 'summary', 'meta.title', 'meta.description']), { path: 'content', rich: true }]
  if (resource === 'cases') return [...textFields('', ['title', 'summary', 'industry']), { path: 'country', overlay: true }, { path: 'content', rich: true }]
  if (resource === 'posts') return [...textFields('', ['title', 'meta.title', 'meta.description']), { path: 'content', rich: true }]
  if (resource === 'faqs') return [...textFields('', ['question', 'category']), { path: 'answer', rich: true }]
  if (resource === 'categories') return textFields('', ['title'])
  if (resource.endsWith('categories')) return textFields('', ['name', 'description'])
  if (resource === 'about') return textFields('fixedPages.about.', ['title', 'intro', 'certificates', 'modules.*.title', 'modules.*.description'])
  if (resource === 'settings') return [...textFields('branding.', ['companyName', 'tagline', 'headerText']), ...textFields('seo.', ['titleSuffix', 'defaultDescription'])]
  if (resource === 'navigation-items') return textFields('', ['label', 'children.*.label'])
  if (resource === 'navigation') return textFields('', ['title', 'footerIntro', 'items.*.label', 'items.*.children.*.label', 'quickLinks.*.label'])
  return [
    ...textFields('fixedPages.homepage.', ['heroEyebrow', 'heroTitle', 'heroDescription', 'companyIntroTitle', 'companyIntro', 'videoTitle', 'videoDescription', 'inquiryTitle', 'inquiryDescription', 'strengthItems.*.label']),
    { path: 'fixedPages.homepage.strengthItems.*.unit', overlay: true },
    { path: 'fixedPages.homepage.banners.*.title', overlay: true },
    { path: 'fixedPages.homepage.banners.*.description', overlay: true },
    ...textFields('fixedPages.homepage.executiveHome.', ['advantagesTitle', 'advantages.*.title', 'advantages.*.description', 'marks.*.label', 'certificatesTitle', 'certificates.*.name', 'certificates.*.alt', 'introButtonLabel', 'strengthTitle', 'strengthGallery.*.caption', 'strengthGallery.*.alt', 'casesTitle', 'categoriesTitle', 'productsTitle', 'newsTitle', 'faqTitle', 'caseCTATitle', 'caseCTADescription', 'caseCTAButton', 'productCTATitle', 'productCTADescription', 'productCTAButton']),
    ...textFields('fixedPages.footer.', ['intro', 'quickLinks.*.label']),
  ]
}
function flattened(fields: Field[]): Field[] {
  return fields.flatMap((field) => {
    if (field.type === 'tabs') return field.tabs.flatMap((tab) => 'name' in tab && tab.name
      ? [{ name: tab.name, type: 'group', fields: tab.fields, localized: tab.localized } as Field]
      : flattened(tab.fields))
    if (!('name' in field) && 'fields' in field) return flattened(field.fields)
    return [field]
  })
}
function isLocalized(fields: Field[], path: string[]) {
  let active = flattened(fields)
  let localized = false
  for (const key of path.filter((key) => key !== '*')) {
    const field = active.find((item) => 'name' in item && item.name === key)
    if (!field) return localized
    localized ||= Boolean('localized' in field && field.localized)
    active = 'fields' in field ? flattened(field.fields) : []
  }
  return localized
}

export function buildContentSnapshot(resource: TranslationResource, documentID: number, document: Record<string, unknown>, fields: Field[]): ContentSnapshot {
  const write: Record<string, unknown> = {}
  const entries: Entry[] = []
  const addRichText = (value: unknown, path: Path, overlay: boolean) => {
    if (typeof value === 'string') {
      const parts = sanitizeRichHTML(value).split(/(<[^>]*>)/g)
      const edges: Array<{ index: number; prefix: string; suffix: string }> = []
      const segments: string[] = []
      parts.forEach((part, index) => {
        if (index % 2 || !part.trim()) return
        const match = part.match(/^(\s*)([\s\S]*?)(\s*)$/)
        if (!match?.[2]) return
        edges.push({ index, prefix: match[1], suffix: match[3] }); segments.push(match[2])
      })
      // One protected rich-text entry per text node; a separate marker carries the HTML structure.
      segments.forEach((segment, index) => entries.push({ path: [...path, '$html', index], value: segment, overlay, html: index === 0 ? { parts, edges } : undefined }))
      return
    }
    const visit = (node: unknown, current: Path) => {
      if (Array.isArray(node)) { node.forEach((item, index) => visit(item, [...current, index])); return }
      const item = objectValue(node)
      if (item.type === 'code' || item.blockType === 'code') return
      for (const [key, child] of Object.entries(item)) {
        if (key === 'text' && typeof child === 'string') entries.push({ path: [...current, key], value: child, overlay })
        else if (child && typeof child === 'object' && key !== 'value') visit(child, [...current, key])
      }
    }
    visit(value, path)
  }
  for (const definition of definitions(resource)) {
    const path = definition.path.split('.')
    const overlay = resource !== 'navigation' && resource !== 'navigation-items' && (definition.overlay || !isLocalized(fields, path))
    const visit = (index: number, current: Path) => {
      const value = valueAt(document, current)
      if (index === path.length) {
        if (value == null) return
        if (!overlay) setValueAt(write, current, clone(value))
        if (definition.rich) addRichText(value, current, Boolean(overlay))
        else if (typeof value === 'string') entries.push({ path: current, value, overlay: Boolean(overlay) })
        return
      }
      if (path[index] === '*') {
        if (!Array.isArray(value)) return
        if (!overlay && valueAt(write, current) === undefined) setValueAt(write, current, clone(value))
        value.forEach((_, at) => visit(index + 1, [...current, at]))
      } else visit(index + 1, [...current, path[index]])
    }
    visit(0, [])
  }
  const content: TranslationContent = { title: '', summary: '', keywords: '', imageAlts: [], tags: [], legacySpecifications: [], specificationSet: null, detailSegments: entries.map((entry) => entry.value) }
  return { kind: 'workspace-content', resource, documentID, draft: document._status === 'draft', write, entries, content }
}
export const contentFingerprint = (source: ContentSnapshot, locale: SiteLocale) =>
  createHash('sha256').update(JSON.stringify({ locale, resource: source.resource, write: source.write, entries: source.entries })).digest('hex')

export function translatedContentPatch(source: ContentSnapshot, translated: TranslationContent) {
  const write = clone(source.write)
  const overlay: Array<{ path: Path; value: unknown }> = []
  for (let index = 0; index < source.entries.length; index++) {
    const entry = source.entries[index]
    const value = translated.detailSegments[index]
    if (entry.path.includes('$html')) {
      if (!entry.html) continue
      const path = entry.path.slice(0, -2)
      const html = mergeHTML(entry.html.parts, entry.html.edges, translated.detailSegments.slice(index, index + entry.html.edges.length))
      if (entry.overlay) overlay.push({ path, value: html })
      else setValueAt(write, path, html)
    } else if (entry.overlay) overlay.push({ path: entry.path, value })
    else setValueAt(write, entry.path, value)
  }
  return { write, overlay }
}

export function mergeContentPatch(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }
  for (const [key, value] of Object.entries(patch)) result[key] = value && typeof value === 'object' && !Array.isArray(value)
    ? mergeContentPatch(objectValue(base[key]), value as Record<string, unknown>) : value
  return result
}
