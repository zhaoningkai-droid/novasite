import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createGeoTaskStore,
  geoTaskAvailableCount,
  type GeoTaskListItem,
} from '../../src/platform/geo/task-store'
import { createGeoArticleStore, geoArticleFingerprint } from '../../src/platform/geo/article-store'
import { buildArticleContext } from '../../src/platform/geo/article-context'
import type { GeoTaskValues } from '../../src/platform/geo/tasks'

const taskID = randomUUID(),
  groupID = randomUUID(),
  configID = randomUUID()
function savedTask(count = 3) {
  const settings: GeoTaskValues = {
    name: '配电柜选型',
    optimizationID: configID,
    optimizationVersion: 1,
    locale: 'zh',
    questionSource: 'original',
    questions: Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      term: '低压配电柜',
      intent: 'default',
      original: `低压配电柜选型问题${index}？`,
      translated: '',
      translatedFrom: '',
      translatedLocale: '',
    })),
    materialGroupID: groupID,
    materialGroupVersion: 1,
    imagesPerArticle: 1,
    direction: '产品介绍',
    length: 'short',
    mode: 'deduplicate',
    count,
  }
  const snapshot = {
    optimization: {
      id: configID,
      version: 1,
      brand: '测试电气',
      aliases: [],
      core: '配电柜',
      terms: ['低压配电柜'],
      website: 'https://fixture.example/',
      blog: '',
      termLinks: [
        { term: '低压配电柜', website: 'https://fixture.example/products/cabinet', blog: '' },
      ],
    },
    materialGroup: {
      id: groupID,
      version: 1,
      images: [
        { id: 1001, url: '/api/media/file/cabinet.jpg', filename: 'cabinet.jpg', alt: '配电柜' },
      ],
    },
    sources: [
      {
        url: 'https://fixture.example/products/cabinet',
        kind: 'site',
        title: '低压配电柜',
        excerpt: '低压配电柜适用场景与选型说明。',
        terms: ['低压配电柜'],
      },
    ],
  }
  return { settings, snapshot }
}

describe('GEO list metadata from the requested task and creation-record columns', () => {
  it('deducts existing enqueue fingerprints, including failed jobs, without inventing capacity from the question count', () => {
    const { settings, snapshot } = savedTask()
    const key = geoArticleFingerprint(
      buildArticleContext(settings, snapshot, settings.questions[0], 0),
    )
    expect(geoTaskAvailableCount(settings, snapshot, 'ready')).toBe(3)
    expect(geoTaskAvailableCount(settings, snapshot, 'ready', [key])).toBe(2)
    expect(geoTaskAvailableCount(settings, snapshot, 'waiting_sources', [])).toBe(3)
    expect(geoTaskAvailableCount(settings, { ...snapshot, sources: [] }, 'ready')).toBe(3)
    expect(geoTaskAvailableCount({ ...settings, imagesPerArticle: 2 }, snapshot, 'ready')).toBe(0)
    expect(geoTaskAvailableCount({ ...settings, direction: '企业榜单' }, snapshot, 'ready')).toBe(3)
  })
  it('caps a repeated request by saved batch count, actual eligible questions and the ten-article request limit', () => {
    const { settings, snapshot } = savedTask(20)
    const key = geoArticleFingerprint(
      buildArticleContext(settings, snapshot, settings.questions[0], 0),
    )
    expect(geoTaskAvailableCount({ ...settings, mode: 'repeat' }, snapshot, 'ready', [key])).toBe(
      10,
    )
    expect(
      geoTaskAvailableCount({ ...settings, mode: 'repeat', count: 2 }, snapshot, 'ready', [key]),
    ).toBe(2)
    expect(geoTaskAvailableCount({ ...settings, count: 0 }, snapshot, 'ready')).toBe(0)
  })
  it('returns task totals and per-tenant queue capacity while keeping saved settings and source snapshots internal', async () => {
    const { settings, snapshot } = savedTask()
    const key = geoArticleFingerprint(
      buildArticleContext(settings, snapshot, settings.questions[0], 0),
    )
    const row: Omit<GeoTaskListItem, 'available_count'> = {
      id: taskID,
      name: settings.name,
      version: 1,
      status: 'ready',
      updated_at: '2026-10-17T00:00:00Z',
      locale: 'zh',
      questions: 3,
      direction: '产品介绍',
      count: 3,
      generated_count: 2,
      used_count: 1,
      generation_state: 'running',
      related_plan_count: 1,
    }
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 21, items: [{ ...row, settings, snapshot }] }] })
      .mockResolvedValueOnce({ rows: [{ dedup_key: key }] })
    const result = await createGeoTaskStore({ query, connect: vi.fn() }, 101, 1).list(
      '配电柜',
      2,
      'zh',
      10,
    )
    expect(result).toMatchObject({
      total: 21,
      page: 2,
      pageSize: 10,
      items: [{ ...row, available_count: 2 }],
    })
    expect(result.items[0]).not.toHaveProperty('settings')
    expect(result.items[0]).not.toHaveProperty('snapshot')
    expect(query.mock.calls[0][1]).toEqual([101, '配电柜', 10, 'zh', 10])
    expect(query.mock.calls[1][1][0]).toBe(101)
    const sql = query.mock.calls[0][0] as string
    expect(sql).toContain('p.tenant_id=t.tenant_id')
    expect(sql).toContain('source.tenant_id=t.tenant_id')
    expect(sql).toContain("p.state='published'")
    expect(sql).toContain('article.tenant_id=t.tenant_id')
    expect(sql).toContain('WHERE tenant_id=t.tenant_id AND task_id=t.id')
  })
  it('filters creation records and their total before pagination, with tenant-scoped task and publication joins', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ total: 0, items: [] }] })
    await createGeoArticleStore({ query, connect: vi.fn() }, 202, 1).list(
      ' CABINET ',
      2,
      taskID,
      { use: 'occupied', locale: 'en', taskName: '  TEST TASK  ' },
      10,
    )
    expect(query.mock.calls[0][1]).toEqual([
      202,
      'cabinet',
      taskID,
      10,
      'en',
      'occupied',
      'test task',
      10,
    ])
    const sql = query.mock.calls[0][0] as string
    expect(sql).toContain("p.tenant_id=a.tenant_id AND p.article_id=a.id AND p.state='published'")
    expect(sql).toContain("p.tenant_id=a.tenant_id AND p.article_id=a.id AND p.state<>'cancelled'")
    expect(sql).toContain('t.tenant_id=a.tenant_id AND t.id=a.task_id')
    expect(sql).toContain(
      "position($7 in lower(coalesce(t.name,a.context->'settings'->>'name','')))>0",
    )
    expect(sql).toContain(
      "filtered AS (SELECT * FROM classified WHERE $6='all' OR publication_status=$6)",
    )
    expect(sql).toContain('(SELECT count(*)::int FROM filtered) AS total')
    expect(sql.indexOf('publication_status=$6')).toBeLessThan(sql.indexOf('LIMIT $8 OFFSET $4'))
    expect(sql).toContain('a.created_at')
    expect(sql).toContain('a.summary')
  })
  it('preserves the existing unfiltered article-store call signature', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ total: 0, items: [] }] })
    await createGeoArticleStore({ query, connect: vi.fn() }, 101, 1).list('', 1, null)
    expect(query.mock.calls[0][1]).toEqual([101, '', null, 0, '', 'all', '', 10])
  })
})
