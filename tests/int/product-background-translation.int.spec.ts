import { describe, expect, it } from 'vitest'
import { companyTranslationTargets } from '../../src/platform/site-locales'
import {
  mergeHTML,
  sourceFrom,
  type TranslationContent,
} from '../../src/platform/product-translation/content'
import {
  protectTranslationText,
  translateProductContent,
  translationTextParts,
} from '../../src/platform/product-translation/provider'
import { translationViewLabel } from '../../src/platform/product-translation/job-view'

// Scenarios come from the user's batch/nonblocking/configured-sites requirements and preservation rules.
const source: TranslationContent = {
  title: 'GGD-380 配电柜',
  summary: '额定电压 380 V，频率 50 Hz。',
  keywords: '配电柜',
  detailSegments: ['<安全> &amp; 请按说明安装。'],
  imageAlts: ['配电柜'],
  tags: ['电力设备'],
  legacySpecifications: [],
  specificationSet: {
    title: '电气参数',
    items: [{ group: '电气', label: '频率', value: '50 Hz' }],
  },
}
const echo = async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(init!.body as string)
  const input = JSON.parse(body.messages[1].content)
  const translations = Object.fromEntries(
    Object.entries(input.fields).map(([key, value]) => [key, 'Translated ' + value]),
  )
  return Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ translations }) } }],
  })
}

describe('product background translation rules', () => {
  it('uses only enabled company sites, deduplicates languages and excludes source', () => {
    expect(
      companyTranslationTargets({
        defaultLocale: 'en',
        enabledLocales: ['en', 'zh', 'ru', 'es', 'es', 'invalid'],
      }),
    ).toEqual(['zh', 'ru', 'es'])
    expect(companyTranslationTargets({ defaultLocale: 'zh', enabledLocales: ['zh'] })).toEqual([])
  })
  it('preserves model, voltage, frequency, URL, entities and whitespace', () => {
    const original = '  GGD-380 380 V / 50 Hz &amp; https://example.com/manual.pdf\n'
    const value = protectTranslationText(original)
    expect(value.restore(value.text)).toBe(original)
    expect(() => value.restore(value.text.replace('__PROTECTED_0__', 'changed'))).toThrow()
    expect(() => value.restore(value.text + ' 999')).toThrow()
  })
  it('rejects duplicated protected tokens rather than silently accepting changed specifications', () => {
    const value = protectTranslationText('M12 螺栓')
    expect(() => value.restore(value.text + ' __PROTECTED_0__')).toThrow()
  })
  it('preserves existing superscripts, fractions and compound units without rejecting them as new numbers', async () => {
    const text = '承载 1-5T/m²；体积 2m³；比例 ½；阶段 Ⅲ；温度 50℃；扭矩 20 N·m。'
    const protectedText = protectTranslationText(text)
    expect(protectedText.restore(protectedText.text)).toBe(text)
    expect(() => protectedText.restore(protectedText.text + ' ²')).toThrow()
    const result = await translateProductContent(
      { ...source, summary: text },
      'zh',
      'en',
      'key',
      'model',
      { fetcher: echo as typeof fetch },
    )
    expect(result.summary).toContain('1-5T/m²')
    expect(result.summary).toContain('½')
    expect(result.summary).toContain('20 N·m')
  })
  it('splits long Unicode paragraphs without losing text or cutting surrogate pairs', () => {
    const text = '厂房😀。\n'.repeat(5000)
    const parts = translationTextParts(text)
    expect(parts.length).toBeGreaterThan(10)
    expect(parts.join('')).toBe(text)
    expect(parts.every((part) => Array.from(part).length <= 1800)).toBe(true)
  })
  it('translates every product string while retaining JSON structure and required technical tokens', async () => {
    const result = await translateProductContent(source, 'zh', 'en', 'test-key', 'test-model', {
      fetcher: echo as typeof fetch,
    })
    expect(result.title).toContain('GGD-380')
    expect(result.summary).toContain('380 V')
    expect(result.specificationSet!.items[0].value).toContain('50 Hz')
    expect(result.tags).toHaveLength(1)
    expect(result.legacySpecifications).toEqual([])
  })
  it('resumes checkpoints and avoids retranslating completed chunks after interruption', async () => {
    let checkpoint: Record<string, string> = {}
    await translateProductContent(source, 'zh', 'en', 'key', 'model', {
      fetcher: echo as typeof fetch,
      onProgress: async (value) => {
        checkpoint = { ...value }
      },
    })
    const never = async () => {
      throw new Error('No new provider request expected')
    }
    const resumed = await translateProductContent(source, 'zh', 'en', 'key', 'model', {
      checkpoint,
      fetcher: never as typeof fetch,
    })
    expect(resumed.title).toContain('GGD-380')
  })
  it('retries temporary provider errors but does not repeatedly charge an invalid key', async () => {
    let count = 0
    const transient = async (url: unknown, init?: RequestInit) =>
      ++count === 1 ? Response.json({}, { status: 429 }) : echo(url, init)
    await translateProductContent(source, 'zh', 'en', 'key', 'model', {
      fetcher: transient as typeof fetch,
      delay: async () => {},
    })
    expect(count).toBe(2)
    count = 0
    const unauthorized = async () => {
      count++
      return Response.json({}, { status: 401 })
    }
    await expect(
      translateProductContent(source, 'zh', 'en', 'key', 'model', {
        fetcher: unauthorized as typeof fetch,
        delay: async () => {},
      }),
    ).rejects.toThrow('密钥')
    expect(count).toBe(1)
  })
  it('rejects an incomplete or empty field response', async () => {
    const missing = async () =>
      Response.json({
        choices: [{ finish_reason: 'stop', message: { content: '{"translations":{}}' } }],
      })
    await expect(
      translateProductContent(source, 'zh', 'en', 'key', 'model', {
        fetcher: missing as typeof fetch,
        retries: 0,
      }),
    ).rejects.toThrow('缺少')
  })
  it('preserves HTML structure and escapes translated text rather than accepting new markup', () => {
    const snapshot = sourceFrom(
      {
        title: '测试',
        detailHTML:
          '<p><strong>标题</strong></p><table><tbody><tr><td>参数</td></tr></tbody></table>',
      },
      null,
    )
    const html = mergeHTML(snapshot.html.parts, snapshot.html.edges, [
      '<script>alert(1)</script>',
      '50 < 60',
    ])
    expect(html).toContain('<strong>')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
  it('distinguishes partial failure and does not present zero target sites as completed', () => {
    const view = {
      productID: 1,
      locked: false,
      canTranslate: true,
      status: 'partial' as const,
      completed: 2,
      total: 3,
      languages: [],
    }
    expect(translationViewLabel(view)).toBe('未翻译')
    expect(translationViewLabel({ ...view, total: 0 })).toBe('未翻译')
  })
})
