import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError, normalizeGeoText, type GeoKeyword, type GeoKeywordValues } from './keywords'

type GeoPool = Pick<PostgresAdapter['pool'], 'query'>
type GeoRow = {
  id: string
  tenant_id: number
  brand: string
  aliases: string[]
  core: string
  terms: string[]
  website: string
  blog: string
  term_links: GeoKeyword['termLinks']
  version: number
  created_at: Date | string
  updated_at: Date | string
}
const toKeyword = (row: GeoRow): GeoKeyword => ({
  id: row.id,
  tenantID: row.tenant_id,
  brand: row.brand,
  aliases: row.aliases,
  core: row.core,
  terms: row.terms,
  website: row.website,
  blog: row.blog,
  termLinks: Array.isArray(row.term_links) ? row.term_links : [],
  version: row.version,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
})
export function createGeoKeywordStore(pool: GeoPool, tenantID: number, actorID: number) {
  if (
    !Number.isSafeInteger(tenantID) ||
    tenantID < 1 ||
    !Number.isSafeInteger(actorID) ||
    actorID < 1
  )
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)
  const find = async (id: string) => {
    const result = await pool.query<GeoRow>(
      'SELECT * FROM platform_geo.optimizations WHERE tenant_id=$1 AND id=$2::uuid',
      [tenantID, id],
    )
    return result.rows[0] ? toKeyword(result.rows[0]) : null
  }
  return {
    find,
    async list(query: string, page: number, pageSize = 20) {
      const params = [tenantID, normalizeGeoText(query)]
      const condition = "tenant_id=$1 AND ($2='' OR position($2 in lower(brand||' '||core))>0)"
      const result = await pool.query<{ total: number; items: GeoRow[] }>(
        `
        SELECT (SELECT count(*)::int FROM platform_geo.optimizations WHERE ${condition}) AS total,
          COALESCE((SELECT jsonb_agg(item) FROM (SELECT * FROM platform_geo.optimizations
            WHERE ${condition} ORDER BY updated_at DESC,id LIMIT $3 OFFSET $4) item),'[]'::jsonb) AS items
      `,
        [...params, pageSize, (page - 1) * pageSize],
      )
      return {
        items: result.rows[0].items.map(toKeyword),
        total: result.rows[0].total,
        page,
        pageSize,
      }
    },
    async create(id: string, values: GeoKeywordValues) {
      const result = await pool.query<GeoRow>(
        `
        WITH changed AS (
          INSERT INTO platform_geo.optimizations
            (id,tenant_id,brand,normalized_brand,aliases,core,normalized_core,terms,website,blog,term_links,
              created_by,updated_by)
          VALUES($1::uuid,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$12)
          ON CONFLICT DO NOTHING RETURNING *
        ), history AS (
          INSERT INTO platform_geo.optimization_revisions
            (tenant_id,optimization_id,version,snapshot,actor_id)
          SELECT tenant_id,id,version,to_jsonb(changed),$12 FROM changed RETURNING version
        ) SELECT * FROM changed
      `,
        [
          id,
          tenantID,
          values.brand,
          normalizeGeoText(values.brand),
          JSON.stringify(values.aliases),
          values.core,
          normalizeGeoText(values.core),
          JSON.stringify(values.terms),
          values.website,
          values.blog,
          JSON.stringify(values.termLinks),
          actorID,
        ],
      )
      if (result.rows[0]) return { item: toKeyword(result.rows[0]), replayed: false }
      const existing = await find(id)
      if (existing) {
        const keys = ['brand', 'aliases', 'core', 'terms', 'website', 'blog', 'termLinks'] as const
        if (keys.every((key) => JSON.stringify(existing[key]) === JSON.stringify(values[key])))
          return { item: existing, replayed: true }
        throw new GeoError('IDEMPOTENCY_CONFLICT', '本次新增请求已处理，请刷新列表后重试。', 409)
      }
      throw new GeoError(
        'DUPLICATE_CONFIG',
        '相同品牌词和核心词的配置已存在，请刷新列表查看。',
        409,
      )
    },
    async update(id: string, version: number, values: GeoKeywordValues) {
      const result = await pool.query<GeoRow>(
        `
        WITH changed AS (
          UPDATE platform_geo.optimizations SET brand=$4,normalized_brand=$5,aliases=$6::jsonb,
            core=$7,normalized_core=$8,terms=$9::jsonb,website=$10,blog=$11,term_links=$12::jsonb,
            version=version+1,updated_by=$13,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND id=$2::uuid AND version=$3 RETURNING *
        ), history AS (
          INSERT INTO platform_geo.optimization_revisions
            (tenant_id,optimization_id,version,snapshot,actor_id)
            SELECT tenant_id,id,version,to_jsonb(changed),$13 FROM changed RETURNING version
        ) SELECT * FROM changed
      `,
        [
          tenantID,
          id,
          version,
          values.brand,
          normalizeGeoText(values.brand),
          JSON.stringify(values.aliases),
          values.core,
          normalizeGeoText(values.core),
          JSON.stringify(values.terms),
          values.website,
          values.blog,
          JSON.stringify(values.termLinks),
          actorID,
        ],
      )
      if (result.rows[0]) return toKeyword(result.rows[0])
      if (!(await find(id))) throw new GeoError('NOT_FOUND', '未找到当前客户的优化词配置。', 404)
      throw new GeoError(
        'VERSION_CONFLICT',
        '此配置已被修改。请先刷新读取最新版本；当前输入已保留。',
        409,
      )
    },
  }
}
