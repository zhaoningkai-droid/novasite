import { beforeEach, describe, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({ scope: vi.fn(), find: vi.fn(), enqueue: vi.fn(), target: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
  workspaceSettingsScope: f.scope,
}))
vi.mock('../../src/platform/geo/article-store', () => ({
  createGeoArticleStore: () => ({ find: f.find, visibleArticle: async (a: unknown) => a }),
}))
vi.mock('../../src/platform/geo/articles', () => ({ validateGeoArticle: () => ({ issues: [] }) }))
vi.mock('../../src/platform/geo/publish-lexical', () => ({
  geoArticleToLexical: () => ({ root: {} }),
}))
vi.mock('../../src/platform/geo/publish-target', () => ({ loadGeoPublishTarget: f.target }))
vi.mock('../../src/platform/site', () => ({ getBaseURL: () => 'https://fixture.example' }))
vi.mock('../../src/platform/geo/publish-store', async (original) => ({
  ...(await original<typeof import('../../src/platform/geo/publish-store')>()),
  createGeoPublishStore: () => ({ enqueue: f.enqueue }),
}))
import { handleGeoPublishing } from '../../src/platform/geo/publish-api'
const id = '34add9d8-6e35-4465-b1d2-616694046326',
  url = 'http://localhost:3100/api/workspace/fixture/geo/publish'
const article = {
  id,
  version: 2,
  status: 'ready',
  title: '配电柜资料',
  summary: '设备资料',
  html: '<p>资料</p>',
  review_note: '已核查',
  context: { settings: { locale: 'zh' } },
}
const input = { articleID: id, version: 2, collection: 'news', categoryID: 10, publishAt: null }
const target = {
  collection: 'news',
  categoryID: 10,
  categoryName: '设备',
  categoryUpdatedAt: '2026-10-17',
  locale: 'zh',
  companySlug: 'fixture',
  origin: 'https://fixture.example',
  companyUpdatedAt: '2026-10-17',
}
const send = (body: object) =>
  handleGeoPublishing(
    new Request(url, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3100', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    'fixture',
  )
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PAYLOAD_SECRET', 'fixture-secret')
  f.scope.mockResolvedValue({
    company: { id: 101 },
    user: { id: 1 },
    payload: { db: { pool: {} } },
  })
  f.find.mockResolvedValue(article)
  f.target.mockResolvedValue(target)
  f.enqueue.mockResolvedValue({ id, snapshot: article, target, state: 'queued' })
})
describe('GEO publish explicit preview and confirmation protocol (injected data only)', () => {
  it('submits a current validated article in one operation and queues it without claiming publication', async () => {
    const response = await send({ action: 'submit', ...input, requestId: id })
    expect(response.status).toBe(202)
    const data = await response.json()
    expect(data.item.state).toBe('queued')
    expect(data.item.target_id).toBeUndefined()
    expect(f.enqueue).toHaveBeenCalledWith(id, input, target, article)
  })

  it('preview does not enqueue, explicit signed confirm returns queued rather than published', async () => {
    const response = await send({ action: 'preview', ...input })
    expect(response.status).toBe(200)
    const { preview } = await response.json()
    expect(f.enqueue).not.toHaveBeenCalled()
    const confirmed = await send({
      action: 'confirm',
      ...input,
      signature: preview.signature,
      expires: preview.expires,
      confirmed: true,
      requestId: id,
    })
    expect(confirmed.status).toBe(202)
    const data = await confirmed.json()
    expect(data.item.state).toBe('queued')
    expect(data.item.target_id).toBeUndefined()
    expect(f.enqueue).toHaveBeenCalledTimes(1)
  })
  it('missing consent and changed targets cannot reuse a preview', async () => {
    const { preview } = await (await send({ action: 'preview', ...input })).json()
    const proof = {
      action: 'confirm',
      ...input,
      signature: preview.signature,
      expires: preview.expires,
      requestId: id,
    }
    expect((await send(proof)).status).toBe(409)
    f.target.mockResolvedValue({ ...target, categoryUpdatedAt: 'changed' })
    expect((await send({ ...proof, confirmed: true })).status).toBe(409)
    expect(f.enqueue).not.toHaveBeenCalled()
  })
  it('editing or withdrawing article readiness invalidates the confirmed revision', async () => {
    const { preview } = await (await send({ action: 'preview', ...input })).json()
    const proof = {
      action: 'confirm',
      ...input,
      signature: preview.signature,
      expires: preview.expires,
      requestId: id,
      confirmed: true,
    }
    for (const update of [{ version: 3 }, { status: 'needs_edit' }]) {
      f.find.mockResolvedValue({ ...article, ...update })
      expect((await send(proof)).status).toBe(409)
    }
    expect(f.enqueue).not.toHaveBeenCalled()
  })
})
