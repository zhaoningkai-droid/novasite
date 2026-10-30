import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const f = vi.hoisted(() => ({ scope: vi.fn(), store: vi.fn(), artifact: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
  workspaceSettingsScope: f.scope,
}))
vi.mock('../../src/platform/geo/detection-store', () => ({ createGeoDetectionStore: f.store }))
import { handleGeoDetection } from '../../src/platform/geo/detection-api'

const url = 'http://localhost:3100/api/workspace/huadong-fasteners/geo/detection'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DATABASE_URL', 'postgres://local@127.0.0.1/local_test')
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'http://localhost:3100')
  f.scope.mockResolvedValue({ company: { id: 2 }, user: { id: 1 }, payload: { db: { pool: {} } } })
  f.store.mockReturnValue({ artifact: f.artifact })
})
afterEach(() => vi.unstubAllEnvs())
describe('GEO local storage API access boundaries', () => {
  it('denies expired login, unauthorized company and switched-company reads/downloads', async () => {
    for (const status of [401, 403, 409]) {
      f.scope.mockResolvedValueOnce({ error: NextResponse.json({ message: '拒绝' }, { status }) })
      expect(
        (await handleGeoDetection(new Request(url), 'huadong-fasteners', randomUUID())).status,
      ).toBe(status)
    }
    expect(f.store).not.toHaveBeenCalled()
  })
  it('only constructs stores from server-authorized IDs and privately streams artifacts', async () => {
    const id = randomUUID()
    f.artifact.mockResolvedValue({
      id,
      kind: 'response',
      payload: Buffer.from('{"sample":true}\n'),
      sha256: 'a'.repeat(64),
    })
    const response = await handleGeoDetection(new Request(url), 'huadong-fasteners', id)
    expect(f.store).toHaveBeenCalledWith({}, 2, 1)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Disposition')).toContain('attachment')
    expect(await response.text()).toBe('{"sample":true}\n')
  })
  it('rejects forged ownership and cross-origin fixture creation without writing', async () => {
    for (const [origin, body, status] of [
      ['https://untrusted.example', { action: 'save_fixture' }, 403],
      ['http://localhost:3100', { tenantID: 99, action: 'create' }, 422],
    ] as const) {
      const response = await handleGeoDetection(
        new Request(url, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        'huadong-fasteners',
      )
      expect(response.status).toBe(status)
    }
    expect(f.artifact).not.toHaveBeenCalled()
  })
})
