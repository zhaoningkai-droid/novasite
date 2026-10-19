import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { GeoError, normalizeGeoText } from './keywords'
import {
  geoImageTypes,
  type GeoMaterialFolder,
  type GeoMaterialGroup,
  type GeoMaterialImage,
  type GeoMaterialValues,
} from './materials'
type Pool = Pick<PostgresAdapter['pool'], 'query' | 'connect'>
type GroupRow = {
  id: string
  tenant_id: number
  name: string
  description: string
  version: number
  archived: boolean
  entry_type: 'folder' | 'group'
  parent_group_id: string | null
  updated_at: string | Date
}
export function createGeoMaterialStore(pool: Pool, tenantID: number, actorID: number) {
  if (
    !Number.isSafeInteger(tenantID) ||
    tenantID < 1 ||
    !Number.isSafeInteger(actorID) ||
    actorID < 1
  )
    throw new GeoError('FORBIDDEN', '客户授权信息无效。', 403)
  const find = async (id: string): Promise<GeoMaterialGroup | null> => {
    const group = (
      await pool.query<GroupRow>(
        "SELECT * FROM platform_geo.material_groups WHERE tenant_id=$1 AND id=$2::uuid AND entry_type='group'",
        [tenantID, id],
      )
    ).rows[0]
    if (!group) return null
    const images = (
      await pool.query<GeoMaterialImage>(
        `
      SELECT i.media_id AS id,
        CASE WHEN m.id IS NULL THEN '' ELSE coalesce(m.alt,'') END AS alt,
        CASE WHEN m.id IS NULL THEN '' ELSE coalesce(m.filename,'') END AS filename,
        CASE WHEN m.id IS NULL THEN '' ELSE coalesce(m.url,'') END AS url,
        CASE WHEN m.id IS NULL THEN '' ELSE coalesce(m.thumbnail_u_r_l,m.url,'') END AS "thumbnailURL",
        (m.id IS NOT NULL AND m.mime_type=ANY($3::text[]) AND coalesce(m.filesize,0)<=512000) AS available
      FROM platform_geo.material_items i LEFT JOIN public.media m
        ON m.id=i.media_id AND m.tenant_id=i.tenant_id
      WHERE i.tenant_id=$1 AND i.group_id=$2::uuid ORDER BY i.sort_order,i.media_id
    `,
        [tenantID, id, geoImageTypes],
      )
    ).rows
    return {
      id: group.id,
      tenantID,
      name: group.name,
      description: group.description,
      version: group.version,
      archived: group.archived,
      updatedAt: new Date(group.updated_at).toISOString(),
      parentGroupID: group.parent_group_id,
      mediaIds: images.map((image) => image.id),
      images,
    }
  }
  const findSummary = async (id: string) => {
    const group = (
      await pool.query<GroupRow & { count: number }>(
        `SELECT g.id,g.tenant_id,g.name,g.description,g.version,g.archived,g.entry_type,
          g.parent_group_id,g.updated_at,
          count(m.id) FILTER (WHERE m.id IS NOT NULL AND m.mime_type=ANY($3::text[])
            AND coalesce(m.filesize,0)<=512000)::int AS count
        FROM platform_geo.material_groups g
        LEFT JOIN platform_geo.material_items i ON i.tenant_id=g.tenant_id AND i.group_id=g.id
        LEFT JOIN public.media m ON m.id=i.media_id AND m.tenant_id=i.tenant_id
        WHERE g.tenant_id=$1 AND g.id=$2::uuid AND g.entry_type='group'
        GROUP BY g.id`,
        [tenantID, id, geoImageTypes],
      )
    ).rows[0]
    if (!group) return null
    return {
      id: group.id,
      tenantID,
      name: group.name,
      description: group.description,
      version: group.version,
      archived: group.archived,
      updatedAt: new Date(group.updated_at).toISOString(),
      parentGroupID: group.parent_group_id,
      count: Number(group.count),
    }
  }
  return {
    find,
    findSummary,
    async listTree(archived = false) {
      const [folderResult, groupResult] = await Promise.all([
        pool.query<GroupRow>(
          `SELECT id,name,updated_at,version,description,archived,entry_type,parent_group_id
          FROM platform_geo.material_groups WHERE tenant_id=$1 AND entry_type='folder' AND archived=false
          ORDER BY normalized_name,id`,
          [tenantID],
        ),
        pool.query<GroupRow & { count: number }>(
          `SELECT g.*,
          (SELECT count(*)::int FROM platform_geo.material_items i
            WHERE i.tenant_id=g.tenant_id AND i.group_id=g.id) AS count
          FROM platform_geo.material_groups g WHERE g.tenant_id=$1 AND g.entry_type='group' AND g.archived=$2
          ORDER BY g.normalized_name,g.id`,
          [tenantID, archived],
        ),
      ])
      const folders: GeoMaterialFolder[] = folderResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        updatedAt: new Date(row.updated_at).toISOString(),
      }))
      const groups = groupResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        archived: row.archived,
        parentGroupID: row.parent_group_id,
        updatedAt: new Date(row.updated_at).toISOString(),
        count: Number(row.count),
      }))
      return { folders, groups }
    },
    async createFolder(id: string, name: string) {
      await pool.query(
        `INSERT INTO platform_geo.material_groups
        (id,tenant_id,name,normalized_name,description,entry_type,created_by,updated_by)
        VALUES($1::uuid,$2,$3,$4,'','folder',$5,$5)`,
        [id, tenantID, name, normalizeGeoText(name), actorID],
      )
      return { id, name }
    },
    async list(query: string, page: number, archived = false) {
      const result = await pool.query<{ total: number; items: (GroupRow & { count: number })[] }>(
        `
        SELECT (SELECT count(*)::int FROM platform_geo.material_groups
          WHERE tenant_id=$1 AND entry_type='group' AND archived=$2
            AND position($3 in lower(name))>0) AS total,
          COALESCE((SELECT jsonb_agg(item) FROM (
            SELECT g.*,(SELECT count(*)::int FROM platform_geo.material_items i
              WHERE i.tenant_id=g.tenant_id AND i.group_id=g.id) AS count
            FROM platform_geo.material_groups g WHERE tenant_id=$1 AND entry_type='group' AND archived=$2
              AND position($3 in lower(name))>0 ORDER BY updated_at DESC,id LIMIT 20 OFFSET $4
          ) item),'[]'::jsonb) AS items
      `,
        [tenantID, archived, normalizeGeoText(query), (page - 1) * 20],
      )
      return {
        total: result.rows[0].total,
        items: result.rows[0].items.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          version: row.version,
          archived: row.archived,
          parentGroupID: row.parent_group_id,
          updatedAt: new Date(row.updated_at).toISOString(),
          count: Number(row.count),
        })),
        page,
        pageSize: 20,
      }
    },
    async archive(id: string, version: number, archived: boolean) {
      const result = await pool.query(
        `UPDATE platform_geo.material_groups SET archived=$4,
        version=version+1,updated_by=$5,updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND id=$2::uuid AND entry_type='group' AND version=$3 RETURNING id`,
        [tenantID, id, version, archived, actorID],
      )
      if (result.rows[0]) return find(id)
      if (!(await find(id))) throw new GeoError('NOT_FOUND', '未找到当前客户的素材组。', 404)
      throw new GeoError('VERSION_CONFLICT', '素材组已被修改，请读取最新版本后重试。', 409)
    },
    async appendUploaded(id: string, version: number, mediaIDs: number[]) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const group = (
          await client.query<GroupRow>(
            `SELECT * FROM platform_geo.material_groups
          WHERE tenant_id=$1 AND id=$2::uuid AND entry_type='group' FOR UPDATE`,
            [tenantID, id],
          )
        ).rows[0]
        if (!group) throw new GeoError('NOT_FOUND', '未找到当前客户的素材组。', 404)
        if (group.archived)
          throw new GeoError('GROUP_ARCHIVED', '此素材组已归档，请先恢复后再上传。', 409)
        if (group.version !== version)
          throw new GeoError('VERSION_CONFLICT', '素材组已被修改，请刷新后重试上传。', 409)
        if (!mediaIDs.length || mediaIDs.length > 20 || new Set(mediaIDs).size !== mediaIDs.length)
          throw new GeoError('INVALID_MEDIA', '每次最多上传20张图片。')
        const media = await client.query<{ id: number; mime_type: string; filesize: number }>(
          'SELECT id,mime_type,filesize FROM public.media WHERE tenant_id=$1 AND id=ANY($2::int[]) ORDER BY id FOR SHARE',
          [tenantID, mediaIDs],
        )
        if (
          media.rows.length !== mediaIDs.length ||
          media.rows.some(
            (image) => !geoImageTypes.includes(image.mime_type) || Number(image.filesize) > 512000,
          )
        )
          throw new GeoError('INVALID_MEDIA', '上传图片不属于当前客户或格式、大小不符合要求。')
        const nextOrder = (
          await client.query<{ value: number | null }>(
            `SELECT max(sort_order)::int AS value
          FROM platform_geo.material_items WHERE tenant_id=$1 AND group_id=$2::uuid`,
            [tenantID, id],
          )
        ).rows[0].value
        for (const [offset, mediaID] of mediaIDs.entries())
          await client.query(
            `
          INSERT INTO platform_geo.material_items(tenant_id,group_id,media_id,sort_order)
          VALUES($1,$2::uuid,$3,$4)`,
            [tenantID, id, mediaID, (nextOrder ?? -1) + offset + 1],
          )
        await client.query(
          `UPDATE platform_geo.material_groups SET version=version+1,updated_by=$3,
          updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2::uuid`,
          [tenantID, id, actorID],
        )
        await client.query('COMMIT')
        return find(id)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async save(
      id: string,
      values: GeoMaterialValues,
      version?: number,
      archive?: boolean,
      parentGroupID?: string | null,
    ) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const old = (
          await client.query<GroupRow>(
            "SELECT * FROM platform_geo.material_groups WHERE tenant_id=$1 AND id=$2::uuid AND entry_type='group' FOR UPDATE",
            [tenantID, id],
          )
        ).rows[0]
        if (version !== undefined && !old)
          throw new GeoError('NOT_FOUND', '未找到当前客户的素材组。', 404)
        if (version !== undefined && old.version !== version)
          throw new GeoError('VERSION_CONFLICT', '素材组已被修改，请读取最新版本后重试。', 409)
        if (old?.archived)
          throw new GeoError('GROUP_ARCHIVED', '请先恢复素材组，再修改图片或名称。')
        const media = await client.query<{ id: number; mime_type: string; filesize: number }>(
          'SELECT id,mime_type,filesize FROM public.media WHERE tenant_id=$1 AND id=ANY($2::int[]) ORDER BY id FOR SHARE',
          [tenantID, values.mediaIds],
        )
        if (
          media.rows.length !== values.mediaIds.length ||
          media.rows.some(
            (item) => !geoImageTypes.includes(item.mime_type) || Number(item.filesize) > 512000,
          )
        )
          throw new GeoError('INVALID_MEDIA', '部分图片不属于当前客户或已不可用，请移除后重试。')
        if (old && version === undefined) {
          const items = (
            await client.query<{ media_id: number }>(
              'SELECT media_id FROM platform_geo.material_items WHERE tenant_id=$1 AND group_id=$2::uuid ORDER BY sort_order,media_id',
              [tenantID, id],
            )
          ).rows.map((row) => row.media_id)
          if (
            old.name !== values.name ||
            old.description !== values.description ||
            JSON.stringify(items) !== JSON.stringify(values.mediaIds) ||
            old.parent_group_id !== (parentGroupID ?? null)
          )
            throw new GeoError('IDEMPOTENCY_CONFLICT', '此新增请求已处理，请刷新列表后重试。', 409)
          await client.query('COMMIT')
          return find(id)
        }
        if (old)
          await client.query(
            `UPDATE platform_geo.material_groups SET name=$4,
          normalized_name=$5,description=$6,archived=$7,version=version+1,updated_by=$8,
          updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2::uuid AND version=$3`,
            [
              tenantID,
              id,
              version,
              values.name,
              normalizeGeoText(values.name),
              values.description,
              archive ?? old.archived,
              actorID,
            ],
          )
        else
          await client.query(
            `INSERT INTO platform_geo.material_groups
          (id,tenant_id,name,normalized_name,description,entry_type,parent_group_id,created_by,updated_by)
          VALUES($1::uuid,$2,$3,$4,$5,'group',$6::uuid,$7,$7)`,
            [
              id,
              tenantID,
              values.name,
              normalizeGeoText(values.name),
              values.description,
              parentGroupID ?? null,
              actorID,
            ],
          )
        await client.query(
          'DELETE FROM platform_geo.material_items WHERE tenant_id=$1 AND group_id=$2::uuid',
          [tenantID, id],
        )
        for (const [order, mediaID] of values.mediaIds.entries())
          await client.query(
            `
          INSERT INTO platform_geo.material_items(tenant_id,group_id,media_id,sort_order)
          VALUES($1,$2::uuid,$3,$4)`,
            [tenantID, id, mediaID, order],
          )
        await client.query('COMMIT')
        return find(id)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
  }
}
