import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  articleDirection,
  cleanGeoArticleHTML,
  validateGeoArticle,
  type ArticleContext,
} from '../../src/platform/geo/articles'
import { generateGeoArticle } from '../../src/platform/geo/article-provider'
import { buildArticleContext } from '../../src/platform/geo/article-context'
import { geoArticleWritingTemplate } from '../../src/platform/geo/article-writing-template'
import { geoArticleFingerprint } from '../../src/platform/geo/article-store'
const id = randomUUID(),
  paragraph =
    'The distribution cabinet helps organize electrical equipment. Buyers should check the installation conditions and compare the documented product information before choosing a suitable cabinet. '
const source = {
  url: 'https://fixture.example/products/cabinet',
  kind: 'site' as const,
  title: 'Distribution cabinet',
  excerpt: paragraph.repeat(4),
  terms: ['低压配电柜'],
}
const settings = {
  name: '文章任务',
  optimizationID: id,
  optimizationVersion: 1,
  locale: 'en' as const,
  questions: [
    {
      id: randomUUID(),
      term: '低压配电柜',
      original: '低压配电柜如何选型？',
      intent: 'default' as const,
      translated: 'How to choose a cabinet?',
      translatedFrom: '低压配电柜如何选型？',
      translatedLocale: 'en',
    },
  ],
  materialGroupID: randomUUID(),
  materialGroupVersion: 1,
  imagesPerArticle: 1,
  direction: '产品介绍',
  length: 'short' as const,
  mode: 'deduplicate' as const,
  count: 1,
}
const snapshot = {
  optimization: {
    id,
    version: 1,
    brand: 'Fixture',
    aliases: [],
    core: '配电柜',
    terms: ['低压配电柜'],
    website: 'https://fixture.example/',
    blog: '',
    termLinks: [{ term: '低压配电柜', website: source.url, blog: '' }],
  },
  materialGroup: {
    id: settings.materialGroupID,
    version: 1,
    images: [{ id: 1001, url: '/api/media/file/a.jpg', alt: '设备图', filename: 'a.jpg' }],
  },
  sources: [source],
}
const context: ArticleContext = {
  ...buildArticleContext(settings, snapshot, settings.questions[0]),
  writingMode: undefined,
  sources: [source],
}
const validHTML = `<p>${paragraph.repeat(8)}<a href="${source.url}">Reference</a></p><p><img src="/api/media/file/a.jpg"></p>`
const output = () => ({
  title: 'Selecting a distribution cabinet',
  summary: 'Documented selection guidance.',
  sections: [
    {
      heading: 'Selection',
      paragraphs: [
        {
          text: paragraph.repeat(4),
          sourceID: 'S1',
          quote: 'The distribution cabinet helps organize electrical equipment.',
        },
      ],
    },
    {
      heading: 'Installation conditions',
      paragraphs: [
        {
          text: paragraph.repeat(4),
          sourceID: 'S1',
          quote: 'Buyers should check the installation conditions',
        },
      ],
    },
  ],
  reviewNotes: [],
})
const provider = (data: object) =>
  vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }],
      }),
    ),
  )
describe('GEO article references, media and readiness constraints', () => {
  it('accepts a grounded article body with expected language, images and length', () => {
    expect(
      validateGeoArticle({ title: 'Cabinet selection', summary: '', html: validHTML }, context)
        .issues,
    ).toEqual([])
  })
  it('blocks removed citations and empty invisible anchors', () => {
    expect(
      validateGeoArticle(
        { title: 'Cabinet selection', summary: '', html: validHTML.replace(/<a.*?<\/a>/u, '') },
        context,
      ).issues.join(''),
    ).toContain('引用')
    expect(
      validateGeoArticle(
        {
          title: 'Cabinet selection',
          summary: '',
          html: validHTML.replace('>Reference</a>', '></a>'),
        },
        context,
      ).issues.join(''),
    ).toContain('引用')
  })
  it('rejects foreign links/media and strips events, scripts, iframes and malformed tags', () => {
    const result = cleanGeoArticleHTML(
      '<svg onload=alert(1)><script>alert(1)</script></svg><iframe src="https://evil.example"></iframe><img src="/api/media/file/other.jpg" onerror=alert(1)><a data-href="https://fixture.example/products/cabinet" href="javascript:alert(1)">x</a><p onclick="alert(1)">safe</p><scr<script>ipt>',
      [source],
      snapshot.materialGroup.images,
    )
    expect(result.html).not.toMatch(/<(?:script|svg|iframe)|onerror=|onclick=|href="javascript/iu)
    expect(result.usedImages).toEqual([])
    expect(result.usedLinks).toEqual([])
    expect(result.issues.length).toBeGreaterThan(0)
  })
  it('keeps only safe heading and rich-text styles from the editor', () => {
    const result = cleanGeoArticleHTML(
      '<h4>Subheading</h4><p align="center" style="line-height:1.5;color:#123456;background-image:url(javascript:alert(1))"><span style="font-size:18px">formatted</span><font size="4" color="#00aa00">legacy</font></p>',
      [source],
      snapshot.materialGroup.images,
    )
    expect(result.html).toBe(
      '<h4>Subheading</h4><p style="line-height:1.5;color:#123456;text-align:center"><span style="font-size:18px">formatted</span><span style="color:#00aa00;font-size:18px">legacy</span></p>',
    )
    expect(result.html).not.toContain('javascript:')
  })
  it('does not count duplicated images as multiple task images', () => {
    const result = validateGeoArticle(
      { title: 'Cabinet', summary: '', html: validHTML + '<img src="/api/media/file/a.jpg">' },
      { ...context, settings: { ...settings, imagesPerArticle: 2 } },
    )
    expect(result.issues.join('')).toContain('2张')
  })
  it('blocks unsupported numbers, incompatible scripts and oversized bodies', () => {
    expect(
      validateGeoArticle(
        { title: '9999 patents', summary: '', html: validHTML },
        context,
      ).issues.join(''),
    ).toContain('数字')
    expect(
      validateGeoArticle(
        {
          title: '中文文章',
          summary: '',
          html: validHTML.replace(paragraph.repeat(8), '这是中文文章。'.repeat(100)),
        },
        context,
      ).issues.join(''),
    ).toContain('语言')
    expect(
      validateGeoArticle(
        { title: 'Cabinet', summary: '', html: validHTML.repeat(15) },
        context,
      ).issues.join(''),
    ).toContain('长度')
  })
  it('requires particular evidence for rankings, experiences and news; matching is deterministic', () => {
    for (const direction of ['企业榜单', '体验分享', '新闻报道', '企业推荐'])
      expect(() =>
        articleDirection(direction, [source], context.question, 'Unknown brand'),
      ).toThrow()
    expect(articleDirection('AI匹配', [source], context.question, 'Fixture')).toBe('产品介绍')
  })
  it('deduplicates identical content when only the task name changes', () => {
    expect(geoArticleFingerprint(context)).toBe(
      geoArticleFingerprint({ ...context, settings: { ...settings, name: 'Renamed' } }),
    )
    expect(
      buildArticleContext(settings, { ...snapshot, sources: [] }, context.question).writingMode,
    ).toBe('keyword')
  })
})
describe('GEO structured article provider, injected responses only', () => {
  it('records usage, validates exact source quotes and creates only allowed links/images', async () => {
    const usage = vi.fn().mockResolvedValue(undefined),
      fetcher = provider(output())
    const result = await generateGeoArticle(context, {
      key: 'fixture-only',
      model: 'fixture',
      fetcher,
      onUsage: usage,
    })
    expect(result.content.issues).toEqual([])
    expect(result.content.html).toContain(source.url)
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({ totalTokens: 300 }))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects fabricated evidence quotes or references to nonexistent source IDs', async () => {
    for (const value of [{ quote: 'This company holds a certificate.' }, { sourceID: 'S9' }]) {
      const data = output()
      Object.assign(data.sections[0].paragraphs[0], value)
      await expect(
        generateGeoArticle(context, {
          key: 'fixture-only',
          model: 'fixture',
          fetcher: provider(data),
          onUsage: async () => {},
        }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_CLAIM' })
    }
  })
  it('never retries provider failure automatically', async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException('fixture timeout', 'TimeoutError'))
    await expect(
      generateGeoArticle(context, {
        key: 'fixture-only',
        model: 'fixture',
        fetcher,
        onUsage: async () => {},
      }),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([
    [401, '密钥无效'],
    [402, '余额不足'],
    [429, '过于频繁'],
  ] as const)(
    'explains article provider HTTP %i without a second call',
    async (status, message) => {
      const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status })),
        onUsage = vi.fn()
      await expect(
        generateGeoArticle(context, { key: 'fixture-only', model: 'fixture', fetcher, onUsage }),
      ).rejects.toMatchObject({
        code: `PROVIDER_${status}`,
        status: 503,
        message: expect.stringContaining(message),
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(onUsage).not.toHaveBeenCalled()
    },
  )
})

describe('GEO article templates', () => {
  it.each([
    ['企业推荐', '供应商评估指南'],
    ['企业榜单', '禁止编造榜单与名次'],
    ['产品介绍', '产品类别和采购方需要核实的参数'],
    ['技术解读', '工作原理和关键部件'],
    ['场景化问题解答', '排查/解决步骤'],
    ['行业问题解答', '可重复使用的实践清单'],
    ['行业百科', '分类体系'],
    ['体验分享', '测试者和测试条件'],
    ['新闻报道', '倒金字塔导语'],
    ['知识科普', '常见认知误区'],
  ])('applies the supplied %s structure and its evidence boundary', (direction, expected) => {
    const prompt = geoArticleWritingTemplate(direction, 'Chinese', 'long')
    expect(prompt).toContain(expected)
    expect(prompt).toContain(
      'very first sentence of the first body paragraph must state an actionable answer',
    )
    expect(prompt).toContain(
      'the very first sentence of the first body paragraph must state an actionable answer',
    )
    expect(prompt).toContain('do not start with a definition, background, or preamble')
    expect(prompt).toContain('Do not fetch or treat the website/Blog publication links as evidence')
  })

  it('keeps length and title guidance aligned with the article language and task settings', () => {
    const shortEnglish = geoArticleWritingTemplate('产品介绍', 'English', 'short')
    expect(shortEnglish).toContain('50–70 characters')
    expect(shortEnglish).toContain('150–200 word core summary')
    expect(shortEnglish).toContain('3–4 focused sections and 4–7 body paragraphs')
    expect(shortEnglish).toContain('Target 180–350 words')

    const longChinese = geoArticleWritingTemplate('知识科普', 'Chinese', 'long')
    expect(longChinese).toContain('150–250 Chinese-character core summary')
    expect(longChinese).toContain('4–6 focused sections and 7–12 body paragraphs')
    expect(longChinese).toContain('Do not add an unsupported company name, ranking, event')
    expect(longChinese).toContain('omit unused optional fields')
  })
})

describe('keyword writing without website evidence', () => {
  it('omits webpage excerpts from the provider and accepts text without citations', async () => {
    const keyword = buildArticleContext(
      settings,
      { ...snapshot, sources: [] },
      settings.questions[0],
    )
    const fetcher = provider(output())
    const result = await generateGeoArticle(keyword, {
      key: 'fixture',
      model: 'fixture',
      fetcher,
      onUsage: async () => {},
    })
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    const input = JSON.parse(body.messages[1].content)
    expect(body.messages[0].content).toContain('product information that is actually supplied')
    expect(body.messages[0].content).toContain(
      'very first sentence of the first body paragraph must state an actionable answer',
    )
    expect(input.coreKeyword).toBe('配电柜')
    expect(input.knowledge).toEqual([])
    expect(input).not.toHaveProperty('sources')
    expect(result.content.issues).toEqual([])
    expect(result.content.html).toContain(`href="${source.url}"`)
    expect(result.content.html).toContain('>官方网站</a>')
  })

  it('renders template-ready lists and tables as safe article structure', async () => {
    const keyword = buildArticleContext(
        settings,
        { ...snapshot, sources: [] },
        settings.questions[0],
      ),
      data = output() as Record<string, unknown>,
      sections = data.sections as Record<string, unknown>[]
    sections[0].bullets = ['Confirm the installation environment.', '<script>not markup</script>']
    sections[1].table = {
      headers: ['Check', 'Why it matters'],
      rows: [['Environment', 'Confirms suitability']],
    }
    const fetcher = provider(data)
    const result = await generateGeoArticle(keyword, {
      key: 'fixture',
      model: 'fixture',
      fetcher,
      onUsage: async () => {},
    })
    expect(result.content.html).toContain('<ul><li>Confirm the installation environment.</li>')
    expect(result.content.html).toContain('&lt;script&gt;not markup&lt;/script&gt;')
    expect(result.content.html).toContain('<table><thead>')
    expect(result.content.html).toContain('<td>Confirms suitability</td>')
    expect(result.content.issues).toEqual([])
  })

  it('ignores empty optional lists and tables returned by the model', async () => {
    const keyword = buildArticleContext(
        settings,
        { ...snapshot, sources: [] },
        settings.questions[0],
      ),
      data = output() as Record<string, unknown>,
      sections = data.sections as Record<string, unknown>[]
    for (const section of sections) {
      section.bullets = []
      section.table = { headers: [], rows: [] }
    }
    const result = await generateGeoArticle(keyword, {
      key: 'fixture',
      model: 'fixture',
      fetcher: provider(data),
      onUsage: async () => {},
    })
    expect(result.content.issues).toEqual([])
    expect(result.content.html).not.toContain('<ul>')
    expect(result.content.html).not.toContain('<table>')
  })
})
