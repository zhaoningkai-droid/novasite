export class TranslationUsageError extends Error {
  constructor(message: string, readonly code: string, readonly status = 503) { super(message) }
}

export type TranslationRequestUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheHitInputTokens: number | null
  cacheMissInputTokens: number | null
}
export type TranslationRequestInfo = {
  model: string
  inputBytes: number
  maxOutputTokens: number
}
export type TranslationRequestMeter = {
  reserve: (request: TranslationRequestInfo) => Promise<string>
  settle: (reservationID: string, usage?: TranslationRequestUsage) => Promise<void>
}

/** Missing or inconsistent usage is unknown, never converted into zero-cost success. */
export function normalizeTranslationUsage(value: unknown): TranslationRequestUsage | undefined {
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const integer = (number: unknown): number | undefined => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 && number <= 1_000_000_000 ? number : undefined
  const input = integer(record.prompt_tokens)
  const output = integer(record.completion_tokens)
  const total = integer(record.total_tokens)
  if (input === undefined || input === 0 || output === undefined || total === undefined || total !== input + output) return
  const hit = integer(record.prompt_cache_hit_tokens)
  const miss = integer(record.prompt_cache_miss_tokens)
  const cacheKnown = hit !== undefined && miss !== undefined && hit + miss === input
  return { inputTokens: input, outputTokens: output, totalTokens: total, cacheHitInputTokens: cacheKnown ? hit : null, cacheMissInputTokens: cacheKnown ? miss : null }
}
