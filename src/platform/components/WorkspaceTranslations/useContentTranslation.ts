'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProductTranslationView } from '../../product-translation/job-view'
import type { TranslationResource } from '../../content-translation/resources'

export function useContentTranslation(companySlug: string, resource: TranslationResource, ids: number[], refreshKey = '') {
  const router = useRouter()
  const endpoint = `/api/workspace/${companySlug}/translations/${resource}`
  const idsKey = ids.join(',')
  const [views, setViews] = useState<Record<number, ProductTranslationView>>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)
  const submission = useRef<AbortController | undefined>(undefined)
  const scopeGeneration = useRef(0)
  const submissionRevision = useRef(0)
  const active = useRef(new Set<number>())
  const generation = useRef(0)
  useEffect(() => {
    // A response from the previous company/module must never update this view.
    // Aborting the browser request does not cancel an already persisted job.
    ++scopeGeneration.current
    setSubmitting(false)
    return () => {
      ++scopeGeneration.current
      submission.current?.abort()
      submission.current = undefined
    }
  }, [companySlug, resource])
  useEffect(() => {
    setViews({}); setReady(false); setError(''); active.current = new Set()
  }, [companySlug, resource, idsKey, refreshKey])
  useEffect(() => {
    if (!idsKey) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    const ownGeneration = ++generation.current
    const read = async () => {
      const revisionAtRead = submissionRevision.current
      try {
        const requested = idsKey.split(',')
        const results: Array<{ views: ProductTranslationView[]; enabled?: boolean }> = []
        for (let offset = 0; offset < requested.length; offset += 50) {
          const response = await fetch(`${endpoint}?ids=${requested.slice(offset, offset + 50).join(',')}`, { cache: 'no-store', signal: controller.signal })
          const result = await response.json() as { message?: string; views?: ProductTranslationView[]; enabled?: boolean }
          if (!response.ok || !result.views) throw new Error(result.message || '翻译状态暂时无法读取。')
          results.push({ views: result.views, enabled: result.enabled })
        }
        const result = { views: results.flatMap((item) => item.views), enabled: results.every((item) => item.enabled) }
        if (disposed || ownGeneration !== generation.current
          || revisionAtRead !== submissionRevision.current) return
        const completed = result.views.some((view) => active.current.has(view.productID) && !view.locked)
        active.current = new Set(result.views.filter((view) => view.locked).map((view) => view.productID))
        setViews(Object.fromEntries(result.views.map((view) => [view.productID, view])))
        setReady(Boolean(result.enabled))
        setError(result.views.some((view) => view.status === 'failed' || view.status === 'partial')
          ? '上次翻译未完成，请重新选择相应内容后点击翻译。'
          : '')
        if (completed) router.refresh()
      } catch (reason) {
        if (!disposed && ownGeneration === generation.current
          && revisionAtRead === submissionRevision.current) {
          // Keep known task locks when a status request fails; do not infer completion.
          setReady(false)
          setError(reason instanceof Error ? reason.message : '翻译状态暂时无法读取。')
        }
      }
      finally { if (!disposed) timer = setTimeout(() => void read(), active.current.size ? 3000 : 12000) }
    }
    void read()
    return () => { disposed = true; controller.abort(); clearTimeout(timer) }
  }, [endpoint, idsKey, refreshKey, submitting, router])
  const translate = async (selectedIDs: number[]) => {
    if (submission.current || !ready || !selectedIDs.length) return
    const eligible = [...new Set(selectedIDs)].filter((id) => views[id]?.canTranslate && !views[id]?.locked)
    if (!eligible.length) return
    const controller = new AbortController()
    const ownScopeGeneration = scopeGeneration.current
    submission.current = controller
    const isCurrent = () => !controller.signal.aborted
      && ownScopeGeneration === scopeGeneration.current && submission.current === controller
    setSubmitting(true); setError('')
    try {
      for (let offset = 0; offset < eligible.length; offset += 50) {
        if (!isCurrent()) return
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: eligible.slice(offset, offset + 50) }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) })
        const result = await response.json() as { message?: string; accepted?: Array<{ productID: number; jobID: string }> }
        if (!isCurrent()) return
        if (!response.ok) throw new Error(result.message || '任务提交失败。')
        if (result.accepted?.length) ++submissionRevision.current
        for (const item of result.accepted || []) active.current.add(item.productID)
        setViews((previous) => {
          if (ownScopeGeneration !== scopeGeneration.current || controller.signal.aborted) return previous
          const next = { ...previous }
          for (const item of result.accepted || []) next[item.productID] = { ...previous[item.productID], productID: item.productID, jobID: item.jobID, locked: true, canTranslate: false, status: 'queued', completed: previous[item.productID]?.completed || 0, total: previous[item.productID]?.total || 0, languages: previous[item.productID]?.languages || [] }
          return next
        })
      }
    } catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : '翻译任务提交失败。')
    } finally {
      if (isCurrent()) {
        submission.current = undefined
        setSubmitting(false)
      }
    }
  }
  return { views, error, ready, submitting, translate, locked: (id: number) => Boolean(views[id]?.locked) }
}
