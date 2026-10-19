import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createGeoArticleStore } from '../../src/platform/geo/article-store'
import { refreshArticleContext } from '../../src/platform/geo/article-context'
import type { ArticleContext } from '../../src/platform/geo/articles'

const tenantID = 101
const groupID = randomUUID()
const sourceURL = 'https://fixture.example/products/cabinet'
const image = {
  id: 1001,
  url: '/api/media/file/cabinet.jpg',
  alt: '配电柜',
  filename: 'cabinet.jpg',
}
const excerpt = '配电柜选型应从安装环境、使用方式、设备结构和维护空间几个方面逐项核对。'.repeat(9)
const context: ArticleContext = {
  settings: {
    name: '手动创作',
    optimizationID: randomUUID(),
    optimizationVersion: 1,
    locale: 'zh',
    questions: [
      {
        id: randomUUID(),
        term: '配电柜',
        intent: 'default',
        original: '配电柜如何选型？',
        translated: '',
        translatedFrom: '',
        translatedLocale: '',
      },
    ],
    materialGroupID: groupID,
    materialGroupVersion: 1,
    imagesPerArticle: 0,
    direction: '产品介绍',
    length: 'short',
    mode: 'repeat',
    count: 1,
  },
  question: {
    id: randomUUID(),
    term: '配电柜',
    intent: 'default',
    original: '配电柜如何选型？',
    translated: '',
    translatedFrom: '',
    translatedLocale: '',
  },
  optimization: {
    id: randomUUID(),
    version: 1,
    brand: '测试电气',
    aliases: [],
    core: '配电柜',
    terms: ['低压成套配电柜'],
    website: 'https://fixture.example/',
    blog: '',
    termLinks: [{ term: '低压成套配电柜', website: sourceURL, blog: '' }],
  },
  materialGroup: { id: groupID, version: 1, images: [image] },
  sources: [
    { url: sourceURL, kind: 'site', title: '配电柜产品资料', excerpt, terms: ['低压成套配电柜'] },
  ],
  direction: '产品介绍',
}
const content = {
  title: '配电柜选型说明',
  summary: '结合安装环境核对产品资料。',
  html: `<h2>选型要点</h2><p>${excerpt}<a href="${sourceURL}">查看配电柜产品资料</a></p><img src="${image.url}" alt="配电柜">`,
}

describe('GEO direct authoring records', () => {
  it('stores a manually authored article without a fake task or generation job', async () => {
    const id = randomUUID()
    const row = {
      id,
      tenant_id: tenantID,
      job_id: null,
      task_id: null,
      task_version: null,
      question_id: null,
      context,
      ...content,
      status: 'ready',
      validation: [],
      warnings: [],
      version: 1,
      review_note: '',
      updated_at: '2026-10-17T00:00:00.000Z',
    }
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT * FROM platform_geo.articles')) return { rows: [] }
      if (sql.includes('SELECT m.id,m.url FROM public.media'))
        return { rows: [{ id: image.id, url: image.url }] }
      if (sql.includes('INSERT INTO platform_geo.articles')) return { rows: [row] }
      if (sql.includes('INSERT INTO platform_geo.article_revisions')) return { rows: [] }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const release = vi.fn()
    const query = vi.fn()
    const store = createGeoArticleStore(
      { query, connect: vi.fn().mockResolvedValue({ query: clientQuery, release }) },
      tenantID,
      1,
    )
    const article = await store.createManual(id, content, context, '')
    expect(article).toMatchObject({ id, task_id: null, job_id: null, status: 'ready', version: 1 })
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO platform_geo.generation_jobs'),
      ),
    ).toBe(false)
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(release).toHaveBeenCalledOnce()
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects an article without an independent-page citation before inserting it', async () => {
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT * FROM platform_geo.articles')) return { rows: [] }
      if (sql.includes('SELECT m.id,m.url FROM public.media'))
        return { rows: [{ id: image.id, url: image.url }] }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const store = createGeoArticleStore(
      {
        query: vi.fn(),
        connect: vi.fn().mockResolvedValue({ query: clientQuery, release: vi.fn() }),
      },
      tenantID,
      1,
    )
    await expect(
      store.createManual(
        randomUUID(),
        { ...content, html: content.html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/u, '') },
        context,
        '',
      ),
    ).rejects.toMatchObject({ code: 'ARTICLE_INVALID' })
    expect(
      clientQuery.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO platform_geo.articles'),
      ),
    ).toBe(false)
  })

  it('stores a directly written article without a material group or image', async () => {
    const id = randomUUID()
    const noMediaContext: ArticleContext = {
      ...context,
      settings: { ...context.settings, materialGroupID: '', materialGroupVersion: 0 },
      materialGroup: { id: '', version: 0, images: [] },
    }
    const noImageContent = { ...content, html: content.html.replace(/<img\b[^>]*>/u, '') }
    const row = {
      id,
      tenant_id: tenantID,
      job_id: null,
      task_id: null,
      task_version: null,
      question_id: null,
      context: noMediaContext,
      ...noImageContent,
      status: 'ready',
      validation: [],
      warnings: [],
      version: 1,
      review_note: '',
      updated_at: '2026-10-17T00:00:00.000Z',
    }
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT * FROM platform_geo.articles')) return { rows: [] }
      if (sql.includes('INSERT INTO platform_geo.articles')) return { rows: [row] }
      if (sql.includes('INSERT INTO platform_geo.article_revisions')) return { rows: [] }
      throw new Error(`Unexpected query: ${sql}`)
    })
    const store = createGeoArticleStore(
      {
        query: vi.fn(),
        connect: vi.fn().mockResolvedValue({ query: clientQuery, release: vi.fn() }),
      },
      tenantID,
      1,
    )
    const saved = await store.createManual(id, noImageContent, noMediaContext, '')
    expect(saved).toMatchObject({ id, status: 'ready', context: noMediaContext })
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('public.media'))).toBe(false)
  })

  it('rechecks tenant ownership without fetching publication URLs for a direct article', async () => {
    const noMediaContext: ArticleContext = {
      ...context,
      settings: { ...context.settings, materialGroupID: '', materialGroupVersion: 0 },
      materialGroup: { id: '', version: 0, images: [] },
    }
    const query = vi.fn(async (sql: string) =>
      sql.includes('SELECT version FROM platform_geo.optimizations')
        ? { rows: [{ version: 1 }] }
        : { rows: [] },
    )
    const discover = vi.fn().mockRejectedValue(new Error('Promotion URLs must not be fetched'))
    const refreshed = await refreshArticleContext(
      { query } as unknown as Parameters<typeof refreshArticleContext>[0],
      tenantID,
      noMediaContext,
      discover,
    )
    expect(discover).not.toHaveBeenCalled()
    expect(refreshed.writingMode).toBe('keyword')
    expect(refreshed.sources.map((source) => source.url)).toEqual([sourceURL])
    expect(query.mock.calls.some(([sql]) => String(sql).includes('material_groups'))).toBe(false)
  })

  it('keeps manual records isolated by tenant and uses idempotent article IDs', async () => {
    const id = randomUUID(),
      row = {
        id,
        tenant_id: tenantID,
        job_id: null,
        task_id: null,
        task_version: null,
        question_id: null,
        context,
        ...content,
        status: 'ready',
        validation: [],
        warnings: [],
        version: 1,
        review_note: '已核对品牌、来源和配图。',
      }
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [{ same: true }] })
    const clientQuery = vi.fn(async (sql: string) =>
      sql === 'BEGIN' || sql === 'COMMIT'
        ? { rows: [] }
        : sql.includes('SELECT * FROM platform_geo.articles')
          ? { rows: [row] }
          : sql.includes('SELECT $1=$4')
            ? { rows: [{ same: true }] }
            : { rows: [] },
    )
    const pool = {
      query,
      connect: vi.fn().mockResolvedValue({ query: clientQuery, release: vi.fn() }),
    }
    expect(await createGeoArticleStore(pool, tenantID, 1).find(id)).toBe(row)
    expect(
      await createGeoArticleStore(pool, tenantID, 1).createManual(
        id,
        content,
        context,
        '已核对品牌、来源和配图。',
      ),
    ).toBe(row)
    expect(query.mock.calls[0][1]).toEqual([tenantID, id])
    expect(clientQuery.mock.calls.map(([sql]) => sql)).toContain('COMMIT')
  })
})
