import { describe, expect, it } from 'vitest'
import { parseGeoValues } from '../../src/platform/geo/keywords'
import {
  classifyGeoCitations,
  computeGeoVisibilityMetrics,
  parseGeoObservation,
  parseGeoQuestions,
  type GeoObservation,
  type GeoTrackedQuestion,
} from '../../src/platform/geo/visibility'

const questions: GeoTrackedQuestion[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    queryType: 'brand_self',
    question: 'Lichuang 配电柜有哪些产品？',
    language: 'zh',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    queryType: 'discovery',
    question: '哪些厂家提供配电柜？',
    language: 'zh',
  },
]

describe('GEO visibility data and metrics', () => {
  it('validates versionable questions and isolates query type and locale', () => {
    expect(parseGeoQuestions(questions)).toEqual(questions)
    expect(() =>
      parseGeoQuestions([
        ...questions,
        { ...questions[1], id: '00000000-0000-4000-8000-000000000003' },
      ]),
    ).toThrow(/重复/u)
    expect(() => parseGeoQuestions([{ ...questions[0], language: 'xx' }])).toThrow(/支持范围/u)
  })

  it('requires original evidence for completed answers and a reason for failures', () => {
    const common = {
      questionID: questions[0].id,
      optimizationVersion: 1,
      questionSetVersion: 2,
      platform: 'ChatGPT',
      model: '',
      browsingMode: 'connected',
      language: 'zh',
      region: 'CN',
    }
    expect(() => parseGeoObservation({ ...common, outcome: 'answered', rawAnswer: '' })).toThrow(
      /原始答案/u,
    )
    expect(() => parseGeoObservation({ ...common, outcome: 'failed', failureMessage: '' })).toThrow(
      /失败说明/u,
    )
    expect(
      parseGeoObservation({ ...common, outcome: 'failed', failureMessage: '超时' }).outcome,
    ).toBe('failed')
    expect(() =>
      parseGeoObservation({
        ...common,
        outcome: 'answered',
        rawAnswer: '答案',
        citationURLs: 'javascript:alert(1)',
      }),
    ).toThrow(/有效/u)
    const rawAnswer = '\n  平台原始答案（保留全角标点）  \n'
    expect(parseGeoObservation({ ...common, outcome: 'answered', rawAnswer }).rawAnswer).toBe(
      rawAnswer,
    )
  })

  it('matches citation evidence only against the supplied available source inventory', () => {
    const citations = classifyGeoCitations(
      [
        'https://www.lichuang.com/products/panel/',
        'https://www.lichuang.com/Products/panel',
        'https://other.example/page',
      ],
      [
        {
          url: 'https://www.lichuang.com/products/panel',
          status: 'available',
          title: '配电柜',
          kind: 'site',
        },
        {
          url: 'https://www.lichuang.com/products/private',
          status: 'failed',
          title: '不可访问',
          kind: 'blog',
        },
      ],
    )
    expect(citations.map((item) => item.status)).toEqual([
      'known_available',
      'not_in_source_inventory',
      'not_in_source_inventory',
    ])
  })

  it('does not treat missing or failed samples as negative answers or zero rates', () => {
    const makeObservation = (
      questionID: string,
      resultState: GeoObservation['resultState'],
    ): GeoObservation => ({
      id: questionID,
      batchID: questionID,
      questionID,
      question: 'query',
      queryType: 'discovery',
      resultState,
      matchedAliases: [],
      recommendationContext: 'not_applicable',
      rawAnswer: '',
      groundingQueries: [],
      citations: [],
      failureMessage: resultState === 'failed' ? 'timeout' : '',
      platform: 'ChatGPT',
      model: '',
      browsingMode: 'connected',
      language: 'zh',
      region: 'CN',
      optimizationVersion: 1,
      questionSetVersion: 1,
      method: 'manual',
      sampledAt: '2026-10-17T00:00:00.000Z',
      optimizationSnapshot: {
        ...parseGeoValues({
          brand: 'Lichuang',
          core: '配电柜',
          terms: [
            '低压成套配电柜',
            '不锈钢户外配电柜',
            '光伏并网配电柜',
            '消防动力配电柜',
            '工地临时一级配电柜',
            '双电源自动切换配电柜',
            '防雨型工业配电柜',
            '三相动力配电柜',
            '智能控制配电柜',
            '防爆型低压配电柜',
          ],
          website: 'https://www.lichuang.com',
          blog: '',
          termLinks: [
            '低压成套配电柜',
            '不锈钢户外配电柜',
            '光伏并网配电柜',
            '消防动力配电柜',
            '工地临时一级配电柜',
            '双电源自动切换配电柜',
            '防雨型工业配电柜',
            '三相动力配电柜',
            '智能控制配电柜',
            '防爆型低压配电柜',
          ].map((term, index) => ({
            term,
            website: `https://www.lichuang.com/products/${index}`,
            blog: '',
          })),
        }),
        version: 1,
      },
    })
    const metrics = computeGeoVisibilityMetrics(questions, [
      makeObservation(questions[0].id, 'detected'),
      makeObservation(questions[1].id, 'failed'),
    ])
    expect(metrics).toMatchObject({
      trackedQuestions: 2,
      coveredQuestions: 1,
      validSamples: 1,
      detectedSamples: 1,
      mentionRate: 1,
      citationRate: 0,
      questionCoverage: 0.5,
    })
    expect(computeGeoVisibilityMetrics(questions, []).mentionRate).toBeNull()
    expect(computeGeoVisibilityMetrics(questions, []).questionCoverage).toBeNull()
  })
})
