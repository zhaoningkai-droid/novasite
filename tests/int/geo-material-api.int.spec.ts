import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const fixtures = vi.hoisted(() => ({ scope: vi.fn(), query: vi.fn(), connect: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
  workspaceSettingsScope: fixtures.scope,
}))
import { handleGeoMaterials } from '../../src/platform/geo/material-api'
const url = 'http://localhost:3100/api/workspace/fixture/geo/materials'
const id = '86e78899-18d8-44cf-b6f1-00c99ec8d3c7'
const patch = (body: object) =>
  new Request(url + '/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3100' },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  vi.clearAllMocks()
  fixtures.scope.mockResolvedValue({
    company: { id: 101 },
    user: { id: 1, roles: ['editor'] },
    payload: { db: { pool: { query: fixtures.query, connect: fixtures.connect } } },
  })
})
describe('GEO material API boundaries', () => {
  it('does not touch storage when the current customer or session is invalid', async () => {
    fixtures.scope.mockResolvedValueOnce({
      error: NextResponse.json({ message: '拒绝' }, { status: 403 }),
    })
    expect((await handleGeoMaterials(new Request(url), 'fixture')).status).toBe(403)
    expect(fixtures.query).not.toHaveBeenCalled()
    expect(fixtures.connect).not.toHaveBeenCalled()
  })
  it('prevents editors from archiving groups via forged requests', async () => {
    expect(
      (await handleGeoMaterials(patch({ version: 1, archived: true }), 'fixture', id)).status,
    ).toBe(403)
    expect(fixtures.query).not.toHaveBeenCalled()
  })
  it('rejects a caller-supplied tenant before beginning a write transaction', async () => {
    expect(
      (
        await handleGeoMaterials(
          patch({ tenantID: 202, name: '图片', mediaIds: [] }),
          'fixture',
          id,
        )
      ).status,
    ).toBe(422)
    expect(fixtures.connect).not.toHaveBeenCalled()
  })
  it('always scopes material listing to the authorized tenant', async () => {
    fixtures.query.mockResolvedValueOnce({ rows: [{ total: 0, items: [] }] })
    expect((await handleGeoMaterials(new Request(url), 'fixture')).status).toBe(200)
    expect(fixtures.query.mock.calls[0][1][0]).toBe(101)
  })
})
