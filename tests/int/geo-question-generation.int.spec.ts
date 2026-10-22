import { describe, expect, it } from 'vitest'
import {
  createGeoQuestionPlan,
  geoDiscoveryFamilies,
} from '../../src/platform/geo/question-generation'

// The user supplied ten transformer products with ten distinct buyer intentions per product.
describe('operator supplied GEO buyer-intent coverage', () => {
  const terms = [
    '环形变压器',
    '电力变压器',
    '反激变压器',
    '隔离变压器',
    '降压变压器',
    '电感变压器',
    '线圈变压器',
    '控制变压器',
    'SMD贴片变压器',
    'LLC变压器',
  ]
  it('plans all ten buyer-intent families for every selected product, rather than four repeated forms', () => {
    const plan = createGeoQuestionPlan(terms, 10, 'default')
    expect(plan).toHaveLength(100)
    expect(new Set(plan.map((row) => row.slot)).size).toBe(100)
    for (const term of terms) {
      expect(new Set(plan.filter((row) => row.term === term).map((row) => row.family))).toEqual(
        new Set(geoDiscoveryFamilies.map((row) => row[0])),
      )
    }
  })
  it.each([
    ['supplier', 'supplier'],
    ['manufacturer', 'factory'],
    ['wholesale', 'channel'],
    ['industry', 'industry'],
    ['comparison', 'top'],
  ] as const)(
    'keeps explicit %s generation within its requested search intent',
    (intent, family) => {
      const plan = createGeoQuestionPlan(terms, 10, intent)
      expect(new Set(plan.map((row) => row.family))).toEqual(new Set([family]))
      expect(new Set(plan.map((row) => row.term))).toEqual(new Set(terms))
    },
  )
})
