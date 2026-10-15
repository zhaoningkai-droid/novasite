type ByteRange = { start: number; end: number } | 'invalid' | null

/** Supports one byte range, including suffix ranges used by PDF/video readers. */
export function byteRange(value: string | null, size: number): ByteRange {
  if (!value || !/^\s*bytes\s*=/i.test(value)) return null
  const match = value.match(/^\s*bytes=(\d*)-(\d*)\s*$/i)
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size < 1)
    return 'invalid'
  if (!match[1]) {
    const length = Number(match[2])
    if (!Number.isSafeInteger(length) || length < 1) return 'invalid'
    return { start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || start >= size || end < start) return 'invalid'
  return { start, end: Math.min(end, size - 1) }
}
