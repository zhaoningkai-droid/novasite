import { beforeEach, describe, it, expect, vi } from 'vitest'
import { NextResponse } from 'next/server'
const fixture = vi.hoisted(() => ({ scope: vi.fn(), query: vi.fn(), connect: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  workspaceSettingsScope: fixture.scope,
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
}))
import { handleKnowledge } from '../../src/platform/knowledge/api'
const url = 'http://localhost:3100/api/workspace/fixture/knowledge',
  id = 'c8cbb897-ef0f-4ae8-b80c-41edca3f7266'
const request = (method: string, body: object, origin = 'http://localhost:3100') =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json', origin },
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
describe('knowledge API authenticated tenant boundaries', () => {
  it.each([401, 403, 409])(
    'returns scope failure %s before querying or parsing any customer data',
    async (status) => {
      fixture.scope.mockResolvedValue({
        error: NextResponse.json({ message: 'Forbidden' }, { status }),
      })
      expect((await handleKnowledge(new Request(url), 'fixture')).status).toBe(status)
      expect(fixture.query).not.toHaveBeenCalled()
    },
  )
  it('rejects cross-site writes before lookup', async () => {
    expect(
      (await handleKnowledge(request('PUT', { name: 'A' }, 'https://other.invalid'), 'fixture'))
        .status,
    ).toBe(403)
    expect(fixture.scope).not.toHaveBeenCalled()
  })
  it('does not accept caller-controlled customer ownership', async () => {
    expect(
      (await handleKnowledge(request('PUT', { name: 'A', tenantID: 202 }), 'fixture')).status,
    ).toBe(422)
    expect(fixture.query).not.toHaveBeenCalled()
  })
  it('returns 404 for another customer file or download', async () => {
    fixture.query.mockResolvedValue({ rows: [] })
    expect((await handleKnowledge(new Request(`${url}/${id}`), 'fixture', id)).status).toBe(404)
    expect(
      (await handleKnowledge(new Request(`${url}/${id}?download=1`), 'fixture', id)).status,
    ).toBe(404)
    for (const [, values] of fixture.query.mock.calls) expect(values[0]).toBe(101)
  })
  it('guards stale knowledge edits by version', async () => {
    fixture.query.mockResolvedValue({ rows: [] })
    expect(
      (await handleKnowledge(request('PATCH', { version: 1, enabled: false }), 'fixture', id))
        .status,
    ).toBe(409)
    expect(fixture.query.mock.calls[0][1].slice(0, 3)).toEqual([101, id, 1])
  })
  it('does not persist an empty text document', async () => {
    expect(
      (
        await handleKnowledge(
          request('POST', { action: 'text', title: 'Example', text: ' ' }),
          'fixture',
        )
      ).status,
    ).toBe(422)
    expect(fixture.query).not.toHaveBeenCalled()
  })
})
