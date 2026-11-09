'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProductTranslationView } from '../../product-translation/job-view'
import type { TranslationResource } from '../../content-translation/resources'
import { submitTranslationBatch, translationBatchSize, translationSubmissionNotice } from '../../product-translation/submission'

export function useContentTranslation(companySlug: string, resource: TranslationResource, ids: number[], refreshKey = '') {
  const router = useRouter()
  const endpoint = `/api/workspace/${encodeURIComponent(companySlug)}/translations/${resource}`
  const idsKey = ids.join(',')
  const [views, setViews] = useState<Record<number, ProductTranslationView>>({})
  const [error, setError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)
  const [readRevision, setReadRevision] = useState(0)
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
    setSubmitError('')
    setNotice('')
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
    if (!idsKey || submitting) return
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
        setError('')
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
  }, [endpoint, idsKey, refreshKey, submitting, readRevision, router])
  const translate = async (selectedIDs: number[]) => {
    if (submission.current || !ready || !selectedIDs.length) return false
    const eligible = [...new Set(selectedIDs)].filter((id) => views[id]?.canTranslate && !views[id]?.locked)
    if (!eligible.length) return false
    setSubmitError(''); setNotice('')
    if (eligible.length > translationBatchSize) {
      setSubmitError(`每批最多提交 ${translationBatchSize} 项，本批还未提交。请减少选择后再试。`)
      return false
    }
    const controller = new AbortController()
    const ownScopeGeneration = scopeGeneration.current
    submission.current = controller
    ++submissionRevision.current
    const isCurrent = () => !controller.signal.aborted
      && ownScopeGeneration === scopeGeneration.current && submission.current === controller
    setSubmitting(true)
    try {
      const result = await submitTranslationBatch(endpoint, eligible, controller.signal)
      if (!isCurrent()) return false
      ++submissionRevision.current
      for (const item of result.accepted) active.current.add(item.productID)
      setViews((previous) => {
        if (ownScopeGeneration !== scopeGeneration.current || controller.signal.aborted) return previous
        const next = { ...previous }
        for (const item of result.accepted) next[item.productID] = { ...previous[item.productID], productID: item.productID, jobID: item.jobID, locked: true, canTranslate: false, status: 'queued', completed: previous[item.productID]?.completed || 0, total: previous[item.productID]?.total || 0, languages: previous[item.productID]?.languages || [] }
        return next
      })
      setNotice(translationSubmissionNotice(result))
      return true
    } catch (reason) {
      if (isCurrent()) {
        // Re-read current-source status before allowing another submission. Never automatically POST again.
        setReady(false)
        setSubmitError(reason instanceof Error ? reason.message : '翻译任务提交失败。')
      }
      return false
    } finally {
      if (isCurrent()) {
        submission.current = undefined
        setSubmitting(false)
        setReadRevision((revision) => revision + 1)
      }
    }
  }
  const markReviewed = (id: number, jobID: string) => {
    ++submissionRevision.current
    active.current.add(id)
    setViews((previous) => {
      const view = previous[id]
      if (!view || view.jobID !== jobID) return previous
      return { ...previous, [id]: { ...view, status: 'queued', locked: true, canTranslate: false, needsAction: false, review: undefined } }
    })
    setNotice('已重新排队，可以离开此页面。')
    setSubmitError('')
    router.refresh()
  }
  return { views, error: [submitError, error].filter(Boolean).join(' '), notice, ready, submitting, translate, markReviewed, locked: (id: number) => Boolean(views[id]?.locked) }
}
