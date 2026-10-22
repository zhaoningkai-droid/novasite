/** CJK bigrams preserve Chinese names and model numbers; Latin words remain exact. */
export function knowledgeTokens(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase()
  const tokens: string[] = normalized.match(/[a-z0-9]+(?:[._-][a-z0-9]+)*/g) || []
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) || []) {
    const chars = [...run]
    if (chars.length === 1) tokens.push(chars[0])
    else for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1])
  }
  return tokens
}
export function normalizeKnowledgeText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}
export type KnowledgePart = {
  ordinal: number
  heading: string
  content: string
  context: string
  searchText: string
}
/** Heading-aware child chunks with overlap; original paragraphs/tables remain in order. */
export function chunkKnowledge(text: string, title: string): KnowledgePart[] {
  const paragraphs = normalizeKnowledgeText(text)
    .replace(
      /(^|\n)((?:产品类别|产品名称|企业简介|公司介绍|资质认证|服务政策)[：:][^\n]{1,80})/g,
      '$1\n\n# $2\n\n',
    )
    .split(/\n\s*\n/g)
  const parts: KnowledgePart[] = []
  let heading = title,
    buffer = ''
  const flush = () => {
    if (!buffer.trim()) return
    const content = buffer.trim()
    const context = `资料：${title}\n章节：${heading}`
    parts.push({
      ordinal: parts.length,
      heading,
      content,
      context,
      searchText: knowledgeTokens(`${title} ${heading} ${content}`).join(' '),
    })
    buffer = ''
  }
  for (const paragraph of paragraphs) {
    const found =
      paragraph.match(/^#{1,6}\s+([^\n]+)$/) ||
      paragraph.match(/^((?:[一二三四五六七八九十]+[、．.]|\d+[、．.])[^\n]{1,55})$/)
    if (found) {
      flush()
      heading = found[1]
      continue
    }
    const sentences =
      paragraph.length > 1400
        ? paragraph
            .split(/(?<=[。！？])|\n/)
            .flatMap((line) =>
              line.length > 1400 ? line.match(/[\s\S]{1,1200}/g) || [line] : [line],
            )
        : [paragraph]
    for (const sentence of sentences) {
      if (buffer && buffer.length + sentence.length > 1400) {
        const overlap = buffer.slice(-160)
        flush()
        buffer = overlap + '\n'
      }
      buffer += (buffer ? '\n\n' : '') + sentence
    }
  }
  flush()
  return parts
}
export function rankKnowledge<
  T extends { content: string; context: string; title: string; heading: string },
>(candidates: T[], query: string) {
  const q = [...new Set(knowledgeTokens(query))]
  if (!q.length) return []
  const docs = candidates.map((c) => knowledgeTokens(`${c.context} ${c.content}`))
  const average = docs.reduce((s, t) => s + t.length, 0) / (docs.length || 1)
  const frequencies = new Map(q.map((t) => [t, docs.filter((d) => d.includes(t)).length]))
  return candidates
    .map((candidate, index) => {
      const doc = docs[index]
      let bm25 = 0
      for (const term of q) {
        const frequency = doc.filter((t) => t === term).length
        if (!frequency) continue
        const df = frequencies.get(term) || 0
        bm25 +=
          (Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)) * frequency * 2.2) /
          (frequency + 1.2 * (0.25 + (0.75 * doc.length) / (average || 1)))
      }
      const titleBoost = q.filter((t) =>
        knowledgeTokens(`${candidate.title} ${candidate.heading}`).includes(t),
      ).length
      return { ...candidate, score: bm25 + titleBoost * 0.5 }
    })
    .sort((a, b) => b.score - a.score)
}
/** Diversify highly similar overlapping chunks while keeping the best result first. */
export function diverseKnowledge<T extends { content: string; score: number }>(
  items: T[],
  count = 12,
): T[] {
  const result: T[] = []
  const remaining = [...items]
  while (result.length < count && remaining.length) {
    let best = 0,
      bestScore = -Infinity
    remaining.forEach((item, i) => {
      const tokens = new Set(knowledgeTokens(item.content))
      const similarity = Math.max(
        0,
        ...result.map((previous) => {
          const other = new Set(knowledgeTokens(previous.content))
          const intersection = [...tokens].filter((t) => other.has(t)).length
          return intersection / (new Set([...tokens, ...other]).size || 1)
        }),
      )
      const score = item.score * 0.75 - similarity * Math.max(items[0]?.score || 0, 0.0001) * 0.25
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    })
    result.push(remaining.splice(best, 1)[0])
  }
  return result
}
