import { createHash } from 'node:crypto'

import type { SiteLocale } from './site-locales'

export type ProductTranslationSpecification = {
  group?: string | null
  label?: string | null
  value?: string | null
}

export type ProductTranslationSource = {
  detailHTML?: string | null
  externalImageAlts?: Array<string | null | undefined>
  keywords?: string | null
  legacySpecifications?: ProductTranslationSpecification[]
  specificationSet?: {
    items?: ProductTranslationSpecification[]
    title?: string | null
  } | null
  summary?: string | null
  tags?: Array<string | null | undefined>
  title?: string | null
}

const normalizedText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Stable fingerprint for the source fields included in whole-product translation. */
export function productTranslationFingerprint(
  sourceLocale: SiteLocale,
  source: ProductTranslationSource,
) {
  const normalized = {
    detailHTML: normalizedText(source.detailHTML),
    externalImageAlts: (source.externalImageAlts || []).map(normalizedText),
    keywords: normalizedText(source.keywords),
    legacySpecifications: (source.legacySpecifications || []).map((item) => ({
      group: normalizedText(item.group),
      label: normalizedText(item.label),
      value: normalizedText(item.value),
    })),
    specificationSet: source.specificationSet
      ? {
          items: (source.specificationSet.items || []).map((item) => ({
            group: normalizedText(item.group),
            label: normalizedText(item.label),
            value: normalizedText(item.value),
          })),
          title: normalizedText(source.specificationSet.title),
        }
      : null,
    sourceLocale,
    summary: normalizedText(source.summary),
    tags: (source.tags || []).map(normalizedText),
    title: normalizedText(source.title),
  }

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

export function productTranslationMarker(
  companyID: number,
  sourceLocale: SiteLocale,
  fingerprint: string,
) {
  return `product-translation:v1:${companyID}:${sourceLocale}:${fingerprint}`
}

export function fingerprintFromProductTranslationMarker(summary: unknown) {
  if (typeof summary !== 'string') return null
  const match = summary.match(/product-translation:v1:\d+:[a-z]{2}:([a-f0-9]{64})$/)
  return match?.[1] || null
}
