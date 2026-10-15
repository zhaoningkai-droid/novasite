import { APIError, type CollectionConfig, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionAfterReadHook, type CollectionAfterChangeHook } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { isSiteLocale } from '../site-locales'
import { buildContentSnapshot, contentFingerprint, mergeContentPatch, objectValue, setValueAt } from './content'
import { activeContentJobs, contentOverlays, contentQueueEnabled, contentTransaction, relationID } from './jobs'
import { contentTaskKey, translationResources, type TranslationResource } from './resources'

const resourcesFor = (collection: string) => Object.entries(translationResources).filter(([, definition]) => definition.collection === collection).map(([resource]) => resource as TranslationResource)
const allowWorker = (job: { id: string; lease_owner: string | null }, context: Record<string, unknown>) => Boolean(job.lease_owner && job.id === context.workspaceContentTranslationJobID && job.lease_owner === context.workspaceContentTranslationLease)

const guardChange: CollectionBeforeChangeHook = async ({ data, originalDoc, collection, context, req, operation }) => {
  if (!contentQueueEnabled()) return data
  const tenantID = collection.slug === 'tenants' ? relationID(originalDoc?.id || data.id) : relationID(data.tenant || originalDoc?.tenant)
  if (!Number.isSafeInteger(tenantID) || tenantID < 1) return data
  const transaction = contentTransaction(req)
  await transaction.execute(sql`SELECT pg_advisory_xact_lock(57291, ${tenantID})`)
  const active = (await activeContentJobs(req.payload, tenantID, req)).filter((job) => resourcesFor(collection.slug).includes(job.source.resource) && !allowWorker(job, context))
  for (const job of active) {
    if (collection.slug === 'site-navigation' && job.source.resource === 'navigation-items') {
      if ((data.localeCode || originalDoc?.localeCode) !== 'zh') continue
      const old = (Array.isArray(originalDoc?.items) ? originalDoc.items : []).map(objectValue)
        .find((item: Record<string, unknown>) => Number(item.translationKey) === job.source.documentID)
      if (!old) continue
      const next = (Array.isArray(data.items) ? data.items : originalDoc.items).map(objectValue)
        .find((item: Record<string, unknown>) => item.id === old.id)
      const before = buildContentSnapshot('navigation-items', job.source.documentID, old, collection.fields)
      if (next && contentFingerprint(before, 'zh') === contentFingerprint(buildContentSnapshot('navigation-items', job.source.documentID, next, collection.fields), 'zh')) continue
      throw new APIError('这个栏目正在翻译中，请完成后再修改。其他栏目不受影响。', 409)
    }
    if (collection.slug === 'site-navigation') throw new APIError('导航正在翻译中，请完成后再保存。其他页面不受影响。', 409)
    if (Number(originalDoc?.id) !== job.source.documentID) continue
    if (collection.slug === 'tenants') {
      const source = buildContentSnapshot(job.source.resource, Number(originalDoc.id), originalDoc, collection.fields)
      const changed = buildContentSnapshot(job.source.resource, Number(originalDoc.id), mergeContentPatch(originalDoc, data), collection.fields)
      if (contentFingerprint(source, job.source_locale) === contentFingerprint(changed, job.source_locale)) continue
    }
    if (operation === 'update') throw new APIError('这条内容正在翻译中，请完成后再编辑或删除。其他内容不受影响。', 409)
  }
  return data
}
const guardDelete: CollectionBeforeDeleteHook = async ({ collection, id, req }) => {
  if (!contentQueueEnabled()) return
  const document = await req.payload.findByID({ collection: collection.slug, id, depth: 0, overrideAccess: false, req, context: { skipContentTranslationOverlay: true } })
  const tenantID = collection.slug === 'tenants' ? Number(id) : relationID(objectValue(document).tenant)
  const transaction = contentTransaction(req)
  await transaction.execute(sql`SELECT pg_advisory_xact_lock(57291, ${tenantID})`)
  if ((await activeContentJobs(req.payload, tenantID, req)).some((job) => resourcesFor(collection.slug).includes(job.source.resource) && (collection.slug === 'site-navigation' || job.source.documentID === Number(id)))) throw new APIError('这条内容正在翻译中，请完成后再删除。其他内容不受影响。', 409)
}
const overlayRead: CollectionAfterReadHook = async ({ doc, collection, req, context }) => {
  if (!contentQueueEnabled() || context.skipContentTranslationOverlay || typeof req.locale !== 'string' || !isSiteLocale(req.locale)) return doc
  if (collection.slug === 'site-navigation') return doc
  const tenantID = collection.slug === 'tenants' ? Number(doc.id) : relationID(doc.tenant)
  if (!Number.isSafeInteger(tenantID) || tenantID < 1 || !Number.isSafeInteger(Number(doc.id))) return doc
  // Nonlocalized labels (e.g. banner JSON or project country) remain source data in
  // the business record. Only its target-language read receives the saved overlay.
  const cache = (req.context.contentTranslationOverlayCache ||= new Map()) as Map<string, Promise<Array<{ path: Array<string | number>; value: unknown; sourceValue: unknown }>>>
  const key = `${tenantID}:${collection.slug}:${doc.id}:${req.locale}:${doc._status === 'draft' ? 'draft' : 'published'}`
  if (!cache.has(key)) cache.set(key, contentOverlays(req.payload, tenantID, collection.slug, Number(doc.id), req.locale, doc._status === 'draft'))
  const overlays = await cache.get(key)!
  if (!overlays.length) return doc
  const result = structuredClone(doc)
  for (const overlay of overlays) {
    // Never create a removed array row from an older translation.
    let value: unknown = result
    let present = true
    for (const path of overlay.path.slice(0, -1)) {
      if (!value || typeof value !== 'object' || !(path in value)) { present = false; break }
      value = (value as Record<string, unknown>)[path]
    }
    const current = value && typeof value === 'object' ? (value as Record<string, unknown>)[overlay.path.at(-1)!] : undefined
    if (present && current === overlay.sourceValue) setValueAt(result, overlay.path, overlay.value)
  }
  return result
}
const publishOverlays: CollectionAfterChangeHook = async ({ doc, collection, req }) => {
  if (!contentQueueEnabled() || doc._status !== 'published' || typeof req.locale !== 'string' || !isSiteLocale(req.locale)) return doc
  const resources = resourcesFor(collection.slug)
  if (!resources.length || collection.slug === 'tenants' || collection.slug === 'site-navigation') return doc
  const tenantID = relationID(doc.tenant)
  const transaction = contentTransaction(req)
  for (const resource of resources) {
    const snapshot = buildContentSnapshot(resource, Number(doc.id), doc, collection.fields)
    const hash = contentFingerprint(snapshot, req.locale)
    // Publishing a translated draft promotes its language overlays along with the
    // CMS draft version; a different source revision is never promoted by mistake.
    await transaction.execute(sql`UPDATE platform_jobs.product_translation SET source=jsonb_set(source,'{draft}','false'::jsonb),updated_at=now() WHERE tenant_id=${tenantID} AND product_id=${contentTaskKey(resource, Number(doc.id))} AND source_hash=${hash} AND source_locale=${req.locale} AND source->>'draft'='true'`)
  }
  return doc
}
export function withContentTranslations(collection: CollectionConfig): CollectionConfig {
  if (!resourcesFor(collection.slug).length) return collection
  return { ...collection, hooks: { ...collection.hooks, beforeChange: [guardChange, ...(collection.hooks?.beforeChange || [])], beforeDelete: [guardDelete, ...(collection.hooks?.beforeDelete || [])], afterRead: [...(collection.hooks?.afterRead || []), overlayRead], afterChange: [publishOverlays, ...(collection.hooks?.afterChange || [])] } }
}
