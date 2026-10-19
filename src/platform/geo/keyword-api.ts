import { assertGeoRequestOrigin } from './request-origin'
import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { NextResponse } from 'next/server'
import { settingsEditorRoles, workspaceSettingsScope } from '../workspace-settings-api'
import { createGeoKeywordStore } from './keyword-store'
import {
  assertGeoBodyOwnership,
  GeoError,
  geoID,
  geoObject,
  geoVersion,
  parseGeoValues,
} from './keywords'

export const geoReply = (data: Record<string, unknown>, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
  })
export function assertGeoWriteRequest(request: Request) {
  assertGeoRequestOrigin(request)
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new GeoError('INVALID_CONTENT_TYPE', '请使用JSON格式提交配置。', 415)
}
export async function readGeoBody(request: Request, maxChars = 32768) {
  if (Number(request.headers.get('content-length')) > maxChars)
    throw new GeoError('BODY_TOO_LARGE', '配置内容过长。', 413)
  let input: unknown
  try {
    const body = await request.text()
    if (body.length > maxChars) throw new GeoError('BODY_TOO_LARGE', '配置内容过长。', 413)
    input = JSON.parse(body)
  } catch (error) {
    if (error instanceof GeoError) throw error
    throw new GeoError('INVALID_JSON', '配置内容格式不正确。', 400)
  }
  const body = geoObject(input)
  assertGeoBodyOwnership(body)
  return body
}
export function geoAPIError(error: unknown, requestId: string) {
  if (error instanceof GeoError)
    return geoReply(
      {
        code: error.code,
        message: error.message,
        requestId,
      },
      error.status,
    )
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === '23505')
    return geoReply(
      { code: 'DUPLICATE_CONFIG', message: '当前客户已有相同品牌词与核心词的配置。', requestId },
      409,
    )
  if (['42P01', '3F000', '42703'].includes(String(code)))
    return geoReply(
      {
        code: 'GEO_STORAGE_NOT_READY',
        message: 'GEO数据存储尚未安装，请先完成第2步数据接入。',
        requestId,
      },
      503,
    )
  return geoReply(
    { code: 'GEO_UNAVAILABLE', message: 'GEO配置暂时无法读写，请稍后重试。', requestId },
    503,
  )
}

/** All SQL runs only after the existing authenticated tenant/role scope is resolved. */
export async function handleGeoKeywords(request: Request, companySlug: string, id?: string) {
  const requestId = randomUUID()
  try {
    if (request.method !== 'GET') assertGeoWriteRequest(request)
    const scoped = await workspaceSettingsScope(companySlug, settingsEditorRoles)
    if (scoped.error) {
      const body = (await scoped.error.json()) as { message?: string }
      return geoReply(
        { code: `SCOPE_${scoped.error.status}`, message: body.message, requestId },
        scoped.error.status,
      )
    }
    const pool = (scoped.payload.db as unknown as PostgresAdapter).pool
    const store = createGeoKeywordStore(pool, scoped.company.id, scoped.user.id)
    if (request.method === 'GET') {
      if (id) {
        const item = await store.find(geoID(id))
        if (!item) throw new GeoError('NOT_FOUND', '未找到当前客户的优化词配置。', 404)
        return geoReply({ item, requestId })
      }
      const search = new URL(request.url).searchParams
      const query = (search.get('q') || '').trim()
      const page = Number(search.get('page') || '1')
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || query.length > 100)
        throw new GeoError('INVALID_QUERY', '搜索或分页参数不正确。')
      return geoReply({ ...(await store.list(query, page)), requestId })
    }
    const body = await readGeoBody(request)
    const values = parseGeoValues(body)
    if (request.method === 'POST' && !id) {
      const result = await store.create(geoID(body.requestId), values)
      return geoReply(
        { ...result, message: 'GEO优化词已保存。', requestId },
        result.replayed ? 200 : 201,
      )
    }
    if (request.method === 'PATCH' && id) {
      const item = await store.update(geoID(id), geoVersion(body.version), values)
      return geoReply({ item, message: 'GEO优化词已保存。', requestId })
    }
    throw new GeoError('METHOD_NOT_ALLOWED', '不支持此操作。', 405)
  } catch (error) {
    return geoAPIError(error, requestId)
  }
}
