'use client'
import Link from 'next/link'
import { FilePlus2, SearchCheck, Images, FilePenLine } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { WorkspaceCompany } from '@/platform/workspace'
import { localeOptions } from '@/platform/site-locales'
import type { GeoKeyword } from '@/platform/geo/keywords'
import type { GeoAIOperation } from '@/platform/geo/ai-store'
import {
  editGeoQuestionLines,
  mergeGeoQuestionResults,
  questionLines,
} from '@/platform/geo/creation-questions'
import {
  geoDirections,
  geoIntents,
  type GeoIntent,
  type GeoQuestion,
  type GeoTask,
  type GeoTaskValues,
} from '@/platform/geo/tasks'
import {
  allowWorkspaceNavigation,
  useWorkspaceUnsaved,
} from '../WorkspaceEditor/useWorkspaceUnsaved'
import './geo-workspace.scss'

type Group = { id: string; name: string; version: number; count: number; archived?: boolean }
type TaskItem = {
  id: string
  name: string
  locale: string
  direction: string
  questions: number
  status: GeoTask['status']
  updated_at: string
  version: number
  count: number
  available_count?: number | null
  generated_count: number
  used_count: number
  related_plan_count: number
  generation_state: string
}
type RelatedPlan = {
  id: string
  name: string
  state: 'draft' | 'active' | 'paused' | 'ended'
  config: {
    schedule: { cadence: string }
    targets: { collection: 'news' | 'posts' }[]
  }
  created_at: string
}
const stateLabel = { running: '处理中', failed: '失败', unknown: '结果待确认' }
const planStateLabel: Record<RelatedPlan['state'], string> = {
  draft: '草稿',
  active: '运行中',
  paused: '已暂停',
  ended: '已结束',
}
const creationSteps = [
  ['geo-task-info', '创建', '输入任务信息'],
  ['geo-task-keywords', '文章关键词', '设置文章关键词'],
  ['geo-task-materials', '素材配置', '设置文章中的图片'],
  ['geo-task-writing', '文章创作', '设置创作类型及方式'],
] as const
type Draft = GeoTaskValues & {
  id: string
  version: number
  status: GeoTask['status']
  snapshot?: Record<string, unknown>
}
async function readJSON(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || '请求失败，请稍后重试。')
  return result
}
export function GeoCreation({
  company,
  recordId,
  readOnly = false,
  saved = false,
}: {
  company: WorkspaceCompany
  recordId?: string
  readOnly?: boolean
  saved?: boolean
}) {
  const router = useRouter(),
    base = `/workspace/${encodeURIComponent(company.slug)}/geo/creation`,
    articlesBase = `/workspace/${encodeURIComponent(company.slug)}/geo/articles`
  const endpoint = `/api/workspace/${encodeURIComponent(company.slug)}/geo`
  const taskLanguages = localeOptions.filter(
    (language) =>
      language.code === 'zh' || language.code === 'en' || language.code === company.defaultLocale,
  )
  const [draft, setDraft] = useState<Draft | null>(null),
    [baseline, setBaseline] = useState('')
  const [items, setItems] = useState<TaskItem[]>([]),
    [total, setTotal] = useState(0)
  const [query, setQuery] = useState(''),
    [typeFilter, setTypeFilter] = useState(''),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [selectedTaskIDs, setSelectedTaskIDs] = useState<string[]>([]),
    [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(saved ? '保存成功' : '')
  const [configs, setConfigs] = useState<GeoKeyword[]>([]),
    [groups, setGroups] = useState<Group[]>([])
  const [configQuery, setConfigQuery] = useState(''),
    [groupQuery, setGroupQuery] = useState('')
  const [configPage, setConfigPage] = useState(1),
    [groupPage, setGroupPage] = useState(1)
  const [configTotal, setConfigTotal] = useState(0),
    [groupTotal, setGroupTotal] = useState(0)
  const [selectedConfig, setSelectedConfig] = useState<GeoKeyword | null>(null)
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]),
    [intent, setIntent] = useState<GeoIntent>('default')
  const [termPickerOpen, setTermPickerOpen] = useState(false)
  const termPicker = useRef<HTMLDivElement | null>(null)
  const [sourceText, setSourceText] = useState(''),
    [translatedText, setTranslatedText] = useState('')
  const [step, setStep] = useState(0)
  const [relatedTask, setRelatedTask] = useState<TaskItem | null>(null),
    [relatedPlans, setRelatedPlans] = useState<RelatedPlan[]>([]),
    [relatedPlansLoading, setRelatedPlansLoading] = useState(false),
    [relatedPlansError, setRelatedPlansError] = useState('')
  const [groupImageCount, setGroupImageCount] = useState(0)
  const groupPicker = useRef<HTMLDialogElement | null>(null),
    generationDialog = useRef<HTMLDialogElement | null>(null),
    relatedPlanDialog = useRef<HTMLDialogElement | null>(null)
  const [generationTarget, setGenerationTarget] = useState<TaskItem | null>(null),
    [generationCount, setGenerationCount] = useState<number | ''>(1)
  const active = useRef(true),
    lock = useRef(false),
    mutation = useRef<AbortController | null>(null)
  const aiRequest = useRef<{ input: string; id: string } | null>(null)
  const generationRequests = useRef(new Map<string, string>())
  const dirty = !!draft && (!draft.version || JSON.stringify(draft) !== baseline)
  const draftID = draft?.id
  const editing = !!draft,
    groupID = draft?.materialGroupID
  useWorkspaceUnsaved(dirty, busy)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      mutation.current?.abort()
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const timer = setTimeout(
      async () => {
        try {
          if (recordId === 'new') {
            const fresh: Draft = {
              id: crypto.randomUUID(),
              version: 0,
              status: 'waiting_sources',
              name: '',
              optimizationID: '',
              optimizationVersion: 0,
              locale: company.defaultLocale || 'zh',
              questions: [],
              questionSource: company.defaultLocale === 'zh' ? 'original' : 'translated',
              materialGroupID: '',
              materialGroupVersion: 0,
              imagesPerArticle: 1,
              direction: 'AI匹配',
              length: 'short',
              mode: 'deduplicate',
              count: 1,
            }
            const now = new Date()
            fresh.name = `wz-${[
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, '0'),
              String(now.getDate()).padStart(2, '0'),
              String(now.getHours()).padStart(2, '0'),
              String(now.getMinutes()).padStart(2, '0'),
              String(now.getSeconds()).padStart(2, '0'),
            ].join('')}`
            setDraft(fresh)
            setBaseline(JSON.stringify(fresh))
            setSourceText('')
            setTranslatedText('')
          } else if (recordId) {
            const result = await readJSON(`${endpoint}/tasks/${recordId}`, {
              signal: controller.signal,
            })
            if (controller.signal.aborted) return
            const loadedDraft: Draft = {
              ...result.item,
              questionSource:
                result.item.questionSource ||
                (result.item.locale === 'zh' ? 'original' : 'translated'),
            }
            setDraft(loadedDraft)
            setBaseline(JSON.stringify(loadedDraft))
            setSourceText(
              result.item.questions.map((question: GeoQuestion) => question.original).join('\n'),
            )
            setTranslatedText(
              result.item.questions
                .map((question: GeoQuestion) =>
                  question.translatedLocale === result.item.locale ? question.translated : '',
                )
                .join('\n'),
            )
            const [key, group] = await Promise.all([
              readJSON(`${endpoint}/keywords/${result.item.optimizationID}`, {
                signal: controller.signal,
              }),
              readJSON(`${endpoint}/materials/${result.item.materialGroupID}?summary=true`, {
                signal: controller.signal,
              }),
            ])
            if (controller.signal.aborted) return
            setSelectedConfig(key.item)
            const taskTerms = result.item.questions
              .map((question: GeoQuestion) => question.term)
              .filter((term: string, index: number, all: string[]) => all.indexOf(term) === index)
            setSelectedTerms(taskTerms.length ? taskTerms : [key.item.core])
            setGroups((old) => [
              ...old.filter((g) => g.id !== group.item.id),
              {
                ...group.item,
                count: group.item.count,
              },
            ])
          } else {
            setDraft(null)
            const result = await readJSON(
              `${endpoint}/tasks?q=${encodeURIComponent(query)}&type=${typeFilter}&page=${page}&pageSize=${pageSize}`,
              { signal: controller.signal },
            )
            if (!controller.signal.aborted) {
              setItems(result.items)
              setTotal(result.total)
              const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
              if (page > lastPage) setPage(lastPage)
            }
          }
        } catch (cause) {
          if (!controller.signal.aborted)
            setError(cause instanceof Error ? cause.message : '读取失败。')
        } finally {
          if (!controller.signal.aborted) setLoading(false)
        }
      },
      query ? 200 : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [company.defaultLocale, endpoint, page, pageSize, query, recordId, reload, typeFilter])
  useEffect(() => {
    if (!draftID || typeof IntersectionObserver === 'undefined') return
    const sections = creationSteps.flatMap(([id], index) => {
      const element = document.getElementById(id)
      return element ? [{ id, index, element }] : []
    })
    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (!current) return
        const section = sections.find((item) => item.element === current.target)
        if (section) setStep(section.index)
      },
      { rootMargin: '-12% 0px -72% 0px', threshold: 0 },
    )
    sections.forEach((item) => observer.observe(item.element))
    return () => observer.disconnect()
  }, [draftID])
  useEffect(() => {
    if (recordId || !items.some((item) => ['queued', 'running'].includes(item.generation_state)))
      return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void readJSON(
        `${endpoint}/tasks?q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`,
        {
          signal: controller.signal,
        },
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setItems(result.items)
            setTotal(result.total)
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message)
        })
    }, 5000)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [endpoint, items, page, pageSize, query, recordId])
  useEffect(() => {
    if (!editing) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void readJSON(
        `${endpoint}/keywords?q=${encodeURIComponent(configQuery)}&page=${configPage}`,
        { signal: controller.signal },
      )
        .then((r) => {
          if (!controller.signal.aborted) {
            setConfigs((old) =>
              configPage === 1
                ? r.items
                : [
                    ...old.filter((x) => !r.items.some((y: GeoKeyword) => y.id === x.id)),
                    ...r.items,
                  ],
            )
            setConfigTotal(r.total)
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message)
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [editing, endpoint, configQuery, configPage])
  useEffect(() => {
    if (!editing) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void readJSON(`${endpoint}/materials?q=${encodeURIComponent(groupQuery)}&page=${groupPage}`, {
        signal: controller.signal,
      })
        .then((r) => {
          if (!controller.signal.aborted) {
            setGroups((old) => [
              ...old.filter((x) => x.id === groupID && !r.items.some((y: Group) => y.id === x.id)),
              ...(groupPage === 1
                ? []
                : old.filter(
                    (x) => x.id !== groupID && !r.items.some((y: Group) => y.id === x.id),
                  )),
              ...r.items,
            ])
            setGroupTotal(r.total)
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message)
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [editing, groupID, endpoint, groupQuery, groupPage])
  useEffect(() => {
    if (!groupID) {
      setGroupImageCount(0)
      return
    }
    const controller = new AbortController()
    void readJSON(`${endpoint}/materials/${groupID}?summary=true`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setGroupImageCount(result.item.count)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [endpoint, groupID, draft?.materialGroupVersion])
  useEffect(() => {
    if (!termPickerOpen) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!termPicker.current?.contains(event.target as Node)) setTermPickerOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTermPickerOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [termPickerOpen])
  useEffect(() => {
    if (!relatedTask) return
    const controller = new AbortController()
    setRelatedPlans([])
    setRelatedPlansError('')
    setRelatedPlansLoading(true)
    void readJSON(
      `${endpoint}/plans?state=active&sourceMode=tasks&sourceID=${encodeURIComponent(relatedTask.id)}&page=1&pageSize=15`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setRelatedPlans(result.items)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setRelatedPlansError(cause instanceof Error ? cause.message : '读取关联计划失败。')
      })
      .finally(() => {
        if (!controller.signal.aborted) setRelatedPlansLoading(false)
      })
    return () => controller.abort()
  }, [endpoint, relatedTask])
  useEffect(() => {
    if (relatedTask && !relatedPlanDialog.current?.open) relatedPlanDialog.current?.showModal()
  }, [relatedTask])
  const patch = (value: Partial<Draft>) => {
    setDraft((old) => old && { ...old, ...value })
    setNotice('')
  }
  const replaceQuestions = (questions: GeoQuestion[]) => {
    patch({ questions, count: Math.max(1, questions.length) })
    setSourceText(questions.map((question) => question.original).join('\n'))
    setTranslatedText(
      questions
        .map((question) => (question.translatedLocale === draft?.locale ? question.translated : ''))
        .join('\n'),
    )
  }
  const selectConfig = (id: string) => {
    const config = configs.find((c) => c.id === id) || selectedConfig
    if (!config || config.id !== id || !draft) return
    if (draft.questions.length && !window.confirm('更换优化词配置将清空当前问题，是否继续？'))
      return
    setSelectedConfig(config)
    setSelectedTerms([config.core])
    setTermPickerOpen(false)
    aiRequest.current = null
    patch({
      optimizationID: config.id,
      optimizationVersion: config.version,
      questions: [],
      count: 1,
    })
    setSourceText('')
    setTranslatedText('')
  }
  const mergeQuestions = (questions: GeoQuestion[]) => {
    if (!draft) return
    const result = mergeGeoQuestionResults(draft.questions, questions)
    replaceQuestions(result.questions)
    setNotice(
      `已添加${result.added}条问题${result.duplicates ? `，合并${result.duplicates}条重复内容` : ''}。`,
    )
  }
  const applyOperation = (operation: GeoAIOperation) => {
    if (!draft || !operation.result || operation.state !== 'succeeded')
      throw new Error('此处理尚无可取回的成功结果。')
    if (
      operation.input.optimizationID !== draft.optimizationID ||
      operation.input.optimizationVersion !== draft.optimizationVersion
    )
      throw new Error('结果属于其他配置版本，未覆盖当前问题。')
    if (operation.kind === 'expand') mergeQuestions(operation.result.questions)
    else {
      if (operation.input.locale !== draft.locale)
        throw new Error('结果语言与当前文章语言不同，未覆盖当前问题。')
      const mapped = new Map(operation.result.questions.map((q) => [q.id, q]))
      const matches = draft.questions.filter((q) => mapped.get(q.id)?.original === q.original)
      if (!matches.length) throw new Error('原问题已修改或移除，旧译文未覆盖输入。')
      replaceQuestions(
        draft.questions.map((q) =>
          mapped.get(q.id)?.original === q.original
            ? {
                ...q,
                translated: mapped.get(q.id)!.translated,
                translatedFrom: q.original,
                translatedLocale: draft.locale,
              }
            : q,
        ),
      )
      setNotice('翻译完成。')
    }
  }
  const action = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const controller = new AbortController()
    mutation.current = controller
    try {
      await work(controller.signal)
    } catch (cause) {
      if (active.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '操作失败，输入已保留。')
    } finally {
      lock.current = false
      if (active.current) setBusy(false)
    }
  }
  const copyTask = (item: TaskItem) =>
    action(async (signal) => {
      await readJSON(`${endpoint}/tasks/${encodeURIComponent(item.id)}`, {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'copy', requestId: crypto.randomUUID() }),
      })
      if (!active.current || signal.aborted) return
      setPage(1)
      setSelectedTaskIDs([])
      setReload((value) => value + 1)
      setNotice('任务已复制。')
    })
  const archiveTasks = (ids: string[], versions: Record<string, number>) => {
    if (!ids.length || !window.confirm(`归档${ids.length}个创作任务？已生成文章和历史记录会保留。`))
      return
    void action(async (signal) => {
      const single = ids.length === 1
      await readJSON(
        single ? `${endpoint}/tasks/${encodeURIComponent(ids[0])}` : `${endpoint}/tasks`,
        {
          signal,
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(single ? { version: versions[ids[0]] } : { ids, versions }),
        },
      )
      if (!active.current || signal.aborted) return
      setSelectedTaskIDs([])
      setReload((value) => value + 1)
      setNotice(`已归档${ids.length}个创作任务；文章和历史记录仍保留。`)
    })
  }
  const openGenerationDialog = (item: TaskItem) => {
    setGenerationTarget(item)
    setGenerationCount(1)
    setError('')
    generationDialog.current?.showModal()
  }
  const generateArticle = (item: TaskItem, count: number) =>
    action(async (signal) => {
      if (item.status !== 'ready') throw new Error('请先保存完整的创作任务。')
      if (!item.available_count) throw new Error('没有可生成的问题。')
      if (!Number.isInteger(count) || count < 1 || count > Math.min(10, item.available_count))
        throw new Error(`本次可生成1至${Math.min(10, item.available_count)}篇文章。`)
      const requestKey = `${item.id}:${item.version}:${count}`
      const requestId = generationRequests.current.get(requestKey) || crypto.randomUUID()
      generationRequests.current.set(requestKey, requestId)
      const result = await readJSON(`${endpoint}/generation`, {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, taskID: item.id, version: item.version, count }),
      })
      generationRequests.current.delete(requestKey)
      generationDialog.current?.close()
      setNotice(`已提交${result.count || 0}篇文章生成。`)
      setReload((value) => value + 1)
    })
  const selectableItems = items.filter((item) => item.related_plan_count === 0)
  const selectedOnPage = selectableItems.filter((item) => selectedTaskIDs.includes(item.id))
  const taskPageCount = Math.max(1, Math.ceil(total / pageSize))
  const allOnPageSelected =
    selectableItems.length > 0 && selectedOnPage.length === selectableItems.length
  const ai = (kind: 'expand' | 'translate') =>
    action(async (signal) => {
      if (!draft || !selectedConfig || !selectedTerms.length)
        throw new Error('请先选择优化词与关键词。')
      let characters = 0
      const questions =
        kind === 'translate'
          ? draft.questions
              .filter(
                (q) =>
                  !q.translated ||
                  q.translatedFrom !== q.original ||
                  q.translatedLocale !== draft.locale,
              )
              .slice(0, 30)
              .filter((q) => {
                if (characters + q.original.length > 1800) return false
                characters += q.original.length
                return true
              })
          : []
      if (kind === 'translate' && !questions.length) throw new Error('当前没有需要翻译的问题。')
      const input = {
        kind,
        optimizationID: draft.optimizationID,
        optimizationVersion: draft.optimizationVersion,
        terms: selectedTerms,
        intent,
        locale: draft.locale,
        questions,
      }
      const encoded = JSON.stringify(input)
      if (!aiRequest.current || aiRequest.current.input !== encoded)
        aiRequest.current = { input: encoded, id: crypto.randomUUID() }
      const r = await readJSON(`${endpoint}/ai`, {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, requestId: aiRequest.current.id }),
      })
      if (!active.current || signal.aborted) return
      if (r.operation.state !== 'succeeded') {
        if (r.operation.state === 'failed') aiRequest.current = null
        const label = kind === 'expand' ? 'GEO问题生成' : '翻译'
        throw new Error(
          r.operation.state === 'unknown'
            ? `${label}结果待确认，请稍后再检查，不要重复发起。`
            : `${label}${stateLabel[r.operation.state as 'running' | 'failed' | 'unknown']}，可稍后重试。`,
        )
      }
      applyOperation(r.operation)
      aiRequest.current = null
    })
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (readOnly) return
    void action(async (signal) => {
      if (!draft) return
      for (const index of [0, 1, 2]) {
        const message = validateStep(index)
        if (message) {
          setError(message)
          document
            .getElementById(creationSteps[index][0])
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }
      if (
        draft.locale !== 'zh' &&
        draft.questionSource === 'translated' &&
        questionLines(translatedText).length !== draft.questions.length
      )
        throw new Error('译文与原文行数不一致，请保持一行对应一条问题。')
      const { id, version, status: _status, snapshot: _snapshot, ...values } = draft
      const r = await readJSON(version ? `${endpoint}/tasks/${id}` : `${endpoint}/tasks`, {
        signal,
        method: version ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, ...(version ? { version } : { requestId: id }) }),
      })
      if (!active.current || signal.aborted) return
      setDraft(r.item)
      setBaseline(JSON.stringify(r.item))
      setNotice('保存成功')
      allowWorkspaceNavigation()
      router.push(`${base}?saved=1`)
    })
  }
  const back = () => {
    allowWorkspaceNavigation()
    router.push(base)
  }
  const selectedGroup = groups.find((g) => g.id === draft?.materialGroupID)
  const fineTerms = selectedConfig?.terms || []
  const allFineTermsSelected =
    fineTerms.length > 0 && fineTerms.every((term) => selectedTerms.includes(term))
  const options =
    selectedConfig && !configs.some((c) => c.id === selectedConfig.id)
      ? [selectedConfig, ...configs]
      : configs
  const directionDescriptions: Record<string, string> = {
    AI匹配: '按问题与可用资料匹配合适的写作方向。',
    企业榜单: '对照可核验资料，说明企业比较依据。',
    产品介绍: '介绍产品原理、参数、配置与应用场景。',
    技术解读: '解释技术原理、设计方法与实施要点。',
    场景化问题解答: '围绕具体使用场景给出选型和解决方法。',
    行业问题解答: '回答行业常见问题与采购疑问。',
    行业百科: '梳理行业定义、产品分类与基础知识。',
    体验分享: '以可核验的实际记录说明使用过程。',
    企业推荐: '根据采购需求介绍企业能力与适用范围。',
    新闻报道: '根据真实事件和来源整理行业资讯。',
    知识科普: '用易懂的语言解释概念与选型知识。',
  }
  const generationLabels: Record<string, string> = {
    idle: '未生成',
    queued: '排队中',
    running: '生成中',
    failed: '生成失败',
    unknown: '结果待确认',
    succeeded: '已生成',
  }
  const editOriginal = (value: string) => {
    if (!draft) return
    setSourceText(value)
    const questions = editGeoQuestionLines(
      value,
      draft.questions,
      { term: selectedTerms[0] || '', intent },
      () => crypto.randomUUID(),
    )
    patch({ questions, count: Math.max(1, questions.length) })
    setTranslatedText(
      questions
        .map((question) => (question.translatedLocale === draft.locale ? question.translated : ''))
        .join('\n'),
    )
  }
  const editTranslation = (value: string) => {
    if (!draft) return
    setTranslatedText(value)
    const lines = value.split(/\r?\n/u)
    patch({
      questions: draft.questions.map((question, index) => ({
        ...question,
        translated: lines[index]?.trim() || '',
        translatedFrom: question.original,
        translatedLocale: draft.locale,
      })),
    })
  }
  const validateStep = (index: number) => {
    if (!draft) return '任务信息尚未准备好。'
    if (index === 0 && !draft.name.trim()) return '请填写任务名称。'
    if (index === 1) {
      if (!selectedConfig || selectedConfig.id !== draft.optimizationID)
        return '请选择当前客户的GEO优化词组。'
      if (!selectedTerms.length) return '请选择至少一个核心词或细分词。'
      if (!draft.questions.length) return '请先生成或填写至少一个搜索问题。'
      if (
        draft.locale !== 'zh' &&
        draft.questionSource === 'translated' &&
        questionLines(translatedText).length !== draft.questions.length
      )
        return '请补齐与原问题逐行对应的翻译。'
    }
    if (index === 2) {
      if (!draft.materialGroupID) return '请选择一个素材组。'
      if (!selectedGroup) return '所选素材组暂不可用，请重新选择。'
      if (groupImageCount < draft.imagesPerArticle)
        return `所选素材组至少需要${draft.imagesPerArticle}张可用图片。`
    }
    return ''
  }
  const jumpToStep = (index: number, id: string) => {
    setStep(index)
    setError('')
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <section className={`geo-workspace geo-creation-page${draft ? ' is-editing' : ' is-list'}`}>
      <header className="geo-workspace__heading">
        <div>
          {draft && (
            <button
              type="button"
              className="geo-workspace__back"
              aria-label="返回文章创作"
              disabled={busy}
              onClick={back}
            >
              ‹
            </button>
          )}
          <h1>
            {draft ? (readOnly ? '查看任务' : draft.version ? '编辑任务' : '创建任务') : '文章创作'}
          </h1>
        </div>
        {!draft && (
          <div className="geo-creation__actions">
            <Link className="geo-workspace__button" href={articlesBase}>
              创作记录
            </Link>
            <Link className="geo-workspace__button is-primary" href={`${base}/new`}>
              创建
            </Link>
          </div>
        )}
        {draft && draft.version > 0 && (
          <div className="geo-creation__actions">
            <Link className="geo-workspace__button" href={`${articlesBase}?taskID=${draft.id}`}>
              创作记录
            </Link>
          </div>
        )}
        {!draft && (
          <div className="geo-workspace__toolbar">
            <input
              aria-label="搜索任务"
              placeholder="请输入任务名称"
              value={query}
              maxLength={100}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
                setSelectedTaskIDs([])
              }}
            />
            <select
              aria-label="文章类型"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value)
                setPage(1)
                setSelectedTaskIDs([])
              }}
            >
              <option value="">请选择文章类型</option>
              <option value="search">搜索词</option>
            </select>
            {selectedOnPage.length > 0 && (
              <div className="geo-creation__bulk-actions">
                <span>已选 {selectedOnPage.length} 项</span>
                <button
                  type="button"
                  className="geo-workspace__button"
                  disabled={busy}
                  onClick={() => setSelectedTaskIDs([])}
                >
                  取消多选
                </button>
                <button
                  type="button"
                  className="geo-workspace__button"
                  disabled={busy}
                  onClick={() =>
                    archiveTasks(
                      selectedOnPage.map((item) => item.id),
                      Object.fromEntries(selectedOnPage.map((item) => [item.id, item.version])),
                    )
                  }
                >
                  删除
                </button>
              </div>
            )}
          </div>
        )}
      </header>
      {error && (
        <div className="geo-workspace__error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="geo-workspace__notice" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <p role="status">正在读取…</p>
      ) : draft ? (
        <>
          <nav className="geo-creation__steps" aria-label="任务配置步骤">
            {creationSteps.map(([_id, title, subtitle], index) => (
              <button
                key={title}
                type="button"
                className={step === index ? 'is-current' : ''}
                aria-current={step === index ? 'step' : undefined}
                onClick={() => jumpToStep(index, _id)}
              >
                <span aria-hidden="true">
                  {[FilePlus2, SearchCheck, Images, FilePenLine].map((Icon, iconIndex) =>
                    iconIndex === index ? <Icon key={iconIndex} size={21} /> : null,
                  )}
                </span>
                <div>
                  <strong>{title}</strong>
                  <small>{subtitle}</small>
                </div>
              </button>
            ))}
          </nav>
          <form onSubmit={save} className="geo-workspace__panel geo-creation geo-creation__form">
            <fieldset disabled={busy || readOnly}>
              <section id="geo-task-info" className="geo-creation__section">
                <h2>创建</h2>
                <div className="geo-workspace__field">
                  <label htmlFor="task-name">
                    任务名称 <b>*</b>
                  </label>
                  <div className="geo-creation__name">
                    <input
                      id="task-name"
                      required
                      maxLength={20}
                      placeholder="请输入任务名称"
                      value={draft.name}
                      onChange={(event) => patch({ name: event.target.value })}
                    />
                    <span>{draft.name.length} / 20</span>
                  </div>
                </div>
                <div className="geo-workspace__field">
                  <label>
                    文章语言 <b>*</b>
                  </label>
                  <div>
                    <div className="geo-creation__segments" role="group" aria-label="文章语言">
                      {taskLanguages.map((language) => (
                        <button
                          type="button"
                          key={language.code}
                          aria-pressed={draft.locale === language.code}
                          className={draft.locale === language.code ? 'is-selected' : ''}
                          onClick={() => {
                            patch({
                              locale: language.code,
                              questionSource:
                                language.code === 'zh'
                                  ? 'original'
                                  : draft.locale === 'zh'
                                    ? 'translated'
                                    : draft.questionSource,
                            })
                            setTranslatedText(
                              draft.questions
                                .map((question) =>
                                  question.translatedLocale === language.code
                                    ? question.translated
                                    : '',
                                )
                                .join('\n'),
                            )
                          }}
                        >
                          {language.label}
                        </button>
                      ))}
                    </div>
                    {draft.locale !== company.defaultLocale && (
                      <p className="geo-workspace__hint">
                        本站发布使用默认语言“
                        {localeOptions.find((language) => language.code === company.defaultLocale)
                          ?.label || company.defaultLocale}
                        ”；当前语言文章可保存和编辑。
                      </p>
                    )}
                  </div>
                </div>
              </section>
              <section id="geo-task-keywords" className="geo-creation__section">
                <h2>文章关键词</h2>
                <div className="geo-workspace__field">
                  <label>
                    选择方式 <b>*</b>
                  </label>
                  <div className="geo-creation__segments">
                    <span className="is-selected">搜索词</span>
                  </div>
                </div>
                <div className="geo-workspace__field">
                  <label htmlFor="task-config">
                    选择词组 <b>*</b>
                  </label>
                  <div>
                    <select
                      id="task-config"
                      required
                      value={draft.optimizationID}
                      onChange={(event) => selectConfig(event.target.value)}
                    >
                      <option value="">请选择词组</option>
                      {options.map((config) => (
                        <option key={config.id} value={config.id}>
                          {config.core}
                        </option>
                      ))}
                    </select>
                    {(configTotal > 20 || configQuery) && (
                      <details className="geo-creation__config-search">
                        <summary>搜索更多词组</summary>
                        <input
                          aria-label="搜索优化词"
                          placeholder="搜索核心词"
                          value={configQuery}
                          onChange={(event) => {
                            setConfigQuery(event.target.value)
                            setConfigPage(1)
                          }}
                        />
                        {configs.length < configTotal && (
                          <button
                            type="button"
                            className="geo-workspace__link"
                            onClick={() => setConfigPage((value) => value + 1)}
                          >
                            加载更多
                          </button>
                        )}
                      </details>
                    )}
                    {selectedConfig ? (
                      <div className="geo-creation__term-picker" ref={termPicker}>
                        <button
                          type="button"
                          className="geo-creation__term-trigger"
                          aria-expanded={termPickerOpen}
                          aria-haspopup="listbox"
                          onClick={() => setTermPickerOpen((open) => !open)}
                        >
                          <span>
                            {selectedTerms.length
                              ? `已选择 ${selectedTerms.length} 个词`
                              : '请选择核心词或细分词'}
                          </span>
                          <span aria-hidden="true">{termPickerOpen ? '⌃' : '⌄'}</span>
                        </button>
                        {termPickerOpen && (
                          <div
                            className="geo-creation__term-menu"
                            role="group"
                            aria-label="选择核心词和细分词"
                          >
                            <button
                              type="button"
                              className="geo-creation__term-select-all"
                              onClick={() =>
                                setSelectedTerms((old) =>
                                  allFineTermsSelected
                                    ? old.filter((term) => !fineTerms.includes(term))
                                    : [...new Set([...old, ...fineTerms])],
                                )
                              }
                            >
                              {allFineTermsSelected ? '清空细分词' : '全选细分词'}
                            </button>
                            {[selectedConfig.core, ...selectedConfig.terms].map((term) => (
                              <label key={term}>
                                <input
                                  type="checkbox"
                                  checked={selectedTerms.includes(term)}
                                  onChange={(event) =>
                                    setSelectedTerms((old) =>
                                      event.target.checked
                                        ? [...old, term]
                                        : old.filter((value) => value !== term),
                                    )
                                  }
                                />
                                <span>{term}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="geo-workspace__hint">请先选择当前客户已保存的GEO优化词。</p>
                    )}
                    {selectedConfig && selectedConfig.version !== draft.optimizationVersion && (
                      <p className="geo-workspace__hint">
                        优化词配置已有更新。
                        <button
                          type="button"
                          className="geo-workspace__link"
                          onClick={() => selectConfig(selectedConfig.id)}
                        >
                          使用最新配置
                        </button>
                      </p>
                    )}
                  </div>
                </div>
                <div className="geo-workspace__field">
                  <label htmlFor="task-intent">
                    生成类型 <b>*</b>
                  </label>
                  <div className="geo-creation__generate">
                    <select
                      id="task-intent"
                      value={intent}
                      onChange={(event) => setIntent(event.target.value as GeoIntent)}
                    >
                      {geoIntents.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="geo-workspace__button is-primary"
                      disabled={!selectedConfig || !selectedTerms.length}
                      onClick={() => void ai('expand')}
                    >
                      {busy ? '处理中…' : 'AI生成'}
                    </button>
                  </div>
                </div>
                <div
                  className="geo-creation__translation"
                  role="group"
                  aria-label="创作时使用的问题"
                >
                  <div className="geo-creation__question-pane">
                    <header>
                      <strong>
                        翻译前 <em>({draft.questions.length})</em>
                      </strong>
                      <button
                        type="button"
                        aria-label="翻译前"
                        aria-pressed={draft.questionSource === 'original'}
                        onClick={() => patch({ questionSource: 'original' })}
                      >
                        {draft.questionSource === 'original' ? '使用中' : '使用翻译前'}
                      </button>
                    </header>
                    <textarea
                      aria-label="翻译前搜索问题"
                      rows={10}
                      value={sourceText}
                      placeholder="可点击AI生成，也可直接填写，每行一个搜索问题"
                      onChange={(event) => editOriginal(event.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="geo-workspace__button geo-creation__translate"
                    disabled={draft.locale === 'zh' || !draft.questions.length}
                    onClick={() => void ai('translate')}
                  >
                    翻译 →
                  </button>
                  <div className="geo-creation__question-pane">
                    <header>
                      <strong>
                        翻译后 <em>({questionLines(translatedText).length})</em>
                      </strong>
                      <button
                        type="button"
                        aria-label="翻译后"
                        aria-pressed={draft.questionSource === 'translated'}
                        disabled={draft.locale === 'zh' && 'translated' === 'translated'}
                        onClick={() => patch({ questionSource: 'translated' })}
                      >
                        {draft.questionSource === 'translated' ? '使用中' : '使用翻译后'}
                      </button>
                    </header>
                    <textarea
                      aria-label="翻译后搜索问题"
                      rows={10}
                      value={translatedText}
                      disabled={draft.locale === 'zh'}
                      dir="auto"
                      placeholder={
                        draft.locale === 'zh'
                          ? '中文创作使用左侧原文'
                          : '译文逐行对应左侧原文，可直接修改'
                      }
                      onChange={(event) => editTranslation(event.target.value)}
                    />
                  </div>
                </div>
              </section>
              <section id="geo-task-materials" className="geo-creation__section">
                <h2>素材配置</h2>
                <div className="geo-workspace__field">
                  <label>素材使用</label>
                  <div className="geo-creation__material-controls">
                    <span className="geo-creation__fixed-option">素材组</span>
                    <button
                      type="button"
                      className="geo-workspace__button"
                      onClick={() => groupPicker.current?.showModal()}
                    >
                      选择素材组
                    </button>
                    <label htmlFor="task-images">每篇使用数量</label>
                    <select
                      id="task-images"
                      value={draft.imagesPerArticle}
                      onChange={(event) => patch({ imagesPerArticle: Number(event.target.value) })}
                    >
                      {Array.from({ length: 10 }, (_, index) => (
                        <option key={index} value={index + 1}>
                          {index + 1}张
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="geo-creation__material-summary">
                  {selectedGroup ? (
                    <>
                      <strong>{selectedGroup.name}</strong>
                      <span>{groupImageCount} 张可用图片</span>
                      <button
                        type="button"
                        className="geo-workspace__link"
                        onClick={() => patch({ materialGroupID: '', materialGroupVersion: 0 })}
                      >
                        清空
                      </button>
                    </>
                  ) : (
                    <span>请选择素材组</span>
                  )}
                </div>
                {selectedGroup && selectedGroup.version !== draft.materialGroupVersion && (
                  <p className="geo-workspace__hint">
                    素材组已更新。
                    <button
                      type="button"
                      className="geo-workspace__link"
                      onClick={() => patch({ materialGroupVersion: selectedGroup.version })}
                    >
                      采用当前版本
                    </button>
                  </p>
                )}
              </section>
              <section id="geo-task-writing" className="geo-creation__section">
                <h2>文章创作</h2>
                <div className="geo-workspace__field">
                  <label>
                    创作方向 <b>*</b>
                  </label>
                  <div className="geo-creation__directions">
                    {geoDirections.map((direction) => (
                      <label
                        key={direction}
                        className={draft.direction === direction ? 'is-selected' : ''}
                      >
                        <input
                          type="radio"
                          name="direction"
                          checked={draft.direction === direction}
                          onChange={() => patch({ direction })}
                        />
                        <strong>{direction}</strong>
                        <small>{directionDescriptions[direction]}</small>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="geo-workspace__field">
                  <label>
                    文章长度 <b>*</b>
                  </label>
                  <div className="geo-creation__segments" role="group" aria-label="文章长度">
                    {[
                      ['short', '精简（约500字）'],
                      ['long', '完整（约1000字）'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={draft.length === value ? 'is-selected' : ''}
                        aria-pressed={draft.length === value}
                        onClick={() => patch({ length: value as Draft['length'] })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="geo-workspace__field">
                  <label>
                    创作模式 <b>*</b>
                  </label>
                  <div className="geo-creation__segments" role="group" aria-label="创作模式">
                    {[
                      ['deduplicate', '去重创作'],
                      ['repeat', '循环创作'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={draft.mode === value ? 'is-selected' : ''}
                        aria-pressed={draft.mode === value}
                        onClick={() => patch({ mode: value as Draft['mode'] })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </fieldset>
            <footer>
              <button
                type="button"
                className={readOnly ? 'geo-workspace__button is-primary' : 'geo-workspace__button'}
                disabled={busy}
                onClick={back}
              >
                {readOnly ? '返回' : '取消'}
              </button>
              {!readOnly && (
                <button type="submit" className="geo-workspace__button is-primary" disabled={busy}>
                  {busy ? '处理中…' : '保存'}
                </button>
              )}
            </footer>
          </form>
          <dialog ref={groupPicker} className="geo-workspace__dialog geo-creation__group-dialog">
            <header>
              <h2>选择素材组</h2>
              <button
                type="button"
                aria-label="关闭选择素材组"
                onClick={() => groupPicker.current?.close()}
              >
                ×
              </button>
            </header>
            <input
              aria-label="搜索素材组"
              placeholder="搜索素材组名称"
              value={groupQuery}
              onChange={(event) => {
                setGroupQuery(event.target.value)
                setGroupPage(1)
              }}
            />
            <div className="geo-creation__group-list">
              {groups.map((group) => (
                <button
                  type="button"
                  key={group.id}
                  disabled={group.archived}
                  className={draft.materialGroupID === group.id ? 'is-selected' : ''}
                  onClick={() => {
                    patch({ materialGroupID: group.id, materialGroupVersion: group.version })
                    groupPicker.current?.close()
                  }}
                >
                  <strong>{group.name}</strong>
                  <span>{group.archived ? '已归档' : `${group.count}张图片`}</span>
                </button>
              ))}
            </div>
            {!groups.length && <p>暂无可用素材组，请先在素材库上传图片。</p>}
            {groups.length < groupTotal && (
              <button
                type="button"
                className="geo-workspace__button"
                onClick={() => setGroupPage((value) => value + 1)}
              >
                加载更多素材组
              </button>
            )}
          </dialog>
        </>
      ) : (
        <div className="geo-workspace__panel">
          <div
            className="geo-workspace__table-scroll"
            role="region"
            aria-label="创作任务列表，可横向滚动查看全部字段"
            tabIndex={0}
          >
            <table className="geo-creation__task-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="选择当前页全部任务"
                      checked={allOnPageSelected}
                      disabled={!selectableItems.length || busy}
                      onChange={(event) =>
                        setSelectedTaskIDs((old) =>
                          event.target.checked
                            ? [...new Set([...old, ...selectableItems.map((item) => item.id)])]
                            : old.filter((id) => !selectableItems.some((item) => item.id === id)),
                        )
                      }
                    />
                  </th>
                  <th>序号</th>
                  <th>任务名称</th>
                  <th>文章类型</th>
                  <th>语言</th>
                  <th>创作方向</th>
                  <th>可生成文章数量</th>
                  <th>已生成文章</th>
                  <th>已使用文章</th>
                  <th>生成状态</th>
                  <th>关联发布</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`选择任务 ${item.name}`}
                        checked={selectedTaskIDs.includes(item.id)}
                        disabled={busy || item.related_plan_count > 0}
                        onChange={(event) =>
                          setSelectedTaskIDs((old) =>
                            event.target.checked
                              ? [...new Set([...old, item.id])]
                              : old.filter((id) => id !== item.id),
                          )
                        }
                      />
                    </td>
                    <td>{(page - 1) * pageSize + index + 1}</td>
                    <td>{item.name}</td>
                    <td>搜索词</td>
                    <td>
                      {localeOptions.find((language) => language.code === item.locale)?.label ||
                        item.locale}
                    </td>
                    <td>{item.direction}</td>
                    <td title="按当前已保存任务计算">
                      {item.available_count == null ? '—' : `${item.available_count}/篇`}
                    </td>
                    <td>
                      {item.generated_count ? (
                        <Link href={`/workspace/${company.slug}/geo/articles?taskID=${item.id}`}>
                          {item.generated_count}篇
                        </Link>
                      ) : (
                        '0篇'
                      )}
                    </td>
                    <td>{item.used_count ?? 0}/篇</td>
                    <td>
                      {item.status === 'ready'
                        ? ['queued', 'running'].includes(item.generation_state)
                          ? '生成中'
                          : generationLabels[item.generation_state] || '未生成'
                        : '待生成'}
                    </td>
                    <td>
                      {item.related_plan_count ? (
                        <button
                          type="button"
                          className="geo-workspace__link"
                          onClick={() => setRelatedTask(item)}
                        >
                          {item.related_plan_count}个计划
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{new Date(item.updated_at).toLocaleString()}</td>
                    <td>
                      <div className="geo-creation__row-actions">
                        <button
                          type="button"
                          className="geo-workspace__link"
                          disabled={
                            busy ||
                            item.status !== 'ready' ||
                            item.available_count === 0 ||
                            ['queued', 'running'].includes(item.generation_state)
                          }
                          onClick={() => openGenerationDialog(item)}
                        >
                          {['queued', 'running'].includes(item.generation_state)
                            ? '生成中'
                            : '生成文章'}
                        </button>
                        <Link
                          href={`${base}/${item.id}${item.related_plan_count ? '?view=1' : ''}`}
                        >
                          {item.related_plan_count ? '查看' : '编辑'}
                        </Link>
                        <Link
                          href={`${articlesBase}?taskID=${encodeURIComponent(item.id)}`}
                          title={`查看“${item.name}”生成的文章`}
                        >
                          记录
                        </Link>
                        <details className="geo-creation__task-menu">
                          <summary aria-label={`更多任务操作：${item.name}`}>⋯</summary>
                          <div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void copyTask(item)}
                            >
                              复制
                            </button>
                            <button
                              type="button"
                              disabled={busy || item.related_plan_count > 0}
                              onClick={() => archiveTasks([item.id], { [item.id]: item.version })}
                            >
                              删除
                            </button>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!items.length && (
            <div className="geo-workspace__empty">
              <strong>暂无数据</strong>
            </div>
          )}
          <div className="geo-workspace__pager">
            <label>
              每页
              <select
                aria-label="每页条数"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                  setSelectedTaskIDs([])
                }}
              >
                {[10, 15, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              条
            </label>
            <span>共 {total} 条</span>
            <button
              className="geo-workspace__button"
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((value) => value - 1)
                setSelectedTaskIDs([])
              }}
            >
              上一页
            </button>
            <span>
              {page} / {taskPageCount}
            </span>
            <button
              className="geo-workspace__button"
              disabled={page * pageSize >= total || loading}
              onClick={() => {
                setPage((value) => value + 1)
                setSelectedTaskIDs([])
              }}
            >
              下一页
            </button>
            <label>
              前往
              <input
                aria-label="前往任务页码"
                type="number"
                min={1}
                max={taskPageCount}
                value={page}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (Number.isSafeInteger(value) && value >= 1 && value <= taskPageCount) {
                    setPage(value)
                    setSelectedTaskIDs([])
                  }
                }}
              />
              页
            </label>
          </div>
        </div>
      )}
      <dialog
        ref={generationDialog}
        className="geo-workspace__dialog geo-creation__generation-dialog"
        aria-labelledby="geo-generation-count-title"
        onClose={() => setGenerationTarget(null)}
      >
        <header>
          <h2 id="geo-generation-count-title">生成文章</h2>
          <button
            type="button"
            aria-label="关闭生成文章"
            disabled={busy}
            onClick={() => generationDialog.current?.close()}
          >
            ×
          </button>
        </header>
        {generationTarget && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (generationCount === '') return
              generateArticle(generationTarget, generationCount)
            }}
          >
            <label htmlFor="geo-generation-count">生成篇数</label>
            <input
              id="geo-generation-count"
              type="number"
              min={1}
              max={Math.min(10, generationTarget.available_count || 1)}
              step={1}
              required
              disabled={busy}
              value={generationCount}
              onChange={(event) =>
                setGenerationCount(event.target.value === '' ? '' : Number(event.target.value))
              }
            />
            <p>本任务还可生成 {generationTarget.available_count} 篇</p>
            <footer>
              <button
                type="button"
                className="geo-workspace__button"
                disabled={busy}
                onClick={() => generationDialog.current?.close()}
              >
                取消
              </button>
              <button
                type="submit"
                className="geo-workspace__button is-primary"
                disabled={busy || generationCount === '' || generationCount < 1}
              >
                {busy ? '生成中…' : '生成文章'}
              </button>
            </footer>
          </form>
        )}
      </dialog>
      <dialog
        ref={relatedPlanDialog}
        className="geo-workspace__dialog geo-creation__related-dialog"
        aria-labelledby="geo-related-plans-title"
        onClose={() => setRelatedTask(null)}
      >
        <header>
          <div>
            <h2 id="geo-related-plans-title">关联发布计划</h2>
            {relatedTask && <p className="geo-workspace__hint">任务：{relatedTask.name}</p>}
          </div>
          <button
            type="button"
            aria-label="关闭关联发布计划"
            onClick={() => relatedPlanDialog.current?.close()}
          >
            ×
          </button>
        </header>
        {relatedPlansError && (
          <p role="alert" className="geo-workspace__error">
            {relatedPlansError}
          </p>
        )}
        {relatedPlansLoading ? (
          <p role="status">正在读取关联发布计划…</p>
        ) : relatedPlans.length ? (
          <div className="geo-workspace__table-scroll">
            <table>
              <thead>
                <tr>
                  <th>序号</th>
                  <th>计划名称</th>
                  <th>发布方式</th>
                  <th>发布账号数量</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {relatedPlans.map((plan, index) => (
                  <tr key={plan.id}>
                    <td>{index + 1}</td>
                    <td>{plan.name}</td>
                    <td>{plan.config.schedule.cadence === 'once' ? '手动' : '自动'}</td>
                    <td>{plan.config.targets.length}</td>
                    <td>{planStateLabel[plan.state]}</td>
                    <td>{new Date(plan.created_at).toLocaleString()}</td>
                    <td>
                      <Link
                        href={`/workspace/${encodeURIComponent(company.slug)}/geo/plans?sourceMode=tasks&sourceID=${encodeURIComponent(relatedTask!.id)}&q=${encodeURIComponent(plan.name)}&planID=${encodeURIComponent(plan.id)}`}
                      >
                        查看
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="geo-workspace__empty">该任务暂无关联发布计划</div>
        )}
      </dialog>
    </section>
  )
}
