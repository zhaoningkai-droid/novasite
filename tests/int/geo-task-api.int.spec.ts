import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const fixture = vi.hoisted(() => ({ scope: vi.fn(), query: vi.fn(), connect: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
  workspaceSettingsScope: fixture.scope,
}))
import { handleGeoTasks } from '../../src/platform/geo/task-api'
import { handleGeoAI } from '../../src/platform/geo/ai-api'
const url = 'http://localhost:3100/api/workspace/fixture/geo/tasks'
const post = (body: object, origin = 'http://localhost:3100') =>
  new Request(url, {
    method: 'POST',
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
describe('GEO task and AI authenticated boundaries', () => {
  it('does not read storage or call providers when tenant scope is denied', async () => {
    fixture.scope.mockImplementation(async () => ({
      error: NextResponse.json({ message: '当前客户不符' }, { status: 409 }),
    }))
    expect((await handleGeoTasks(new Request(url), 'fixture')).status).toBe(409)
    expect((await handleGeoAI(post({}), 'fixture')).status).toBe(409)
    expect(fixture.query).not.toHaveBeenCalled()
    expect(fixture.connect).not.toHaveBeenCalled()
  })
  it('rejects cross-site writes and forged tenant ownership before a transaction', async () => {
    expect((await handleGeoTasks(post({}, 'https://other.example'), 'fixture')).status).toBe(403)
    expect((await handleGeoAI(post({ tenantID: 202 }), 'fixture')).status).toBe(422)
    expect(fixture.query).not.toHaveBeenCalled()
    expect(fixture.connect).not.toHaveBeenCalled()
  })
  it('scopes task lists and operation recovery to the authorized customer', async () => {
    fixture.query.mockResolvedValueOnce({ rows: [{ total: 0, items: [] }] })
    expect((await handleGeoTasks(new Request(url), 'fixture')).status).toBe(200)
    expect(fixture.query.mock.calls[0][1][0]).toBe(101)
    fixture.query.mockResolvedValueOnce({ rows: [] })
    expect(
      (
        await handleGeoAI(
          new Request(url + '?optimizationID=34add9d8-6e35-4465-b1d2-616694046326'),
          'fixture',
        )
      ).status,
    ).toBe(200)
    expect(fixture.query.mock.calls[1][1][0]).toBe(101)
  })
  it('does not reveal another customer task', async () => {
    fixture.query.mockResolvedValueOnce({ rows: [] })
    const response = await handleGeoTasks(
      new Request(url),
      'fixture',
      '34add9d8-6e35-4465-b1d2-616694046326',
    )
    expect(response.status).toBe(404)
    expect(fixture.query.mock.calls[0][1][0]).toBe(101)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })
  it('passes a valid language filter to task SQL and rejects unknown languages before reading storage', async () => {
    fixture.query.mockResolvedValueOnce({ rows: [{ total: 0, items: [] }] })
    expect((await handleGeoTasks(new Request(url + '?locale=en&page=2'), 'fixture')).status).toBe(
      200,
    )
    expect(fixture.query.mock.calls[0][1]).toEqual([101, '', 10, 'en', 10])
    fixture.query.mockResolvedValueOnce({ rows: [{ total: 0, items: [] }] })
    expect(
      (await handleGeoTasks(new Request(url + '?locale=en&page=2&pageSize=20'), 'fixture')).status,
    ).toBe(200)
    expect(fixture.query.mock.calls[1][1]).toEqual([101, '', 20, 'en', 20])
    fixture.query.mockClear()
    expect(
      (await handleGeoTasks(new Request(url + '?locale=not-a-language'), 'fixture')).status,
    ).toBe(422)
    expect(fixture.query).not.toHaveBeenCalled()
  })
})
