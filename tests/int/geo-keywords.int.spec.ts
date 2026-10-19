import { describe, expect, it } from 'vitest'
import {
  assertGeoBodyOwnership,
  geoAliasMatches,
  geoID,
  geoVersion,
  normalizeGeoText,
  parseGeoValues,
} from '../../src/platform/geo/keywords'

// Scenarios come from the approved step-2 requirements: 1 core/10 terms,
// company ownership, safe URLs and explicit brand aliases. No real customer fixture or AI calls.
const values = {
  brand: '测试电气',
  aliases: '测试电气有限公司 / Test Electric / TE',
  core: '配电柜',
  terms: Array.from({ length: 10 }, (_, i) => `项目${i + 1}配电柜`),
  website: 'https://company.example/products/',
  blog: 'https://blog.company.example/',
  termLinks: Array.from({ length: 10 }, (_, i) => ({
    term: `项目${i + 1}配电柜`,
    website: `https://company.example/products/${i + 1}`,
    blog: '',
  })),
}
describe('GEO optimization server input', () => {
  it('accepts a complete configuration and keeps all ten terms', () => {
    const parsed = parseGeoValues(values)
    expect(parsed.terms).toEqual(values.terms)
    expect(parsed.aliases).toHaveLength(3)
  })
  it('accepts only the website and Blog roots without per-term URL entries', () => {
    const rootOnly: Record<string, unknown> = { ...values }
    delete rootOnly.termLinks
    const parsed = parseGeoValues(rootOnly)
    expect(parsed.website).toBe(values.website)
    expect(parsed.blog).toBe(values.blog)
    expect(parsed.termLinks).toEqual([])
  })
  it('rejects insufficient, duplicate, core-equal and invalid typed terms', () => {
    for (const terms of [
      values.terms.slice(1),
      [...values.terms.slice(0, 9), values.terms[0]],
      [...values.terms.slice(0, 9), '配电柜'],
      [...values.terms.slice(0, 9), 123],
      [...values.terms.slice(0, 9), '一个词\n另一个词'],
    ])
      expect(() => parseGeoValues({ ...values, terms })).toThrow()
    expect(() => parseGeoValues({ ...values, core: '配电柜\n控制柜' })).toThrow()
  })
  it('deduplicates full-width and case variants without changing display names', () => {
    expect(normalizeGeoText(' ＡＣＭＥ  Electric ')).toBe('acme electric')
    expect(() =>
      parseGeoValues({ ...values, terms: [...values.terms.slice(0, 8), 'ABC', 'ＡＢＣ'] }),
    ).toThrow()
  })
  it('rejects caller-supplied customer identity regardless of field spelling', () => {
    for (const field of ['tenant', 'tenantID', 'tenantId', 'tenant_id', 'company', 'companyID'])
      expect(() => assertGeoBodyOwnership({ [field]: 2 })).toThrow()
  })
  it('rejects script URLs, embedded credentials and malformed identities/versions', () => {
    for (const website of ['javascript:alert(1)', 'https://user:password@example.com/', 'bad-url'])
      expect(() => parseGeoValues({ ...values, website })).toThrow()
    for (const id of ['1', '../../other', "' OR true --"]) expect(() => geoID(id)).toThrow()
    for (const version of [0, -1, 1.5, '1']) expect(() => geoVersion(version)).toThrow()
  })
  it('keeps optional legacy URL hints validated without requiring a row for every subterm', () => {
    expect(
      parseGeoValues({ ...values, termLinks: values.termLinks.slice(1) }).termLinks,
    ).toHaveLength(9)
    expect(() =>
      parseGeoValues({
        ...values,
        termLinks: values.termLinks.map((link, index) =>
          index === 3 ? { ...link, website: 'https://other.example/products/item' } : link,
        ),
      }),
    ).toThrow('必须是官网网址下的独立子页面')
    expect(() =>
      parseGeoValues({
        ...values,
        termLinks: values.termLinks.map((link, index) =>
          index === 2 ? { ...link, website: values.website } : link,
        ),
      }),
    ).toThrow('必须是官网网址下的独立子页面')
    expect(() =>
      parseGeoValues({
        ...values,
        termLinks: values.termLinks.map((link, index) =>
          index === 2 ? { ...link, website: values.termLinks[0].website } : link,
        ),
      }),
    ).toThrow('每个细分词请配置不同的独立页面链接')
  })
  it('recognizes explicit brand aliases and English token boundaries', () => {
    const parsed = parseGeoValues(values)
    expect(geoAliasMatches('测试电气有限公司与 TEST-ELECTRIC', parsed)).toEqual([
      '测试电气',
      '测试电气有限公司',
      'Test Electric',
    ])
    expect(geoAliasMatches('This steel cabinet is suitable.', parsed)).toEqual([])
    // A negative mention is still a mention; recommendation is intentionally a separate later step.
    expect(geoAliasMatches('不推荐测试电气', parsed)).toEqual(['测试电气'])
  })
})
