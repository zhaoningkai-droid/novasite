import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const fixture = vi.hoisted(() => ({ scope: vi.fn(), query: vi.fn(), connect: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
  workspaceSettingsScope: fixture.scope,
}))
import { handleGeoArticles, handleGeoGeneration } from '../../src/platform/geo/article-api'
const url = 'http://localhost:3100/api/workspace/fixture/geo/articles',
  id = '34add9d8-6e35-4465-b1d2-616694046326'
const write = (body: object, origin = 'http://localhost:3100') =>
  new Request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.clearAllMocks()
  fixture.scope.mockResolvedValue({
    company: { id: 101 },
    user: { id: 1 },
    payload: { db: { pool: { query: fixture.query, connect: fixture.connect } } },
  })
})
describe('GEO articles authenticated ownership boundary', () => {
  it('rejects missing tenant scope before any SQL or provider operation', async () => {
    fixture.scope.mockImplementation(async () => ({
      error: NextResponse.json({ message: '禁止' }, { status: 403 }),
    }))
    expect((await handleGeoArticles(new Request(url), 'fixture')).status).toBe(403)
    expect((await handleGeoGeneration(new Request(url), 'fixture')).status).toBe(403)
    expect(fixture.query).not.toHaveBeenCalled()
    expect(fixture.connect).not.toHaveBeenCalled()
  })
  it('rejects cross-site writes and caller-controlled tenant or context ownership', async () => {
    expect(
      (await handleGeoArticles(write({}, 'https://other.example'), 'fixture', id)).status,
    ).toBe(403)
    expect((await handleGeoArticles(write({ tenantID: 202 }), 'fixture', id)).status).toBe(422)
    expect(
      (await handleGeoArticles(write({ version: 1, context: { tenantID: 202 } }), 'fixture', id))
        .status,
    ).toBe(422)
    expect(fixture.query).not.toHaveBeenCalled()
    expect(fixture.connect).not.toHaveBeenCalled()
  })
  it('always scopes lists, histories and job reads to the current tenant', async () => {
    fixture.query.mockResolvedValueOnce({ rows: [{ total: 0, items: [] }] })
    expect((await handleGeoArticles(new Request(url), 'fixture')).status).toBe(200)
    expect(fixture.query.mock.calls[0][1][0]).toBe(101)
    fixture.query.mockResolvedValueOnce({ rows: [] })
    expect((await handleGeoGeneration(new Request(url + `?taskID=${id}`), 'fixture')).status).toBe(
      200,
    )
    expect(fixture.query.mock.calls[1][1][0]).toBe(101)
    fixture.query.mockResolvedValueOnce({ rows: [] })
    expect((await handleGeoArticles(new Request(url + `?version=1`), 'fixture', id)).status).toBe(
      404,
    )
    expect(fixture.query.mock.calls[2][1][0]).toBe(101)
  })
  it('still rejects a stale revision without requiring an extra review checkbox', async () => {
    fixture.query.mockResolvedValueOnce({ rows: [{ id, version: 2 }] })
    const response = await handleGeoArticles(
      write({
        version: 1,
        ready: true,
        title: 'title',
        summary: '',
        html: '<p>content</p>',
        factsReviewed: false,
      }),
      'fixture',
      id,
    )
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('VERSION_CONFLICT')
    expect(fixture.connect).not.toHaveBeenCalled()
  })
  it('accepts every requested publication filter and sends it to the tenant-scoped SQL query', async () => {
    for (const use of ['all', 'unused', 'occupied', 'published']) {
      fixture.query.mockResolvedValueOnce({ rows: [{ total: 0, items: [] }] })
      const response = await handleGeoArticles(
        new Request(url + `?use=${use}&locale=en&page=2&taskName=TEST%20TASK`),
        'fixture',
      )
      expect(response.status).toBe(200)
      expect(fixture.query.mock.calls.at(-1)?.[1]).toEqual([
        101,
        '',
        null,
        10,
        'en',
        use,
        'test task',
        10,
      ])
    }
  })
  it('rejects invalid publication or language filters before storage is read', async () => {
    for (const query of [
      'use=made-up',
      'locale=made-up',
      'taskName=' + 'a'.repeat(101),
      'pageSize=30',
    ]) {
      const response = await handleGeoArticles(new Request(url + '?' + query), 'fixture')
      expect(response.status).toBe(422)
      expect((await response.json()).code).toBe('INVALID_QUERY')
    }
    expect(fixture.query).not.toHaveBeenCalled()
  })

  it('creates a direct article from the tenant keyword without requiring a material group or image', async () => {
    const sourceURL = 'https://fixture.example/products/low-voltage-cabinet'
    fixture.scope.mockResolvedValue({
      company: { id: 101, defaultLocale: 'zh' },
      user: { id: 1 },
      payload: { db: { pool: { query: fixture.query, connect: fixture.connect } } },
    })
    fixture.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM platform_geo.optimizations'))
        return {
          rows: [
            {
              id,
              version: 1,
              brand: '测试电气',
              aliases: [],
              core: '配电柜',
              terms: ['低压成套配电柜'],
              website: 'https://fixture.example/',
              blog: '',
              term_links: [{ term: '低压成套配电柜', website: sourceURL, blog: '' }],
            },
          ],
        }
      if (sql.includes('FROM platform_geo.source_pages'))
        return {
          rows: [
            {
              url: sourceURL,
              kind: 'site',
              title: '低压成套配电柜产品页',
              excerpt: '配电柜用于不同的工业供配电场景。',
              terms: ['低压成套配电柜'],
              checked_at: '2026-10-17T00:00:00.000Z',
            },
          ],
        }
      if (sql.includes('FROM public.media')) return { rows: [] }
      throw new Error(`Unexpected pool query: ${sql}`)
    })
    const clientQuery = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK')
        return { rows: [], rowCount: 0 }
      if (sql.includes('SELECT * FROM platform_geo.articles')) return { rows: [] }
      if (sql.includes('INSERT INTO platform_geo.articles'))
        return {
          rows: [
            {
              id: values?.[0],
              tenant_id: 101,
              job_id: null,
              task_id: null,
              task_version: null,
              question_id: null,
              context: JSON.parse(String(values?.[2])),
              title: values?.[3],
              summary: values?.[4],
              html: values?.[5],
              status: 'ready',
              validation: [],
              warnings: [],
              version: 1,
              review_note: '',
              updated_at: '2026-10-17T00:00:00.000Z',
            },
          ],
        }
      if (sql.includes('INSERT INTO platform_geo.article_revisions')) return { rows: [] }
      throw new Error(`Unexpected client query: ${sql}`)
    })
    fixture.connect.mockResolvedValue({ query: clientQuery, release: vi.fn() })

    const request = new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3100' },
      body: JSON.stringify({
        requestId: id,
        optimizationID: id,
        optimizationVersion: 1,
        term: '低压成套配电柜',
        title: '配电柜在工业供电中的应用',
        html: `<p>配电柜用于工业供配电场景。<a href="${sourceURL}">低压成套配电柜产品页</a></p>`,
      }),
    })
    const response = await handleGeoArticles(request, 'fixture')
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result.item).toMatchObject({
      status: 'ready',
      context: { materialGroup: { id: '', images: [] } },
    })
    expect(fixture.query.mock.calls.some(([sql]) => String(sql).includes('material_groups'))).toBe(
      false,
    )
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('public.media'))).toBe(false)
  })
})
