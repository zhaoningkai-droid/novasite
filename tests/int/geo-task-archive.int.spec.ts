import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createGeoTaskStore } from '../../src/platform/geo/task-store'

const tenantID = 101
const taskID = randomUUID()

function pool(
  options: {
    rows?: { id: string; version: number }[]
    running?: boolean
    scheduled?: boolean
  } = {},
) {
  const calls: { sql: string; values?: unknown[] }[] = []
  const clientQuery = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values })
    if (sql.includes('SELECT id,version FROM platform_geo.creation_tasks'))
      return { rows: options.rows ?? [{ id: taskID, version: 4 }] }
    if (sql.includes('FROM platform_geo.generation_jobs'))
      return { rows: options.running ? [{ task_id: taskID }] : [] }
    if (sql.includes('FROM platform_geo.publish_plans p'))
      return { rows: options.scheduled ? [{ id: randomUUID() }] : [] }
    return { rows: [] }
  })
  const client = { query: clientQuery, release: vi.fn() }
  return {
    calls,
    client,
    store: createGeoTaskStore(
      { query: vi.fn(), connect: vi.fn().mockResolvedValue(client) } as never,
      tenantID,
      7,
    ),
  }
}

describe('GEO task archive keeps customer records and history intact', () => {
  it('archives only active tasks scoped to the current tenant and expected version', async () => {
    const fixture = pool()
    await expect(fixture.store.archive([taskID], { [taskID]: 4 })).resolves.toEqual({ archived: 1 })
    const selection = fixture.calls.find((call) =>
      call.sql.includes('SELECT id,version FROM platform_geo.creation_tasks'),
    )!
    expect(selection.values).toEqual([tenantID, [taskID]])
    const update = fixture.calls.find((call) =>
      call.sql.includes('UPDATE platform_geo.creation_tasks'),
    )!
    expect(update.sql).toContain('archived_at=clock_timestamp()')
    expect(update.sql).toContain('tenant_id=$1')
    expect(update.values).toEqual([tenantID, [taskID], 7])
    expect(fixture.calls.some((call) => /\bDELETE\s+FROM\b/i.test(call.sql))).toBe(false)
    expect(fixture.calls.at(-1)?.sql).toBe('COMMIT')
    expect(fixture.client.release).toHaveBeenCalledOnce()
  })

  it.each([
    [{ running: true }, 'TASK_RUNNING'],
    [{ scheduled: true }, 'TASK_SCHEDULED'],
  ] as const)('refuses to archive a task that is still in use', async (options, code) => {
    const fixture = pool(options)
    await expect(fixture.store.archive([taskID], { [taskID]: 4 })).rejects.toMatchObject({ code })
    expect(
      fixture.calls.some((call) => call.sql.includes('UPDATE platform_geo.creation_tasks')),
    ).toBe(false)
    expect(fixture.calls.at(-1)?.sql).toBe('ROLLBACK')
  })

  it('rejects stale versions and IDs that are absent from the tenant-scoped active set', async () => {
    const stale = pool()
    await expect(stale.store.archive([taskID], { [taskID]: 3 })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
    expect(
      stale.calls.some((call) => call.sql.includes('UPDATE platform_geo.creation_tasks')),
    ).toBe(false)

    const foreign = pool({ rows: [] })
    await expect(foreign.store.archive([taskID], { [taskID]: 4 })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(
      foreign.calls.find((call) =>
        call.sql.includes('SELECT id,version FROM platform_geo.creation_tasks'),
      )?.values,
    ).toEqual([tenantID, [taskID]])
  })
})
