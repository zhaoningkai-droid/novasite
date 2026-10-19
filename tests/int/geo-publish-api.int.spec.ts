import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const f = vi.hoisted(() => ({ scope: vi.fn(), query: vi.fn(), connect: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
  workspaceSettingsScope: f.scope,
}))
vi.mock('../../src/platform/site', () => ({ getBaseURL: () => 'https://fixture.example' }))
import {
  handleGeoPublishing,
  signGeoPublishPreview,
  verifyGeoPublishPreview,
} from '../../src/platform/geo/publish-api'
const url = 'http://localhost:3100/api/workspace/fixture/geo/publish',
  id = '34add9d8-6e35-4465-b1d2-616694046326'
const write = (body: object, origin = 'http://localhost:3100') =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.clearAllMocks()
  f.scope.mockResolvedValue({
    company: { id: 101 },
    user: { id: 1 },
    payload: { db: { pool: { query: f.query, connect: f.connect } } },
  })
})
describe('GEO publish API ownership and signed confirmation', () => {
  it('returns the published snapshot and actual URL for the article preview', async () => {
    f.query
      .mockResolvedValueOnce({
        rows: [
          {
            id,
            article_id: id,
            article_version: 1,
            state: 'published',
            target_url: 'https://fixture.example/zh/news/published',
            snapshot: {
              title: '发布时的标题',
              html: '<p onclick="bad()">发布时的正文</p>',
              context: {
                sources: [],
                materialGroup: { images: [] },
                knowledge: [{ text: '内部知识' }],
              },
            },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
    const response = await handleGeoPublishing(new Request(`${url}/${id}`), 'fixture', id)
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.item).toMatchObject({
      title: '发布时的标题',
      html: '<p>发布时的正文</p>',
      target_url: 'https://fixture.example/zh/news/published',
    })
    expect(JSON.stringify(result)).not.toContain('内部知识')
    expect(f.query.mock.calls[0][1]).toEqual([101, id])
  })
  it('rejects expired/altered previews and cross-tenant/actor signatures', () => {
    const now = Date.now(),
      expiry = now + 200000,
      signature = signGeoPublishPreview('hash', expiry, 101, 1, 'fixture-secret')
    expect(verifyGeoPublishPreview(signature, 'hash', expiry, 101, 1, 'fixture-secret', now)).toBe(
      true,
    )
    for (const args of [
      [signature, 'changed', expiry, 101, 1],
      [signature, 'hash', expiry, 202, 1],
      [signature, 'hash', expiry, 101, 2],
      [signature, 'hash', now - 1, 101, 1],
      ['invalid', 'hash', expiry, 101, 1],
    ])
      expect(
        verifyGeoPublishPreview(
          args[0],
          args[1] as string,
          args[2],
          args[3] as number,
          args[4] as number,
          'fixture-secret',
          now,
        ),
      ).toBe(false)
  })
  it('requires authorized scope before querying or writing', async () => {
    f.scope.mockResolvedValue({ error: NextResponse.json({ message: '禁止' }, { status: 403 }) })
    expect((await handleGeoPublishing(new Request(url), 'fixture')).status).toBe(403)
    expect(f.query).not.toHaveBeenCalled()
    expect(f.connect).not.toHaveBeenCalled()
  })
  it('blocks cross-site writes, spoofed tenant/context and fake published state', async () => {
    expect((await handleGeoPublishing(write({}, 'https://other.example'), 'fixture')).status).toBe(
      403,
    )
    expect((await handleGeoPublishing(write({ tenantID: 202 }), 'fixture')).status).toBe(422)
    expect(
      (
        await handleGeoPublishing(
          write({ action: 'published', state: 'published', target_id: 2 }),
          'fixture',
        )
      ).status,
    ).toBe(422)
    expect(f.query).not.toHaveBeenCalled()
    expect(f.connect).not.toHaveBeenCalled()
  })
  it('scopes records and mutations by authorized tenant regardless of guessed UUID', async () => {
    f.query.mockResolvedValueOnce({ rows: [{ items: [], total: 0 }] })
    expect((await handleGeoPublishing(new Request(url), 'fixture')).status).toBe(200)
    expect(f.query.mock.calls[0][1][0]).toBe(101)
    f.query.mockResolvedValueOnce({ rows: [] })
    expect((await handleGeoPublishing(new Request(url), 'fixture', id)).status).toBe(404)
    expect(f.query.mock.calls[1][1]).toEqual([101, id])
    f.query.mockResolvedValueOnce({ rows: [] })
    expect((await handleGeoPublishing(write({ action: 'retry', id }), 'fixture')).status).toBe(409)
    expect(f.query.mock.calls[2][1][0]).toBe(101)
  })
  it('applies reference filters, status tabs, and page size within the active tenant', async () => {
    f.scope.mockResolvedValue({
      company: { id: 101, name: '测试客户' },
      user: { id: 1 },
      payload: { db: { pool: { query: f.query, connect: f.connect } } },
    })
    f.query.mockResolvedValueOnce({ rows: [{ items: [], total: 0, counts: {} }] })
    const response = await handleGeoPublishing(
      new Request(
        `${url}?page=2&pageSize=20&tab=publishing&title=%E6%B5%8B%E8%AF%95&account=fixture&plan=weekly&platform=posts&startDate=2026-10-01&endDate=2026-10-17`,
      ),
      'fixture',
    )
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({
      page: 2,
      pageSize: 20,
      total: 0,
      counts: { pending: 0, publishing: 0, published: 0, failed: 0 },
    })
    const [sql, values] = f.query.mock.calls[0]
    expect(sql).toContain("item.state='awaiting_review'")
    expect(sql).toContain('WHERE p.tenant_id=$1')
    expect(values).toEqual([
      101,
      '测试',
      'fixture',
      'weekly',
      'posts',
      '2026-10-01',
      '2026-10-17',
      'publishing',
      20,
      20,
      '测试客户',
    ])
  })
  it('rejects malformed dates, reversed ranges, and unsupported page sizes before querying', async () => {
    expect(
      (await handleGeoPublishing(new Request(`${url}?startDate=2026-02-30`), 'fixture')).status,
    ).toBe(422)
    expect(
      (
        await handleGeoPublishing(
          new Request(`${url}?startDate=2026-10-18&endDate=2026-10-17`),
          'fixture',
        )
      ).status,
    ).toBe(422)
    expect((await handleGeoPublishing(new Request(`${url}?pageSize=12`), 'fixture')).status).toBe(
      422,
    )
    expect(f.query).not.toHaveBeenCalled()
  })
})
