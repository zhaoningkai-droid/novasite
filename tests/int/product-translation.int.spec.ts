import { describe, expect, it } from 'vitest'

import {
  fingerprintFromProductTranslationMarker,
  productTranslationFingerprint,
  productTranslationMarker,
  type ProductTranslationSource,
} from '../../src/platform/product-translation'

const source: ProductTranslationSource = {
  detailHTML: '<p>Industrial control board</p>',
  externalImageAlts: ['Control board'],
  keywords: 'control board, industrial',
  legacySpecifications: [{ group: 'Power', label: 'Voltage', value: '24 V' }],
  specificationSet: {
    title: 'Electrical data',
    items: [{ group: 'Power', label: 'Input', value: '24 V DC' }],
  },
  summary: 'Industrial board with dual network ports.',
  tags: ['Control', 'Industrial'],
  title: 'Wide Temperature Industrial Board',
}

describe('product translation source fingerprint', () => {
  it('normalizes whitespace and stays stable across repeated page loads', () => {
    expect(productTranslationFingerprint('zh', source)).toBe(
      productTranslationFingerprint('zh', {
        ...source,
        title: '  Wide Temperature Industrial Board  ',
      }),
    )
  })

  it('changes when the source language or any translated field changes', () => {
    expect(productTranslationFingerprint('zh', source)).not.toBe(
      productTranslationFingerprint('en', source),
    )
    expect(productTranslationFingerprint('zh', source)).not.toBe(
      productTranslationFingerprint('zh', { ...source, summary: 'A changed summary.' }),
    )
    expect(productTranslationFingerprint('zh', source)).not.toBe(
      productTranslationFingerprint('zh', {
        ...source,
        specificationSet: {
          ...source.specificationSet!,
          items: [{ group: 'Power', label: 'Input', value: '48 V DC' }],
        },
      }),
    )
  })

  it('stores only a reversible digest marker for the last completed translation', () => {
    const fingerprint = productTranslationFingerprint('zh', source)
    const marker = productTranslationMarker(42, 'zh', fingerprint)
    expect(marker).toContain('42:zh:')
    expect(marker).not.toContain(source.title)
    expect(fingerprintFromProductTranslationMarker(marker)).toBe(fingerprint)
    expect(fingerprintFromProductTranslationMarker('an unrelated audit record')).toBeNull()
  })
})
