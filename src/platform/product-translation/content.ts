import { richTextToHTML } from '../rich-text'
import { sanitizeRichHTML } from '../sanitizeRichHTML'
import type {
  ProductTranslationSource,
  ProductTranslationSpecification,
} from '../product-translation'
import type { SiteLocale } from '../site-locales'

type Specification = { group: string; label: string; value: string }
export type TranslationContent = {
  detailSegments: string[]
  imageAlts: string[]
  keywords: string
  legacySpecifications: Specification[]
  specificationSet: { items: Specification[]; title: string } | null
  summary: string
  tags: string[]
  title: string
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

function splitHTMLText(html: string) {
  const parts = sanitizeRichHTML(html).split(/(<[^>]*>)/g)
  const segments: string[] = []
  const edges: Array<{ index: number; prefix: string; suffix: string }> = []
  for (const [index, part] of parts.entries()) {
    if (index % 2 !== 0 || !part.trim()) continue
    const match = part.match(/^(\s*)([\s\S]*?)(\s*)$/)
    if (!match?.[2]) continue
    segments.push(match[2])
    edges.push({ index, prefix: match[1], suffix: match[3] })
  }
  return { edges, parts, segments }
}

function specificationItems(value: unknown): ProductTranslationSpecification[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const entry = object(item)
        return {
          group: text(entry?.group),
          label: text(entry?.label),
          value: text(entry?.value),
        }
      })
    : []
}

export function sourceFrom(
  product: Record<string, unknown>,
  specification: Record<string, unknown> | null,
) {
  const rawHTML = text(product.detailHTML) || richTextToHTML(product.description)
  const html = splitHTMLText(rawHTML)
  const tags = Array.isArray(product.tags) ? product.tags : []
  const images = Array.isArray(product.externalImages) ? product.externalImages : []
  const legacySpecifications = specificationItems(product.specifications)
  const specificationSet = specification
    ? {
        items: specificationItems(specification.items),
        title: text(specification.title),
      }
    : null
  const content: TranslationContent = {
    detailSegments: html.segments,
    imageAlts: images.map((image) => text(object(image)?.alt)),
    keywords: text(product.keywords),
    legacySpecifications: legacySpecifications.map((item) => ({
      group: text(item.group),
      label: text(item.label),
      value: text(item.value),
    })),
    specificationSet: specificationSet
      ? {
          items: specificationSet.items.map((item) => ({
            group: text(item.group),
            label: text(item.label),
            value: text(item.value),
          })),
          title: specificationSet.title,
        }
      : null,
    summary: text(product.summary),
    tags: tags.map((tag) => text(object(tag)?.label)),
    title: text(product.title),
  }
  const fingerprintSource: ProductTranslationSource = {
    detailHTML: rawHTML,
    externalImageAlts: content.imageAlts,
    keywords: content.keywords,
    legacySpecifications: content.legacySpecifications,
    specificationSet: content.specificationSet,
    summary: content.summary,
    tags: content.tags,
    title: content.title,
  }
  return { content, fingerprintSource, html, rawHTML }
}

export function validateTranslation(
  value: unknown,
  source: TranslationContent,
): TranslationContent | null {
  const translated = object(value)
  if (!translated) return null
  const detailSegments = translated.detailSegments
  const imageAlts = translated.imageAlts
  const tags = translated.tags
  const legacy = translated.legacySpecifications
  const translatedSpecSet = translated.specificationSet
  const expectedSpecCount = source.specificationSet?.items.length ?? 0
  const matchesArray = (value: unknown, expectedCount: number) =>
    Array.isArray(value) &&
    value.length === expectedCount &&
    value.every((entry) => typeof entry === 'string')
  if (
    typeof translated.title !== 'string' ||
    typeof translated.summary !== 'string' ||
    typeof translated.keywords !== 'string' ||
    !matchesArray(detailSegments, source.detailSegments.length) ||
    !matchesArray(imageAlts, source.imageAlts.length) ||
    !matchesArray(tags, source.tags.length) ||
    !Array.isArray(legacy) ||
    legacy.length !== source.legacySpecifications.length
  )
    return null
  const normalizeSpecifications = (items: unknown, count: number): Specification[] | null => {
    if (!Array.isArray(items) || items.length !== count) return null
    const result: Specification[] = []
    for (const item of items) {
      const entry = object(item)
      if (
        !entry ||
        typeof entry.label !== 'string' ||
        typeof entry.value !== 'string' ||
        typeof entry.group !== 'string'
      )
        return null
      result.push({ group: entry.group, label: entry.label, value: entry.value })
    }
    return result
  }
  const legacySpecifications = normalizeSpecifications(legacy, source.legacySpecifications.length)
  if (!legacySpecifications) return null
  let specificationSet: TranslationContent['specificationSet'] = null
  if (source.specificationSet) {
    const translatedSet = object(translatedSpecSet)
    const items = normalizeSpecifications(translatedSet?.items, expectedSpecCount)
    if (!translatedSet || typeof translatedSet.title !== 'string' || !items) return null
    specificationSet = { items, title: translatedSet.title }
  } else if (translatedSpecSet !== null) return null
  return {
    detailSegments: detailSegments as string[],
    imageAlts: imageAlts as string[],
    keywords: translated.keywords,
    legacySpecifications,
    specificationSet,
    summary: translated.summary,
    tags: tags as string[],
    title: translated.title,
  }
}

export function mergeHTML(
  parts: string[],
  edges: Array<{ index: number; prefix: string; suffix: string }>,
  segments: string[],
) {
  if (edges.length !== segments.length) throw new Error('DETAIL_SEGMENT_MISMATCH')
  const output = [...parts]
  edges.forEach((edge, index) => {
    output[edge.index] = `${edge.prefix}${segments[index]
      .replace(/&(?!(?:#\d+|#x[\da-f]+|[a-z]+);)/gi, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}${edge.suffix}`
  })
  return sanitizeRichHTML(output.join(''))
}

export function localizedProductData(
  product: Record<string, unknown>,
  translated: TranslationContent,
  html: string,
) {
  const originalTags = Array.isArray(product.tags) ? product.tags : []
  const originalImages = Array.isArray(product.externalImages) ? product.externalImages : []
  const originalSpecifications = Array.isArray(product.specifications) ? product.specifications : []
  return {
    description: {
      root: {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: html
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim(),
                type: 'text',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'paragraph',
            version: 1,
          },
        ],
        direction: null,
        format: '' as const,
        indent: 0,
        type: 'root' as const,
        version: 1,
      },
    },
    detailHTML: html,
    externalImages: originalImages.map((value, index) => {
      const image = object(value) || {}
      return {
        ...(typeof image.id === 'string' ? { id: image.id } : {}),
        url: typeof image.url === 'string' ? image.url : '',
        alt: translated.imageAlts[index],
      }
    }),
    keywords: translated.keywords,
    specifications: originalSpecifications.map((value, index) => {
      const specification = object(value) || {}
      const localized = translated.legacySpecifications[index]
      return {
        ...(typeof specification.id === 'string' ? { id: specification.id } : {}),
        group: localized?.group || '',
        label: localized?.label || '',
        value: localized?.value || '',
      }
    }),
    summary: translated.summary,
    tags: originalTags.map((value, index) => {
      const tag = object(value) || {}
      return {
        ...(typeof tag.id === 'string' ? { id: tag.id } : {}),
        label: translated.tags[index],
      }
    }),
    title: translated.title,
  }
}

export function localizedSpecificationData(
  existingTarget: Record<string, unknown> | null,
  translated: NonNullable<TranslationContent['specificationSet']>,
  productID: number,
  tenantID: number,
  localeCode: SiteLocale,
) {
  const existingItems = Array.isArray(existingTarget?.items) ? existingTarget.items : []
  return {
    tenant: tenantID,
    title: translated.title,
    product: productID,
    localeCode,
    items: translated.items.map((item, index) => {
      const existingItem = object(existingItems[index])
      return {
        ...(typeof existingItem?.id === 'string' ? { id: existingItem.id } : {}),
        group: item.group,
        label: item.label,
        value: item.value,
      }
    }),
  }
}
