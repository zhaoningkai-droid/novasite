import { normalizeGeoText } from './keywords'
import type { GeoIntent, GeoQuestion } from './tasks'

export const questionLines = (value: string) =>
  value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)

export function editGeoQuestionLines(
  value: string,
  previous: GeoQuestion[],
  defaults: { term: string; intent: GeoIntent },
  newID: () => string,
) {
  const remaining = new Map(
    previous.map((question) => [normalizeGeoText(question.original), question]),
  )
  return questionLines(value).map((original, index) => {
    const key = normalizeGeoText(original),
      existing = remaining.get(key)
    if (existing) {
      remaining.delete(key)
      return existing.original === original
        ? existing
        : {
            ...existing,
            original,
            translated: '',
            translatedFrom: '',
            translatedLocale: '',
          }
    }
    const atIndex = previous[index]
    return {
      id: newID(),
      term: atIndex?.term || defaults.term,
      intent: atIndex?.intent || defaults.intent,
      original,
      translated: '',
      translatedFrom: '',
      translatedLocale: '',
    } satisfies GeoQuestion
  })
}

export function mergeGeoQuestionResults(
  previous: GeoQuestion[],
  incoming: GeoQuestion[],
) {
  const seen = new Set(previous.map((question) => normalizeGeoText(question.original)))
  const unique = incoming.filter((question) => {
    const key = normalizeGeoText(question.original)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const accepted = unique
  return {
    questions: [...previous, ...accepted],
    added: accepted.length,
    duplicates: incoming.length - unique.length,
    overflow: 0,
  }
}
