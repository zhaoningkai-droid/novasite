import type { Field } from 'payload'
import { managedMediaFilename } from './access-mode'

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const relationID = (value: unknown): number => Number(typeof value === 'object' ? object(value).id : value)
const urlFields = new Set([
  'branding.heroImageURL', 'branding.mobileHeroImageURL', 'branding.navigationBannerURL',
  'fixedPages.homepage.videoURL', 'externalImages.*.url',
  'siteNavigation.*.href', 'siteNavigation.*.children.*.href',
  'fixedPages.footer.quickLinks.*.href', 'items.*.href', 'items.*.children.*.href', 'quickLinks.*.href',
])
const jsonImageKeys = new Set(['desktopImage', 'mobileImage', 'navigationImage', 'imageURL', 'backgroundImage', 'heroImageURL'])

export class MediaReferenceLimitError extends Error {
  constructor() { super('Published media reference lookup exceeded its limit.') }
}

/** Inspect actual media fields, rich-text uploads/links and known URL settings.
 * An arbitrary number, filename mentioned in prose, or another collection's
 * populated relationship never grants media access.
 */
function visitMediaReferences(document: unknown, fields: Field[], visitor: {
  authority?: string | null
  onID: (id: number) => boolean
  onFilename: (filename: string) => boolean
}) {
  let visited = 0
  const step = (depth: number) => { if (++visited > 100_000 || depth > 60) throw new MediaReferenceLimitError() }
  const urlMatches = (value: unknown) => {
    const filename = managedMediaFilename(value, visitor.authority)
    return Boolean(filename && visitor.onFilename(filename))
  }
  const visitID = (value: unknown) => {
    const id = relationID(value)
    return Number.isSafeInteger(id) && id > 0 && visitor.onID(id)
  }
  const mediaRelation = (value: unknown, polymorphic = false, depth = 0): boolean => {
    step(depth)
    if (Array.isArray(value)) return value.some((item) => mediaRelation(item, polymorphic, depth + 1))
    if (polymorphic) {
      const reference = object(value)
      return reference.relationTo === 'media' && visitID(reference.value)
    }
    return visitID(value)
  }
  const htmlMatches = (value: string) => {
    if (value.length > 2_000_000) throw new MediaReferenceLimitError()
    const html = value.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|pre|code|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    for (const tag of html.matchAll(/<(?:img|video|source|a)\b[^>]*>/gi))
      for (const attribute of tag[0].matchAll(/\s(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))
        if (urlMatches(attribute[1] ?? attribute[2] ?? attribute[3])) return true
    return false
  }
  const richMatches = (value: unknown, depth: number): boolean => {
    step(depth)
    if (typeof value === 'string') return htmlMatches(value)
    if (Array.isArray(value)) return value.some((item) => richMatches(item, depth + 1))
    const node = object(value)
    if (node.type === 'code' || node.type === 'code-highlight' || node.blockType === 'code') return false
    if (node.type === 'upload') return node.relationTo === 'media' && mediaRelation(node.value)
    const block = object(node.fields)
    if (node.type === 'block' && block.blockType === 'mediaBlock' && mediaRelation(block.media)) return true
    if (node.type === 'link' || node.type === 'autolink') {
      const link = object(node.fields)
      if (mediaRelation(link.doc, true) || urlMatches(node.url) || urlMatches(link.url)) return true
    }
    // Text nodes are prose, not HTML. Uploaded records of other collections
    // are not followed even if they happen to contain a matching media ID.
    if (node.type === 'text') return false
    return Object.entries(node).some(([key, child]) => key !== 'value' && key !== 'doc' &&
      child && typeof child === 'object' && richMatches(child, depth + 1))
  }
  const jsonMatches = (value: unknown, depth: number): boolean => {
    step(depth)
    if (Array.isArray(value)) return value.some((item) => jsonMatches(item, depth + 1))
    return Object.entries(object(value)).some(([key, child]) =>
      jsonImageKeys.has(key) && urlMatches(child) || child && typeof child === 'object' && jsonMatches(child, depth + 1))
  }
  const inspect = (value: unknown, definitions: Field[], prefix = '', depth = 0): boolean => {
    step(depth)
    const data = object(value)
    for (const field of definitions) {
      if (field.type === 'tabs') {
        if (field.tabs.some((tab) => {
          const name = 'name' in tab ? tab.name : undefined
          return inspect(name ? data[name] : data, tab.fields,
            name ? `${prefix}${prefix ? '.' : ''}${name}` : prefix, depth + 1)
        })) return true
        continue
      }
      if (!('name' in field)) {
        if ('fields' in field && inspect(data, field.fields, prefix, depth + 1)) return true
        continue
      }
      const current = data[field.name]
      const fieldPath = `${prefix}${prefix ? '.' : ''}${field.name}`
      if ((field.type === 'upload' || field.type === 'relationship') &&
          (field.relationTo === 'media' && mediaRelation(current) ||
           Array.isArray(field.relationTo) && field.relationTo.includes('media') && mediaRelation(current, true))) return true
      if (field.type === 'richText' && richMatches(current, depth + 1)) return true
      if (fieldPath === 'detailHTML' && typeof current === 'string' && htmlMatches(current)) return true
      if (urlFields.has(fieldPath) && urlMatches(current)) return true
      if (field.type === 'json' && ['fixedPages.homepage.banners', 'templateSettings'].includes(fieldPath) && jsonMatches(current, depth + 1)) return true
      if (field.type === 'array' && Array.isArray(current) &&
          current.some((item) => inspect(item, field.fields, `${fieldPath}.*`, depth + 1))) return true
      if (field.type === 'group' && inspect(current, field.fields, fieldPath, depth + 1)) return true
      if (field.type === 'blocks' && Array.isArray(current)) {
        for (const item of current) {
          const block = field.blocks.find((candidate) => typeof candidate === 'object' && candidate.slug === object(item).blockType)
          if (block && typeof block === 'object' && inspect(item, block.fields, `${fieldPath}.*`, depth + 1)) return true
        }
      }
    }
    return false
  }
  return inspect(document, fields)
}

export function documentReferencesMedia(document: unknown, fields: Field[], target: {
  id: number; filenames: Set<string>; authority?: string | null
}) {
  return visitMediaReferences(document, fields, {
    authority: target.authority,
    onID: (id) => id === target.id,
    onFilename: (filename) => target.filenames.has(filename),
  })
}

/** The write guard and public file reader share one definition of media references. */
export function collectMediaReferences(document: unknown, fields: Field[], authority?: string | null) {
  const ids = new Set<number>()
  const filenames = new Set<string>()
  visitMediaReferences(document, fields, {
    authority,
    // Return false to visit all fields instead of stopping on the first match.
    onID: (id) => { ids.add(id); return false },
    onFilename: (filename) => { filenames.add(filename); return false },
  })
  return { ids, filenames }
}
