import { sql } from '@payloadcms/db-postgres'
import type { CollectionBeforeChangeHook, Field } from 'payload'
import { contentTransaction } from './content-translation/jobs'
import { objectValue } from './content-translation/content'
import { safeNavigationHref } from './workspace-settings-validation'

// Keep an empty string (not SQL NULL) for optional destinations. Existing URL
// columns are NOT NULL; users can leave them empty without a database rewrite.
export const navigationURLField = {
  type: 'text' as const, required: true, defaultValue: '',
  validate: (value: string | null | undefined) => value === '' || Boolean(safeNavigationHref(value)) || '请填写有效链接，或留空。',
}

export const navigationPresentationFields: Field[] = [
  { name: 'sortOrder', label: '网站排序', type: 'number', defaultValue: 0 },
  { name: 'translationKey', type: 'number', admin: { hidden: true } },
  { name: 'modifiedAt', type: 'date', admin: { hidden: true } },
]

export const prepareNavigationItems: CollectionBeforeChangeHook = async ({ data, originalDoc, req, context }) => {
  if (!Array.isArray(data.items)) return data
  const oldItems: Record<string, unknown>[] = Array.isArray(originalDoc?.items) ? originalDoc.items.map(objectValue) : []
  const worker = Boolean(context.navigationStructureSync || context.workspaceContentTranslationJobID && context.workspaceContentTranslationLease)
  const prepared = []
  for (let index = 0; index < data.items.length; index++) {
    const item = objectValue(data.items[index])
    const old = oldItems.find((entry) => item.id && entry.id === item.id)
    let key = worker && Number.isSafeInteger(item.translationKey) ? Number(item.translationKey) : Number(old?.translationKey || 0)
    // A sequence supplies collision-free IDs in the existing durable translation queue.
    if (!key) {
      const result = await contentTransaction(req).execute(sql`SELECT nextval('site_navigation_item_translation_key_seq') AS key`) as { rows: Array<{ key: string }> }
      key = Number(result.rows[0].key)
    }
    const sortOrder = Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : Number(old?.sortOrder ?? 0)
    const meaningful = (value: Record<string, unknown>) => JSON.stringify({ label: value.label, href: value.href, children: value.children || [], sortOrder: value.sortOrder })
    prepared.push({ ...item, sortOrder, translationKey: key,
      modifiedAt: old && meaningful({ ...item, sortOrder }) === meaningful(old) ? old.modifiedAt || originalDoc.updatedAt : new Date().toISOString() })
  }
  return { ...data, items: prepared }
}
