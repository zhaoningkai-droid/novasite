import { createHash } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError, geoTermSourceMatches, type GeoKeyword } from './keywords'
import type { GeoSourcePage } from './source-discovery'
import { isSourceInScope } from './source-policy'
type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
export function createGeoSourceStore(pool: Pool, tenantID: number) {
  if (!Number.isSafeInteger(tenantID) || tenantID < 1)
    throw new GeoError('FORBIDDEN', '客户归属无效。', 403)
  return {
    async list(configID: string, version: number) {
      return (
        await pool.query(
          `SELECT url,kind,title,excerpt,terms,status,reason,checked_at
        FROM platform_geo.source_pages WHERE tenant_id=$1 AND optimization_id=$2::uuid
          AND optimization_version=$3 ORDER BY status,url`,
          [tenantID, configID, version],
        )
      ).rows
    },
    async replace(config: GeoKeyword, pages: GeoSourcePage[]) {
      if (config.tenantID !== tenantID)
        throw new GeoError('FORBIDDEN', '不能使用其他客户的来源配置。', 403)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const current = (
          await client.query<{ version: number }>(
            'SELECT version FROM platform_geo.optimizations WHERE tenant_id=$1 AND id=$2::uuid FOR SHARE',
            [tenantID, config.id],
          )
        ).rows[0]
        if (!current || current.version !== config.version)
          throw new GeoError('VERSION_CONFLICT', '来源配置已更新，本次旧结果未写入。', 409)
        for (const page of pages) {
          const root = page.kind === 'site' ? config.website : config.blog
          if (
            !isSourceInScope(page.url, root, page.status === 'available') ||
            page.terms.some((term) => term !== config.core && !config.terms.includes(term)) ||
            (page.status === 'available' &&
              (!page.terms.length ||
                (config.termLinks.length > 0 &&
                  !page.terms.every((term) =>
                    geoTermSourceMatches(
                      config,
                      page.url,
                      page.kind,
                      term === config.core ? undefined : term,
                    ),
                  ))))
          )
            throw new GeoError('INVALID_SOURCE', '来源页面超出当前客户配置范围。')
        }
        await client.query(
          `DELETE FROM platform_geo.source_pages WHERE tenant_id=$1
          AND optimization_id=$2::uuid AND optimization_version=$3`,
          [tenantID, config.id, config.version],
        )
        for (const page of pages)
          await client.query(
            `INSERT INTO platform_geo.source_pages
          (tenant_id,optimization_id,optimization_version,url_hash,url,kind,title,excerpt,terms,status,reason,checked_at)
          VALUES($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,now())`,
            [
              tenantID,
              config.id,
              config.version,
              createHash('sha256').update(page.url).digest('hex'),
              page.url,
              page.kind,
              page.title,
              page.excerpt,
              JSON.stringify(page.terms),
              page.status,
              page.reason,
            ],
          )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
  }
}
