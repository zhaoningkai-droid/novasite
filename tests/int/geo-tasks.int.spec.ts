import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  assertGeoQuestionTranslation,
  parseGeoTask,
  type GeoQuestion,
} from '../../src/platform/geo/tasks'
import { parseGeoAIInput, runGeoQuestionAI } from '../../src/platform/geo/question-ai'
import type { GeoKeyword } from '../../src/platform/geo/keywords'
const config: GeoKeyword = {
  id: randomUUID(),
  tenantID: 101,
  version: 1,
  brand: '测试电气',
  aliases: [],
  core: '配电柜',
  terms: Array.from({ length: 10 }, (_, i) => `类型${i}配电柜`),
  website: 'https://fixture.example/',
  blog: '',
  termLinks: Array.from({ length: 10 }, (_, i) => ({
    term: `类型${i}配电柜`,
    website: `https://fixture.example/products/${i}`,
    blog: '',
  })),
  createdAt: '',
  updatedAt: '',
}
const question = (original = '配电柜如何选型？'): GeoQuestion => ({
  id: randomUUID(),
  term: '配电柜',
  intent: 'default',
  original,
  translated: '',
  translatedFrom: '',
  translatedLocale: '',
})
const task = () => ({
  name: '选型文章',
  optimizationID: config.id,
  optimizationVersion: 1,
  locale: 'zh',
  questions: [question()],
  materialGroupID: randomUUID(),
  materialGroupVersion: 1,
  imagesPerArticle: 1,
  direction: '技术解读',
  length: 'short',
  mode: 'deduplicate',
  count: 1,
})
const input = (kind = 'expand', questions: GeoQuestion[] = []) =>
  parseGeoAIInput(
    { kind, locale: 'en', terms: ['配电柜'], intent: 'default', optimizationVersion: 1, questions },
    config,
  )
const provider = (data: object, usage?: object) =>
  vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          usage,
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }],
        }),
        { status: 200 },
      ),
    )
describe('GEO creation configuration and question identity', () => {
  it('accepts a finite group-only task and rejects missing groups or unlimited counts', () => {
    expect(parseGeoTask(task()).count).toBe(1)
    expect(() => parseGeoTask({ ...task(), materialGroupID: '' })).toThrow()
    expect(() => parseGeoTask({ ...task(), count: 2 })).toThrow()
    expect(() => parseGeoTask({ ...task(), imagesPerArticle: 0 })).toThrow()
  })
  it('rejects normalized duplicate originals and stale translations after edits', () => {
    const q = question('配电柜  选型')
    expect(() =>
      parseGeoTask({ ...task(), questions: [q, { ...question('配电柜 选型') }] }),
    ).toThrow()
    expect(() =>
      parseGeoTask({
        ...task(),
        locale: 'en',
        questions: [
          {
            ...q,
            translated: 'Cabinet selection',
            translatedFrom: '旧问题',
            translatedLocale: 'en',
          },
        ],
      }),
    ).toThrow()
    expect(() =>
      parseGeoTask({
        ...task(),
        locale: 'en',
        questions: [
          {
            ...q,
            translated: 'Cabinet selection',
            translatedFrom: q.original,
            translatedLocale: 'es',
          },
        ],
      }),
    ).toThrow()
  })
  it('rejects duplicated question IDs and duplicate target-language questions', () => {
    const q = question()
    expect(() =>
      parseGeoTask({ ...task(), questions: [q, { ...q, original: '另一问题' }] }),
    ).toThrow()
    const questions = [q, question('配电柜如何安装？')].map((q) => ({
      ...q,
      translated: 'Same question',
      translatedFrom: q.original,
      translatedLocale: 'en',
    }))
    expect(() => parseGeoTask({ ...task(), locale: 'en', questions })).toThrow()
  })
  it('rejects terms from outside the chosen config and changed config versions', () => {
    expect(() => parseGeoAIInput({ ...input(), terms: ['其他客户产品'] }, config)).toThrow()
    expect(() => parseGeoAIInput({ ...input(), optimizationVersion: 2 }, config)).toThrow()
  })
  it('rejects manual translations that copy Chinese or include HTML before saving a task', () => {
    const q = question()
    for (const translated of [
      q.original,
      '<p>How to choose a cabinet?</p>',
      'Это вопрос о распределительном шкафе.',
    ]) {
      expect(() =>
        parseGeoTask({
          ...task(),
          locale: 'en',
          questions: [{ ...q, translated, translatedFrom: q.original, translatedLocale: 'en' }],
        }),
      ).toThrow()
    }
  })
  it('allows English brand names and model numbers inside Arabic or Russian questions', () => {
    const original = '如何选择Lichuang Electric GGD 380V配电柜？'
    expect(() =>
      assertGeoQuestionTranslation(original, 'كيف تختار Lichuang Electric GGD 380V؟', 'ar'),
    ).not.toThrow()
    expect(() =>
      assertGeoQuestionTranslation(original, 'Как выбрать Lichuang Electric GGD 380V?', 'ru'),
    ).not.toThrow()
    expect(() => assertGeoQuestionTranslation('GGD 380V', 'GGD 380V', 'ru')).not.toThrow()
    expect(() =>
      assertGeoQuestionTranslation(original, 'Lichuang Electric GGD 380V', 'ru'),
    ).toThrow()
  })
  it('does not claim to distinguish languages that share the Latin script', () => {
    expect(() =>
      assertGeoQuestionTranslation('配电柜如何选型？', 'How to choose a cabinet?', 'es'),
    ).not.toThrow()
  })
})
describe('GEO provider with injected responses only, no network', () => {
  it('maps reordered translations by stable question IDs', async () => {
    const a = question('如何安装配电柜？'),
      b = question('如何维护配电柜？')
    const fetcher = provider({
      translations: { [b.id]: 'How to maintain a cabinet?', [a.id]: 'How to install a cabinet?' },
    })
    const result = await runGeoQuestionAI(input('translate', [a, b]), config, {
      key: 'fixture-only',
      model: 'fixture',
      fetcher,
    })
    expect(result.questions[0].translated).toBe('How to install a cabinet?')
    expect(result.questions[1].translatedFrom).toBe(b.original)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects missing IDs without returning a partial mapping', async () => {
    const a = question(),
      b = question('如何维护配电柜？')
    await expect(
      runGeoQuestionAI(input('translate', [a, b]), config, {
        key: 'fixture-only',
        model: 'fixture',
        fetcher: provider({ translations: { [a.id]: 'Only one answer' } }),
      }),
    ).rejects.toMatchObject({ code: 'TRANSLATION_MAPPING' })
  })
  it('preserves numerical tokens and refuses invented values', async () => {
    const q = question('380V配电柜如何选型？')
    const result = await runGeoQuestionAI(input('translate', [q]), config, {
      key: 'fixture-only',
      model: 'fixture',
      fetcher: provider({ translations: { [q.id]: 'How to choose a __PROTECTED_0__V cabinet?' } }),
    })
    expect(result.questions[0].translated).toContain('380')
    await expect(
      runGeoQuestionAI(input('translate', [q]), config, {
        key: 'fixture-only',
        model: 'fixture',
        fetcher: provider({ translations: { [q.id]: 'Choose a 480V cabinet' } }),
      }),
    ).rejects.toThrow()
  })
  it.each([
    ['配电柜如何选型？', 'UNCHANGED_TRANSLATION'],
    ['配电柜的安装条件是什么？', 'TRANSLATION_LANGUAGE'],
    ['Как выбрать распределительный шкаф?', 'TRANSLATION_LANGUAGE'],
    ['<p>How to choose a cabinet?</p>', 'TRANSLATION_MARKUP'],
    ['&lt;p&gt;How to choose a cabinet?&lt;/p&gt;', 'TRANSLATION_MARKUP'],
  ])(
    'rejects invalid English provider output %s without losing the original',
    async (translated, code) => {
      const q = question(),
        onUsage = vi.fn().mockResolvedValue(undefined)
      await expect(
        runGeoQuestionAI(input('translate', [q]), config, {
          key: 'fixture-only',
          model: 'fixture',
          onUsage,
          fetcher: provider(
            { translations: { [q.id]: translated } },
            { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
          ),
        }),
      ).rejects.toMatchObject({ code, status: 502 })
      expect(q.original).toBe('配电柜如何选型？')
      expect(q.translated).toBe('')
      expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ totalTokens: 120 }))
    },
  )
  it('accepts a Russian translation carrying English brand, model and preserved voltage', async () => {
    const q = question('如何选择Lichuang Electric GGD 380V配电柜？')
    const translated = 'Как выбрать Lichuang Electric GGD __PROTECTED_0__V?'
    const values = {
      kind: 'translate',
      locale: 'ru',
      terms: ['配电柜'],
      intent: 'default',
      optimizationVersion: 1,
      questions: [q],
    }
    const result = await runGeoQuestionAI(parseGeoAIInput(values, config), config, {
      key: 'fixture-only',
      model: 'fixture',
      fetcher: provider({ translations: { [q.id]: translated } }),
    })
    expect(result.questions[0].translated).toBe('Как выбрать Lichuang Electric GGD 380V?')
    expect(result.questions[0].translatedLocale).toBe('ru')
  })
  it('stores usage before output validation; unknown usage is never zero', async () => {
    const onUsage = vi.fn().mockResolvedValue(undefined)
    await expect(
      runGeoQuestionAI(input(), config, {
        key: 'fixture-only',
        model: 'fixture',
        onUsage,
        fetcher: provider(
          { questions: [] },
          { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        ),
      }),
    ).rejects.toThrow()
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ totalTokens: 120 }))
    const unknown = vi.fn().mockResolvedValue(undefined)
    await runGeoQuestionAI(input(), config, {
      key: 'fixture-only',
      model: 'fixture',
      onUsage: unknown,
      fetcher: provider({ questions: [{ term: '配电柜', text: '配电柜如何维护？' }] }),
    })
    expect(unknown).toHaveBeenCalledWith(undefined)
  })
  it('deduplicates model expansions and rejects unrelated terms', async () => {
    const fetcher = provider({
      questions: [
        { term: '配电柜', text: '配电柜 选型？' },
        { term: '配电柜', text: '配电柜  选型？' },
      ],
    })
    expect(
      (await runGeoQuestionAI(input(), config, { key: 'fixture-only', model: 'fixture', fetcher }))
        .questions,
    ).toHaveLength(1)
    await expect(
      runGeoQuestionAI(input(), config, {
        key: 'fixture-only',
        model: 'fixture',
        fetcher: provider({ questions: [{ term: '无关产品', text: '怎么选择？' }] }),
      }),
    ).rejects.toThrow()
  })
  it.each([
    [401, '密钥无效'],
    [402, '余额不足'],
    [429, '过于频繁'],
  ] as const)('explains provider HTTP %i without an automatic retry', async (status, message) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status }))
    await expect(
      runGeoQuestionAI(input(), config, { key: 'fixture-only', model: 'fixture', fetcher }),
    ).rejects.toMatchObject({
      code: `PROVIDER_${status}`,
      message: expect.stringContaining(message),
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('GEO full-selection generation regression', () => {
  it('accepts more than twenty useful questions without rejecting the entire result', async () => {
    const questions = Array.from({length:40},(_,i)=>({term:'配电柜',text:`采购场景${i+1}的配电柜有哪些厂家可以了解？`}))
    const result=await runGeoQuestionAI(input(),config,{key:'fixture',model:'fixture',fetcher:provider({questions})})
    expect(result.questions).toHaveLength(40)
  })
  it('normalizes omitted spaces in a selected term without accepting unrelated products', async () => {
    const custom={...config,core:'T 型螺栓'}
    const result=await runGeoQuestionAI({...input(),terms:['T 型螺栓']},custom,{key:'fixture',model:'fixture',fetcher:provider({questions:[{term:'T型螺栓',text:'T型螺栓批量采购有哪些厂家可以比较？'}]})})
    expect(result.questions[0].term).toBe('T 型螺栓')
    expect(result.questions[0].original).toContain('T 型螺栓')
  })
  it('covers core plus all ten subterms and returns about forty questions across automatic batches', async () => {
    const terms=[config.core,...config.terms]
    const fetcher=vi.fn(async (_url:unknown,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body))
      const selected=JSON.parse(body.messages[1].content).terms as string[]
      const perTerm=Number(body.messages[0].content.match(/exactly (\d+)/)[1])
      return provider({questions:selected.flatMap(term=>Array.from({length:perTerm},(_,i)=>({term,text:`采购场景${i+1}的${term}有哪些厂家？`})))})()
    })
    const result=await runGeoQuestionAI({...input(),terms},config,{key:'fixture',model:'fixture',fetcher})
    expect(result.questions).toHaveLength(44)
    expect(new Set(result.questions.map(q=>q.term))).toEqual(new Set(terms))
  })
})
