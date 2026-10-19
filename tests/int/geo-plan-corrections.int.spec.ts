// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeoPlanConfig } from '../../src/platform/geo/plans'
import {
  confirmedGeoPlanOccurrence,
  createGeoPlanStore,
  dispatchOneGeoPlan,
  previewGeoPlanOccurrence,
} from '../../src/platform/geo/plan-store'

const mocks = vi.hoisted(() => ({ scope: vi.fn() }))
vi.mock('../../src/platform/workspace-settings-api', () => ({
  settingsEditorRoles: ['super-admin', 'site-admin', 'editor'],
  settingsAdminRoles: ['super-admin', 'site-admin'],
  workspaceSettingsScope: mocks.scope,
}))
vi.mock('../../src/platform/site', () => ({ getBaseURL: () => 'https://fixture.example' }))
import { geoPlanCreateID, handleGeoPlans } from '../../src/platform/geo/plan-api'

const id = '00000000-0000-4000-8000-000000000001'
const config: GeoPlanConfig = {
  sourceMode: 'articles',
  sourceIDs: [id],
  distribution: 'all',
  approvalMode: 'manual',
  maxArticles: 2,
  targets: [
    {
      collection: 'news',
      categoryID: 22,
      categoryName: '分类B',
      categoryUpdatedAt: '',
      locale: 'zh',
      companySlug: 'fixture',
      origin: 'https://fixture.example',
      companyUpdatedAt: '',
    },
  ],
  schedule: {
    timezone: 'Asia/Shanghai',
    startDate: '2026-10-17',
    endDate: '2026-10-18',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    windowStart: '09:00',
    windowEnd: '17:00',
    intervalMinutes: 60,
  },
}
const now = new Date('2026-10-17T00:59:30Z')
const row = {
  id,
  tenant_id: 101,
  actor_id: 1,
  name: '计划',
  version: 1,
  config,
  state: 'draft',
  next_run_at: null,
  last_run_at: null,
  created_at: now,
  updated_at: now,
}
const pool = (query = vi.fn(), clientQuery = vi.fn()) => ({
  query,
  connect: vi.fn().mockResolvedValue({ query: clientQuery, release: vi.fn() }),
})

beforeEach(() => vi.clearAllMocks())

describe('GEO plan fixes from the reference-site bug report', () => {
  it('starts inside the selected hour and resumes a completed slot on the next day without duplicate work', async () => {
    const current = new Date('2026-10-18T05:22:00Z')
    const daily = {
      ...config,
      schedule: {
        cadence: 'daily' as const,
        timezone: 'Asia/Shanghai',
        startDate: '2026-10-18',
        endDate: '2026-10-20',
        intervalDays: 1,
        timeSlot: '13:00',
        selectedSlots: [13],
      },
    }
    const first = previewGeoPlanOccurrence(daily, current)!.toISOString()
    expect(first).toBe('2026-10-18T05:00:00.000Z')
    expect(confirmedGeoPlanOccurrence(daily, current, first).toISOString()).toBe(first)
    const query = vi.fn(async (text: string, _values?: unknown[]) => ({
      rows: text.includes('SELECT *')
        ? [{ ...row, state: 'paused', config: daily }]
        : text.includes("state<>'preparing'")
          ? [{ id }]
          : text.includes('UPDATE platform_geo.publish_plans')
            ? [{ ...row, state: 'active' }]
            : [],
    }))
    await createGeoPlanStore(pool(vi.fn(), query), 101, 1).action(id, 'activate', 1, current, first)
    expect(
      query.mock.calls.find(([text]) =>
        text.includes('UPDATE platform_geo.publish_plans'),
      )?.[1]?.[4],
    ).toBe('2026-10-19T05:00:00.000Z')
  })

  it('does not activate an unselected hour or a skipped interval day as the current occurrence', () => {
    const daily = {
      ...config,
      schedule: {
        cadence: 'daily' as const,
        timezone: 'Asia/Shanghai',
        startDate: '2026-10-17',
        endDate: '2026-10-22',
        intervalDays: 2,
        timeSlot: '13:00',
        selectedSlots: [13],
      },
    }
    expect(previewGeoPlanOccurrence(daily, new Date('2026-10-18T05:22:00Z'))?.toISOString()).toBe(
      '2026-10-19T05:00:00.000Z',
    )
    expect(previewGeoPlanOccurrence(daily, new Date('2026-10-19T06:00:00Z'))?.toISOString()).toBe(
      '2026-10-21T05:00:00.000Z',
    )
  })
  it('runs a selected hour only once when daylight saving repeats that hour', () => {
    const daily = {
      ...config,
      schedule: {
        cadence: 'daily' as const,
        timezone: 'America/New_York',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        intervalDays: 1,
        timeSlot: '01:00',
        selectedSlots: [1],
      },
    }
    expect(previewGeoPlanOccurrence(daily, new Date('2026-11-01T05:30:00Z'))?.toISOString()).toBe(
      '2026-11-01T05:00:00.000Z',
    )
    expect(previewGeoPlanOccurrence(daily, new Date('2026-11-01T06:30:00Z'))?.toISOString()).toBe(
      '2026-11-02T06:00:00.000Z',
    )
  })
  it('previews and activates the exact same safe first occurrence', async () => {
    const next = previewGeoPlanOccurrence(config, now)!.toISOString()
    expect(next).toBe('2026-10-17T01:00:00.000Z')
    const query = vi.fn(async (text: string, _values?: unknown[]) => ({
      rows: text.includes('SELECT *')
        ? [row]
        : text.includes('UPDATE platform_geo.publish_plans')
          ? [{ ...row, state: 'active', next_run_at: next, version: 2 }]
          : [],
    }))
    await createGeoPlanStore(pool(vi.fn(), query), 101, 1).action(
      id,
      'activate',
      1,
      new Date(now.getTime() + 10_000),
      next,
    )
    const update = query.mock.calls.find(([text]) =>
      text.includes('UPDATE platform_geo.publish_plans'),
    )
    expect(update?.[1]?.[4]).toBe(next)
  })

  it('rejects a stale or invented preview instead of silently moving the first run', () => {
    expect(() => confirmedGeoPlanOccurrence(config, now, '2026-10-16T01:00:00.000Z')).toThrow(
      '重新选择',
    )
    expect(() => confirmedGeoPlanOccurrence(config, now, '2026-10-17T02:30:00.000Z')).toThrow(
      '不符合当前计划',
    )
  })

  it('excludes an article already reserved or published in another category of the same channel', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id, version: 3, title: '配电柜' }] })
      .mockResolvedValueOnce({
        rows: [{ article_id: id, article_version: 3, publication_key: 'news:zh' }],
      })
    const preview = await createGeoPlanStore(pool(query), 101, 1).preview(config, now)
    expect(preview.items).toEqual([])
    expect(preview.skippedExistingTargets).toBe(1)
    expect(query.mock.calls[2][0]).toContain("collection || ':' || locale AS publication_key")
    expect(query.mock.calls[2][1][0]).toBe(101)
  })

  it('keeps plan pagination scoped to the customer and passes the requested offset', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 21 }] })
    expect(await createGeoPlanStore(pool(query), 101, 1).list(2)).toMatchObject({
      items: [],
      total: 21,
      page: 2,
      pageSize: 15,
    })
    expect(query.mock.calls[0][1]).toEqual([101, 15, '', '', '', '', 15])
  })

  it('filters the real customer list and keeps older runs that still need review', async () => {
    const query = vi.fn(async (text: string, _values?: unknown[]) => ({
      rows: text.includes('SELECT * FROM platform_geo.publish_plans')
        ? [row]
        : text.includes('count(*)::int AS total')
          ? [{ total: 1 }]
          : text.includes('name AS label')
            ? [{ id, mode: 'articles', label: '配电柜选型' }]
            : [],
    }))
    const result = await createGeoPlanStore(pool(query), 101, 1).list(1, '配电柜', 'paused')
    expect(query.mock.calls[0][1]).toEqual([101, 0, '配电柜', 'paused', '', '', 15])
    expect(result.items[0].sources).toEqual([{ id, name: '配电柜选型' }])
    expect(query.mock.calls.find(([text]) => text.includes('row_number()'))?.[0]).toContain(
      "pending.state='awaiting_review'",
    )
  })

  it('filters associated plans by an authorized task source and active state', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
    const taskID = '00000000-0000-4000-8000-000000000009'
    await createGeoPlanStore(pool(query), 101, 1).list(1, '', 'active', 15, 'tasks', taskID)
    expect(query.mock.calls[0][0]).toContain("config->>'sourceMode'=$5")
    expect(query.mock.calls[0][0]).toContain("config->'sourceIDs' ? $6")
    expect(query.mock.calls[0][1]).toEqual([101, 0, '', 'active', 'tasks', taskID, 15])
    expect(query.mock.calls[1][1]).toEqual([101, '', 'active', 'tasks', taskID])
  })

  it('uses the same channel-wide deduplication when dispatching a plan', async () => {
    const query = vi.fn(async (text: string, _values?: unknown[]) => ({
      rows: text.includes('AS pending_run_id')
        ? [{ ...row, state: 'active', scheduled_at: '2026-10-17T01:00:00.000Z' }]
        : text.includes('SELECT a.*')
          ? [{ id, title: '配电柜', version: 3 }]
          : text.includes('AS publication_key')
            ? [{ article_id: id, article_version: 3, publication_key: 'news:zh' }]
            : [],
      rowCount: 1,
    }))
    await dispatchOneGeoPlan(pool(vi.fn(), query), {
      authorize: async () => ({ id: 1 }),
      canAuto: () => false,
      now: new Date('2026-10-17T01:00:05.000Z'),
    })
    expect(
      query.mock.calls.some(([text]) =>
        text.includes('INSERT INTO platform_geo.publish_plan_items'),
      ),
    ).toBe(false)
    expect(
      query.mock.calls.find(([text]) => text.includes('pg_advisory_xact_lock(57310'))?.[1],
    ).toEqual([101])
  })

  it('replays one draft request without inserting a second plan or creation event', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ count: 1 }] })
    const clientQuery = vi.fn(async (text: string, _values?: unknown[]) => ({
      rows: text.includes('request_matches') ? [{ ...row, request_matches: true }] : [],
    }))
    const result = await createGeoPlanStore(pool(query, clientQuery), 101, 1).save(
      id,
      '计划',
      config,
    )
    expect(result).toMatchObject({ id, replayed: true })
    expect(clientQuery.mock.calls.some(([text]) => text.includes('INSERT INTO'))).toBe(false)
    expect(
      clientQuery.mock.calls.find(([text]) => text.includes('request_matches'))?.[1]?.[0],
    ).toBe(101)
  })

  it('rejects reusing the same draft request for changed content', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ count: 1 }] })
    const clientQuery = vi.fn(async (text: string, _values?: unknown[]) => ({
      rows: text.includes('request_matches') ? [{ ...row, request_matches: false }] : [],
    }))
    await expect(
      createGeoPlanStore(pool(query, clientQuery), 101, 1).save(id, '另一计划', config),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(clientQuery.mock.calls.some(([text]) => text.includes('INSERT INTO'))).toBe(false)
  })

  it('derives separate create IDs for separate customers and actors', () => {
    expect(geoPlanCreateID(101, 1, id)).toBe(geoPlanCreateID(101, 1, id))
    expect(geoPlanCreateID(101, 1, id)).not.toBe(geoPlanCreateID(202, 1, id))
    expect(geoPlanCreateID(101, 1, id)).not.toBe(geoPlanCreateID(101, 2, id))
  })

  it('requires the previewed first time before any activation write', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [row] }),
      connect = vi.fn()
    mocks.scope.mockResolvedValue({
      company: { id: 101 },
      user: { id: 1, roles: ['editor'] },
      payload: { db: { pool: { query, connect } } },
    })
    const response = await handleGeoPlans(
      new Request('http://localhost:3100/api/geo/plans', {
        method: 'POST',
        headers: { Origin: 'http://localhost:3100', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', id, version: 1, confirmed: true }),
      }),
      'fixture',
    )
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('PLAN_PREVIEW_REQUIRED')
    expect(connect).not.toHaveBeenCalled()
  })
})
