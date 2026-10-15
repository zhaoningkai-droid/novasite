import { normalizeTranslationUsage, TranslationUsageError, type TranslationRequestMeter, type TranslationRequestUsage } from './types'

/** All attempts reserve before network I/O, including provider and validation retries. */
export async function fetchMeteredTranslation(fetcher: typeof fetch, input: string, init: RequestInit, meter?: TranslationRequestMeter) {
  if (!meter) return fetcher(input, init)
  if (typeof init.body !== 'string') throw new TranslationUsageError('翻译用量记录无法识别请求，已停止调用 AI。', 'COST_REQUEST_INVALID')
  let request: { model?: unknown; max_tokens?: unknown; messages?: unknown }
  try { request = JSON.parse(init.body) } catch { throw new TranslationUsageError('翻译请求格式无效，已停止调用 AI。', 'COST_REQUEST_INVALID') }
  if (typeof request.model !== 'string' || !Number.isSafeInteger(request.max_tokens) || Number(request.max_tokens) < 1 || Number(request.max_tokens) > 8192 || !Array.isArray(request.messages)) throw new TranslationUsageError('翻译输出限制或模型配置无效，已停止调用 AI。', 'COST_REQUEST_INVALID')
  const reservation = await meter.reserve({ model: request.model, inputBytes: Buffer.byteLength(JSON.stringify(request.messages), 'utf8'), maxOutputTokens: Number(request.max_tokens) })
  let usage: TranslationRequestUsage | undefined
  let settled = false
  try {
    const response = await fetcher(input, init)
    if (response.ok) {
      try {
        // Read only a bounded copy; the original response remains available to the translator.
        const copy = response.clone()
        const reader = copy.body?.getReader()
        if (reader) {
          const parts: Uint8Array[] = []
          let bytes = 0
          let oversized = false
          try {
            while (true) {
              const item = await reader.read()
              if (item.done) break
              bytes += item.value.byteLength
              if (bytes > 262_144) { oversized = true; void reader.cancel().catch(() => {}); break }
              parts.push(item.value)
            }
          } finally { reader.releaseLock() }
          if (!oversized) {
            const record = JSON.parse(Buffer.concat(parts).toString('utf8')) as { usage?: unknown }
            usage = normalizeTranslationUsage(record?.usage)
          }
        }
      } catch { /* A missing usage response keeps the full conservative reservation. */ }
    }
    await meter.settle(reservation, usage)
    settled = true
    return response
  } catch (error) {
    if (!settled) {
      try { await meter.settle(reservation, usage) } catch {
        throw new TranslationUsageError('翻译用量记录暂不可用，已停止后续 AI 调用，请联系管理员。', 'COST_LEDGER_UNAVAILABLE')
      }
    }
    throw error
  }
}
