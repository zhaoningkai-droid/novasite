import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi, beforeEach } from 'vitest'
vi.mock('../../src/platform/site', () => ({
  getBaseURL: (_s: unknown, slug: string) => `https://${slug}.fixture.example`,
}))
import { parseGeoPublishInput, geoPublishURL } from '../../src/platform/geo/publishing'
import { geoArticleToLexical } from '../../src/platform/geo/publish-lexical'
import { commitGeoPublication } from '../../src/platform/geo/publish-adapter'
import { loadGeoPublishTarget } from '../../src/platform/geo/publish-target'
import type { GeoArticle } from '../../src/platform/geo/articles'
import type { GeoPublishRecord } from '../../src/platform/geo/publishing'
import type { Payload } from 'payload'
import type { User } from '../../src/payload-types'
const id = randomUUID(),
  source = {
    url: 'https://fixture.example/product',
    title: '设备资料',
    kind: 'site',
    terms: ['配电柜'],
    excerpt: '设备资料',
  }
const image = { id: 1001, url: '/api/media/file/a.jpg', filename: 'a.jpg', alt: '设备' }
const article = {
  id,
  version: 2,
  title: '配电柜选型',
  summary: '安装条件说明',
  status: 'ready',
  html: `<h2>选型</h2><p><strong>设备</strong>与<a href="${source.url}">产品资料</a></p><p><img src="${image.url}"></p><ul><li>安装</li><li>维护</li></ul>`,
  context: {
    settings: { locale: 'zh' },
    question: { term: '配电柜' },
    optimization: { website: '', blog: '', termLinks: [] },
    sources: [source],
    materialGroup: { id: randomUUID(), version: 1, images: [image] },
  },
} as unknown as GeoArticle
const tenant = {
  id: 101,
  status: 'published',
  defaultLocale: 'zh',
  enabledLocales: ['zh', 'en'],
  slug: 'fixture',
  updatedAt: '2026-10-17T00:00:00Z',
}
const category = { id: 10, name: '设备', title: '设备', updatedAt: tenant.updatedAt }
const target = {
  collection: 'news' as const,
  categoryID: 10,
  categoryName: '设备',
  categoryUpdatedAt: category.updatedAt,
  locale: 'zh',
  companySlug: 'fixture',
  origin: 'https://fixture.fixture.example',
  companyUpdatedAt: tenant.updatedAt,
}
const item = {
  id: randomUUID(),
  tenant_id: 101,
  article_id: id,
  article_version: 2,
  lease_owner: randomUUID(),
  snapshot: article,
  target,
} as GeoPublishRecord
const user = { id: 1 } as User
function mockPayload(articleToPublish: GeoArticle = article) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{}] })
    .mockResolvedValueOnce({ rows: [{ id: item.id }] })
    .mockResolvedValueOnce({ rows: [{ ...articleToPublish }] })
  if (articleToPublish.context.materialGroup.images.length)
    execute.mockResolvedValueOnce({ rows: [{ id: image.id, url: image.url }] })
  execute.mockResolvedValueOnce({ rows: [{ id: item.id }] }).mockResolvedValue({ rows: [] })
  const db = {
    beginTransaction: vi.fn().mockResolvedValue('tx'),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    sessions: { tx: { db: { execute } } },
  }
  const findByID = vi.fn().mockImplementation(async (o) =>
    o.collection === 'tenants'
      ? tenant
      : {
          id: 99,
          tenant: 101,
          _status: 'published',
          slug: `geo-${id.replaceAll('-', '')}-v2-zh`,
          title: articleToPublish.title,
        },
  )
  const find = vi.fn().mockImplementation(async (o) => ({
    docs: o.collection === 'news-categories' || o.collection === 'categories' ? [category] : [],
  }))
  const create = vi.fn().mockImplementation(async (o) => ({ id: 99, ...o.data }))
  return {
    payload: { db, findByID, find, create } as unknown as Payload,
    db,
    execute,
    findByID,
    find,
    create,
  }
}
beforeEach(() => vi.clearAllMocks())
describe('GEO publication selection and rich text preservation', () => {
  it('validates IDs, collections, category and strict bounded UTC schedule', () => {
    const input = { articleID: id, version: 2, collection: 'news', categoryID: 10, publishAt: null }
    expect(parseGeoPublishInput(input).articleID).toBe(id)
    for (const update of [
      { collection: 'products' },
      { categoryID: -1 },
      { categoryID: '10' },
      { version: 0 },
      { publishAt: new Date().toISOString() },
      { publishAt: '2026-12-20T10:00' },
    ])
      expect(() => parseGeoPublishInput({ ...input, ...update })).toThrow()
    expect(
      parseGeoPublishInput({ ...input, publishAt: new Date(Date.now() + 120000).toISOString() })
        .publishAt,
    ).toBeTruthy()
    expect(geoPublishURL(target, id, 2)).toBe(
      `https://fixture.fixture.example/zh/news/geo-${id.replaceAll('-', '')}-v2-zh`,
    )
  })
  it('preserves links, format, list order and group images in CMS Lexical content', () => {
    const lexical = geoArticleToLexical(article),
      serialized = JSON.stringify(lexical)
    expect(serialized).toContain(source.url)
    expect(serialized).toContain('产品资料')
    expect(serialized).toContain('"format":1')
    expect(serialized).toContain('"value":1001')
    expect(serialized).toContain('"value":2')
    expect(lexical.root.children.map((n) => n.type)).toEqual([
      'heading',
      'paragraph',
      'upload',
      'list',
    ])
  })
  it('preserves table, heading, alignment and inline styles supported by the reference editor', () => {
    const lexical = geoArticleToLexical({
      ...article,
      html: '<h5 style="text-align:center"><span style="font-size:24px;color:#e11d48">规格对照</span></h5><table><tbody><tr><th>项目</th><th>说明</th></tr><tr><td>额定电流</td><td><strong>按负载选择</strong></td></tr></tbody></table>',
    })
    const heading = lexical.root.children[0] as unknown as {
      tag: string
      format: string
      children: { style: string }[]
    }
    const table = lexical.root.children[1] as unknown as {
      type: string
      children: { type: string; children: { type: string; headerState: number }[] }[]
    }
    expect(heading).toMatchObject({ tag: 'h5', format: 'center' })
    expect(heading.children[0].style).toContain('font-size:24px')
    expect(heading.children[0].style).toContain('color:#e11d48')
    expect(table.type).toBe('table')
    expect(table.children[0].type).toBe('tablerow')
    expect(table.children[0].children[0]).toMatchObject({ type: 'tablecell', headerState: 1 })
    expect(JSON.stringify(table)).toContain('按负载选择')
  })
  it('rejects malformed structure and foreign media/citations instead of losing them', () => {
    for (const html of [
      '<p><strong>资料</p>',
      '<img src="/other.jpg">',
      '<a href="https://other.example">资料</a>',
    ])
      expect(() => geoArticleToLexical({ ...article, html })).toThrow()
  })
  it('enforces current tenant category and default locale and active site', async () => {
    const m = mockPayload()
    await expect(
      loadGeoPublishTarget(m.payload, user, 101, 'news', 10, 'en'),
    ).rejects.toMatchObject({ code: 'PUBLISH_LANGUAGE' })
    m.findByID.mockResolvedValueOnce({ ...tenant, status: 'suspended' })
    await expect(
      loadGeoPublishTarget(m.payload, user, 101, 'news', 10, 'zh'),
    ).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHED' })
    m.find.mockResolvedValueOnce({ docs: [] })
    await expect(
      loadGeoPublishTarget(m.payload, user, 101, 'news', 20, 'zh'),
    ).rejects.toMatchObject({ code: 'INVALID_CATEGORY' })
    expect(m.find.mock.calls[0][0]).toMatchObject({
      overrideAccess: false,
      where: { and: [{ id: { equals: 20 } }, { tenant: { equals: 101 } }] },
    })
  })
  it('allows saving a draft target for an unpublished tenant while keeping publication gated', async () => {
    const m = mockPayload()
    m.findByID.mockResolvedValue({ ...tenant, status: 'draft' })
    await expect(
      loadGeoPublishTarget(m.payload, user, 101, 'news', 10, 'zh', undefined, {
        allowUnpublished: true,
      }),
    ).resolves.toMatchObject({ collection: 'news', categoryID: 10, locale: 'zh' })
    await expect(
      loadGeoPublishTarget(m.payload, user, 101, 'news', 10, 'zh'),
    ).rejects.toMatchObject({ code: 'SITE_NOT_PUBLISHED' })
  })
})
describe('GEO CMS and publication ledger transaction boundary', () => {
  it('creates a new published document and readback in the same scoped transaction then commits', async () => {
    const m = mockPayload()
    const result = await commitGeoPublication(m.payload, user, item, article)
    expect(result.id).toBe(99)
    expect(m.db.commitTransaction).toHaveBeenCalledWith('tx')
    expect(m.db.rollbackTransaction).not.toHaveBeenCalled()
    expect(m.create).toHaveBeenCalledTimes(1)
    expect(m.create.mock.calls[0][0]).toMatchObject({
      collection: 'news',
      overrideAccess: false,
      locale: 'zh',
      data: { tenant: 101, _status: 'published', category: 10, cover: 1001 },
      req: { transactionID: 'tx', user },
    })
    for (const call of m.find.mock.calls) expect(call[0].req.transactionID).toBe('tx')
    expect(m.findByID.mock.calls.at(-1)?.[0]).toMatchObject({
      collection: 'news',
      req: { transactionID: 'tx' },
      draft: false,
    })
  })
  it('publishes a directly written article without requiring a material group or cover image', async () => {
    const noImageArticle = {
      ...article,
      html: article.html.replace(/<p><img\b[^>]*><\/p>/u, ''),
      context: {
        ...article.context,
        settings: { ...article.context.settings, name: '手动创作', imagesPerArticle: 0 },
        materialGroup: { id: '', version: 0, images: [] },
      },
    } as GeoArticle
    const m = mockPayload(noImageArticle)
    const result = await commitGeoPublication(
      m.payload,
      user,
      { ...item, snapshot: noImageArticle },
      noImageArticle,
    )
    expect(result.id).toBe(99)
    expect(m.execute).toHaveBeenCalledTimes(7)
    expect(m.db.commitTransaction).toHaveBeenCalledWith('tx')
  })
  it('never creates site content after lease loss, article change or a conflicting target slug', async () => {
    const lost = mockPayload()
    lost.execute.mockReset().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
    await expect(commitGeoPublication(lost.payload, user, item, article)).rejects.toMatchObject({
      code: 'LEASE_LOST',
    })
    expect(lost.create).not.toHaveBeenCalled()
    const changed = mockPayload()
    changed.execute
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ ...article, version: 3 }] })
    await expect(commitGeoPublication(changed.payload, user, item, article)).rejects.toMatchObject({
      code: 'ARTICLE_CHANGED',
    })
    expect(changed.create).not.toHaveBeenCalled()
    const conflict = mockPayload()
    conflict.find.mockImplementation(async (o) => ({
      docs: o.collection === 'news' ? [{ id: 55 }] : [category],
    }))
    await expect(commitGeoPublication(conflict.payload, user, item, article)).rejects.toMatchObject(
      { code: 'TARGET_CONFLICT' },
    )
    expect(conflict.create).not.toHaveBeenCalled()
    expect(conflict.db.rollbackTransaction).toHaveBeenCalled()
  })
  it('rolls back on readback failure or ledger fencing loss; commit ambiguity is not declared failed/success', async () => {
    const bad = mockPayload()
    bad.findByID.mockImplementation(async (o) =>
      o.collection === 'tenants' ? tenant : { _status: 'draft' },
    )
    await expect(commitGeoPublication(bad.payload, user, item, article)).rejects.toMatchObject({
      code: 'TARGET_READBACK_FAILED',
    })
    expect(bad.db.rollbackTransaction).toHaveBeenCalledWith('tx')
    expect(bad.db.commitTransaction).not.toHaveBeenCalled()
    const fenced = mockPayload()
    fenced.execute
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [article] })
      .mockResolvedValueOnce({ rows: [image] })
      .mockResolvedValueOnce({ rows: [] })
    await expect(commitGeoPublication(fenced.payload, user, item, article)).rejects.toMatchObject({
      code: 'LEASE_LOST',
    })
    expect(fenced.db.rollbackTransaction).toHaveBeenCalled()
    const uncertain = mockPayload()
    uncertain.db.commitTransaction.mockRejectedValue(new Error('connection lost'))
    await expect(commitGeoPublication(uncertain.payload, user, item, article)).rejects.toThrow(
      'PUBLICATION_COMMIT_UNCONFIRMED',
    )
  })
})

it('attaches the configured website and Blog without reading their content', () => {
  const linked = {
    ...article,
    html: '<p>配电柜选型说明。</p>',
    context: {
      ...article.context,
      writingMode: 'keyword' as const,
      sources: [],
      optimization: {
        ...article.context.optimization,
        website: 'https://fixture.example/',
        blog: 'https://blog.fixture.example/',
      },
    },
  }
  const content = JSON.stringify(geoArticleToLexical(linked))
  expect(content).toContain('https://fixture.example/')
  expect(content).toContain('https://blog.fixture.example/')
  expect(content).toContain('官方网站')
})
