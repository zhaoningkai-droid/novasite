'use client'
import Link from 'next/link'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'
import type { GeoArticle } from '@/platform/geo/articles'
import type { GeoKeyword } from '@/platform/geo/keywords'
import { geoISOToLocalDateTime, geoLocalDateTimeToISO } from '@/platform/geo/plans'
import { geoTimezoneGroups, geoTimezoneOptions } from '@/platform/geo/timezone-options'
import { geoPublishStates, type GeoPublishRecord } from '@/platform/geo/publishing'
import { useWorkspaceUnsaved } from '../WorkspaceEditor/useWorkspaceUnsaved'
import { GeoPlans } from './GeoPlans'
import { GeoRichTextToolbar } from './GeoRichTextToolbar'
import './geo-workspace.scss'
import './geo-published-preview.scss'
type RecordItem = Omit<
  Pick<
    GeoPublishRecord,
    | 'id'
    | 'article_id'
    | 'article_version'
    | 'target'
    | 'publish_at'
    | 'target_id'
    | 'target_url'
    | 'message'
    | 'error_code'
    | 'attempts'
    | 'updated_at'
  >,
  'state'
> & {
  state: GeoPublishRecord['state'] | 'awaiting_review' | 'scheduled' | 'preparing'
  title: string
  kind: 'intent' | 'plan_item' | 'scheduled' | 'plan_run'
  status_tab: 'pending' | 'publishing' | 'published' | 'failed'
  plan_id: string | null
  plan_name: string | null
  run_id: string | null
  item_id: string | null
  account: string
  platform: 'news' | 'posts'
  created_at: string
  html?: string
}
type RecordTab = 'pending' | 'publishing' | 'published' | 'failed'
const recordTabs: { id: RecordTab; label: string }[] = [
  { id: 'pending', label: '待确认' },
  { id: 'publishing', label: '发布中' },
  { id: 'published', label: '发布成功' },
  { id: 'failed', label: '发布失败' },
]
const emptyRecordCounts: Record<RecordTab, number> = {
  pending: 0,
  publishing: 0,
  published: 0,
  failed: 0,
}
const recordStateLabel = (state: RecordItem['state']) =>
  state === 'awaiting_review'
    ? '待确认'
    : state === 'scheduled'
      ? '待发布'
      : state === 'preparing'
        ? '生成中'
        : geoPublishStates[state]
type Option = { id: number; name: string }
type ArticleOption = { id: string; title: string; version: number; locale: string; status: string }
type PublishCollection = 'news' | 'posts'
const time = (value: string) => new Date(value).toLocaleString('sv-SE').slice(0, 16)
const openTimePicker = (event: MouseEvent<HTMLInputElement>) => {
  try {
    event.currentTarget.showPicker?.()
  } catch {
    event.currentTarget.focus()
  }
}
const timestampName = () => {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
}
async function readPublishResponse(response: Response) {
  const data = await response.json().catch(() => null)
  if (!data) throw new Error(`服务响应不完整（HTTP ${response.status}），输入已保留，请重试。`)
  if (!response.ok) throw new Error(data.message || '操作失败，请重试。')
  return data
}
async function readJSON(url: string, signal: AbortSignal, body?: object) {
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  })
  return readPublishResponse(response)
}
export function GeoPublishing({
  company,
  view,
  initialArticleID,
  initialMode = 'manual',
  canManageSite = false,
  recordId,
}: {
  company: WorkspaceCompany
  view: 'compose' | 'records'
  initialArticleID?: string
  initialMode?: 'manual' | 'auto'
  canManageSite?: boolean
  recordId?: string
}) {
  const base = `/workspace/${encodeURIComponent(company.slug)}/geo`,
    geoAPIBase = `/api/workspace/${encodeURIComponent(company.slug)}/geo`,
    endpoint = `/api/workspace/${encodeURIComponent(company.slug)}/geo/publish`,
    plansEndpoint = `${geoAPIBase}/plans`,
    articlesEndpoint = `/api/workspace/${encodeURIComponent(company.slug)}/geo/articles`
  const [mode, setMode] = useState<'manual' | 'auto'>(initialMode),
    [autoMounted, setAutoMounted] = useState(initialMode === 'auto')
  const [composeKind, setComposeKind] = useState<'saved' | 'direct'>(
    initialArticleID ? 'saved' : 'direct',
  )
  const [manualConfig, setManualConfig] = useState<GeoKeyword | null>(null),
    [manualConfigID, setManualConfigID] = useState(''),
    [manualConfigs, setManualConfigs] = useState<GeoKeyword[]>([])
  const [manualTerm, setManualTerm] = useState('')
  const [manualTitle, setManualTitle] = useState(''),
    [manualHTML, setManualHTML] = useState('')
  const [manualConfigLoading, setManualConfigLoading] = useState(false)
  const manualEditor = useRef<HTMLDivElement | null>(null),
    publishEditor = useRef<HTMLDivElement | null>(null),
    manualRequest = useRef<{ input: string; id: string } | null>(null)
  const [targetCollections, setTargetCollections] = useState<PublishCollection[]>(['news']),
    [targetView, setTargetView] = useState<'all' | PublishCollection>('all'),
    [targetCategoryIDs, setTargetCategoryIDs] = useState<Record<PublishCollection, string>>({
      news: '',
      posts: '',
    }),
    [categories, setCategories] = useState<Record<PublishCollection, Option[]>>({
      news: [],
      posts: [],
    }),
    [categoryTotals, setCategoryTotals] = useState<Record<PublishCollection, number>>({
      news: 0,
      posts: 0,
    }),
    [categoryQ, setCategoryQ] = useState(''),
    [categoryPage, setCategoryPage] = useState(1),
    [locale, setLocale] = useState(''),
    [siteStatus, setSiteStatus] = useState(''),
    [articleID, setArticleID] = useState(initialArticleID || ''),
    [article, setArticle] = useState<GeoArticle | null>(null)
  const [articlePickerOpen, setArticlePickerOpen] = useState(false),
    [publishTitle, setPublishTitle] = useState(''),
    [publishHTML, setPublishHTML] = useState('')
  const [articles, setArticles] = useState<ArticleOption[]>([]),
    [articleListLoading, setArticleListLoading] = useState(false),
    [articleQ, setArticleQ] = useState(''),
    [articlePage, setArticlePage] = useState(1),
    [articleTotal, setArticleTotal] = useState(0)
  const [planName, setPlanName] = useState(timestampName),
    [planTimezone, setPlanTimezone] = useState('Asia/Shanghai'),
    [planTime, setPlanTime] = useState(''),
    [planStartMode, setPlanStartMode] = useState<'active' | 'draft'>('active')
  const [publishTimeEdited, setPublishTimeEdited] = useState(false)
  const recordTabChosen = useRef(false)
  const [currentTime, setCurrentTime] = useState<number | null>(null)
  const [createdPlanID, setCreatedPlanID] = useState('')
  const [previewID, setPreviewID] = useState('')
  const [publishedPreview, setPublishedPreview] = useState<RecordItem | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const publishedDialog = useRef<HTMLDialogElement>(null)
  const publishedContent = useRef<HTMLElement>(null)
  const [items, setItems] = useState<RecordItem[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [recordTab, setRecordTab] = useState<RecordTab>('pending'),
    [recordCounts, setRecordCounts] = useState(emptyRecordCounts),
    [selectedRecordIDs, setSelectedRecordIDs] = useState<string[]>([]),
    [titleFilter, setTitleFilter] = useState(''),
    [accountFilter, setAccountFilter] = useState(''),
    [planFilter, setPlanFilter] = useState(''),
    [platformFilter, setPlatformFilter] = useState<'' | 'news' | 'posts'>(''),
    [startDateFilter, setStartDateFilter] = useState(''),
    [endDateFilter, setEndDateFilter] = useState(''),
    [recordFilters, setRecordFilters] = useState({
      title: '',
      account: '',
      plan: '',
      platform: '' as '' | 'news' | 'posts',
      startDate: '',
      endDate: '',
    }),
    [item, setItem] = useState<RecordItem | null>(null),
    [events, setEvents] = useState<
      { event: string; created_at: string; details: { message?: string; code?: string } }[]
    >([])
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [optionsLoading, setOptionsLoading] = useState(false),
    [articleLoading, setArticleLoading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [reload, setReload] = useState(0)
  const active = useRef(true),
    lock = useRef(false),
    mutation = useRef<AbortController | null>(null),
    planNameBaseline = useRef(planName),
    submittedManualBaseline = useRef<string | null>(null),
    planRequest = useRef<{ input: string; id: string } | null>(null)
  const manualValues = {
    planName,
    planTime,
    planTimezone,
    planStartMode,
    targetCollections,
    targetCategoryIDs,
    composeKind,
    articleID,
    manualConfigID,
    manualTerm,
    manualTitle,
    manualHTML,
    publishTitle,
    publishHTML,
  }
  const manualDirty =
    submittedManualBaseline.current !== null
      ? JSON.stringify(manualValues) !== submittedManualBaseline.current
      : Boolean(
          planName !== planNameBaseline.current ||
          publishTimeEdited ||
          planTimezone !== 'Asia/Shanghai' ||
          planStartMode !== (siteStatus && siteStatus !== 'published' ? 'draft' : 'active') ||
          targetCollections.length !== 1 ||
          targetCollections[0] !== 'news' ||
          targetCategoryIDs.news ||
          targetCategoryIDs.posts ||
          manualTitle.trim() ||
          manualHTML.trim(),
        )
  const publishDirty = Boolean(
    article && (publishTitle !== article.title || publishHTML !== article.html),
  )
  useWorkspaceUnsaved(
    view === 'compose' &&
      ((mode === 'manual' && manualDirty) || (composeKind === 'saved' && publishDirty)),
    busy,
  )
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      mutation.current?.abort()
    }
  }, [])
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const initial = setTimeout(() => {
      setCurrentTime(Date.now())
      interval = setInterval(() => setCurrentTime(Date.now()), 60_000)
    }, 0)
    return () => {
      clearTimeout(initial)
      if (interval) clearInterval(interval)
    }
  }, [])
  useEffect(() => {
    if (view !== 'compose' || composeKind !== 'direct') return
    const controller = new AbortController()
    setManualConfigLoading(true)
    void readJSON(`${geoAPIBase}/keywords?page=1`, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) {
          setManualConfigs(r.items)
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setManualConfigLoading(false)
      })
    return () => controller.abort()
  }, [view, composeKind, geoAPIBase])
  useEffect(() => {
    if (!manualConfigs.length) return
    const content = `${manualTitle} ${manualHTML.replace(/<[^>]*>/gu, ' ')}`.toLowerCase()
    const config =
      manualConfigs.find((item) =>
        [item.core, ...item.terms].some((term) => content.includes(term.toLowerCase())),
      ) || manualConfigs[0]
    setManualConfigID(config.id)
  }, [manualConfigs, manualTitle, manualHTML])
  useEffect(() => {
    if (currentTime !== null && !publishTimeEdited)
      setPlanTime(geoISOToLocalDateTime(new Date(currentTime).toISOString(), planTimezone))
  }, [currentTime, planTimezone, publishTimeEdited])
  useEffect(() => {
    if (view !== 'compose' || composeKind !== 'direct' || !manualConfigID) return
    const controller = new AbortController()
    setManualConfig(null)
    void readJSON(`${geoAPIBase}/keywords/${encodeURIComponent(manualConfigID)}`, controller.signal)
      .then((key) => {
        if (!controller.signal.aborted) {
          setManualConfig(key.item)
          setManualTerm(key.item.core)
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [view, composeKind, geoAPIBase, manualConfigID, reload])
  useEffect(() => {
    if (
      composeKind === 'direct' &&
      manualEditor.current &&
      manualEditor.current.innerHTML !== manualHTML
    )
      manualEditor.current.innerHTML = manualHTML
  }, [composeKind, manualHTML])
  useEffect(() => {
    if (composeKind !== 'saved' || !article || !publishEditor.current) return
    if (publishEditor.current.innerHTML !== publishHTML)
      publishEditor.current.innerHTML = publishHTML
  }, [article, composeKind, publishHTML])
  const invalidate = () => {
    setNotice('')
    setError('')
  }
  const toggleTargetCollection = (collection: PublishCollection) => {
    setTargetCollections((current) => {
      if (current.includes(collection)) {
        if (current.length === 1) {
          setError('至少保留一个本站发布目标。')
          return current
        }
        setTargetCategoryIDs((old) => ({ ...old, [collection]: '' }))
        return current.filter((item) => item !== collection)
      }
      return [...current, collection]
    })
    invalidate()
  }
  const visibleTargetCollections: PublishCollection[] =
    targetView === 'all' ? ['news', 'posts'] : [targetView]
  useEffect(() => {
    if (view !== 'compose') return
    const controller = new AbortController()
    setOptionsLoading(true)
    const requestedCollections: PublishCollection[] = targetCollections.length
      ? targetCollections
      : ['news']
    const timer = setTimeout(
      () =>
        void Promise.all(
          requestedCollections.map(
            async (collection) =>
              [
                collection,
                await readJSON(
                  `${endpoint}?view=options&collection=${collection}&q=${encodeURIComponent(categoryQ)}&page=${categoryPage}`,
                  controller.signal,
                ),
              ] as const,
          ),
        )
          .then((results) => {
            if (controller.signal.aborted) return
            const byCollection = Object.fromEntries(results) as Partial<
              Record<
                PublishCollection,
                {
                  items: Option[]
                  total: number
                  defaultLocale: string
                  siteStatus: string
                }
              >
            >
            setCategories({
              news: byCollection.news?.items || [],
              posts: byCollection.posts?.items || [],
            })
            setCategoryTotals({
              news: byCollection.news?.total || 0,
              posts: byCollection.posts?.total || 0,
            })
            const first = Object.values(byCollection)[0]
            setSiteStatus(first?.siteStatus || '')
            if (!first) return
            setLocale(first.defaultLocale)
            setPlanStartMode(first.siteStatus === 'published' ? 'active' : 'draft')
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message)
          })
          .finally(() => {
            if (!controller.signal.aborted) setOptionsLoading(false)
          }),
      180,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [view, endpoint, targetCollections, categoryQ, categoryPage, reload])
  useEffect(() => {
    if (view !== 'compose') return
    const controller = new AbortController()
    setArticleListLoading(true)
    const timer = setTimeout(
      () =>
        void readJSON(
          `${articlesEndpoint}?q=${encodeURIComponent(articleQ)}&page=${articlePage}&pageSize=20`,
          controller.signal,
        )
          .then((r) => {
            if (!controller.signal.aborted) {
              setArticles(r.items)
              setArticleTotal(r.total)
            }
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message)
          })
          .finally(() => {
            if (!controller.signal.aborted) setArticleListLoading(false)
          }),
      180,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [view, articlesEndpoint, articleQ, articlePage, reload])
  useEffect(() => {
    if (view !== 'compose') return
    const controller = new AbortController()
    setArticle(null)
    setPublishTitle('')
    setPublishHTML('')
    setArticleLoading(!!articleID)
    if (articleID)
      void readJSON(`${articlesEndpoint}/${encodeURIComponent(articleID)}`, controller.signal)
        .then((r) => {
          if (!controller.signal.aborted) {
            setArticle(r.item)
            setPublishTitle(r.item.title)
            setPublishHTML(r.item.html)
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setArticleLoading(false)
        })
    return () => controller.abort()
  }, [view, articlesEndpoint, articleID])
  useEffect(() => {
    if (view !== 'records' || recordId) return
    const timer = setTimeout(() => {
      setPage(1)
      setRecordFilters({
        title: titleFilter,
        account: accountFilter,
        plan: planFilter,
        platform: platformFilter,
        startDate: startDateFilter,
        endDate: endDateFilter,
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [
    view,
    recordId,
    titleFilter,
    accountFilter,
    planFilter,
    platformFilter,
    startDateFilter,
    endDateFilter,
  ])
  useEffect(() => {
    setSelectedRecordIDs([])
  }, [page, pageSize, recordTab, recordFilters])
  useEffect(() => {
    if (view !== 'records') return
    const controller = new AbortController()
    setLoading(true)
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      tab: recordTab,
      title: recordFilters.title,
      account: recordFilters.account,
      plan: recordFilters.plan,
      platform: recordFilters.platform,
      startDate: recordFilters.startDate,
      endDate: recordFilters.endDate,
    })
    void readJSON(
      recordId ? `${endpoint}/${encodeURIComponent(recordId)}` : `${endpoint}?${query.toString()}`,
      controller.signal,
    )
      .then((r) => {
        if (controller.signal.aborted) return
        if (recordId) {
          setItem(r.item)
          setEvents(r.events)
        } else {
          setItems(r.items)
          setTotal(r.total)
          setRecordCounts({ ...emptyRecordCounts, ...r.counts })
          if (!recordTabChosen.current) {
            recordTabChosen.current = true
            const first = recordTabs.find((tab) => Number(r.counts?.[tab.id]) > 0)
            if (first) setRecordTab(first.id)
          }
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [view, endpoint, recordId, page, pageSize, recordTab, recordFilters, reload])
  useEffect(() => {
    if (view !== 'records') return
    const timer = setTimeout(() => setReload((n) => n + 1), 5000)
    return () => clearTimeout(timer)
  }, [view, recordId, item, items, reload])
  useEffect(() => {
    if (!previewID) return
    const controller = new AbortController()
    setPublishedPreview(null)
    setPreviewLoading(true)
    setCopied(false)
    publishedDialog.current?.showModal?.()
    void readJSON(`${endpoint}/${encodeURIComponent(previewID)}`, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPublishedPreview(result.item)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause.message || '读取文章失败。')
          publishedDialog.current?.close()
          setPreviewID('')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false)
      })
    return () => controller.abort()
  }, [previewID, endpoint])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copyPublishedArticle = async () => {
    const record = publishedPreview || item
    if (!record) return
    try {
      await navigator.clipboard.writeText(
        `${record.title}\n\n${publishedContent.current?.innerText || ''}\n\n${record.target_url || ''}`,
      )
      setCopied(true)
    } catch {
      setError('复制失败，请重试。')
    }
  }
  const currentPublishHTML = () =>
    publishEditor.current ? publishEditor.current.innerHTML : publishHTML
  const saveManualArticle = async (): Promise<GeoArticle | null> => {
    if (lock.current) return null
    const html = manualEditor.current?.innerHTML || manualHTML
    const body = {
      optimizationID: manualConfig?.id,
      optimizationVersion: manualConfig?.version,
      term: manualTerm,
      question: manualTitle,
      materialGroupID: '',
      materialGroupVersion: 0,
      imageID: null,
      direction: '产品介绍',
      length: 'short',
      title: manualTitle,
      summary: '',
      html,
      reviewNote: '',
    }
    if (!manualConfig || !manualTerm || !manualTitle.trim() || !html.trim()) {
      setError(
        manualConfigLoading
          ? '企业配置正在读取，请稍后重试。'
          : !manualConfig
            ? '请先在GEO优化词中保存企业配置。'
            : '请填写文章标题和正文。',
      )
      return null
    }
    const encoded = JSON.stringify(body)
    if (!manualRequest.current || manualRequest.current.input !== encoded)
      manualRequest.current = { input: encoded, id: crypto.randomUUID() }
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    try {
      const response = await fetch(articlesEndpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, requestId: manualRequest.current.id }),
      })
      const result = await readPublishResponse(response)
      if (!active.current || controller.signal.aborted) return null
      const savedArticle = result.item as GeoArticle
      setComposeKind('saved')
      setArticleID(savedArticle.id)
      setArticle(savedArticle)
      setPublishTitle(savedArticle.title)
      setPublishHTML(savedArticle.html)
      setArticleLoading(false)
      manualRequest.current = null
      setNotice('保存成功')
      return savedArticle
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '保存失败，正文仍保留。')
      return null
    } finally {
      lock.current = false
      if (active.current) {
        setBusy(false)
      }
    }
  }
  const submitManual = async () => {
    if (lock.current) return
    const name = planName.trim()
    if (!name || name.length > 20) {
      setError('请填写1至20个字符的计划名称。')
      return
    }
    if (!targetCollections.length) {
      setError('请选择至少一个本站发布目标。')
      return
    }
    if (targetCollections.some((collection) => !targetCategoryIDs[collection])) {
      setError('请为每个发布目标选择当前客户的分类。')
      return
    }
    if (siteStatus !== 'published' && planStartMode !== 'draft') {
      setError('当前站点尚未上线或已停用，请选择“暂不开启”保存计划。')
      return
    }
    try {
      if (
        publishTimeEdited &&
        planTime &&
        Date.parse(geoLocalDateTimeToISO(planTime, planTimezone)) < Date.now() - 60_000
      )
        throw new Error('请选择当前或未来的发布时间。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '请选择有效的计划时间。')
      return
    }
    let selectedArticle = article
    if (!selectedArticle && composeKind === 'direct') selectedArticle = await saveManualArticle()
    if (!selectedArticle) {
      if (composeKind === 'saved') setError('请先选择一篇已核查文章。')
      return
    }
    if (selectedArticle.status !== 'ready' || selectedArticle.context.settings.locale !== locale) {
      setError('文章必须是当前客户默认语言下已核查通过的最新修订。')
      return
    }
    const contentChanged = Boolean(
      article &&
      (publishTitle !== selectedArticle.title || currentPublishHTML() !== selectedArticle.html),
    )
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    try {
      if (contentChanged) {
        const response = await fetch(
          `${articlesEndpoint}/${encodeURIComponent(selectedArticle.id)}`,
          {
            method: 'PATCH',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: publishTitle,
              summary: selectedArticle.summary,
              html: currentPublishHTML(),
              version: selectedArticle.version,
              ready: true,
              factsReviewed: true,
              reviewNote: '用户在手动发布页面提交修订并请求发布。',
            }),
          },
        )
        const saved = await readPublishResponse(response)
        selectedArticle = saved.item as GeoArticle
        setArticle(selectedArticle)
        setPublishTitle(selectedArticle.title)
        setPublishHTML(selectedArticle.html)
        if (selectedArticle.status !== 'ready')
          throw new Error(
            `文章已保存为待编辑修订：${selectedArticle.validation.join(' ') || '请检查正文后重新核查。'}`,
          )
      }
      const chosenTime = planTime ? geoLocalDateTimeToISO(planTime, planTimezone) : null
      const runAt =
        publishTimeEdited && chosenTime && Date.parse(chosenTime) >= Date.now() + 120_000
          ? chosenTime
          : null
      const date = runAt
        ? planTime.slice(0, 10)
        : geoISOToLocalDateTime(new Date().toISOString(), planTimezone).slice(0, 10)
      const config = {
        sourceMode: 'articles' as const,
        sourceIDs: [selectedArticle.id],
        targets: targetCollections.map((collection) => ({
          collection,
          categoryID: Number(targetCategoryIDs[collection]),
          categoryName: '',
          categoryUpdatedAt: '',
          locale,
          companySlug: company.slug,
          origin: '',
          companyUpdatedAt: '',
        })),
        distribution: 'all' as const,
        approvalMode: 'auto' as const,
        maxArticles: 1,
        schedule: {
          cadence: 'once' as const,
          timezone: planTimezone,
          startDate: date,
          endDate: date,
          runAt,
        },
      }
      const createInput = JSON.stringify({ name, config, planStartMode })
      if (!planRequest.current || planRequest.current.input !== createInput)
        planRequest.current = { input: createInput, id: crypto.randomUUID() }
      const created = await readJSON(plansEndpoint, controller.signal, {
        action: 'create',
        name,
        config,
        requestId: planRequest.current.id,
      })
      let plan = created.item
      if (planStartMode === 'active' && plan.state !== 'active') {
        const previewResult = await readJSON(plansEndpoint, controller.signal, {
          action: 'preview',
          config,
        })
        const preview = previewResult.preview
        if (!preview.nextRunAt) throw new Error('当前时间设置没有可执行的发布时间，请调整后重试。')
        if (preview.itemCount !== targetCollections.length)
          throw new Error('部分发布目标已存在相同文章，请检查发布计划或选择其他文章。')
        const activated = await readJSON(plansEndpoint, controller.signal, {
          action: 'activate',
          id: plan.id,
          version: plan.version,
          confirmed: true,
          previewNextRunAt: preview.nextRunAt,
        })
        plan = activated.item
      }
      if (!active.current || controller.signal.aborted) return
      setArticle(selectedArticle)
      planNameBaseline.current = planName
      submittedManualBaseline.current = JSON.stringify({
        ...manualValues,
        composeKind: 'saved',
        articleID: selectedArticle.id,
        publishTitle: selectedArticle.title,
        publishHTML: selectedArticle.html,
      })
      planRequest.current = null
      setNotice(
        planStartMode === 'active'
          ? '文章已提交，单次发布计划已开启。'
          : '文章已保存，单次发布计划暂未开启。',
      )
      setCreatedPlanID(plan.id)
      setReload((n) => n + 1)
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '发布提交失败，输入已保留。')
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  const run = async (action: 'retry' | 'cancel', record?: RecordItem) => {
    if (lock.current) return
    if (
      action === 'retry' &&
      record?.state === 'unknown' &&
      !window.confirm(
        '结果尚未确定。请先核对目标地址和站点内容，确认没有发布成功，再重试。继续登记重试？',
      )
    )
      return
    if (action === 'cancel' && !window.confirm('取消这条尚未完成的发布请求？')) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    try {
      const r = await readJSON(endpoint, controller.signal, {
        action,
        id: record?.id,
        acknowledgeUnknown: record?.state === 'unknown',
      })
      if (!active.current || controller.signal.aborted) return
      setItem(r.item)
      setReload((n) => n + 1)
      setNotice(action === 'cancel' ? '发布请求已取消。' : '重试请求已登记，请查看执行结果。')
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '操作失败，输入已保留。')
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  const actions = (record: RecordItem) => (
    <span className="geo-publish__actions">
      {record.state === 'queued' && (
        <button
          type="button"
          className="geo-workspace__link"
          disabled={busy}
          onClick={() => void run('cancel', record)}
        >
          取消发布
        </button>
      )}
      {['failed', 'unknown'].includes(record.state) && (
        <button
          type="button"
          className="geo-workspace__link"
          disabled={busy}
          onClick={() => void run('retry', record)}
        >
          {record.state === 'unknown' ? '核对后重试' : '重试'}
        </button>
      )}
    </span>
  )
  const recordKey = (record: RecordItem) => `${record.kind}:${record.id}`
  const canSelectRecord = (record: RecordItem) =>
    (record.kind === 'plan_item' && record.state === 'awaiting_review') ||
    (record.kind === 'intent' && record.state === 'queued')
  const selectableRecords = items.filter(canSelectRecord)
  const selectedRecords = items.filter((record) => selectedRecordIDs.includes(recordKey(record)))
  const confirmableRecords = selectedRecords.filter(
    (record) => record.kind === 'plan_item' && record.state === 'awaiting_review',
  )
  const cancellableRecords = selectedRecords.filter(canSelectRecord)
  const allSelectableSelected =
    selectableRecords.length > 0 &&
    selectableRecords.every((record) => selectedRecordIDs.includes(recordKey(record)))
  const performRecordAction = async (record: RecordItem, action: 'confirm' | 'cancel') => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    try {
      const planItem = record.kind === 'plan_item'
      const result = await readJSON(
        planItem ? plansEndpoint : endpoint,
        controller.signal,
        planItem
          ? {
              action: action === 'confirm' ? 'approve' : 'skip',
              runID: record.run_id,
              itemID: record.item_id,
            }
          : { action: 'cancel', id: record.id },
      )
      if (!active.current || controller.signal.aborted) return
      setNotice(result.message || (action === 'confirm' ? '已确认发布。' : '已取消发布。'))
      setSelectedRecordIDs([])
      setReload((n) => n + 1)
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : '操作失败，请重试。')
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  const performBulkRecordAction = async (action: 'confirm' | 'cancel') => {
    const rows = action === 'confirm' ? confirmableRecords : cancellableRecords
    if (lock.current || !rows.length) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    let succeeded = 0
    const failures: string[] = []
    try {
      for (const record of rows) {
        try {
          const planItem = record.kind === 'plan_item'
          await readJSON(
            planItem ? plansEndpoint : endpoint,
            controller.signal,
            planItem
              ? {
                  action: action === 'confirm' ? 'approve' : 'skip',
                  runID: record.run_id,
                  itemID: record.item_id,
                }
              : { action: 'cancel', id: record.id },
          )
          succeeded += 1
        } catch (e) {
          failures.push(`${record.title}：${e instanceof Error ? e.message : '操作失败'}`)
        }
      }
      if (!active.current || controller.signal.aborted) return
      setSelectedRecordIDs([])
      setReload((n) => n + 1)
      setNotice(
        `已${action === 'confirm' ? '确认' : '取消'} ${succeeded} 条${failures.length ? `；${failures.length} 条未处理` : ''}。`,
      )
      if (failures.length) setError(failures.slice(0, 3).join('\n'))
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  const modeSelector = (
    <div className="geo-publish__modes" role="radiogroup" aria-label="发布方式">
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'manual'}
        className={mode === 'manual' ? 'is-active' : ''}
        onClick={() => setMode('manual')}
      >
        <strong>手动发布/manual release</strong>
        <span>自定义编写文章内容即时直接发布</span>
        <span>适合有明确发布内容时使用</span>
        <span className="geo-publish__mode-art geo-publish__mode-art--manual" aria-hidden="true" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'auto'}
        className={mode === 'auto' ? 'is-active' : ''}
        onClick={() => {
          setMode('auto')
          setAutoMounted(true)
        }}
      >
        <strong>自动发布/auto publish</strong>
        <span>AI自动生成文章内容按任务策略发布</span>
        <span>适合有预设排期内容时使用</span>
        <span className="geo-publish__mode-art geo-publish__mode-art--auto" aria-hidden="true" />
      </button>
    </div>
  )
  const publishedArticleContent = (record: RecordItem) => (
    <>
      <div className="geo-published-preview__title">
        <h2>{record.title}</h2>
        <button type="button" onClick={() => void copyPublishedArticle()}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      {record.target_url && (
        <div className="geo-published-preview__link">
          <span>发布链接</span>
          <a href={record.target_url} target="_blank" rel="noopener noreferrer">
            {record.target_url}
          </a>
        </div>
      )}
      <article
        ref={publishedContent}
        className="geo-published-preview__content"
        dir="auto"
        dangerouslySetInnerHTML={{ __html: record.html || '' }}
      />
      <footer className="geo-published-preview__count">
        {(record.html || '').replace(/<[^>]*>/gu, '').replace(/\s/gu, '').length} 字
      </footer>
    </>
  )
  return (
    <section className={`geo-workspace geo-publish${view === 'records' ? ' is-records' : ''}`}>
      <header className="geo-workspace__heading">
        <div>
          {view === 'compose' && !recordId && (
            <Link className="geo-publish__back" href={`${base}/creation`} aria-label="返回文章创作">
              ‹
            </Link>
          )}
          {recordId && (
            <Link className="geo-published-preview__back" href={`${base}/records`}>
              〈 返回发布记录
            </Link>
          )}
          <h1>
            {view === 'compose'
              ? '文章发布'
              : recordId
                ? item?.state === 'published'
                  ? '查看文章'
                  : '发布详情'
                : '发布记录'}
          </h1>
        </div>
        {view === 'records' && !recordId && (
          <div className="geo-publish__record-filters">
            <input
              aria-label="按文章标题筛选"
              placeholder="请输入标题"
              maxLength={100}
              value={titleFilter}
              onChange={(event) => setTitleFilter(event.target.value)}
            />
            <input
              aria-label="按发布账号筛选"
              placeholder="请输入账号"
              maxLength={100}
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
            />
            <input
              aria-label="按发布计划筛选"
              placeholder="请输入计划名称"
              maxLength={100}
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value)}
            />
            <select
              aria-label="按发布平台筛选"
              value={platformFilter}
              onChange={(event) => setPlatformFilter(event.target.value as '' | 'news' | 'posts')}
            >
              <option value="">请选择平台</option>
              <option value="news">本站新闻</option>
              <option value="posts">本站 Blog</option>
            </select>
            <div className="geo-publish__date-range">
              <input
                aria-label="发布时间起始日期"
                type="date"
                onClick={openTimePicker}
                value={startDateFilter}
                onChange={(event) => setStartDateFilter(event.target.value)}
              />
              <span>—</span>
              <input
                aria-label="发布时间结束日期"
                type="date"
                onClick={openTimePicker}
                value={endDateFilter}
                onChange={(event) => setEndDateFilter(event.target.value)}
              />
            </div>
          </div>
        )}
      </header>
      {error && (
        <p role="alert" className="geo-workspace__error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="geo-workspace__notice">
          {notice}
          {item && view === 'compose' && (
            <>
              {' '}
              <Link href={`${base}/records/${item.id}`}>查看这次发布</Link>
            </>
          )}
        </p>
      )}
      {view === 'compose' && autoMounted && (
        <div className="geo-publish__auto" hidden={mode !== 'auto'}>
          <GeoPlans
            company={company}
            canManageSite={canManageSite}
            createMode
            hideQuickNav
            modeSelector={
              <div className="geo-workspace__field">
                <label>
                  发布方式 <b>*</b>
                </label>
                {modeSelector}
              </div>
            }
          />
        </div>
      )}
      {view === 'compose' && (
        <div className="geo-workspace__panel geo-workspace__form" hidden={mode !== 'manual'}>
          <fieldset disabled={busy}>
            <section id="geo-publish-basic" className="geo-publish__section">
              <div className="geo-workspace__field">
                <label htmlFor="publish-plan-name">
                  计划名称 <b>*</b>
                </label>
                <input
                  id="publish-plan-name"
                  required
                  maxLength={20}
                  value={planName}
                  onChange={(event) => {
                    setPlanName(event.target.value)
                    invalidate()
                  }}
                />
              </div>
              <div className="geo-workspace__field">
                <label>
                  发布方式 <b>*</b>
                </label>
                {modeSelector}
              </div>
              <div className="geo-workspace__field geo-publish__time-field">
                <label htmlFor="publish-timezone">
                  发布时间 <b>*</b>
                </label>
                <div>
                  <select
                    id="publish-timezone"
                    aria-label="发布时间时区"
                    value={planTimezone}
                    onChange={(event) => {
                      setPlanTimezone(event.target.value)
                      invalidate()
                    }}
                  >
                    {geoTimezoneGroups.map((group) => (
                      <optgroup label={group.label} key={group.label}>
                        {group.options.map((timezone) => (
                          <option key={timezone.value} value={timezone.value}>
                            {timezone.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {!geoTimezoneOptions.some((timezone) => timezone.value === planTimezone) && (
                      <option value={planTimezone}>{planTimezone}</option>
                    )}
                  </select>
                  <div className={`geo-publish__time-controls${planTime ? '' : ' is-empty'}`}>
                    <input
                      type="datetime-local"
                      aria-label="指定发布时间"
                      onClick={openTimePicker}
                      value={planTime}
                      max={
                        currentTime === null
                          ? undefined
                          : geoISOToLocalDateTime(
                              new Date(currentTime + 90 * 86400_000).toISOString(),
                              planTimezone,
                            )
                      }
                      onChange={(event) => {
                        setPublishTimeEdited(true)
                        setPlanTime(event.target.value)
                        invalidate()
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>
            <section id="geo-publish-target" className="geo-publish__section">
              <div className="geo-publish__target-layout">
                <h2>发布到</h2>
                <div className="geo-publish__target-content">
                  <div
                    className="geo-publish__destination-tabs"
                    role="tablist"
                    aria-label="发布目标"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={targetView === 'all'}
                      className={targetView === 'all' ? 'is-active' : ''}
                      onClick={() => setTargetView('all')}
                    >
                      全部
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={targetView === 'news'}
                      className={targetView === 'news' ? 'is-active' : ''}
                      onClick={() => setTargetView('news')}
                    >
                      独立站（1）
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={targetView === 'posts'}
                      className={targetView === 'posts' ? 'is-active' : ''}
                      onClick={() => setTargetView('posts')}
                    >
                      博客（1）
                    </button>
                  </div>
                  <div
                    className="geo-publish__destination-cards"
                    id="geo-publish-target-cards"
                    role="group"
                    aria-label="本站发布目标"
                  >
                    {visibleTargetCollections.map((collection) => {
                      const isNews = collection === 'news'
                      return (
                        <label
                          className={`geo-publish__destination-card ${targetCollections.includes(collection) ? 'is-selected' : ''}`}
                          key={collection}
                        >
                          <input
                            type="checkbox"
                            checked={targetCollections.includes(collection)}
                            onChange={() => toggleTargetCollection(collection)}
                          />
                          <span className="geo-publish__destination-mark" aria-hidden="true">
                            {isNews ? '站' : 'Blog'}
                          </span>
                          <span className="geo-publish__destination-copy">
                            <strong>{isNews ? '本站新闻' : '本站 Blog'}</strong>
                            <small>{isNews ? '独立站 · 新闻内容' : '博客 · Blog 内容'}</small>
                          </span>
                          <span className="geo-publish__destination-check" aria-hidden="true">
                            ✓
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  <div className="geo-publish__target-categories">
                    {targetCollections.map((collection) => (
                      <div className="geo-workspace__field" key={collection}>
                        <label htmlFor={`publish-category-${collection}`}>
                          {collection === 'news' ? '独立站分类' : 'Blog分类'}
                        </label>
                        <select
                          id={`publish-category-${collection}`}
                          value={targetCategoryIDs[collection]}
                          onChange={(event) => {
                            setTargetCategoryIDs((old) => ({
                              ...old,
                              [collection]: event.target.value,
                            }))
                            invalidate()
                          }}
                          disabled={optionsLoading || busy}
                        >
                          <option value="">
                            {optionsLoading ? '正在读取分类…' : '请选择分类'}
                          </option>
                          {targetCategoryIDs[collection] &&
                            !categories[collection].some(
                              (category) => category.id === Number(targetCategoryIDs[collection]),
                            ) && (
                              <option value={targetCategoryIDs[collection]}>
                                已选分类 #{targetCategoryIDs[collection]}
                              </option>
                            )}
                          {categories[collection].map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {targetCollections.some((collection) => categoryTotals[collection] > 40) && (
                      <div className="geo-workspace__field geo-publish__category-search">
                        <label htmlFor="publish-category-search">搜索分类</label>
                        <input
                          id="publish-category-search"
                          placeholder="搜索分类"
                          maxLength={100}
                          value={categoryQ}
                          onChange={(event) => {
                            setCategoryQ(event.target.value)
                            setCategoryPage(1)
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {targetCollections.some((collection) => categoryTotals[collection] > 40) && (
                    <div className="geo-workspace__pager geo-publish__category-pager">
                      <button
                        type="button"
                        className="geo-workspace__button"
                        disabled={categoryPage <= 1 || optionsLoading}
                        onClick={() => setCategoryPage((current) => current - 1)}
                      >
                        上一页
                      </button>
                      <span>
                        {categoryPage} /{' '}
                        {Math.max(
                          1,
                          ...targetCollections.map((collection) =>
                            Math.ceil(categoryTotals[collection] / 40),
                          ),
                        )}
                      </span>
                      <button
                        type="button"
                        className="geo-workspace__button"
                        disabled={
                          optionsLoading ||
                          targetCollections.every(
                            (collection) => categoryPage * 40 >= categoryTotals[collection],
                          )
                        }
                        onClick={() => setCategoryPage((current) => current + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
            <section id="geo-publish-content" className="geo-publish__section">
              {composeKind === 'saved' ? (
                <div className="geo-publish__article-source">
                  {articleLoading ? (
                    <p role="status">正在读取文章…</p>
                  ) : article ? (
                    <>
                      <div className="geo-workspace__field geo-publish__title-row">
                        <label htmlFor="publish-title">文章内容</label>
                        <div className="geo-publish__title-field">
                          <input
                            id="publish-title"
                            aria-label="文章标题"
                            required
                            maxLength={100}
                            value={publishTitle}
                            placeholder="请输入文章标题（2-100字）"
                            onChange={(e) => {
                              setPublishTitle(e.target.value)
                              invalidate()
                            }}
                          />
                          <div className="geo-publish__title-tools">
                            <span>{publishTitle.length}/100</span>
                            <button
                              type="button"
                              className="geo-publish__title-action"
                              aria-label="更换创作记录文章"
                              onClick={() => setArticlePickerOpen(true)}
                              disabled={busy}
                            >
                              更换文章&nbsp;››
                            </button>
                            <button
                              type="button"
                              className="geo-publish__switch-source"
                              onClick={() => {
                                setComposeKind('direct')
                                setArticleID('')
                                setArticle(null)
                              }}
                              disabled={busy}
                            >
                              直接写新文章
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="geo-publish__article-meta">
                        <span>
                          修订 {article.version} ·{' '}
                          {article.status === 'ready' ? '可发布' : '待编辑'}
                        </span>
                        <Link href={`${base}/articles/${article.id}`}>创作记录</Link>
                      </div>
                      {!!article.validation.length && (
                        <p className="geo-workspace__error">
                          文章仍需处理：{article.validation.join(' ')}
                        </p>
                      )}
                      <GeoRichTextToolbar
                        editorRef={publishEditor}
                        disabled={busy}
                        onChange={(html) => {
                          setPublishHTML(html)
                          invalidate()
                        }}
                        images={article.context.materialGroup.images.map((image) => ({
                          url: image.url,
                          alt: image.alt,
                          label: image.alt || image.filename,
                        }))}
                      />
                      <div
                        ref={publishEditor}
                        role="textbox"
                        aria-label="文章正文"
                        aria-multiline="true"
                        contentEditable={!busy}
                        suppressContentEditableWarning
                        className="geo-article__body geo-publish__body"
                        dir="auto"
                        onInput={(e) => {
                          setPublishHTML(e.currentTarget.innerHTML)
                          invalidate()
                        }}
                      />
                    </>
                  ) : (
                    <p className="geo-publish__empty">还没有选择文章</p>
                  )}
                  {articlePickerOpen && (
                    <div
                      className="geo-publish__dialog-backdrop"
                      role="presentation"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setArticlePickerOpen(false)
                      }}
                      onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setArticlePickerOpen(false)
                      }}
                    >
                      <section
                        className="geo-publish__article-picker"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="publish-article-picker-title"
                        tabIndex={-1}
                      >
                        <header>
                          <div>
                            <h2 id="publish-article-picker-title">选择创作文章</h2>
                            <p className="geo-workspace__hint">
                              仅当前客户的文章可选；发布目标使用该客户默认语言（{locale || '读取中'}
                              ）。
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="关闭文章选择"
                            onClick={() => setArticlePickerOpen(false)}
                          >
                            ×
                          </button>
                        </header>
                        <input
                          aria-label="搜索可选文章"
                          autoFocus
                          placeholder="搜索文章标题"
                          value={articleQ}
                          onChange={(e) => {
                            setArticleQ(e.target.value)
                            setArticlePage(1)
                          }}
                          maxLength={100}
                        />
                        {articleListLoading ? (
                          <p role="status">正在读取文章…</p>
                        ) : articles.length ? (
                          <div className="geo-publish__article-options">
                            {articles.map((option) => {
                              const eligible = option.status === 'ready' && option.locale === locale
                              return (
                                <article key={option.id}>
                                  <div>
                                    <strong>{option.title}</strong>
                                    <small>
                                      修订 {option.version} · {option.locale} ·{' '}
                                      {option.status !== 'ready'
                                        ? '待编辑'
                                        : option.locale !== locale
                                          ? '语言不匹配'
                                          : '可发布'}
                                    </small>
                                  </div>
                                  <button
                                    type="button"
                                    className="geo-workspace__button"
                                    disabled={!eligible || articleLoading}
                                    onClick={() => {
                                      invalidate()
                                      setArticleID(option.id)
                                      setArticlePickerOpen(false)
                                    }}
                                  >
                                    选择
                                  </button>
                                </article>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="geo-publish__empty">
                            {articleQ ? '没有匹配的文章' : '当前客户暂无创作记录'}
                          </p>
                        )}
                        <footer className="geo-workspace__pager">
                          <button
                            type="button"
                            className="geo-workspace__button"
                            disabled={articlePage <= 1 || articleListLoading}
                            onClick={() => setArticlePage((n) => n - 1)}
                          >
                            上一页
                          </button>
                          <span>
                            {articlePage} / {Math.max(1, Math.ceil(articleTotal / 20))} · 共{' '}
                            {articleTotal} 篇
                          </span>
                          <button
                            type="button"
                            className="geo-workspace__button"
                            disabled={articlePage * 20 >= articleTotal || articleListLoading}
                            onClick={() => setArticlePage((n) => n + 1)}
                          >
                            下一页
                          </button>
                        </footer>
                      </section>
                    </div>
                  )}
                </div>
              ) : (
                <div className="geo-publish__direct">
                  <div className="geo-workspace__field">
                    <label htmlFor="manual-title">文章内容</label>
                    <div className="geo-publish__title-field">
                      <input
                        id="manual-title"
                        aria-label="文章标题"
                        required
                        maxLength={100}
                        value={manualTitle}
                        placeholder="请输入文章标题（2-100字）"
                        onChange={(e) => {
                          setManualTitle(e.target.value)
                          manualRequest.current = null
                        }}
                      />
                      <div className="geo-publish__title-tools">
                        <span>{manualTitle.length}/100</span>
                        <button
                          type="button"
                          className="geo-publish__title-action"
                          aria-label="选择创作记录文章"
                          onClick={() => {
                            setComposeKind('saved')
                            setArticlePickerOpen(true)
                          }}
                          disabled={busy}
                        >
                          选择文章&nbsp;››
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="geo-workspace__field">
                    <label className="geo-publish__editor-label" htmlFor="manual-editor">
                      文章正文
                    </label>
                    <div>
                      <GeoRichTextToolbar
                        editorRef={manualEditor}
                        disabled={busy}
                        onChange={(html) => {
                          setManualHTML(html)
                          manualRequest.current = null
                        }}
                      />
                      <div
                        ref={manualEditor}
                        id="manual-editor"
                        contentEditable={!busy}
                        suppressContentEditableWarning
                        role="textbox"
                        aria-label="直接创作文章正文"
                        aria-multiline="true"
                        className="geo-article__body"
                        dir="auto"
                        onInput={(e) => {
                          setManualHTML(e.currentTarget.innerHTML)
                          manualRequest.current = null
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </fieldset>
          <footer>
            <button
              type="button"
              className="geo-workspace__button is-primary"
              disabled={
                busy ||
                articleLoading ||
                (composeKind === 'saved' && !article && !articleLoading) ||
                (article && article.status !== 'ready' && !publishDirty) ||
                !targetCollections.length ||
                targetCollections.some((collection) => !targetCategoryIDs[collection]) ||
                (siteStatus !== 'published' && planStartMode !== 'draft')
              }
              onClick={() => void submitManual()}
            >
              {busy ? '提交中…' : siteStatus === 'published' ? '提交发布' : '保存计划'}
            </button>
          </footer>
          {createdPlanID && (
            <p className="geo-workspace__hint">
              <Link href={`${base}/plans`}>查看发布计划</Link>
            </p>
          )}
        </div>
      )}
      {view === 'records' && (
        <div className="geo-workspace__panel">
          {loading && !item && !items.length ? (
            <p role="status">正在读取…</p>
          ) : recordId ? (
            item &&
            (item.state === 'published' ? (
              <div className="geo-published-preview__standalone">
                {publishedArticleContent(item)}
              </div>
            ) : (
              <>
                <dl className="geo-publish__detail">
                  <dt>文章</dt>
                  <dd>
                    <Link href={`${base}/articles/${item.article_id}`}>{item.title}</Link> ·
                    发布修订{item.article_version}
                  </dd>
                  <dt>状态</dt>
                  <dd>{recordStateLabel(item.state)}</dd>
                  <dt>目标</dt>
                  <dd>
                    {item.target.collection === 'news' ? '本站新闻' : '本站Blog'} /{' '}
                    {item.target.categoryName} / {item.target.locale}
                  </dd>
                  <dt>约定时间</dt>
                  <dd>{time(item.publish_at)}</dd>
                  <dt>执行次数</dt>
                  <dd>{item.attempts}</dd>
                  <dt>实际内容</dt>
                  <dd>
                    {item.target_id && item.target_url ? (
                      <a href={item.target_url} target="_blank" rel="noreferrer">
                        #{item.target_id} · {item.target_url}
                      </a>
                    ) : (
                      '尚无确定的已发布内容'
                    )}
                  </dd>
                  <dt>执行说明</dt>
                  <dd>
                    {item.message || '等待执行'} {item.error_code && `（${item.error_code}）`}
                  </dd>
                </dl>
                {actions(item)}
                <h2>执行事件</h2>
                <ol className="geo-publish__events">
                  {events.map((event, index) => (
                    <li key={index}>
                      <span>
                        {time(event.created_at)} ·{' '}
                        {(
                          {
                            confirmed: '已确认请求',
                            started: '开始执行',
                            published: '站点已发布',
                            failed: '执行失败',
                            unknown: '结果待核对',
                            retry: '登记重试',
                            cancel: '取消请求',
                          } as Record<string, string>
                        )[event.event] || event.event}
                      </span>
                      {event.details?.message && <p>{event.details.message}</p>}
                    </li>
                  ))}
                </ol>
              </>
            ))
          ) : (
            <>
              <div className="geo-publish__records-header">
                <div className="geo-publish__record-tabs" role="tablist" aria-label="发布状态">
                  {recordTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={recordTab === tab.id}
                      className={recordTab === tab.id ? 'is-active' : ''}
                      onClick={() => {
                        setRecordTab(tab.id)
                        setPage(1)
                      }}
                    >
                      {tab.label} <span>{recordCounts[tab.id]}</span>
                    </button>
                  ))}
                </div>
                <div className="geo-publish__record-actions">
                  <div>
                    <button
                      type="button"
                      className="geo-workspace__button is-primary"
                      disabled={busy || loading || !confirmableRecords.length}
                      onClick={() => void performBulkRecordAction('confirm')}
                    >
                      确认发布
                      {confirmableRecords.length ? `（${confirmableRecords.length}）` : ''}
                    </button>
                    <button
                      type="button"
                      className="geo-workspace__button"
                      disabled={busy || loading || !cancellableRecords.length}
                      onClick={() => void performBulkRecordAction('cancel')}
                    >
                      取消发布
                      {cancellableRecords.length ? `（${cancellableRecords.length}）` : ''}
                    </button>
                  </div>
                </div>
              </div>
              <div className="geo-workspace__table-scroll">
                <table className="geo-publish__record-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="选择所有行"
                          checked={allSelectableSelected}
                          disabled={!selectableRecords.length || busy || loading}
                          onChange={(event) =>
                            setSelectedRecordIDs(
                              event.target.checked ? selectableRecords.map(recordKey) : [],
                            )
                          }
                        />
                      </th>
                      <th>序号</th>
                      <th>文章标题</th>
                      <th>发布平台</th>
                      <th>发布账号</th>
                      <th>发布计划</th>
                      <th>发布时间</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r, index) => (
                      <tr key={recordKey(r)}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`选择发布记录 ${r.title}`}
                            checked={selectedRecordIDs.includes(recordKey(r))}
                            disabled={!canSelectRecord(r) || busy || loading}
                            onChange={(event) =>
                              setSelectedRecordIDs((selected) =>
                                event.target.checked
                                  ? [...new Set([...selected, recordKey(r)])]
                                  : selected.filter((id) => id !== recordKey(r)),
                              )
                            }
                          />
                        </td>
                        <td>{(page - 1) * pageSize + index + 1}</td>
                        <td title={r.message || r.title}>
                          <span className="geo-publish__record-title">{r.title || '—'}</span>
                          <small className="geo-publish__record-status">
                            {recordStateLabel(r.state)}
                          </small>
                        </td>
                        <td>
                          <span
                            className="geo-publish__platform-icon"
                            title={r.platform === 'news' ? '独立站' : '博客'}
                          >
                            {r.platform === 'news' ? '站' : 'Blog'}
                          </span>
                        </td>
                        <td title={company.name}>{company.name}</td>
                        <td>
                          {r.plan_id ? (
                            <Link href={`${base}/plans?planID=${r.plan_id}`}>{r.plan_name}</Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{time(r.publish_at)}</td>
                        <td>{time(r.updated_at)}</td>
                        <td>
                          <div className="geo-publish__row-actions">
                            {r.kind === 'scheduled' || r.kind === 'plan_run' ? (
                              <Link href={`${base}/plans?planID=${r.plan_id}`}>查看</Link>
                            ) : r.kind === 'plan_item' ? (
                              <>
                                <Link href={`${base}/articles/${r.article_id}`}>查看</Link>
                                <Link href={`${base}/articles/${r.article_id}`}>修改</Link>
                                <button
                                  type="button"
                                  className="geo-workspace__link"
                                  disabled={busy}
                                  onClick={() => void performRecordAction(r, 'confirm')}
                                >
                                  确认
                                </button>
                                <button
                                  type="button"
                                  className="geo-workspace__link"
                                  disabled={busy}
                                  onClick={() => void performRecordAction(r, 'cancel')}
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <>
                                {r.state === 'published' ? (
                                  <button type="button" onClick={() => setPreviewID(r.id)}>
                                    查看
                                  </button>
                                ) : (
                                  <Link href={`${base}/records/${r.id}`}>查看</Link>
                                )}
                                {r.state === 'queued' && actions(r)}
                                {['failed', 'unknown'].includes(r.state) && actions(r)}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!loading && !items.length && (
                      <tr>
                        <td colSpan={9} className="geo-workspace__empty">
                          暂无{recordTabs.find((tab) => tab.id === recordTab)?.label}记录
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="geo-workspace__pager" aria-label="发布记录分页">
                <span>共 {total} 条</span>
                <label>
                  每页
                  <select
                    aria-label="发布记录每页条数"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value))
                      setPage(1)
                    }}
                  >
                    {[10, 20, 50].map((size) => (
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
                  disabled={loading || page <= 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  上一页
                </button>
                <span>
                  第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
                </span>
                <button
                  type="button"
                  className="geo-workspace__button"
                  disabled={loading || page * pageSize >= total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  下一页
                </button>
                <label>
                  前往
                  <input
                    aria-label="前往发布记录页码"
                    type="number"
                    min={1}
                    max={Math.max(1, Math.ceil(total / pageSize))}
                    value={page}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      const pageCount = Math.max(1, Math.ceil(total / pageSize))
                      if (Number.isSafeInteger(value) && value >= 1 && value <= pageCount)
                        setPage(value)
                    }}
                  />
                  页
                </label>
              </div>
              {loading && items.length > 0 && <p role="status">正在更新记录…</p>}
            </>
          )}
        </div>
      )}
      <dialog
        ref={publishedDialog}
        className="geo-published-preview"
        aria-labelledby="geo-published-preview-heading"
        onClose={() => setPreviewID('')}
        onClick={(event) => {
          if (event.target === event.currentTarget) publishedDialog.current?.close()
        }}
      >
        <div className="geo-published-preview__surface">
          <header className="geo-published-preview__header">
            <h2 id="geo-published-preview-heading">查看文章</h2>
            <button
              type="button"
              aria-label="关闭查看文章"
              onClick={() => publishedDialog.current?.close()}
            >
              ×
            </button>
          </header>
          <div className="geo-published-preview__body">
            {previewLoading ? (
              <p role="status">正在读取文章…</p>
            ) : (
              publishedPreview && publishedArticleContent(publishedPreview)
            )}
          </div>
        </div>
      </dialog>
    </section>
  )
}
