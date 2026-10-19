import { describe, expect, it } from 'vitest'
import { nextGeoPlanOccurrence, parseGeoPlanConfig } from '../../src/platform/geo/plans'
import { previewGeoPlanOccurrence } from '../../src/platform/geo/plan-store'

const base = {
  sourceMode: 'articles',
  sourceIDs: ['00000000-0000-4000-8000-000000000001'],
  targets: [{ collection: 'news', categoryID: 1 }],
  distribution: 'all',
  approvalMode: 'manual',
  maxArticles: 2,
  schedule: {
    timezone: 'Asia/Shanghai',
    startDate: '2026-10-17',
    endDate: '2026-10-20',
    weekdays: [1, 2, 3, 4, 5],
    windowStart: '09:00',
    windowEnd: '17:00',
    intervalMinutes: 60,
  },
}

describe('GEO publish plan validation and timezone recurrence', () => {
  it('defaults an empty one-time schedule to the next immediate run window', () => {
    const now = new Date('2026-10-17T00:59:30.000Z')
    const parsed = parseGeoPlanConfig(
      {
        ...base,
        schedule: {
          timezone: 'Asia/Shanghai',
          startDate: '2026-10-17',
          endDate: '2026-10-17',
          cadence: 'once',
          runAt: null,
        },
      },
      'zh',
    )

    expect(parsed.schedule).toMatchObject({ cadence: 'once', runAt: null })
    expect(previewGeoPlanOccurrence(parsed, now)?.toISOString()).toBe('2026-10-17T00:59:31.000Z')
  })

  it('requires customer-safe bounded sources, targets and review rules', () => {
    expect(parseGeoPlanConfig(base, 'zh').targets[0].locale).toBe('zh')
    expect(() => parseGeoPlanConfig({ ...base, sourceIDs: [] }, 'zh')).toThrow()
    expect(() =>
      parseGeoPlanConfig(
        {
          ...base,
          targets: [
            { collection: 'news', categoryID: 1 },
            { collection: 'news', categoryID: 2 },
          ],
        },
        'zh',
      ),
    ).toThrow()
    expect(() =>
      parseGeoPlanConfig({ ...base, schedule: { ...base.schedule, timezone: 'Not/AZone' } }, 'zh'),
    ).toThrow()
    expect(() =>
      parseGeoPlanConfig({ ...base, schedule: { ...base.schedule, endDate: '2027-02-01' } }, 'zh'),
    ).toThrow()
  })

  it('uses the configured timezone and skips nonexistent spring-forward wall times', () => {
    const schedule = {
      ...base.schedule,
      timezone: 'America/New_York',
      startDate: '2026-03-08',
      endDate: '2026-03-08',
      weekdays: [0],
      windowStart: '02:00',
      windowEnd: '04:00',
      intervalMinutes: 30,
    }
    expect(
      nextGeoPlanOccurrence(schedule, new Date('2026-03-08T06:30:00.000Z'))?.toISOString(),
    ).toBe('2026-03-08T07:00:00.000Z')
  })

  it('runs an ambiguous fall-back wall time only once', () => {
    const schedule = {
      ...base.schedule,
      timezone: 'America/New_York',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      weekdays: [0],
      windowStart: '01:00',
      windowEnd: '02:00',
      intervalMinutes: 30,
    }
    expect(
      nextGeoPlanOccurrence(schedule, new Date('2026-11-01T05:15:00.000Z'))?.toISOString(),
    ).toBe('2026-11-01T05:30:00.000Z')
    expect(
      nextGeoPlanOccurrence(schedule, new Date('2026-11-01T05:45:00.000Z'))?.toISOString(),
    ).toBe('2026-11-01T07:00:00.000Z')
  })

  it('stops after the end date and coalesces through the exact configured window', () => {
    const schedule = {
      ...base.schedule,
      startDate: '2026-10-17',
      endDate: '2026-10-17',
      weekdays: [6],
      windowStart: '09:00',
      windowEnd: '10:00',
      intervalMinutes: 30,
    }
    expect(
      nextGeoPlanOccurrence(schedule, new Date('2026-10-17T00:00:00.000Z'))?.toISOString(),
    ).toBe('2026-10-17T01:00:00.000Z')
    expect(nextGeoPlanOccurrence(schedule, new Date('2026-10-17T02:00:00.000Z'))).toBeNull()
  })

  it('runs each selected local hour and repeats on the configured day interval', () => {
    const schedule = {
      timezone: 'Asia/Shanghai',
      startDate: '2026-10-17',
      endDate: '2026-10-22',
      cadence: 'daily' as const,
      timeSlot: '09:00',
      intervalDays: 1,
    }
    expect(parseGeoPlanConfig({ ...base, schedule }, 'zh').schedule).toMatchObject({
      ...schedule,
      selectedSlots: [9],
    })
    expect(
      nextGeoPlanOccurrence(schedule, new Date('2026-10-17T00:00:00.000Z'))?.toISOString(),
    ).toBe('2026-10-17T01:00:00.000Z')
    expect(
      nextGeoPlanOccurrence(schedule, new Date('2026-10-17T02:00:00.000Z'))?.toISOString(),
    ).toBe('2026-10-18T01:00:00.000Z')
    const multiSlotSchedule = parseGeoPlanConfig(
      { ...base, schedule: { ...schedule, selectedSlots: [9, 15] } },
      'zh',
    ).schedule
    expect(
      nextGeoPlanOccurrence(multiSlotSchedule, new Date('2026-10-17T02:00:00.000Z'))?.toISOString(),
    ).toBe('2026-10-17T07:00:00.000Z')
    expect(
      nextGeoPlanOccurrence(multiSlotSchedule, new Date('2026-10-17T08:00:00.000Z'))?.toISOString(),
    ).toBe('2026-10-18T01:00:00.000Z')
    expect(
      nextGeoPlanOccurrence(
        parseGeoPlanConfig(
          { ...base, schedule: { ...schedule, selectedSlots: [9, 15], intervalDays: 2 } },
          'zh',
        ).schedule,
        new Date('2026-10-17T08:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-10-19T01:00:00.000Z')
    expect(
      nextGeoPlanOccurrence(
        { ...schedule, intervalDays: 2 },
        new Date('2026-10-17T02:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-10-19T01:00:00.000Z')
  })

  it('rejects an invalid time slot or daily interval and skips a nonexistent daylight-saving hour', () => {
    expect(() =>
      parseGeoPlanConfig(
        {
          ...base,
          schedule: { ...base.schedule, cadence: 'daily', timeSlot: '09:30', intervalDays: 1 },
        },
        'zh',
      ),
    ).toThrow()
    expect(() =>
      parseGeoPlanConfig(
        {
          ...base,
          schedule: { ...base.schedule, cadence: 'daily', selectedSlots: [9, 24], intervalDays: 1 },
        },
        'zh',
      ),
    ).toThrow()
    expect(() =>
      parseGeoPlanConfig(
        {
          ...base,
          schedule: { ...base.schedule, cadence: 'daily', timeSlot: '09:00', intervalDays: 0 },
        },
        'zh',
      ),
    ).toThrow()
    const schedule = {
      timezone: 'America/New_York',
      startDate: '2026-03-08',
      endDate: '2026-03-09',
      cadence: 'daily' as const,
      timeSlot: '02:00',
      intervalDays: 1,
    }
    expect(
      nextGeoPlanOccurrence(schedule, new Date('2026-03-08T06:00:00.000Z'))?.toISOString(),
    ).toBe('2026-03-09T06:00:00.000Z')
  })
})
