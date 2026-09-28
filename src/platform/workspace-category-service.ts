import type { Payload, PayloadRequest, Where } from 'payload'
import type { User } from '@/payload-types'
import { SettingsInputError, settingsText } from './workspace-settings-validation'

export type WorkspaceCategoryKind = 'cases' | 'news' | 'posts' | 'products'
export type WorkspaceCategoryRow = {
  childCount: number; contentCount: number; id: number; level: number; name: string
  parentID: number | null; slug: string; sortOrder: number; translationComplete: boolean; updatedAt: string
}
export const workspaceCategoryConfig = {
  cases: { collection: 'case-categories', content: 'cases', field: 'name' },
  news: { collection: 'news-categories', content: 'news', field: 'name' },
  posts: { collection: 'categories', content: 'posts', field: 'title' },
  products: { collection: 'product-categories', content: 'products', field: 'name' },
} as const
export const isWorkspaceCategoryKind = (value: string): value is WorkspaceCategoryKind =>
  Object.prototype.hasOwnProperty.call(workspaceCategoryConfig, value)

export const categoryRelationshipID = (value: unknown): number | null =>
  typeof value === 'number' ? value
    : typeof value === 'object' && value && 'id' in value && typeof value.id === 'number' ? value.id : null

export const categoryLocalizedName = (doc: Record<string, unknown>, field: 'name' | 'title', locale = 'zh') => {
  const value = doc[field]
  if (typeof value === 'string') return locale === 'zh' ? settingsText(value) : ''
  return value && typeof value === 'object' ? settingsText((value as Record<string, unknown>)[locale]) : ''
}

type TransactionRequest = Partial<PayloadRequest> | undefined
export async function findOwnedWorkspaceCategory(
  payload: Payload, kind: WorkspaceCategoryKind, id: number, tenantID: number, user: User, req?: TransactionRequest,
) {
  const result = await payload.find({
    collection: workspaceCategoryConfig[kind].collection, depth: 0, locale: 'all', fallbackLocale: false,
    limit: 1, overrideAccess: false, user, req,
    where: { and: [{ id: { equals: id } }, { tenant: { equals: tenantID } }] },
  })
  return result.docs[0] as unknown as Record<string, unknown> | undefined
}

export async function getWorkspaceCategoryDependencies(
  payload: Payload, kind: WorkspaceCategoryKind, id: number, tenantID: number, user: User, req?: TransactionRequest,
) {
  const contentWhere: Where = { and: [
    { tenant: { equals: tenantID } },
    kind === 'posts' ? { categories: { contains: id } } : { category: { equals: id } },
  ] }
  const [children, content] = await Promise.all([
    payload.count({ collection: workspaceCategoryConfig[kind].collection, overrideAccess: false, user, req,
      where: { and: [{ tenant: { equals: tenantID } }, { parent: { equals: id } }] } }),
    payload.count({ collection: workspaceCategoryConfig[kind].content, overrideAccess: false, user, req, where: contentWhere }),
  ])
  return { childCount: children.totalDocs, contentCount: content.totalDocs }
}

const formatCategory = (doc: Record<string, unknown>, kind: WorkspaceCategoryKind, counts: { childCount: number; contentCount: number }): WorkspaceCategoryRow => {
  const parentID = categoryRelationshipID(doc.parent)
  const field = workspaceCategoryConfig[kind].field
  return {
    ...counts, id: Number(doc.id), level: parentID ? 2 : 1, parentID,
    name: categoryLocalizedName(doc, field), slug: String(doc.slug || ''), sortOrder: Number(doc.sortOrder || 0),
    translationComplete: ['zh', 'en', 'ru', 'id'].every((locale) => Boolean(categoryLocalizedName(doc, field, locale))),
    updatedAt: String(doc.updatedAt || ''),
  }
}

export async function getWorkspaceCategoryRow(payload: Payload, kind: WorkspaceCategoryKind, id: number, tenantID: number, user: User) {
  const doc = await findOwnedWorkspaceCategory(payload, kind, id, tenantID, user)
  if (!doc) return null
  return formatCategory(doc, kind, await getWorkspaceCategoryDependencies(payload, kind, id, tenantID, user))
}

export async function getWorkspaceCategoryRows(payload: Payload, kind: WorkspaceCategoryKind, tenantID: number, user: User) {
  const mapping = workspaceCategoryConfig[kind]
  const [categories, content] = await Promise.all([
    payload.find({ collection: mapping.collection, depth: 0, locale: 'all', fallbackLocale: false,
      pagination: false, limit: 0, overrideAccess: false, user, sort: 'sortOrder',
      select: { name: true, title: true, parent: true, slug: true, sortOrder: true, updatedAt: true },
      where: { tenant: { equals: tenantID } } }),
    payload.find({ collection: mapping.content, depth: 0, locale: 'zh', fallbackLocale: false,
      pagination: false, limit: 0, overrideAccess: false, user,
      select: kind === 'posts' ? { categories: true } : { category: true },
      where: { tenant: { equals: tenantID } } }),
  ])
  const contentCounts = new Map<number, number>()
  for (const item of content.docs) {
    const raw = item as unknown as Record<string, unknown>
    const relationships = kind === 'posts' ? Array.isArray(raw.categories) ? raw.categories : [] : [raw.category]
    for (const id of new Set(relationships.map(categoryRelationshipID).filter((id): id is number => id !== null))) {
      contentCounts.set(id, (contentCounts.get(id) || 0) + 1)
    }
  }
  const childCounts = new Map<number, number>()
  for (const item of categories.docs) {
    const parentID = categoryRelationshipID((item as unknown as Record<string, unknown>).parent)
    if (parentID) childCounts.set(parentID, (childCounts.get(parentID) || 0) + 1)
  }
  return categories.docs.map((item) => {
    const doc = item as unknown as Record<string, unknown>
    return formatCategory(doc, kind, { childCount: childCounts.get(Number(doc.id)) || 0, contentCount: contentCounts.get(Number(doc.id)) || 0 })
  }).sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'))
}

export async function validateWorkspaceCategoryParent(payload: Payload, kind: WorkspaceCategoryKind, parentID: number | null, tenantID: number, user: User, id?: number) {
  if (!parentID) return
  if (parentID === id) throw new SettingsInputError('上级分类不能选择自己。')
  const parent = await findOwnedWorkspaceCategory(payload, kind, parentID, tenantID, user)
  if (!parent || categoryRelationshipID(parent.parent)) {
    throw new SettingsInputError('上级分类必须是当前公司的一级分类，最多支持两级。')
  }
  if (id) {
    const children = await payload.count({ collection: workspaceCategoryConfig[kind].collection,
      overrideAccess: false, user, where: { and: [{ tenant: { equals: tenantID } }, { parent: { equals: id } }] } })
    if (children.totalDocs) throw new SettingsInputError('该分类已有二级分类，不能再移动到其他分类下。')
  }
}
