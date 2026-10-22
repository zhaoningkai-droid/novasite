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
    ['企业推荐', '企业愿景'],
    ['企业榜单', '榜单评选规则'],
    ['产品介绍', '客户案例'],
    ['技术解读', '技术参数与规格标准'],
    ['场景化问题解答', '场景化问题深度解答'],
    ['行业问题解答', '行业问题调研'],
    ['行业百科', '行业发展与关键节点'],
    ['体验分享', '实测性能数据对比'],
    ['新闻报道', '权威引述'],
    ['知识科普', '常见认知误区'],
  ])(
    'preserves the complete supplied %s template without a knowledge prerequisite',
    (direction, expected) => {
      const prompt = geoArticleWritingTemplate(direction, 'Chinese', 'long')
      expect(prompt).toContain(expected)
      expect(prompt).toContain('顺序不变，不合并、不省略、不换成其他创作方向')
      expect(prompt).toContain('没有知识库也直接生成完整文章')
      expect(prompt).not.toContain('Use 3–4 focused sections')
      expect(prompt).not.toContain('改为中立的供应商评估指南')
      expect(prompt).toContain('官网和Blog仅为发文链接')
    },
  )

  it('makes short articles concise within every chapter instead of deleting chapters', () => {
    expect(geoArticleWritingTemplate('产品介绍', 'Chinese', 'short')).toContain('每个板块精炼表达')
    const match = geoArticleWritingTemplate('AI匹配', 'Chinese', 'long')
    expect(match).toContain('全部十个方向')
    expect(match).toContain('榜单评选规则')
    expect(match).toContain('实测性能数据对比')
    expect(match).toContain('版权信息')
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
    expect(body.messages[0].content).toContain('没有知识库也直接生成完整文章')
    expect(body.messages[0].content).toContain('不强制全部以同一句式开头')
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

describe('complete template rendering', () => {
  it('keeps long bodies, many chapters, nested questions and complete tables', async () => {
    const keyword = {
      ...buildArticleContext(settings, snapshot, settings.questions[0]),
      direction: '产品介绍',
    }
    const data = output()
    const sections: Record<string, unknown>[] = Array.from({ length: 15 }, (_, index) => ({
      heading: `Chapter ${index + 1}`,
      paragraphs: Array.from({ length: 8 }, () => ({ text: paragraph })),
    }))
    sections[0].subsections = [
      {
        heading: 'Can it fit my installation?',
        paragraphs: [{ text: paragraph }],
        table: {
          headers: ['Condition', 'Recommendation'],
          rows: Array.from({ length: 15 }, () => ['Outdoor', 'Check enclosure rating']),
        },
      },
    ]
    const result = await generateGeoArticle(keyword, {
      key: 'fixture',
      model: 'fixture',
      fetcher: provider({ ...data, sections }),
      onUsage: async () => {},
    })
    expect(result.content.html.match(/<h2>/g)).toHaveLength(15)
    expect(result.content.html).toContain('<h3>Can it fit my installation?</h3>')
    expect(result.content.html.match(/<tr>/g)).toHaveLength(16)
    expect(result.content.issues).toEqual([])
    expect(result.content.words).toBeGreaterThan(2000)
  })
})

describe('article format recovery', () => {
  it('repairs malformed JSON without losing article content and records combined usage', async () => {
    const keyword = buildArticleContext(settings, snapshot, settings.questions[0])
    const valid = output()
    const envelope = (content: string) =>
      new Response(
        JSON.stringify({
          usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
          choices: [{ finish_reason: 'stop', message: { content } }],
        }),
      )
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(envelope('{"title":"broken",}'))
      .mockResolvedValueOnce(envelope(JSON.stringify(valid)))
    const onUsage = vi.fn().mockResolvedValue(undefined)
    const result = await generateGeoArticle(keyword, {
      key: 'fixture',
      model: 'deepseek-flash',
      fetcher,
      onUsage,
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetcher.mock.calls[1][1].body).messages[0].content).toContain(
      'Preserve ALL text',
    )
    expect(onUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({ inputTokens: 200, outputTokens: 400, totalTokens: 600 }),
    )
    expect(result.content.html).toContain(paragraph.trim())
  })
  it('accepts a table returned as a paragraph block without dropping its rows', async () => {
    const keyword = buildArticleContext(settings, snapshot, settings.questions[0])
    const valid = output()
    const sections: Record<string, unknown>[] = valid.sections
    sections[0].paragraphs = [
      { table: { headers: ['Metric', 'Value'], rows: [['Strength', 'Example value']] } },
    ]
    const result = await generateGeoArticle(keyword, {
      key: 'fixture',
      model: 'fixture',
      fetcher: provider(valid),
      onUsage: async () => {},
    })
    expect(result.content.html).toContain('<td>Strength</td><td>Example value</td>')
  })
})

it('preserves deeply nested FAQ and restores template chapter headings after format repair', async () => {
  const keyword = {
    ...buildArticleContext(settings, snapshot, settings.questions[0]),
    direction: '体验分享',
  }
  const data = output()
  const sections: Record<string, unknown>[] = data.sections
  sections[0].subsections = [
    {
      heading: 'Nested block',
      paragraphs: [],
      subsections: [
        {
          heading: '优点与不足',
          paragraphs: [{ text: paragraph }],
          subsections: [
            {
              heading: 'Real limitation',
              paragraphs: [{ text: 'Check this installation condition.' }],
            },
          ],
        },
        {
          heading: '常见问题 FAQ',
          paragraphs: [],
          subsections: [
            {
              heading: 'Will it fit?',
              paragraphs: [{ text: 'Compare dimensions before ordering.' }],
            },
          ],
        },
      ],
    },
  ]
  const result = await generateGeoArticle(keyword, {
    key: 'fixture',
    model: 'fixture',
    fetcher: provider(data),
    onUsage: async () => {},
  })
  expect(result.content.html).toContain('<h2>优点与不足</h2>')
  expect(result.content.html).toContain('<h2>常见问题 FAQ</h2>')
  expect(result.content.html).toContain('Compare dimensions before ordering.')
})

it('keeps uneven table rows and numeric values instead of rejecting the whole article', async () => {
  const keyword = buildArticleContext(settings, snapshot, settings.questions[0])
  const data = output()
  const sections: Record<string, unknown>[] = data.sections
  sections[0].table = {
    headers: ['Metric', 'Value'],
    rows: [['Strength', 800, 'Reference'], ['Width'], ['Height', null]],
  }
  const result = await generateGeoArticle(keyword, {
    key: 'fixture',
    model: 'fixture',
    fetcher: provider(data),
    onUsage: async () => {},
  })
  expect(result.content.html).toContain('<td>Strength</td><td>800</td><td>Reference</td>')
  expect(result.content.html).toContain('<td>Width</td><td></td><td></td>')
})
