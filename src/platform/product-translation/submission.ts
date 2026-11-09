// Bound one database transaction. This is a batch size, independent of AI usage.
export const translationBatchSize = 200

export const validTranslationIDs = (ids: unknown, maxCount: number, maxID = 2_147_483_647): ids is number[] =>
  Array.isArray(ids) && ids.length > 0 && ids.length <= maxCount
  && ids.every((id) => Number.isSafeInteger(id) && id > 0 && id <= maxID)

export type TranslationAdmission = {
  productID: number
  jobID: string
  existing?: true
}
export type TranslationSkip = 'completed' | 'no_source'
export type TranslationSubmission = {
  accepted: TranslationAdmission[]
  skipped: number[]
  skipReasons: Partial<Record<number, TranslationSkip>>
}

export class UnconfirmedTranslationSubmission extends Error {
  constructor() {
    super('未收到整批提交确认。已入队的翻译会在后台继续，请核对列表中的最新任务状态后再提交。')
  }
}

export async function submitTranslationBatch(endpoint: string, ids: number[], signal: AbortSignal) {
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }), signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    })
  } catch {
    throw new UnconfirmedTranslationSubmission()
  }
  const result = await response.json().catch(() => null) as (TranslationSubmission & { message?: string }) | null
  if (!response.ok) {
    if (response.status >= 500 || response.status === 408) {
      const error = new UnconfirmedTranslationSubmission()
      if (result?.message) error.message = `${result.message} ${error.message}`
      throw error
    }
    throw new Error(result?.message || '这批内容未能提交，请核对后重试。')
  }
  if (!result || !Array.isArray(result.accepted) || !Array.isArray(result.skipped)
    || result.accepted.some((item) => !item || typeof item.jobID !== 'string' || !item.jobID))
    throw new UnconfirmedTranslationSubmission()
  const confirmed = [...result.accepted.map((item) => item.productID), ...result.skipped]
  const requested = new Set(ids)
  if (confirmed.length !== requested.size || new Set(confirmed).size !== requested.size
    || confirmed.some((id) => !requested.has(id))) throw new UnconfirmedTranslationSubmission()
  return result
}

export function translationSubmissionNotice(result: TranslationSubmission) {
  const existing = result.accepted.filter((item) => item.existing).length
  const added = result.accepted.length - existing
  const noSource = result.skipped.filter((id) => result.skipReasons?.[id] === 'no_source').length
  const completed = result.skipped.length - noSource
  return [
    added && `已提交 ${added} 项`,
    existing && `${existing} 项已有后台任务`,
    completed && `${completed} 项已翻译`,
    noSource && `${noSource} 项无可翻译的源内容`,
  ].filter(Boolean).join('，') + (result.accepted.length ? '。现在可以离开页面。' : '。')
}
