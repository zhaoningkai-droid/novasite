import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const fixtures = vi.hoisted(() => ({ scope: vi.fn(), query: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
  workspaceSettingsScope: fixtures.scope,
}))
import { handleGeoKeywords } from '../../src/platform/geo/keyword-api'

const url = 'http://localhost:3100/api/workspace/fixture-a/geo/keywords'
const body = {
  requestId: 'b87d6c20-92b4-489e-83fb-39d743ebf314',
  brand: '测试品牌',
  aliases: '',
  core: '配电柜',
  terms: Array.from({ length: 10 }, (_, i) => `测试${i + 1}配电柜`),
  website: 'https://fixture.example/',
  blog: '',
}
const post = (value: unknown, origin = 'http://localhost:3100') =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(value),
  })
// Auth scope is mocked; these tests verify that denied scopes never reach SQL.
// Real tenant SQL, concurrency and persistence are verified by verify-geo-keywords.mts.
beforeEach(() => {
  vi.clearAllMocks()
  fixtures.scope.mockResolvedValue({
    company: { id: 101 },
    user: { id: 5 },
    payload: { db: { pool: { query: fixtures.query } } },
  })
})
describe('GEO keyword API boundaries', () => {
  it('returns expired-login, forbidden and changed-company errors without reading storage', async () => {
    for (const status of [401, 403, 409]) {
      fixtures.scope.mockResolvedValueOnce({
        error: NextResponse.json({ message: '拒绝' }, { status }),
      })
      expect((await handleGeoKeywords(new Request(url), 'fixture-a')).status).toBe(status)
    }
    expect(fixtures.query).not.toHaveBeenCalled()
  })
  it('rejects cross-site mutation before resolving company or writing data', async () => {
    expect(
      (await handleGeoKeywords(post(body, 'https://external.example'), 'fixture-a')).status,
    ).toBe(403)
    expect(fixtures.scope).not.toHaveBeenCalled()
    expect(fixtures.query).not.toHaveBeenCalled()
  })
  it('rejects forged ownership and invalid fields on the server', async () => {
    for (const value of [
      { ...body, tenantID: 202 },
      { ...body, terms: [] },
      { ...body, website: 'javascript:alert(1)' },
    ])
      expect((await handleGeoKeywords(post(value), 'fixture-a')).status).toBe(422)
    expect(fixtures.query).not.toHaveBeenCalled()
  })
  it('uses the authorized customer for list reads and does not cache private results', async () => {
    fixtures.query.mockResolvedValueOnce({ rows: [{ total: 0, items: [] }] })
    const response = await handleGeoKeywords(new Request(`${url}?q=abc&page=2`), 'fixture-a')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(fixtures.query.mock.calls[0][1]).toEqual([101, 'abc', 20, 20])
  })
  it('returns missing records without exposing another customer', async () => {
    fixtures.query.mockResolvedValueOnce({ rows: [] })
    const response = await handleGeoKeywords(new Request(url), 'fixture-a', body.requestId)
    expect(response.status).toBe(404)
    expect(fixtures.query.mock.calls[0][1]).toEqual([101, body.requestId])
  })
  it('does not fake success or expose SQL when storage is not installed', async () => {
    fixtures.query.mockRejectedValueOnce(
      Object.assign(new Error('private connection details'), { code: '42P01' }),
    )
    const response = await handleGeoKeywords(new Request(url), 'fixture-a')
    const result = await response.json()
    expect(response.status).toBe(503)
    expect(result.code).toBe('GEO_STORAGE_NOT_READY')
    expect(JSON.stringify(result)).not.toContain('private connection details')
  })
})
