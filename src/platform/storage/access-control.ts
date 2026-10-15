import { APIError, type Access, type CollectionSlug, type Field, type Payload, type PayloadRequest, type Plugin, type Where } from 'payload'
import type { User } from '@/payload-types'
import { userHasRole } from '@/access/roles'
import { classifyPlatformHost, platformDomainsEnabled } from '../platform-hosts'
import { isSiteLocale } from '../site-locales'
import { mediaAccessControlEnabled, validMediaFilename } from './access-mode'
import { documentReferencesMedia, MediaReferenceLimitError } from './public-references'
import { guardMediaOwnership, mediaOwnershipCollections } from './ownership-guard'

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const id = (value: unknown) => Number(typeof value === 'object' ? object(value).id : value)
const activeUser = (value: unknown): value is User => {
  const user = value as User | null
  if (!user || !userHasRole(user, ['super-admin', 'site-admin', 'editor', 'sales', 'viewer'])) return false
  return !user.expiresAt || Number.isFinite(Date.parse(user.expiresAt)) && Date.parse(user.expiresAt) > Date.now()
}
const companiesFor = (user: User) => (user.tenants || []).map((row) => id(row.tenant)).filter((value) => Number.isSafeInteger(value) && value > 0)
type ReferenceSource = { collection: CollectionSlug; published: boolean; direct: string[]; enabledOnly?: boolean; localeCode?: boolean; single?: boolean }
const sources: ReferenceSource[] = [
  { collection: 'products', published: true, direct: ['gallery', 'datasheet'] },
  { collection: 'news', published: true, direct: ['cover'] },
  { collection: 'cases', published: true, direct: ['cover'] },
  { collection: 'posts', published: true, direct: ['heroImage', 'meta.image'] },
  { collection: 'pages', published: true, direct: ['hero.media', 'meta.image'] },
  { collection: 'product-categories', published: false, direct: ['cover'] },
  { collection: 'faqs', published: false, direct: [], enabledOnly: true },
  { collection: 'site-navigation', published: false, direct: [], localeCode: true, single: true },
]
const sourceScope = (source: ReferenceSource, companyID: number, locale: string): Where[] => [
  { tenant: { equals: companyID } },
  ...(source.published ? [{ _status: { equals: 'published' } }] : []),
  ...(source.enabledOnly ? [{ enabled: { equals: true } }] : []),
  ...(source.localeCode ? [{ localeCode: { equals: locale } }] : []),
]
const unavailable = () => new APIError('媒体权限暂时无法确认，请稍后重试。', 503)
const scanLimit = () => {
  const value = process.env.MEDIA_REFERENCE_SCAN_LIMIT || '5000'
  const limit = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 100 || limit > 50_000) throw unavailable()
  return limit
}

/** Privileged reads below resolve ownership and published references only.
 * They never return records to the caller and never trust a client tenant ID.
 */
export async function authorizeMediaFile(payload: Payload, headers: Headers, filename: string, user?: unknown, req?: Partial<PayloadRequest>) {
  if (!validMediaFilename(filename)) return null
  let host: ReturnType<typeof classifyPlatformHost> | undefined
  if (platformDomainsEnabled()) {
    try { host = classifyPlatformHost(headers.get('host')) } catch { throw unavailable() }
    if (host.kind !== 'admin' && host.kind !== 'tenant') return null
  }
  try {
    const upload = payload.collections.media.config.upload
    const fields: Where[] = [{ filename: { equals: filename } }]
    if (upload && typeof upload === 'object')
      for (const size of upload.imageSizes || []) fields.push({ [`sizes.${size.name}.filename`]: { equals: filename } })
    const result = await payload.find({ collection: 'media', where: { or: fields }, depth: 0, limit: 2,
      overrideAccess: true, req, context: { skipContentTranslationOverlay: true } })
    // Ambiguous filenames are denied rather than resolving another company's file.
    if (result.docs.length !== 1) return null
    const media = result.docs[0]
    const companyID = id(media.tenant)
    if (!Number.isSafeInteger(companyID) || companyID < 1) return null
    const company = await payload.findByID({ collection: 'tenants', id: companyID, depth: 0,
      overrideAccess: true, req, context: { skipContentTranslationOverlay: true } })
    if (host?.kind === 'tenant' && company.slug !== host.slug) return null
    // Customer hosts always use public rules, even if a browser carries an admin cookie.
    if (host?.kind !== 'tenant' && activeUser(user) &&
        (userHasRole(user, ['super-admin']) || companiesFor(user).includes(companyID))) return media.id
    if (company.status !== 'published') return null
    const locales = [...new Set(company.enabledLocales || [])].filter(isSiteLocale)
    if (!locales.length) return null
    const filenames = new Set<string>([media.filename || ''])
    for (const size of Object.values(media.sizes || {})) if (size?.filename) filenames.add(size.filename)
    const target = { id: media.id, filenames, authority: headers.get('host') }
    let remaining = scanLimit()
    for (const locale of locales) {
      const configured = await payload.findByID({ collection: 'tenants', id: companyID, locale, fallbackLocale: false,
        depth: 0, overrideAccess: true, req, context: { skipContentTranslationOverlay: true } })
      if (documentReferencesMedia(configured, payload.collections.tenants.config.fields as Field[], target)) return media.id
      for (const source of sources) {
        const scope = sourceScope(source, companyID, locale)
        if (source.direct.length) {
          const direct = await payload.find({ collection: source.collection, depth: 0, limit: 1, locale,
            fallbackLocale: false, draft: false, overrideAccess: true, req, context: { skipContentTranslationOverlay: true },
            where: { and: [...scope, { or: source.direct.map((field) => ({ [field]: { equals: media.id } })) }] } })
          if (direct.docs.length) return media.id
        }
      }
    }
    // Rich-text uploads, HTML images and legacy URL fields need a bounded scan.
    // Do not infer public access from drafts or recursively populated relations.
    for (const locale of locales) for (const source of sources) {
      let page = 1
      for (;;) {
        if (remaining <= 0) throw new MediaReferenceLimitError()
        const scope = sourceScope(source, companyID, locale)
        const records = await payload.find({ collection: source.collection, depth: 0, page, limit: source.single ? 1 : Math.min(100, remaining),
          sort: source.single ? '-updatedAt' : 'id', locale, fallbackLocale: false, draft: false, overrideAccess: true, req,
          context: { skipContentTranslationOverlay: true }, where: { and: scope } })
        remaining -= records.docs.length
        if (records.docs.some((document) => documentReferencesMedia(document, payload.collections[source.collection].config.fields as Field[], target))) return media.id
        if (source.single || !records.hasNextPage) break
        page++
      }
    }
    return null
  } catch (error) {
    if (error instanceof APIError && error.status === 404) return null
    throw unavailable()
  }
}

export const controlledMediaRead: Access = async ({ req, data, isReadingStaticFile }): Promise<boolean | Where> => {
  if (isReadingStaticFile) {
    if (!validMediaFilename(data?.filename)) return false
    const documentID = await authorizeMediaFile(req.payload, req.headers, data.filename, req.user, req)
    return documentID ? { id: { equals: documentID } } : false
  }
  if (!activeUser(req.user)) return false
  // Internal Local API calls commonly have no HTTP Host. They still require the
  // explicitly supplied authenticated user and assigned companies below.
  if (platformDomainsEnabled() && req.headers.get('host')) {
    try { if (classifyPlatformHost(req.headers.get('host')).kind !== 'admin') return false }
    catch { throw unavailable() }
  }
  if (userHasRole(req.user, ['super-admin'])) return true
  const tenantIDs = companiesFor(req.user)
  return tenantIDs.length ? { tenant: { in: tenantIDs } } : false
}

// Existing folders are shared and have no tenant ownership field. Do not add a
// schema here or let a regular account rename/delete another company's folder.
// Company workspaces use their scoped media library, not this maintenance API.
const controlledFolderAccess: Access = ({ req }) => {
  if (!activeUser(req.user) || !userHasRole(req.user, ['super-admin'])) return false
  if (platformDomainsEnabled() && req.headers.get('host')) {
    try { return classifyPlatformHost(req.headers.get('host')).kind === 'admin' }
    catch { return false }
  }
  return true
}

/** Add validity/entry checks without replacing the official role/tenant guard. */
const controlledMediaWrite = (original?: Access): Access => (args) => {
  if (!activeUser(args.req.user)) return false
  if (platformDomainsEnabled() && args.req.headers.get('host')) {
    try { if (classifyPlatformHost(args.req.headers.get('host')).kind !== 'admin') return false }
    catch { return false }
  }
  return original ? original(args) : false
}

/** Run last: replace READ; compose write checks with the official tenant guards.
 * Published files remain public to visitors who happen to manage another company;
 * authenticated media metadata still stays within explicitly assigned companies.
 */
export const mediaAccessControlPlugin = (): Plugin => (config) => {
  if (!mediaAccessControlEnabled()) return config
  const folders = typeof config.folders === 'object' ? config.folders : {}
  return {
    ...config,
    collections: config.collections?.map((collection) => {
      const guarded = mediaOwnershipCollections.has(collection.slug as CollectionSlug) ? {
        ...collection,
        hooks: { ...collection.hooks, beforeChange: [...(collection.hooks?.beforeChange || []), guardMediaOwnership] },
      } : collection
      return collection.slug !== 'media' ? guarded : {
        ...guarded, access: {
          ...collection.access,
          create: controlledMediaWrite(collection.access?.create),
          delete: controlledMediaWrite(collection.access?.delete),
          read: controlledMediaRead,
          update: controlledMediaWrite(collection.access?.update),
        },
      }
    }),
    // Payload creates its folder collection after plugins. Use its supported
    // override entry, retaining any earlier hooks/fields/overrides unchanged.
    ...(config.folders === false ? {} : {
      folders: {
        ...folders,
        collectionOverrides: [...(folders.collectionOverrides || []), ({ collection }) => ({
          ...collection,
          access: {
            ...collection.access,
            create: controlledFolderAccess,
            delete: controlledFolderAccess,
            read: controlledFolderAccess,
            readVersions: controlledFolderAccess,
            update: controlledFolderAccess,
          },
        })],
      },
    }),
  }
}
