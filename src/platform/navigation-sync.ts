import { objectValue } from './content-translation/content'

/** Keep each language's wording and row IDs while sharing links and display order. */
export function syncNavigationItems(source: unknown[], target: unknown[]) {
  const targets = target.map(objectValue)
  const used = new Set<number>()
  const result = source.map((raw) => {
    const item = objectValue(raw)
    let match = targets.findIndex((entry, index) => !used.has(index) && Number(entry.translationKey) === Number(item.translationKey))
    if (match < 0) match = targets.findIndex((entry, index) => !used.has(index) && entry.href === item.href && item.href)
    if (match >= 0) used.add(match)
    const existing = match < 0 ? {} : targets[match]
    const children = Array.isArray(item.children) ? item.children.map((rawChild) => {
      const child = objectValue(rawChild)
      const previous = (Array.isArray(existing.children) ? existing.children : []).map(objectValue).find((entry) => entry.href === child.href)
      return { label: previous?.label || child.label, href: child.href, ...(previous?.id ? { id: previous.id } : {}) }
    }) : []
    return { ...existing, label: existing.label || item.label, href: item.href, children,
      sortOrder: item.sortOrder, translationKey: item.translationKey, modifiedAt: item.modifiedAt }
  })
  // A language may have historical custom links with no Chinese counterpart.
  // Do not discard those while simplifying the Chinese editor.
  return [...result, ...targets.filter((_, index) => !used.has(index)
    && !source.some((raw) => Number(objectValue(raw).translationKey) === Number(targets[index].translationKey)))]
}
