import { APIError, type PayloadRequest } from 'payload'

const maximumBodyBytes = 64 * 1024

/** Read the small JSON form without allowing an unbounded/chunked body. */
export async function readInquiryRequest(req: PayloadRequest): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get('content-length') || 0)
  if (declaredLength > maximumBodyBytes) throw new APIError('Inquiry content is too long.', 413)
  let decoded: unknown
  if (req.body && !req.bodyUsed) {
    const reader = req.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0
    let body = ''
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > maximumBodyBytes) {
          await reader.cancel().catch(() => {})
          throw new APIError('Inquiry content is too long.', 413)
        }
        body += decoder.decode(part.value, { stream: true })
      }
      body += decoder.decode()
      decoded = JSON.parse(body)
    } finally { reader.releaseLock() }
  } else {
    // Payload Local API callers may expose json() without a native body stream.
    decoded = await req.json?.()
    const serialized = JSON.stringify(decoded)
    if (serialized && Buffer.byteLength(serialized, 'utf8') > maximumBodyBytes) {
      throw new APIError('Inquiry content is too long.', 413)
    }
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new APIError('Invalid request.', 400)
  }
  return decoded as Record<string, unknown>
}

/** Reject invalid/oversized fields instead of silently discarding visitor text. */
export function inquiryText(body: Record<string, unknown>, field: string, maximum: number,
  metadata = false) {
  const value = body[field]
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new APIError('Invalid inquiry field.', 400)
  const text = value.trim()
  // Technical attribution may be capped; visitor-written business text may not.
  if (metadata) return text.slice(0, maximum)
  if (text.length > maximum) throw new APIError('Inquiry content is too long. Please shorten it and retry.', 413)
  return text
}

export function inquiryProductID(body: Record<string, unknown>) {
  const raw = body.productId
  if (raw === undefined || raw === null || raw === '') return undefined
  const id = typeof raw === 'number' ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    throw new APIError('Invalid product.', 400)
  }
  return id
}
