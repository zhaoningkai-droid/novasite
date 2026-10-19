'use client'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'
import {
  geoPlanScheduleIntervalLabel,
  geoPlanScheduleTimeRange,
  geoPlanScheduleTimeSlot,
  geoISOToLocalDateTime,
  geoLocalDateTimeToISO,
  type GeoPlanDailySchedule,
  type GeoPlanConfig,
  type GeoPlanTarget,
} from '@/platform/geo/plans'
import { geoTimezoneGroups, geoTimezoneOptions } from '@/platform/geo/timezone-options'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import './geo-workspace.scss'

type SourceOption = { id: string; name?: string; title?: string; status?: string }
type Category = { id: number; name: string; collection: 'news' | 'posts' }
type PlanItem = {
  id: string
  article_id: string
  article_version: number
  title: string
  target: GeoPlanTarget
  state: string
  intent_id: string | null
  message: string
  created_at: string
}
type PlanRun = {
  id: string
  scheduled_at: string
  state: string
  message: string
  items: PlanItem[]
}
type PlanTargetSummary = {
  collection: GeoPlanTarget['collection']
  categoryID: number
  categoryName: string
  publishedCount: number
  failedCount: number
  unknownCount: number
  awaitingCount: number
  queuedCount: number
  lastPublishedAt: string | null
}
type Plan = {
  id: string
  name: string
  version: number
  config: GeoPlanConfig
  state: string
  next_run_at: string | null
  last_run_at: string | null
  updated_at: string
  sources?: { id: string; name: string }[]
  targetSummaries?: PlanTargetSummary[]
  runs: PlanRun[]
}
type Form = {
  name: string
  startMode: 'active' | 'draft'
  mode: 'manual' | 'auto'
  oneTimeAt: string
  sourceMode: 'articles' | 'tasks'
  sourceIDs: string[]
  targetKeys: string[]
  distribution: 'all' | 'round_robin'
  approvalMode: 'manual' | 'auto'
  maxArticles: number
  timezone: string
  startDate: string
  endDate: string
  selectedSlots: number[]
  intervalDays: number
}
const timeSlots = [
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6,
]
const stateLabels: Record<string, string> = {
  draft: '草稿',
  active: '运行中',
  paused: '已暂停',
  ended: '已结束',
  awaiting_review: '等待审核',
  queued: '已进入发布队列',
  preparing: '正在创作',
  completed: '全部完成',
  partial: '部分完成',
  empty: '本次无可发布文章',
  failed: '执行失败',
  cancelled: '已取消',
  published: '站点已发布',
  unknown: '结果待核对',
  skipped: '已跳过',
}
const blankForm = (): Form => {
  const now = new Date(),
    name = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')
  return {
    name,
    startMode: 'active',
    mode: 'auto',
    oneTimeAt: '',
    sourceMode: 'tasks',
    sourceIDs: [],
    targetKeys: [],
    distribution: 'all',
    approvalMode: 'auto',
    maxArticles: 1,
    timezone: 'Asia/Shanghai',
    startDate: '',
    endDate: '',
    selectedSlots: [],
    intervalDays: 1,
  }
}
const toForm = (plan: Plan): Form => ({
  name: plan.name,
  startMode: plan.state === 'active' ? 'active' : 'draft',
  mode: plan.config.schedule.cadence === 'once' ? 'manual' : 'auto',
  oneTimeAt:
    plan.config.schedule.cadence === 'once'
      ? geoISOToLocalDateTime(plan.config.schedule.runAt, plan.config.schedule.timezone)
      : '',
  sourceMode: plan.config.sourceMode,
  sourceIDs: plan.config.sourceIDs,
  targetKeys: plan.config.targets.map((target) => `${target.collection}:${target.categoryID}`),
  distribution: plan.config.distribution,
  approvalMode: plan.config.approvalMode,
  maxArticles: plan.config.maxArticles,
  timezone: plan.config.schedule.timezone,
  startDate: plan.config.schedule.startDate,
  endDate: plan.config.schedule.endDate,
  selectedSlots:
    plan.config.schedule.cadence === 'daily'
      ? plan.config.schedule.selectedSlots || [Number(plan.config.schedule.timeSlot.slice(0, 2))]
      : plan.config.schedule.cadence === 'once'
        ? []
        : [Number(geoPlanScheduleTimeSlot(plan.config.schedule).slice(0, 2))],
  intervalDays: plan.config.schedule.cadence === 'daily' ? plan.config.schedule.intervalDays : 1,
})
const displayTime = (value: string | null, timezone: string) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'
const readJSON = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { cache: 'no-store', ...init }),
    body = await response.json()
  if (!response.ok) throw new Error(body.message || '操作失败，请重试。')
  return body
}
const isTooSoonForPublication = (value: string) => Date.parse(value) < Date.now() + 60_000

export function GeoPlans({
  company,
  canManageSite,
  createMode = false,
  hideQuickNav = false,
  modeSelector,
  initialQuery = '',
  initialSourceMode = '',
  initialSourceID = '',
  initialPlanID = '',
}: {
  company: WorkspaceCompany
  canManageSite: boolean
  createMode?: boolean
  hideQuickNav?: boolean
  modeSelector?: ReactNode
  initialQuery?: string
  initialSourceMode?: '' | 'articles' | 'tasks'
  initialSourceID?: string
  initialPlanID?: string
}) {
  const base = `/api/workspace/${encodeURIComponent(company.slug)}/geo`,
    endpoint = `${base}/plans`
  const [form, setForm] = useState<Form>(blankForm),
    [editing, setEditing] = useState<Plan | null>(null)
  const [scheduleTouched, setScheduleTouched] = useState(false)
  const [plans, setPlans] = useState<Plan[]>([]),
    [sources, setSources] = useState<SourceOption[]>([]),
    [categories, setCategories] = useState<Category[]>([])
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(15),
    [total, setTotal] = useState(0),
    [selectedPlanIDs, setSelectedPlanIDs] = useState<string[]>([]),
    [selectedPlanVersions, setSelectedPlanVersions] = useState<Record<string, number>>({})
  const [query, setQuery] = useState(initialQuery),
    [stateFilter, setStateFilter] = useState('')
  const [detailID, setDetailID] = useState(initialPlanID)
  const [detailTab, setDetailTab] = useState<'runs' | 'config'>('runs')
  const sourceFilter = useRef({ mode: initialSourceMode, id: initialSourceID }).current
  const [recordTarget, setRecordTarget] = useState<{ plan: Plan; target: GeoPlanTarget } | null>(
    null,
  )
  const [sourcePage, setSourcePage] = useState(1),
    [sourceTotal, setSourceTotal] = useState(0)
  const [sourceCache, setSourceCache] = useState<Record<string, SourceOption>>({})
  const [categoryCollection, setCategoryCollection] = useState<'news' | 'posts'>('news')
  const [categoryQuery, setCategoryQuery] = useState(''),
    [categoryPage, setCategoryPage] = useState(1)
  const [categoryTotal, setCategoryTotal] = useState(0),
    [categoryLoading, setCategoryLoading] = useState(false),
    [siteStatus, setSiteStatus] = useState('')
  const [categoryCache, setCategoryCache] = useState<Record<string, Category>>({})
  const [previewing, setPreviewing] = useState('')
  const recordsRef = useRef<HTMLDialogElement>(null)
  const [sourceQuery, setSourceQuery] = useState(''),
    [sourceLoading, setSourceLoading] = useState(false),
    [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [reload, setReload] = useState(0)
  const sourceEndpoint = `${base}/${form.sourceMode === 'articles' ? 'articles' : 'tasks'}`
  const showForm = createMode || !!editing
  const baseline = useRef(JSON.stringify(form)),
    active = useRef(true),
    lock = useRef(false)
  const mutation = useRef<AbortController | null>(null)
  const createRequest = useRef<{ input: string; id: string } | null>(null)
  const updateSchedule = (values: Partial<Form>) => {
    setScheduleTouched(true)
    setForm((old) => ({ ...old, ...values }))
  }
  useWorkspaceUnsaved(JSON.stringify(form) !== baseline.current, busy || !!previewing)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      mutation.current?.abort()
    }
  }, [])
  const resetForm = () => {
    const next = blankForm()
    if (siteStatus && siteStatus !== 'published') next.startMode = 'draft'
    baseline.current = JSON.stringify(next)
    createRequest.current = null
    setForm(next)
    setEditing(null)
    setScheduleTouched(false)
    setSourceQuery('')
    setSourcePage(1)
  }

  useEffect(() => {
    if (createMode) return
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(
      () =>
        void readJSON(
          `${endpoint}?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(query)}&state=${stateFilter}${sourceFilter.id ? `&sourceMode=${sourceFilter.mode}&sourceID=${encodeURIComponent(sourceFilter.id)}` : ''}`,
          { signal: controller.signal },
        )
          .then((result) => {
            if (controller.signal.aborted) return
            setPlans(result.items)
            setTotal(result.total)
            const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
            if (page > lastPage) setPage(lastPage)
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message)
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false)
          }),
      160,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [endpoint, page, pageSize, query, stateFilter, reload, createMode, sourceFilter])
  useEffect(() => {
    if (
      createMode ||
      busy ||
      previewing ||
      !plans.some(
        (plan) =>
          plan.state === 'active' ||
          plan.runs.some((run) => ['awaiting_review', 'queued'].includes(run.state)),
      )
    )
      return
    const timer = setTimeout(() => setReload((value) => value + 1), 5000)
    return () => clearTimeout(timer)
  }, [busy, previewing, plans, reload, createMode])
  useEffect(() => {
    if (!showForm) return
    const controller = new AbortController()
    setSourceLoading(true)
    const timer = setTimeout(
      () =>
        void readJSON(`${sourceEndpoint}?q=${encodeURIComponent(sourceQuery)}&page=${sourcePage}`, {
          signal: controller.signal,
        })
          .then((result) => {
            if (controller.signal.aborted) return
            setSources(result.items)
            setSourceTotal(result.total)
            setSourceCache((old) => ({
              ...old,
              ...Object.fromEntries(result.items.map((item: SourceOption) => [item.id, item])),
            }))
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message)
          })
          .finally(() => {
            if (!controller.signal.aborted) setSourceLoading(false)
          }),
      160,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [sourceEndpoint, sourceQuery, sourcePage, showForm])
  useEffect(() => {
    if (!showForm) return
    const missing = form.sourceIDs.filter((id) => !sourceCache[id])
    if (!missing.length) return
    const controller = new AbortController()
    void Promise.all(
      missing.map(async (id) => {
        const result = await readJSON(`${sourceEndpoint}/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        })
        return [
          id,
          { id, name: result.item.name, title: result.item.title, status: result.item.status },
        ]
      }),
    )
      .then((items) => {
        if (!controller.signal.aborted)
          setSourceCache((old) => ({ ...old, ...Object.fromEntries(items) }))
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [form.sourceIDs, sourceEndpoint, sourceCache, showForm])
  useEffect(() => {
    if (!showForm) return
    const controller = new AbortController()
    setCategoryLoading(true)
    const timer = setTimeout(
      () =>
        void readJSON(
          `${base}/publish?view=options&collection=${categoryCollection}&q=${encodeURIComponent(categoryQuery)}&page=${categoryPage}`,
          { signal: controller.signal },
        )
          .then((result) => {
            if (controller.signal.aborted) return
            const items = result.items.map((item: { id: number; name: string }) => ({
              ...item,
              collection: categoryCollection,
            }))
            setSiteStatus(result.siteStatus || '')
            if (result.siteStatus && result.siteStatus !== 'published')
              setForm((current) => {
                if (current.startMode === 'draft') return current
                const next = { ...current, startMode: 'draft' as const }
                if (JSON.stringify(current) === baseline.current)
                  baseline.current = JSON.stringify(next)
                return next
              })
            setCategories(items)
            setCategoryTotal(result.total)
            setCategoryCache((old) => ({
              ...old,
              ...Object.fromEntries(
                items.map((item: Category) => [`${item.collection}:${item.id}`, item]),
              ),
            }))
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message)
          })
          .finally(() => {
            if (!controller.signal.aborted) setCategoryLoading(false)
          }),
      160,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [base, categoryCollection, categoryQuery, categoryPage, showForm])
  useEffect(() => {
    if (recordTarget && recordsRef.current && !recordsRef.current.open)
      recordsRef.current.showModal()
  }, [recordTarget])

  const mutate = async (body: Record<string, unknown>) => {
    if (lock.current) return false
    lock.current = true
    const controller = new AbortController()
    mutation.current = controller
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await readJSON(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!active.current || controller.signal.aborted) return false
      setNotice(result.message || '操作已完成。')
      setReload((n) => n + 1)
      if (body.action === 'create' || body.action === 'update') resetForm()
      return true
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '操作失败；输入已保留。')
      return false
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  const config = (): GeoPlanConfig => ({
    sourceMode: form.mode === 'manual' ? 'articles' : form.sourceMode,
    sourceIDs: form.sourceIDs,
    targets: form.targetKeys.map((key) => {
      const [collection, id] = key.split(':')
      return {
        collection: collection as 'news' | 'posts',
        categoryID: Number(id),
        categoryName: '',
        categoryUpdatedAt: '',
        locale: '',
        companySlug: '',
        origin: '',
        companyUpdatedAt: '',
      }
    }),
    distribution: form.distribution,
    approvalMode: form.approvalMode,
    maxArticles: Number(form.maxArticles),
    schedule:
      form.mode === 'manual'
        ? {
            cadence: 'once',
            timezone: form.timezone,
            startDate: form.oneTimeAt
              ? form.oneTimeAt.slice(0, 10)
              : geoISOToLocalDateTime(new Date().toISOString(), form.timezone).slice(0, 10),
            endDate: form.oneTimeAt
              ? form.oneTimeAt.slice(0, 10)
              : geoISOToLocalDateTime(new Date().toISOString(), form.timezone).slice(0, 10),
            runAt: form.oneTimeAt ? geoLocalDateTimeToISO(form.oneTimeAt, form.timezone) : null,
          }
        : editing &&
            editing.config.schedule.cadence !== 'daily' &&
            editing.config.schedule.cadence !== 'once' &&
            !scheduleTouched
          ? editing.config.schedule
          : ({
              cadence: 'daily',
              timezone: form.timezone,
              startDate: form.startDate,
              endDate: form.endDate,
              selectedSlots: form.selectedSlots,
              timeSlot: form.selectedSlots.length
                ? `${String(form.selectedSlots[0]).padStart(2, '0')}:00`
                : '',
              intervalDays: Number(form.intervalDays),
            } satisfies GeoPlanDailySchedule),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const values = config()
    const dailySchedule = values.schedule.cadence === 'daily' ? values.schedule : null
    const onceSchedule = values.schedule.cadence === 'once' ? values.schedule : null
    const validation = !form.name.trim()
      ? '请填写计划名称。'
      : !form.sourceIDs.length
        ? '请选择一个或多个创作来源。'
        : !form.targetKeys.length
          ? '请选择至少一个本站新闻或Blog分类。'
          : dailySchedule && !dailySchedule.startDate
            ? '请选择发布开始日期。'
            : dailySchedule && !dailySchedule.endDate
              ? '请选择发布结束日期。'
              : dailySchedule && !dailySchedule.selectedSlots?.length
                ? '请选择至少一个发布时间。'
                : onceSchedule?.runAt && isTooSoonForPublication(onceSchedule.runAt)
                  ? '单次发布时间需至少晚于当前时间1分钟。'
                  : ''
    if (validation) {
      setError(validation)
      setNotice('')
      return
    }
    const input = JSON.stringify({ name: form.name, startMode: form.startMode, config: values })
    if (!editing && createRequest.current?.input !== input)
      createRequest.current = { input, id: crypto.randomUUID() }
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    void (async () => {
      let saved: Plan | null = null
      try {
        const result = await readJSON(endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            editing
              ? {
                  action: 'update',
                  id: editing.id,
                  version: editing.version,
                  name: form.name,
                  config: values,
                }
              : {
                  action: 'create',
                  name: form.name,
                  config: values,
                  requestId: createRequest.current?.id,
                },
          ),
        })
        saved = result.item as Plan
        if (form.startMode === 'active') {
          const preview = await readJSON(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'preview', config: values }),
          })
          if (!preview.preview.nextRunAt)
            throw new Error('计划日期范围内没有可执行时间，请调整日期。')
          const activated = await readJSON(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'activate',
              id: saved.id,
              version: saved.version,
              confirmed: true,
              previewNextRunAt: preview.preview.nextRunAt,
            }),
          })
          setNotice(activated.message || '发布计划已创建并开启。')
        } else {
          setNotice(result.message || '发布计划已保存。')
        }
        if (!active.current || controller.signal.aborted) return
        resetForm()
        setSelectedPlanIDs([])
        setSelectedPlanVersions({})
        setReload((n) => n + 1)
      } catch (cause) {
        if (active.current && !controller.signal.aborted) {
          if (saved && editing) {
            setEditing(saved)
            baseline.current = JSON.stringify(form)
          }
          if (saved) setNotice('计划已保存；开启未完成，请检查错误后重试。')
          setError(cause instanceof Error ? cause.message : '操作失败，表单内容已保留。')
        }
      } finally {
        lock.current = false
        if (active.current) setBusy(false)
      }
    })()
  }
  const editPlan = (plan: Plan) => {
    if (!['draft', 'paused'].includes(plan.state)) {
      setError('只有草稿或已暂停计划可以修改。')
      return
    }
    const next = toForm(plan)
    baseline.current = JSON.stringify(next)
    createRequest.current = null
    setEditing(plan)
    setScheduleTouched(false)
    setForm(next)
    setSourcePage(1)
    setSourceQuery('')
    setError('')
    setNotice('')
    setCategoryCache((old) => ({
      ...old,
      ...Object.fromEntries(
        plan.config.targets.map((target) => [
          `${target.collection}:${target.categoryID}`,
          { id: target.categoryID, name: target.categoryName, collection: target.collection },
        ]),
      ),
    }))
    document.getElementById('geo-plan-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const toggleSource = (id: string, checked: boolean) =>
    setForm((old) => ({
      ...old,
      sourceIDs:
        old.mode === 'manual'
          ? checked
            ? [id]
            : old.sourceIDs.filter((value) => value !== id)
          : checked
            ? [...old.sourceIDs, id]
            : old.sourceIDs.filter((value) => value !== id),
    }))
  const toggleTarget = (key: string, checked: boolean) =>
    setForm((old) => ({
      ...old,
      targetKeys: checked
        ? [...old.targetKeys, key]
        : old.targetKeys.filter((value) => value !== key),
    }))
  const sourceName = (source: SourceOption) => source.title || source.name || source.id
  const approve = (plan: Plan, run: PlanRun, item: PlanItem) => {
    const mode =
      plan.config.distribution === 'all' ? '发布到全部已选目标' : '按轮转规则发布到该目标'
    if (
      window.confirm(
        `审核并进入发布队列？\n\n${item.title}（修订${item.article_version}）\n${item.target.collection === 'news' ? '本站新闻' : '本站 Blog'} / ${item.target.categoryName}\n${mode}`,
      )
    )
      void mutate({ action: 'approve', runID: run.id, itemID: item.id }).then((ok) => {
        if (ok) closeRecords()
      })
  }
  const skip = (run: PlanRun, item: PlanItem) => {
    if (window.confirm(`跳过这篇文章本次排期？\n\n${item.title}\n\n本次跳过后不会进入发布队列。`))
      void mutate({ action: 'skip', runID: run.id, itemID: item.id }).then((ok) => {
        if (ok) closeRecords()
      })
  }
  const activatePlan = async (plan: Plan) => {
    if (lock.current) return
    lock.current = true
    const controller = new AbortController()
    mutation.current = controller
    setPreviewing(plan.id)
    setError('')
    setNotice('')
    try {
      const result = await readJSON(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', config: plan.config }),
      })
      if (!result.preview.nextRunAt) throw new Error('计划日期范围内没有可执行时间，请调整日期。')
      const activated = await readJSON(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'activate',
          id: plan.id,
          version: plan.version,
          confirmed: true,
          previewNextRunAt: result.preview.nextRunAt,
        }),
      })
      if (active.current && !controller.signal.aborted) {
        setNotice(activated.message || '发布计划已开启。')
        setReload((n) => n + 1)
      }
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '发布计划开启失败。')
    } finally {
      lock.current = false
      if (active.current) setPreviewing('')
    }
  }
  const copyPlan = (plan: Plan) =>
    void mutate({ action: 'copy', id: plan.id, requestId: crypto.randomUUID() })
  const endPlan = (plan: Plan) => {
    if (window.confirm(`结束发布计划「${plan.name}」？已进入发布队列的项目会继续处理。`))
      void mutate({ action: 'end', id: plan.id, version: plan.version })
  }
  const archiveSelectedPlans = () => {
    if (
      !selectedPlanIDs.length ||
      !window.confirm(
        `删除已选${selectedPlanIDs.length}个计划？计划和执行历史将保留在当前客户归档中。`,
      )
    )
      return
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    void readJSON(endpoint, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedPlanIDs, versions: selectedPlanVersions }),
    })
      .then((result) => {
        if (!active.current || controller.signal.aborted) return
        setSelectedPlanIDs([])
        setSelectedPlanVersions({})
        setNotice(`已删除${result.archived}个计划，执行历史已保留。`)
        setReload((value) => value + 1)
      })
      .catch((cause) => {
        if (active.current && !controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : '删除失败，请刷新后重试。')
      })
      .finally(() => {
        lock.current = false
        if (active.current) setBusy(false)
      })
  }
  const closeRecords = () => {
    recordsRef.current?.close()
    setRecordTarget(null)
  }
  const hiddenSourceIDs = form.sourceIDs.filter((id) => !sources.some((source) => source.id === id))
  const targetChoices = [
    ...categories,
    ...form.targetKeys
      .filter(
        (key) => !categories.some((category) => `${category.collection}:${category.id}` === key),
      )
      .map((key) => categoryCache[key])
      .filter((category): category is Category => !!category),
  ]
  const detailPlan = plans.find((plan) => plan.id === detailID)
  const selectedOnPage = plans.filter((plan) => selectedPlanIDs.includes(plan.id))
  const allOnPageSelected = plans.length > 0 && selectedOnPage.length === plans.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="geo-workspace geo-plans">
      {!createMode && (
        <header className="geo-workspace__heading">
          <div>
            <h1>发布计划</h1>
          </div>
          {!editing && (
            <div className="geo-workspace__filters geo-plans__filters">
              <input
                aria-label="搜索发布计划"
                placeholder="请输入计划名称"
                value={query}
                maxLength={100}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                  setSelectedPlanIDs([])
                  setSelectedPlanVersions({})
                }}
              />
              <select
                aria-label="计划状态"
                value={stateFilter}
                onChange={(event) => {
                  setStateFilter(event.target.value)
                  setPage(1)
                  setSelectedPlanIDs([])
                  setSelectedPlanVersions({})
                }}
              >
                <option value="">请选择状态</option>
                <option value="draft">草稿</option>
                <option value="active">运行中</option>
                <option value="paused">已暂停</option>
                <option value="ended">已结束</option>
              </select>
              <button
                type="button"
                className="geo-workspace__button"
                disabled={busy || loading || !selectedPlanIDs.length}
                onClick={archiveSelectedPlans}
              >
                删除{selectedPlanIDs.length ? `（${selectedPlanIDs.length}）` : ''}
              </button>
            </div>
          )}
        </header>
      )}
      {error && (
        <p role="alert" className="geo-workspace__error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="geo-workspace__notice">
          {notice}
        </p>
      )}
      {showForm && (
        <>
          {createMode && !hideQuickNav && (
            <nav className="geo-publish__quick-nav" aria-label="快速导航">
              <span>快速导航</span>
              <a href="#geo-plan-basic">基础配置</a>
              <a href="#geo-plan-target">发布账号</a>
              <a href="#geo-plan-content">添加内容</a>
            </nav>
          )}
          <form
            className="geo-workspace__panel geo-workspace__form geo-plans__form"
            id="geo-plan-form"
            onSubmit={submit}
          >
            <fieldset disabled={busy || !!previewing}>
              <div className="geo-workspace__field geo-plans__name-field" id="geo-plan-basic">
                <label htmlFor="geo-plan-name">计划名称</label>
                <input
                  id="geo-plan-name"
                  required
                  maxLength={20}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              {createMode && modeSelector}
              <div
                className="geo-workspace__field geo-plans__schedule-field"
                id="geo-plan-schedule"
              >
                <label>
                  {form.mode === 'manual' ? (
                    <>
                      发布时间 <b>*</b>
                    </>
                  ) : (
                    '发布周期'
                  )}
                </label>
                <div className="geo-plans__cycle">
                  <div className="geo-plans__timezone">
                    <select
                      id="geo-plan-timezone"
                      aria-label="发布时间时区"
                      value={form.timezone}
                      onChange={(e) => updateSchedule({ timezone: e.target.value })}
                    >
                      {geoTimezoneGroups.map((group) => (
                        <optgroup label={group.label} key={group.label}>
                          {group.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {!geoTimezoneOptions.some((option) => option.value === form.timezone) && (
                        <option value={form.timezone}>{form.timezone}</option>
                      )}
                    </select>
                  </div>
                  {form.mode === 'manual' ? (
                    <label className="geo-plans__inline">
                      <input
                        aria-label="单次发布时间（不选则默认当前时间）"
                        type="datetime-local"
                        value={form.oneTimeAt}
                        onChange={(e) => updateSchedule({ oneTimeAt: e.target.value })}
                      />
                      <span className="geo-workspace__hint">不选则默认当前时间</span>
                    </label>
                  ) : (
                    <div className="geo-plans__inline">
                      <label>
                        开始{' '}
                        <input
                          aria-label="开始日期"
                          type="date"
                          required
                          value={form.startDate}
                          onChange={(e) => updateSchedule({ startDate: e.target.value })}
                        />
                      </label>
                      <label>
                        结束{' '}
                        <input
                          aria-label="结束日期"
                          type="date"
                          required
                          value={form.endDate}
                          onChange={(e) => updateSchedule({ endDate: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
              {form.mode === 'auto' && (
                <div className="geo-workspace__field geo-plans__slots-field">
                  <label>发布时间</label>
                  <div className="geo-plans__time-slots">
                    {timeSlots.map((hour) => {
                      const value = hour
                      const label = hour >= 7 ? String(hour) : String(hour).padStart(2, '0')
                      return (
                        <label
                          key={value}
                          className={`geo-plans__slot${form.selectedSlots.includes(value) ? ' is-selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            aria-label={`${label}:00-${label}:59`}
                            checked={form.selectedSlots.includes(value)}
                            onChange={(event) =>
                              updateSchedule({
                                selectedSlots: event.target.checked
                                  ? [...new Set([...form.selectedSlots, value])]
                                  : form.selectedSlots.filter((slot) => slot !== value),
                              })
                            }
                          />
                          <span>
                            {label}:00-{label}:59
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
              {form.mode === 'auto' && (
                <div className="geo-workspace__field geo-plans__interval-field">
                  <label htmlFor="geo-plan-interval-days">间隔天数</label>
                  <div className="geo-plans__inline">
                    <input
                      id="geo-plan-interval-days"
                      type="number"
                      required
                      min={0}
                      max={29}
                      step={1}
                      value={form.intervalDays - 1}
                      onChange={(e) => updateSchedule({ intervalDays: Number(e.target.value) + 1 })}
                    />
                    <span>天</span>
                  </div>
                </div>
              )}
              {form.mode === 'auto' && (
                <div className="geo-workspace__field geo-plans__review-field">
                  <span id="geo-plan-review-label" className="geo-plans__field-label">
                    发布审核
                  </span>
                  <div
                    className="geo-plans__radios"
                    role="radiogroup"
                    aria-labelledby="geo-plan-review-label"
                  >
                    <label>
                      <input
                        type="radio"
                        name="geo-plan-review"
                        value="auto"
                        checked={form.approvalMode === 'auto'}
                        disabled={!canManageSite}
                        onChange={() => setForm({ ...form, approvalMode: 'auto' })}
                      />
                      自动确认
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="geo-plan-review"
                        value="manual"
                        checked={form.approvalMode === 'manual'}
                        onChange={() => setForm({ ...form, approvalMode: 'manual' })}
                      />
                      手动确认
                    </label>
                  </div>
                </div>
              )}
              {form.mode === 'auto' && (
                <div className="geo-workspace__field geo-plans__distribution-field">
                  <span id="geo-plan-distribution-label" className="geo-plans__field-label">
                    发布规则
                  </span>
                  <div
                    className="geo-plans__radios"
                    role="radiogroup"
                    aria-labelledby="geo-plan-distribution-label"
                  >
                    <label>
                      <input
                        type="radio"
                        name="geo-plan-distribution"
                        value="all"
                        checked={form.distribution === 'all'}
                        onChange={() => setForm({ ...form, distribution: 'all' })}
                      />
                      一篇多发
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="geo-plan-distribution"
                        value="round_robin"
                        checked={form.distribution === 'round_robin'}
                        onChange={() => setForm({ ...form, distribution: 'round_robin' })}
                      />
                      多篇多发
                    </label>
                  </div>
                </div>
              )}
              <div className="geo-workspace__field geo-plans__target-field" id="geo-plan-target">
                <label htmlFor="geo-plan-target-channel">发布目标</label>
                <div>
                  <div className="geo-plans__inline">
                    <select
                      id="geo-plan-target-channel"
                      value={categoryCollection}
                      onChange={(e) => {
                        setCategoryCollection(e.target.value as 'news' | 'posts')
                        setCategories([])
                        setCategoryPage(1)
                        setCategoryQuery('')
                      }}
                    >
                      <option value="news">本站新闻</option>
                      <option value="posts">本站 Blog</option>
                    </select>
                    <input
                      aria-label="搜索发布分类"
                      value={categoryQuery}
                      maxLength={100}
                      placeholder="搜索分类名称"
                      onChange={(e) => {
                        setCategoryQuery(e.target.value)
                        setCategoryPage(1)
                      }}
                    />
                  </div>
                  <div className="geo-plans__choices">
                    {targetChoices.map((category) => {
                      const key = `${category.collection}:${category.id}`
                      const anotherCollectionTarget = form.targetKeys.some(
                        (selected) =>
                          selected !== key && selected.startsWith(`${category.collection}:`),
                      )
                      return (
                        <label key={key} data-channel={category.collection}>
                          <input
                            type="checkbox"
                            checked={form.targetKeys.includes(key)}
                            disabled={!form.targetKeys.includes(key) && anotherCollectionTarget}
                            onChange={(e) => toggleTarget(key, e.target.checked)}
                          />
                          <span>
                            {category.collection === 'news' ? '本站新闻' : '本站 Blog'} /{' '}
                            {category.name}
                          </span>
                        </label>
                      )
                    })}
                    {categoryLoading && <span>正在读取分类…</span>}
                    {!categoryLoading && !categories.length && (
                      <span>
                        {categoryQuery
                          ? '没有找到匹配分类'
                          : '该栏目暂无分类，请先到站点内容管理添加。'}
                      </span>
                    )}
                  </div>
                  {(categoryTotal > 40 || categoryPage > 1) && (
                    <div className="geo-workspace__pager" aria-label="发布分类分页">
                      <button
                        type="button"
                        className="geo-workspace__button"
                        disabled={categoryLoading || categoryPage <= 1}
                        onClick={() => setCategoryPage((value) => value - 1)}
                      >
                        上一页
                      </button>
                      <span>
                        {categoryPage} / {Math.max(1, Math.ceil(categoryTotal / 40))} · 共
                        {categoryTotal}项
                      </span>
                      <button
                        type="button"
                        className="geo-workspace__button"
                        disabled={categoryLoading || categoryPage * 40 >= categoryTotal}
                        onClick={() => setCategoryPage((value) => value + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {editing && form.mode === 'auto' && editing.config.sourceMode === 'articles' && (
                <div className="geo-workspace__field geo-plans__source-mode-field">
                  <label htmlFor="geo-plan-source-mode">原计划来源</label>
                  <select
                    id="geo-plan-source-mode"
                    value={form.sourceMode}
                    onChange={(e) => {
                      setForm({
                        ...form,
                        sourceMode: e.target.value as Form['sourceMode'],
                        sourceIDs: [],
                      })
                      setSources([])
                      setSourceQuery('')
                      setSourcePage(1)
                    }}
                  >
                    <option value="articles">指定创作记录</option>
                    <option value="tasks">一个或多个创作任务</option>
                  </select>
                </div>
              )}
              <div className="geo-workspace__field geo-plans__source-field" id="geo-plan-content">
                <label htmlFor="geo-plan-source-search">
                  {form.sourceMode === 'tasks' ? '创作任务' : '指定创作记录'}
                </label>
                <div>
                  <input
                    id="geo-plan-source-search"
                    value={sourceQuery}
                    maxLength={100}
                    placeholder={form.sourceMode === 'tasks' ? '搜索任务名称' : '搜索文章标题'}
                    onChange={(e) => {
                      setSourceQuery(e.target.value)
                      setSourcePage(1)
                    }}
                  />
                  <div
                    className="geo-plans__choices"
                    aria-label={form.sourceMode === 'tasks' ? '选择创作任务' : '选择创作记录'}
                  >
                    {sourceLoading ? (
                      <span>正在读取来源…</span>
                    ) : (
                      sources.map((source) => (
                        <label key={source.id}>
                          <input
                            type="checkbox"
                            checked={form.sourceIDs.includes(source.id)}
                            onChange={(e) => toggleSource(source.id, e.target.checked)}
                          />
                          <span>{sourceName(source)}</span>
                          {source.status && (
                            <small>{source.status === 'ready' ? '可发布' : source.status}</small>
                          )}
                        </label>
                      ))
                    )}
                    {!sourceLoading && !sources.length && (
                      <span>
                        {form.sourceMode === 'tasks'
                          ? sourceQuery
                            ? '没有找到匹配的创作任务'
                            : '当前客户还没有搜索词创作任务'
                          : '没有找到创作记录'}
                      </span>
                    )}
                  </div>
                  {(sourceTotal > 20 || sourcePage > 1) && (
                    <div
                      className="geo-workspace__pager"
                      aria-label={form.sourceMode === 'tasks' ? '创作任务分页' : '创作记录分页'}
                    >
                      <button
                        type="button"
                        className="geo-workspace__button"
                        disabled={sourceLoading || sourcePage <= 1}
                        onClick={() => setSourcePage((value) => value - 1)}
                      >
                        上一页
                      </button>
                      <span>
                        {sourcePage} / {Math.max(1, Math.ceil(sourceTotal / 20))} · 共{sourceTotal}
                        项
                      </span>
                      <button
                        type="button"
                        className="geo-workspace__button"
                        disabled={sourceLoading || sourcePage * 20 >= sourceTotal}
                        onClick={() => setSourcePage((value) => value + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                  {!!hiddenSourceIDs.length && (
                    <div className="geo-plans__choices" aria-label="其他页面已选来源">
                      {hiddenSourceIDs.map((id) => (
                        <label key={id}>
                          <input type="checkbox" checked onChange={() => toggleSource(id, false)} />
                          <span>
                            {sourceCache[id] ? sourceName(sourceCache[id]) : '正在读取已选来源…'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="geo-workspace__field geo-plans__status-field">
                <span id="geo-plan-start-label" className="geo-plans__field-label">
                  计划状态
                </span>
                <div
                  className="geo-plans__radios"
                  role="radiogroup"
                  aria-labelledby="geo-plan-start-label"
                >
                  <label>
                    <input
                      type="radio"
                      name="geo-plan-start"
                      value="active"
                      checked={form.startMode === 'active'}
                      disabled={siteStatus !== '' && siteStatus !== 'published'}
                      onChange={() => setForm({ ...form, startMode: 'active' })}
                    />
                    立即开启
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="geo-plan-start"
                      value="draft"
                      checked={form.startMode === 'draft'}
                      onChange={() => setForm({ ...form, startMode: 'draft' })}
                    />
                    暂不开启
                  </label>
                </div>
                {siteStatus && siteStatus !== 'published' && (
                  <p className="geo-workspace__hint">
                    当前站点尚未上线，计划可以保存为草稿；站点发布后再开启。
                  </p>
                )}
              </div>
            </fieldset>
            <footer>
              <button
                type="button"
                className="geo-workspace__button"
                disabled={
                  busy || !!previewing || (!editing && JSON.stringify(form) === baseline.current)
                }
                onClick={resetForm}
              >
                取消修改
              </button>
              <button className="geo-workspace__button is-primary" disabled={busy || !!previewing}>
                {busy ? '处理中…' : form.startMode === 'draft' || editing ? '保存计划' : '提交发布'}
              </button>
            </footer>
          </form>
        </>
      )}

      {!createMode && !editing && (
        <div className="geo-workspace__panel geo-plans__list">
          {loading && <p role="status">正在读取…</p>}
          <div className="geo-workspace__table-scroll">
            <table className="geo-plans__list-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="选择当前页全部计划"
                      checked={allOnPageSelected}
                      disabled={!plans.length || busy}
                      onChange={(event) => {
                        const current = new Set(plans.map((plan) => plan.id))
                        setSelectedPlanIDs((old) =>
                          event.target.checked
                            ? [...new Set([...old, ...current])]
                            : old.filter((id) => !current.has(id)),
                        )
                        setSelectedPlanVersions((old) => {
                          const next = { ...old }
                          if (event.target.checked)
                            plans.forEach((plan) => {
                              next[plan.id] = plan.version
                            })
                          else
                            current.forEach((id) => {
                              delete next[id]
                            })
                          return next
                        })
                      }}
                    />
                  </th>
                  <th>序号</th>
                  <th>计划名称</th>
                  <th>发布方式</th>
                  <th>发布审核</th>
                  <th>发布平台</th>
                  <th>状态</th>
                  <th>关联创作任务</th>
                  <th>结束时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan, index) => (
                  <tr key={plan.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`选择计划 ${plan.name}`}
                        checked={selectedPlanIDs.includes(plan.id)}
                        disabled={busy}
                        onChange={(event) => {
                          setSelectedPlanIDs((old) =>
                            event.target.checked
                              ? [...new Set([...old, plan.id])]
                              : old.filter((id) => id !== plan.id),
                          )
                          setSelectedPlanVersions((old) => {
                            const next = { ...old }
                            if (event.target.checked) next[plan.id] = plan.version
                            else delete next[plan.id]
                            return next
                          })
                        }}
                      />
                    </td>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{plan.name}</td>
                    <td>{plan.config.schedule.cadence === 'once' ? '手动' : '自动'}</td>
                    <td>
                      {plan.config.schedule.cadence === 'once'
                        ? '—'
                        : plan.config.approvalMode === 'manual'
                          ? '手动确认'
                          : '自动确认'}
                    </td>
                    <td>
                      {plan.config.targets.map((target) => (
                        <div key={target.collection}>
                          {target.collection === 'news' ? '本站新闻' : '本站 Blog'}
                        </div>
                      ))}
                    </td>
                    <td>{stateLabels[plan.state] || plan.state}</td>
                    <td>
                      {(
                        plan.sources ||
                        plan.config.sourceIDs.map((id) => ({
                          id,
                          name: plan.config.sourceMode === 'tasks' ? '创作任务' : '创作记录',
                        }))
                      ).map((source) => (
                        <div key={source.id}>
                          <Link
                            href={`/workspace/${encodeURIComponent(company.slug)}/geo/${plan.config.sourceMode === 'tasks' ? 'creation' : 'articles'}/${encodeURIComponent(source.id)}${plan.config.sourceMode === 'tasks' ? '?view=1' : ''}`}
                          >
                            {source.name}
                          </Link>
                        </div>
                      ))}
                    </td>
                    <td>
                      {plan.config.schedule.cadence === 'once'
                        ? '—'
                        : plan.config.schedule.endDate || '—'}
                    </td>
                    <td>
                      <div className="geo-plans__actions">
                        <button
                          type="button"
                          className="geo-workspace__link"
                          onClick={() => {
                            setDetailID(detailID === plan.id && detailTab === 'runs' ? '' : plan.id)
                            setDetailTab('runs')
                          }}
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          className="geo-workspace__link"
                          onClick={() => {
                            setDetailID(
                              detailID === plan.id && detailTab === 'config' ? '' : plan.id,
                            )
                            setDetailTab('config')
                          }}
                        >
                          详情
                        </button>
                        <details className="geo-plans__row-menu">
                          <summary aria-label={`更多计划操作：${plan.name}`}>⋯</summary>
                          <div>
                            {['draft', 'paused'].includes(plan.state) && (
                              <button
                                type="button"
                                disabled={busy || !!previewing}
                                onClick={() => editPlan(plan)}
                              >
                                编辑
                              </button>
                            )}
                            {['draft', 'paused'].includes(plan.state) && (
                              <button
                                type="button"
                                disabled={
                                  busy ||
                                  !!previewing ||
                                  (plan.config.approvalMode === 'auto' && !canManageSite)
                                }
                                onClick={() => void activatePlan(plan)}
                              >
                                {previewing === plan.id ? '开启中…' : '开始'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy || !!previewing}
                              onClick={() => copyPlan(plan)}
                            >
                              复制
                            </button>
                            {plan.state !== 'ended' && (
                              <button
                                type="button"
                                disabled={busy || !!previewing}
                                onClick={() => endPlan(plan)}
                              >
                                结束
                              </button>
                            )}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && !plans.length && (
                  <tr>
                    <td colSpan={11} className="geo-workspace__empty">
                      {query || stateFilter ? '没有找到匹配的发布计划' : '暂无发布计划'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="geo-workspace__pager" aria-label="发布计划分页">
            <span>共 {total} 条</span>
            <label>
              每页
              <select
                aria-label="发布计划每页条数"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                  setSelectedPlanIDs([])
                  setSelectedPlanVersions({})
                }}
              >
                {[15, 30, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              条
            </label>
            <button
              type="button"
              className="geo-workspace__button"
              disabled={loading || busy || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              上一页
            </button>
            <span>
              第 {page} / {pageCount} 页
            </span>
            <button
              type="button"
              className="geo-workspace__button"
              disabled={loading || busy || page * pageSize >= total}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
            <label>
              前往
              <input
                aria-label="前往计划页码"
                type="number"
                min={1}
                max={pageCount}
                value={page}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isSafeInteger(value) && value >= 1 && value <= pageCount)
                    setPage(value)
                }}
              />
              页
            </label>
          </div>
          {detailPlan && (
            <section className="geo-plans__runs">
              <h2>
                {detailPlan.name} · {detailTab === 'runs' ? '查看' : '详情'}
              </h2>
              {detailTab === 'config' ? (
                <>
                  <div className="geo-plans__detail-grid">
                    <div>
                      <span>计划状态</span>
                      <strong>{stateLabels[detailPlan.state] || detailPlan.state}</strong>
                    </div>
                    <div>
                      <span>发布方式</span>
                      <strong>
                        {detailPlan.config.schedule.cadence === 'once' ? '手动发布' : '自动'}
                      </strong>
                    </div>
                    <div>
                      <span>发布审核</span>
                      <strong>
                        {detailPlan.config.schedule.cadence === 'once'
                          ? '—'
                          : detailPlan.config.approvalMode === 'manual'
                            ? '手动确认'
                            : '自动确认'}
                      </strong>
                    </div>
                    <div>
                      <span>发布规则</span>
                      <strong>
                        {detailPlan.config.schedule.cadence === 'once'
                          ? '—'
                          : detailPlan.config.distribution === 'all'
                            ? '一篇多发'
                            : '多篇多发'}
                      </strong>
                    </div>
                    <div>
                      <span>每轮发布</span>
                      <strong>
                        {detailPlan.config.schedule.cadence === 'once'
                          ? '1篇'
                          : `${detailPlan.config.maxArticles}篇`}
                      </strong>
                    </div>
                    <div>
                      <span>发布周期</span>
                      <strong>
                        {detailPlan.config.schedule.cadence === 'once'
                          ? '单次'
                          : `${detailPlan.config.schedule.startDate} 至 ${detailPlan.config.schedule.endDate}`}
                      </strong>
                    </div>
                    <div>
                      <span>发布时间</span>
                      <strong>{geoPlanScheduleTimeSlot(detailPlan.config.schedule)}</strong>
                    </div>
                    {detailPlan.config.schedule.cadence !== 'once' && (
                      <div>
                        <span>间隔天数</span>
                        <strong>{geoPlanScheduleIntervalLabel(detailPlan.config.schedule)}</strong>
                      </div>
                    )}
                    <div>
                      <span>时区</span>
                      <strong>{detailPlan.config.schedule.timezone}</strong>
                    </div>
                  </div>
                  <h3>关联创作来源</h3>
                  <div className="geo-plans__detail-sources">
                    {(
                      detailPlan.sources ||
                      detailPlan.config.sourceIDs.map((id) => ({ id, name: id }))
                    ).map((source) => (
                      <Link
                        key={source.id}
                        href={`/workspace/${encodeURIComponent(company.slug)}/geo/${detailPlan.config.sourceMode === 'tasks' ? 'creation' : 'articles'}/${encodeURIComponent(source.id)}${detailPlan.config.sourceMode === 'tasks' ? '?view=1' : ''}`}
                      >
                        {source.name}
                      </Link>
                    ))}
                  </div>
                  <h3>发布目标</h3>
                  <div className="geo-plans__detail-sources">
                    {detailPlan.config.targets.map((target) => (
                      <span key={`${target.collection}:${target.categoryID}`}>
                        {target.collection === 'news' ? '本站新闻' : '本站 Blog'} /{' '}
                        {target.categoryName}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="geo-plans__detail-grid">
                    <div>
                      <span>计划状态</span>
                      <strong>{stateLabels[detailPlan.state] || detailPlan.state}</strong>
                    </div>
                    <div>
                      <span>发布方式</span>
                      <strong>
                        {detailPlan.config.schedule.cadence === 'once' ? '手动发布' : '自动发布'}
                      </strong>
                    </div>
                    <div>
                      <span>发布周期</span>
                      <strong>
                        {detailPlan.config.schedule.timezone} ·{' '}
                        {detailPlan.config.schedule.startDate} 至{' '}
                        {detailPlan.config.schedule.endDate}
                      </strong>
                    </div>
                    <div>
                      <span>发布时间</span>
                      <strong>{geoPlanScheduleTimeRange(detailPlan.config.schedule)}</strong>
                    </div>
                    <div>
                      <span>执行间隔</span>
                      <strong>{geoPlanScheduleIntervalLabel(detailPlan.config.schedule)}</strong>
                    </div>
                    <div>
                      <span>日发</span>
                      <strong>{detailPlan.config.maxArticles}</strong>
                    </div>
                    <div>
                      <span>发布审核</span>
                      <strong>
                        {detailPlan.config.approvalMode === 'manual' ? '手动确认' : '自动确认'}
                      </strong>
                    </div>
                    <div>
                      <span>下次执行</span>
                      <strong>
                        {displayTime(detailPlan.next_run_at, detailPlan.config.schedule.timezone)}
                      </strong>
                    </div>
                    <div>
                      <span>上次执行</span>
                      <strong>
                        {displayTime(detailPlan.last_run_at, detailPlan.config.schedule.timezone)}
                      </strong>
                    </div>
                  </div>
                  <h3>发布目标</h3>
                  <div className="geo-workspace__table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>序号</th>
                          <th>发布目标</th>
                          <th>发布成功</th>
                          <th>发布失败</th>
                          <th>待确认</th>
                          <th>最近发布时间</th>
                          <th>发布状态</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailPlan.config.targets.map((target, index) => {
                          const summary = detailPlan.targetSummaries?.find(
                            (item) =>
                              item.collection === target.collection &&
                              item.categoryID === target.categoryID,
                          )
                          const targetState = summary?.awaitingCount
                            ? '等待审核'
                            : summary?.queuedCount
                              ? '发布中'
                              : summary?.unknownCount
                                ? '结果待核对'
                                : summary?.failedCount && !summary.publishedCount
                                  ? '执行失败'
                                  : summary?.publishedCount
                                    ? '已发布'
                                    : stateLabels[detailPlan.state] || detailPlan.state
                          return (
                            <tr key={`${target.collection}:${target.categoryID}`}>
                              <td>{index + 1}</td>
                              <td>
                                {target.collection === 'news' ? '本站新闻' : '本站 Blog'}
                                <br />
                                <small>{target.categoryName}</small>
                              </td>
                              <td>{summary?.publishedCount || 0}</td>
                              <td>{summary?.failedCount || 0}</td>
                              <td>{summary?.awaitingCount || 0}</td>
                              <td>
                                {displayTime(
                                  summary?.lastPublishedAt || null,
                                  detailPlan.config.schedule.timezone,
                                )}
                              </td>
                              <td>{targetState}</td>
                              <td>
                                <button
                                  type="button"
                                  className="geo-workspace__link"
                                  onClick={() => setRecordTarget({ plan: detailPlan, target })}
                                >
                                  查看记录
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
      {recordTarget && (
        <dialog
          ref={recordsRef}
          className="geo-workspace__dialog geo-plans__records"
          aria-labelledby="geo-plan-records-title"
          onCancel={(event) => {
            event.preventDefault()
            closeRecords()
          }}
        >
          <header>
            <div>
              <h2 id="geo-plan-records-title">发布记录</h2>
              <p>
                {recordTarget.target.collection === 'news' ? '本站新闻' : '本站 Blog'} /{' '}
                {recordTarget.target.categoryName} · 最近10次执行明细
              </p>
            </div>
            <button type="button" onClick={closeRecords} aria-label="关闭发布记录">
              ×
            </button>
          </header>
          <div className="geo-plans__record-counts">
            {[
              ['等待审核', 'awaiting_review'],
              ['发布中', 'queued'],
              ['发布成功', 'published'],
              ['发布失败', 'failed'],
              ['结果待核对', 'unknown'],
            ].map(([label, state]) => {
              const count = recordTarget.plan.runs
                .flatMap((run) => run.items)
                .filter(
                  (item) =>
                    item.state === state &&
                    item.target.collection === recordTarget.target.collection &&
                    item.target.categoryID === recordTarget.target.categoryID,
                ).length
              return (
                <div key={state}>
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              )
            })}
          </div>
          <div className="geo-workspace__table-scroll">
            <table>
              <thead>
                <tr>
                  <th>文章</th>
                  <th>预计时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {recordTarget.plan.runs.flatMap((run) =>
                  run.items
                    .filter(
                      (item) =>
                        item.target.collection === recordTarget.target.collection &&
                        item.target.categoryID === recordTarget.target.categoryID,
                    )
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.title}
                          <br />
                          <small>修订 {item.article_version}</small>
                        </td>
                        <td>
                          {displayTime(
                            run.scheduled_at,
                            recordTarget.plan.config.schedule.timezone,
                          )}
                        </td>
                        <td>
                          {stateLabels[item.state] || item.state}
                          {item.message && (
                            <small className="geo-plans__record-message">{item.message}</small>
                          )}
                        </td>
                        <td>
                          {item.state === 'awaiting_review' && (
                            <>
                              <button
                                type="button"
                                className="geo-workspace__link"
                                disabled={busy}
                                onClick={() => approve(recordTarget.plan, run, item)}
                              >
                                审核并排队
                              </button>
                              <button
                                type="button"
                                className="geo-workspace__link"
                                disabled={busy}
                                onClick={() => skip(run, item)}
                              >
                                跳过
                              </button>
                            </>
                          )}
                          {item.intent_id && (
                            <Link
                              href={`/workspace/${encodeURIComponent(company.slug)}/geo/records/${encodeURIComponent(item.intent_id)}`}
                            >
                              查看发布记录
                            </Link>
                          )}
                        </td>
                      </tr>
                    )),
                )}
                {!recordTarget.plan.runs.some((run) =>
                  run.items.some(
                    (item) =>
                      item.target.collection === recordTarget.target.collection &&
                      item.target.categoryID === recordTarget.target.categoryID,
                  ),
                ) && (
                  <tr>
                    <td colSpan={4} className="geo-workspace__empty">
                      暂无发布记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer>
            <button type="button" className="geo-workspace__button" onClick={closeRecords}>
              关闭
            </button>
          </footer>
        </dialog>
      )}
    </section>
  )
}
