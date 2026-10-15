import { APIError, type CollectionBeforeChangeHook, type CollectionSlug, type Field, type Where } from 'payload'

import { userHasRole } from '@/access/roles'
import { collectMediaReferences, MediaReferenceLimitError } from './public-references'

// All company-owned collections, not a template-specific setting or field.
export const mediaOwnershipCollections = new Set<CollectionSlug>([
  'tenants', 'media', 'pages', 'posts', 'products', 'product-specifications',
  'product-categories', 'news', 'news-categories', 'cases', 'case-categories',
  'categories', 'faqs', 'site-navigation',
])

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const relationID = (value: unknown) => Number(typeof value === 'object' ? object(value).id : value)
const validID = (value: number) => Number.isSafeInteger(value) && value > 0
const mismatch = () => new APIError('所选文件不属于当前公司或已不存在，请重新选择本公司的文件。', 422)
const unavailable = () => new APIError('暂时无法确认文件归属，内容尚未保存，请稍后重试。', 503)
const chunks = <T,>(values: T[], size: number) => {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

/** Validate new media associations before any business data is saved.
 * Privileged queries are constrained to the record's server-side company and
 * return ownership identifiers only. They are not a user-facing media listing.
 */
export const guardMediaOwnership: CollectionBeforeChangeHook = async ({ collection, data, originalDoc, operation, req }) => {
  const companyID = collection.slug === 'tenants'
    ? relationID(originalDoc?.id ?? data.id)
    : relationID(data.tenant ?? originalDoc?.tenant)
  const previousCompanyID = relationID(originalDoc?.tenant)
  if (collection.slug === 'media' && operation === 'update' && validID(previousCompanyID) &&
      previousCompanyID !== companyID)
    throw new APIError('媒体文件不能移动到其他公司，请在目标公司重新上传。', 422)
  if (collection.slug === 'media' && Object.prototype.hasOwnProperty.call(data, 'folder') &&
      (relationID(data.folder) || null) !== (relationID(originalDoc?.folder) || null) &&
      !userHasRole(req.user, ['super-admin']))
    throw new APIError('共享文件夹由平台管理员维护，请使用当前公司的媒体库。', 403)

  let references: ReturnType<typeof collectMediaReferences>
  try {
    references = collectMediaReferences(data, collection.fields as Field[], req.headers.get('host'))
    // Moving a business record must not carry its old company's files with it.
    // Do not rescan untouched legacy content during ordinary text-only edits.
    if (collection.slug !== 'tenants' && validID(previousCompanyID) && companyID !== previousCompanyID) {
      const previous = collectMediaReferences(originalDoc, collection.fields as Field[], req.headers.get('host'))
      for (const id of previous.ids) references.ids.add(id)
      for (const filename of previous.filenames) references.filenames.add(filename)
    }
  } catch (error) {
    if (error instanceof MediaReferenceLimitError)
      throw new APIError('内容中的文件关联过多，请分批保存。', 422)
    throw error
  }
  if (!references.ids.size && !references.filenames.size) return data
  // A newly created company has no server-generated ID yet. Create its empty
  // record first, then upload/associate its own files; never borrow demo media.
  if (!validID(companyID)) throw mismatch()
  if (references.ids.size + references.filenames.size > 1000)
    throw new APIError('一次保存最多检查 1000 个文件关联，请分批保存。', 422)

  const ownershipScope: Where = { tenant: { equals: companyID } }
  const context = { skipContentTranslationOverlay: true }
  for (const ids of chunks([...references.ids], 100)) {
    const result = await req.payload.find({
      collection: 'media', depth: 0, limit: ids.length, pagination: false,
      overrideAccess: true, req, context, select: { tenant: true },
      where: { and: [ownershipScope, { id: { in: ids } }] },
    }).catch(() => { throw unavailable() })
    const found = new Set(result.docs.map((doc) => doc.id))
    if (ids.some((id) => !found.has(id))) throw mismatch()
  }

  const upload = req.payload.collections.media.config.upload
  const paths = ['filename', ...(upload && typeof upload === 'object'
    ? (upload.imageSizes || []).map((size) => `sizes.${size.name}.filename`) : [])]
  // URL fields can reference either originals or Payload's generated sizes.
  // Paginate exact filename matches; never perform an unbounded full-media scan.
  let inspected = 0
  for (const filenames of chunks([...references.filenames], 100)) {
    const missing = new Set(filenames)
    let page = 1
    for (;;) {
      const result = await req.payload.find({
        collection: 'media', depth: 0, limit: 100, page, sort: 'id',
        overrideAccess: true, req, context, select: { filename: true, sizes: true },
        where: { and: [ownershipScope, { or: paths.map((field) => ({ [field]: { in: filenames } })) }] },
      }).catch(() => { throw unavailable() })
      inspected += result.docs.length
      if (inspected > 5000) throw unavailable()
      for (const media of result.docs) {
        if (media.filename) missing.delete(media.filename)
        for (const size of Object.values(media.sizes || {})) if (size?.filename) missing.delete(size.filename)
      }
      if (!missing.size) break
      if (!result.hasNextPage) throw mismatch()
      page++
    }
  }
  return data
}
