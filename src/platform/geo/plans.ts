import { GeoError, geoID } from './keywords'

export type GeoPlanTarget = {
  collection: 'news' | 'posts'
  categoryID: number
  categoryName: string
  categoryUpdatedAt: string
  locale: string
  companySlug: string
  origin: string
  companyUpdatedAt: string
}
type GeoPlanScheduleBase = {
  timezone: string
  startDate: string
  endDate: string
}
export type GeoPlanOnceSchedule = GeoPlanScheduleBase & {
  cadence: 'once'
  /** A single local-time publication converted to UTC; null uses the immediate queue window. */
  runAt: string | null
}
export type GeoPlanDailySchedule = GeoPlanScheduleBase & {
  cadence: 'daily'
  /** Run every N calendar days, counting from startDate. */
  intervalDays: number
  /** Selected local hours; each is scheduled at the beginning of that hour. */
  selectedSlots?: number[]
  /** First selected hour, retained for older saved plans. */
  timeSlot: string
}
type GeoPlanLegacySchedule = GeoPlanScheduleBase & {
  /** Missing cadence is treated as legacy for plans saved before daily scheduling. */
  cadence?: 'legacy'
  weekdays: number[]
  windowStart: string
  windowEnd: string
  intervalMinutes: number
}
export type GeoPlanSchedule = GeoPlanOnceSchedule | GeoPlanDailySchedule | GeoPlanLegacySchedule
export type GeoPlanConfig = {
  sourceMode: 'articles' | 'tasks'
  sourceIDs: string[]
  targets: GeoPlanTarget[]
  distribution: 'all' | 'round_robin'
  approvalMode: 'manual' | 'auto'
  maxArticles: number
  schedule: GeoPlanSchedule
}

const datePattern = /^\d{4}-\d\d-\d\d$/u
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/u
const hourPattern = /^(?:[01]\d|2[0-3]):00$/u
const validDate = (value: string) =>
  datePattern.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const zonedParts = (time: number, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(time)
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  ) as { year: number; month: number; day: number; hour: number; minute: number }
}
const localDay = (time: number, timezone: string) => {
  const p = zonedParts(time, timezone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}
const offsetAt = (time: number, timezone: string) => {
  const p = zonedParts(time, timezone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(time / 60_000) * 60_000
}
export function geoLocalDateTimeToISO(value: string, timezone: string) {
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/u.exec(value)
  if (!match) throw new GeoError('INVALID_TIME', '请选择有效的发布时间。')
  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const desired = Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
  )
  let instant = desired
  for (let attempt = 0; attempt < 6; attempt++) {
    const parts = zonedParts(instant, timezone)
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
    const difference = desired - actual
    if (difference === 0) return new Date(instant).toISOString()
    instant += difference
  }
  throw new GeoError('INVALID_TIME', '该时区的本地时间不存在，请调整发布时间。')
}
export function geoISOToLocalDateTime(value: string | null, timezone: string) {
  if (!value) return ''
  const parts = zonedParts(Date.parse(value), timezone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}
function localTimeCandidates(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute)
  const offsets = new Set<number>()
  for (let step = -36; step <= 36; step += 3)
    offsets.add(offsetAt(wallTime + step * 3_600_000, timezone))
  return [...offsets]
    .map((offset) => wallTime - offset)
    .filter((instant) => {
      const p = zonedParts(instant, timezone)
      return (
        p.year === year &&
        p.month === month &&
        p.day === day &&
        p.hour === hour &&
        p.minute === minute
      )
    })
    .sort((a, b) => a - b)
}

export function parseGeoPlanConfig(value: unknown, defaultLocale: string): GeoPlanConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GeoError('INVALID_PLAN', '请完整填写发布计划。')
  const input = value as Record<string, unknown>
  if (
    !['articles', 'tasks'].includes(String(input.sourceMode)) ||
    !Array.isArray(input.sourceIDs) ||
    input.sourceIDs.length < 1 ||
    input.sourceIDs.length > 50
  )
    throw new GeoError('INVALID_PLAN_SOURCE', '请选择1至50个文章或创作任务作为来源。')
  const sourceIDs = [...new Set(input.sourceIDs.map((id) => geoID(id)))]
  if (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > 8)
    throw new GeoError('INVALID_PLAN_TARGETS', '请选择1至8个本站新闻或Blog分类作为发布目标。')
  const targets = input.targets.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new GeoError('INVALID_PLAN_TARGET', '发布目标无效。')
    const target = raw as Record<string, unknown>
    if (
      !['news', 'posts'].includes(String(target.collection)) ||
      !Number.isSafeInteger(target.categoryID) ||
      Number(target.categoryID) < 1
    )
      throw new GeoError('INVALID_PLAN_TARGET', '请选择有效的本站新闻或Blog分类。')
    return {
      collection: target.collection as GeoPlanTarget['collection'],
      categoryID: Number(target.categoryID),
      categoryName: '',
      categoryUpdatedAt: '',
      locale: defaultLocale,
      companySlug: '',
      origin: '',
      companyUpdatedAt: '',
    }
  })
  if (
    new Set(targets.map((target) => `${target.collection}:${target.categoryID}`)).size !==
    targets.length
  )
    throw new GeoError('DUPLICATE_PLAN_TARGET', '发布目标不能重复。')
  if (new Set(targets.map((target) => target.collection)).size !== targets.length)
    throw new GeoError(
      'MULTIPLE_CATEGORIES_PER_CHANNEL',
      '当前站内发布每篇文章每种栏目只允许一个目标；新闻和Blog可各选一个。',
    )
  if (!['all', 'round_robin'].includes(String(input.distribution)))
    throw new GeoError('INVALID_DISTRIBUTION', '请选择明确的文章分配方式。')
  if (!['manual', 'auto'].includes(String(input.approvalMode)))
    throw new GeoError('INVALID_APPROVAL', '请选择人工审核或自动确认。')
  const maxArticles = Number(input.maxArticles)
  if (!Number.isSafeInteger(maxArticles) || maxArticles < 1 || maxArticles > 20)
    throw new GeoError('INVALID_PLAN_COUNT', '每次最多选择1至20篇文章。')
  const scheduleInput =
    input.schedule && typeof input.schedule === 'object' && !Array.isArray(input.schedule)
      ? (input.schedule as Record<string, unknown>)
      : {}
  const scheduleBase: GeoPlanScheduleBase = {
    timezone: typeof scheduleInput.timezone === 'string' ? scheduleInput.timezone.trim() : '',
    startDate: typeof scheduleInput.startDate === 'string' ? scheduleInput.startDate : '',
    endDate: typeof scheduleInput.endDate === 'string' ? scheduleInput.endDate : '',
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: scheduleBase.timezone })
  } catch {
    throw new GeoError('INVALID_TIMEZONE', '请填写有效的IANA时区，例如 Asia/Shanghai。')
  }
  if (
    !validDate(scheduleBase.startDate) ||
    !validDate(scheduleBase.endDate) ||
    scheduleBase.endDate < scheduleBase.startDate ||
    Date.parse(`${scheduleBase.endDate}T00:00:00Z`) -
      Date.parse(`${scheduleBase.startDate}T00:00:00Z`) >
      90 * 86400_000
  )
    throw new GeoError('INVALID_PLAN_DATES', '计划日期无效；开始和结束日期间隔不能超过90天。')
  let schedule: GeoPlanSchedule
  if (scheduleInput.cadence === 'once') {
    let runAt: string | null = null
    if (
      scheduleInput.runAt !== null &&
      scheduleInput.runAt !== undefined &&
      scheduleInput.runAt !== ''
    ) {
      if (
        typeof scheduleInput.runAt !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(scheduleInput.runAt)
      )
        throw new GeoError('INVALID_TIME', '单次发布时间格式无效。')
      const instant = Date.parse(scheduleInput.runAt)
      if (
        !Number.isFinite(instant) ||
        instant < Date.now() + 60_000 ||
        instant > Date.now() + 90 * 86400_000
      )
        throw new GeoError('INVALID_TIME', '单次发布时间需在1分钟后至90天内。')
      runAt = new Date(instant).toISOString()
    }
    schedule = { ...scheduleBase, cadence: 'once', runAt }
  } else {
    const isDaily =
      scheduleInput.cadence === 'daily' ||
      scheduleInput.intervalDays !== undefined ||
      scheduleInput.timeSlot !== undefined ||
      scheduleInput.selectedSlots !== undefined
    if (isDaily) {
      const legacyTimeSlot =
        typeof scheduleInput.timeSlot === 'string' ? scheduleInput.timeSlot : ''
      const selectedSlots = Array.isArray(scheduleInput.selectedSlots)
        ? [...new Set(scheduleInput.selectedSlots.map(Number))]
        : hourPattern.test(legacyTimeSlot)
          ? [Number(legacyTimeSlot.slice(0, 2))]
          : []
      const intervalDays = Number(scheduleInput.intervalDays)
      if (
        !selectedSlots.length ||
        selectedSlots.length > 24 ||
        selectedSlots.some((hour) => !Number.isSafeInteger(hour) || hour < 0 || hour > 23)
      )
        throw new GeoError('INVALID_TIME_SLOT', '至少选择一个有效的整点发布时间。')
      if (!Number.isSafeInteger(intervalDays) || intervalDays < 1 || intervalDays > 30)
        throw new GeoError('INVALID_INTERVAL_DAYS', '发布间隔为1至30天。')
      const orderedSlots = [...selectedSlots].sort((a, b) => a - b)
      schedule = {
        ...scheduleBase,
        cadence: 'daily',
        selectedSlots: orderedSlots,
        timeSlot: `${String(orderedSlots[0]).padStart(2, '0')}:00`,
        intervalDays,
      }
    } else {
      const legacySchedule: GeoPlanLegacySchedule = {
        ...scheduleBase,
        cadence: 'legacy',
        weekdays: Array.isArray(scheduleInput.weekdays)
          ? [...new Set(scheduleInput.weekdays.map(Number))]
          : [],
        windowStart: typeof scheduleInput.windowStart === 'string' ? scheduleInput.windowStart : '',
        windowEnd: typeof scheduleInput.windowEnd === 'string' ? scheduleInput.windowEnd : '',
        intervalMinutes: Number(scheduleInput.intervalMinutes),
      }
      if (
        !timePattern.test(legacySchedule.windowStart) ||
        !timePattern.test(legacySchedule.windowEnd) ||
        legacySchedule.windowEnd < legacySchedule.windowStart
      )
        throw new GeoError(
          'INVALID_TIME_WINDOW',
          '请选择有效的每日开始和结束时间，结束时间不能早于开始时间。',
        )
      if (
        !Number.isSafeInteger(legacySchedule.intervalMinutes) ||
        legacySchedule.intervalMinutes < 15 ||
        legacySchedule.intervalMinutes > 1440
      )
        throw new GeoError('INVALID_INTERVAL', '发布间隔为15至1440分钟。')
      if (
        !legacySchedule.weekdays.length ||
        legacySchedule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
      )
        throw new GeoError('INVALID_WEEKDAYS', '至少选择一个有效星期。')
      schedule = legacySchedule
    }
  }
  return {
    sourceMode: input.sourceMode as GeoPlanConfig['sourceMode'],
    sourceIDs,
    targets,
    distribution: input.distribution as GeoPlanConfig['distribution'],
    approvalMode: input.approvalMode as GeoPlanConfig['approvalMode'],
    maxArticles,
    schedule,
  }
}

export function currentGeoPlanOccurrence(schedule: GeoPlanSchedule, now: Date): Date | null {
  if (schedule.cadence !== 'daily') return null
  const local = geoISOToLocalDateTime(now.toISOString(), schedule.timezone)
  const date = local.slice(0, 10),
    hour = Number(local.slice(11, 13))
  if (date < schedule.startDate || date > schedule.endDate) return null
  const day =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${schedule.startDate}T00:00:00Z`)) / 86400_000
  if (
    day % schedule.intervalDays !== 0 ||
    !(schedule.selectedSlots || [Number(schedule.timeSlot.slice(0, 2))]).includes(hour)
  )
    return null
  const candidates = localTimeCandidates(
    date,
    `${String(hour).padStart(2, '0')}:00`,
    schedule.timezone,
  )
  const instant = candidates[0]
  return instant !== undefined && instant <= now.getTime() && now.getTime() < instant + 3600_000
    ? new Date(instant)
    : null
}

export function nextGeoPlanOccurrence(schedule: GeoPlanSchedule, after: Date): Date | null {
  const afterMS = after.getTime()
  if (schedule.cadence === 'once') {
    const runAt = schedule.runAt ? Date.parse(schedule.runAt) : NaN
    return Number.isFinite(runAt) && runAt > afterMS ? new Date(runAt) : null
  }
  if (schedule.cadence === 'daily') {
    const startMS = Date.parse(`${schedule.startDate}T00:00:00Z`)
    const endMS = Date.parse(`${schedule.endDate}T00:00:00Z`)
    const days = Math.floor((endMS - startMS) / 86400_000)
    const selectedSlots = schedule.selectedSlots || [Number(schedule.timeSlot.slice(0, 2))]
    const intervalDays = schedule.intervalDays
    for (let day = 0; day <= Math.min(days, 90); day++) {
      if (day % intervalDays !== 0) continue
      const date = new Date(startMS + day * 86400_000).toISOString().slice(0, 10)
      for (const hour of selectedSlots) {
        const timeSlot = `${String(hour).padStart(2, '0')}:00`
        const candidate = localTimeCandidates(date, timeSlot, schedule.timezone)[0]
        if (candidate !== undefined && candidate > afterMS) return new Date(candidate)
      }
    }
    return null
  }
  const startMS = Date.parse(`${schedule.startDate}T00:00:00Z`)
  const endMS = Date.parse(`${schedule.endDate}T00:00:00Z`)
  const local = localDay(afterMS, schedule.timezone)
  const scanStart = Math.max(startMS, Date.parse(`${local}T00:00:00Z`) - 86400_000)
  const days = Math.floor((endMS - scanStart) / 86400_000)
  for (let i = 0; i <= Math.min(days, 92); i++) {
    const date = new Date(scanStart + i * 86400_000).toISOString().slice(0, 10)
    if (date < schedule.startDate || date > schedule.endDate) continue
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (!schedule.weekdays.includes(weekday)) continue
    const [startHour, startMinute] = schedule.windowStart.split(':').map(Number)
    const [endHour, endMinute] = schedule.windowEnd.split(':').map(Number)
    const start = startHour * 60 + startMinute,
      end = endHour * 60 + endMinute
    for (let minute = start; minute <= end; minute += schedule.intervalMinutes) {
      const wall = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
      const candidates = localTimeCandidates(date, wall, schedule.timezone)
      const firstOccurrence = candidates[0]
      if (firstOccurrence !== undefined && firstOccurrence > afterMS)
        return new Date(firstOccurrence)
    }
  }
  return null
}

export function geoPlanScheduleTimeSlot(schedule: GeoPlanSchedule) {
  return schedule.cadence === 'once'
    ? schedule.runAt
      ? new Intl.DateTimeFormat('zh-CN', {
          timeZone: schedule.timezone,
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(schedule.runAt))
      : '启用时确定'
    : schedule.cadence === 'daily'
      ? (schedule.selectedSlots || [Number(schedule.timeSlot.slice(0, 2))])
          .map((hour) => `${String(hour).padStart(2, '0')}:00`)
          .join('、')
      : schedule.windowStart
}

export function geoPlanScheduleTimeRange(schedule: GeoPlanSchedule) {
  if (schedule.cadence === 'once') return geoPlanScheduleTimeSlot(schedule)
  if (schedule.cadence === 'daily') {
    return (schedule.selectedSlots || [Number(schedule.timeSlot.slice(0, 2))])
      .map((hour) => {
        const value = String(hour).padStart(2, '0')
        return `${value}:00–${value}:59`
      })
      .join('、')
  }
  return `${schedule.windowStart}–${schedule.windowEnd}`
}

export function geoPlanScheduleIntervalLabel(schedule: GeoPlanSchedule) {
  return schedule.cadence === 'once'
    ? '单次'
    : schedule.cadence === 'daily'
      ? `每隔${schedule.intervalDays}天`
      : `每${schedule.intervalMinutes}分钟`
}

export function geoPlanTargetKey(
  target: Pick<GeoPlanTarget, 'collection' | 'categoryID' | 'locale'>,
) {
  return `${target.collection}:${target.categoryID}:${target.locale}`
}
