import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { settingsEditorRoles, workspaceSettingsScope } from '../workspace-settings-api'
import { assertGeoWriteRequest, geoAPIError, geoReply, readGeoBody } from './keyword-api'
import { createGeoKeywordStore } from './keyword-store'
import { createGeoSourceStore } from './source-store'
import { GeoError, geoID, geoVersion } from './keywords'
import { discoverGeoSources, type GeoSourceCandidate } from './source-discovery'
import { isSourceInScope } from './source-policy'

/** Internal source index endpoint. Candidate URLs remain tenant-scoped and server checked. */
export async function handleGeoSources(request: Request, companySlug: string, id: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scoped = await workspaceSettingsScope(companySlug, settingsEditorRoles)
    if (scoped.error) {
      const error = await scoped.error.json()
      return geoReply(
        { code: `SCOPE_${scoped.error.status}`, message: error.message, requestId },
        scoped.error.status,
      )
    }
    const pool = (scoped.payload.db as unknown as PostgresAdapter).pool
    const config = await createGeoKeywordStore(pool, scoped.company.id, scoped.user.id).find(
      geoID(id),
    )
    if (!config) throw new GeoError('NOT_FOUND', '未找到当前客户的优化词配置。', 404)
    const store = createGeoSourceStore(pool, scoped.company.id)
    if (request.method === 'POST') {
      const body = await readGeoBody(request)
      if (geoVersion(body.version) !== config.version)
        throw new GeoError('VERSION_CONFLICT', '优化词配置已更新，请读取最新配置后重试。', 409)
      const candidates: GeoSourceCandidate[] = []
      const company = scoped.company
      if (company.status === 'published' && company.primaryDomain) {
        const primary = /^https?:\/\//iu.test(company.primaryDomain)
          ? company.primaryDomain
          : `https://${company.primaryDomain}`
        const origin = new URL(primary).origin
        for (const [collection, path] of [
          ['products', 'products'],
          ['news', 'news'],
          ['cases', 'cases'],
          ['posts', 'blog'],
        ] as const) {
          const found = await scoped.payload.find({
            collection,
            depth: 0,
            draft: false,
            limit: 30,
            locale: company.defaultLocale,
            fallbackLocale: false,
            overrideAccess: false,
            user: scoped.user,
            select: { title: true, slug: true },
            where: {
              and: [{ tenant: { equals: company.id } }, { _status: { equals: 'published' } }],
            },
          })
          for (const doc of found.docs) {
            if (!doc.slug) continue
            const url = `${origin}/${company.defaultLocale}/${path}/${encodeURIComponent(doc.slug)}`
            if (
              isSourceInScope(url, config.website, true) ||
              (config.blog && isSourceInScope(url, config.blog, true))
            )
              candidates.push({ url, title: doc.title || '' })
          }
        }
      }
      const pages = await discoverGeoSources(config, candidates)
      await store.replace(config, pages)
    }
    const items = await store.list(config.id, config.version)
    return geoReply({
      items,
      version: config.version,
      available: items.filter((item) => item.status === 'available').length,
      requestId,
    })
  } catch (error) {
    return geoAPIError(error, requestId)
  }
}
