import { randomUUID } from 'node:crypto'
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import config from '@payload-config'
import { settingsEditorRoles, workspaceSettingsScope } from '../workspace-settings-api'
import { geoReply } from './keyword-api'
import { GeoError, geoID, geoVersion } from './keywords'
import { geoImageTypes, type GeoMaterialGroup } from './materials'
import { createGeoMaterialStore } from './material-store'

const maxImageBytes = 512_000
const maxFilesPerRequest = 20
const maxRequestBytes = 12 * 1024 * 1024
const extensionTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const formatSize = (bytes: number) => `${(bytes / 1024).toFixed(0)}KB`

function assertUploadRequest(request: Request) {
  const origin = request.headers.get('origin')
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== new URL(request.url).origin)
  )
    throw new GeoError('INVALID_ORIGIN', '请求来源无效，请在当前后台重试。', 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;'))
    throw new GeoError('INVALID_CONTENT_TYPE', '请选择电脑上的图片后再上传。', 415)
  if (Number(request.headers.get('content-length') || 0) > maxRequestBytes)
    throw new GeoError('BODY_TOO_LARGE', '本次上传内容过大，请分批上传。', 413)
}

function imageAlt(filename: string) {
  return (
    filename
      .replace(/\.[^.]+$/u, '')
      .replace(/[\u0000-\u001f]/gu, ' ')
      .trim()
      .slice(0, 255) || 'GEO素材图片'
  )
}

export async function handleGeoMaterialUpload(
  request: Request,
  companySlug: string,
  rawID: string,
) {
  const requestId = randomUUID()
  const uploadedIDs: number[] = [],
    uploadedIndexes: number[] = [],
    failedIndexes: number[] = []
  let scoped: Awaited<ReturnType<typeof workspaceSettingsScope>> | null = null
  let payload: Awaited<ReturnType<typeof getPayload>> | null = null
  let store: ReturnType<typeof createGeoMaterialStore> | null = null
  try {
    assertUploadRequest(request)
    scoped = await workspaceSettingsScope(companySlug, settingsEditorRoles)
    if (scoped.error) {
      const body = (await scoped.error.json()) as { message?: string }
      return geoReply(
        { code: `SCOPE_${scoped.error.status}`, message: body.message, requestId },
        scoped.error.status,
      )
    }
    const id = geoID(rawID)
    const form = await request.formData().catch(() => null)
    if (!form) throw new GeoError('INVALID_FORM', '上传内容读取失败，请重新选择图片。', 400)
    const rawVersion = form.get('version')
    const version = geoVersion(typeof rawVersion === 'string' ? Number(rawVersion) : rawVersion)
    const files = form
      .getAll('files')
      .filter((file): file is File => file instanceof File && file.size > 0)
    if (!files.length || files.length > maxFilesPerRequest)
      throw new GeoError('INVALID_MEDIA', `每次请选择1至${maxFilesPerRequest}张图片。`)
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > maxFilesPerRequest * maxImageBytes)
      throw new GeoError('BODY_TOO_LARGE', '本次上传内容过大，请分批上传。', 413)
    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      const mimeType = file.type || extensionTypes[extension] || ''
      if (!geoImageTypes.includes(mimeType) || extensionTypes[extension] !== mimeType)
        throw new GeoError('INVALID_MEDIA', '仅支持 JPG、PNG 或 WebP 图片。')
      if (file.size > maxImageBytes)
        throw new GeoError(
          'IMAGE_TOO_LARGE',
          `“${file.name}”为${formatSize(file.size)}，超过单张500KB限制。`,
        )
    }
    const pool = (scoped.payload.db as unknown as PostgresAdapter).pool
    store = createGeoMaterialStore(pool, scoped.company.id, scoped.user.id)
    const group = await store.find(id)
    if (!group) throw new GeoError('NOT_FOUND', '未找到当前客户的素材组。', 404)
    if (group.archived)
      throw new GeoError('GROUP_ARCHIVED', '此素材组已归档，请先恢复后再上传。', 409)
    if (group.version !== version)
      throw new GeoError('VERSION_CONFLICT', '素材组已被修改，请刷新后重试上传。', 409)
    payload = await getPayload({ config })
    for (const [index, file] of files.entries()) {
      const extension = file.name.split('.').pop()?.toLowerCase() || ''
      try {
        const media = await payload.create({
          collection: 'media',
          data: { alt: imageAlt(file.name), tenant: scoped.company.id },
          file: {
            data: Buffer.from(await file.arrayBuffer()),
            mimetype: file.type || extensionTypes[extension],
            name: file.name,
            size: file.size,
          },
          depth: 0,
          locale: 'zh',
          overrideAccess: false,
          user: scoped.user,
        })
        uploadedIDs.push(Number(media.id))
        uploadedIndexes.push(index)
      } catch (error) {
        failedIndexes.push(index)
        console.error('[geo-material-upload-file]', error)
      }
    }
    if (!uploadedIDs.length)
      throw new GeoError('GEO_UPLOAD_FAILED', '图片上传失败，请检查文件后重试。', 500)
    let nextVersion = version
    let item: GeoMaterialGroup | null = null
    for (let attempt = 0; attempt < 3 && !item; attempt += 1) {
      try {
        item = await store.appendUploaded(id, nextVersion, uploadedIDs)
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
        if (code !== 'VERSION_CONFLICT' || attempt === 2) throw error
        const latest = await store.find(id)
        if (!latest || latest.archived) throw error
        nextVersion = latest.version
      }
    }
    if (!item) throw new GeoError('NOT_FOUND', '素材组已不存在，图片暂未加入素材组。', 404)
    return geoReply(
      { item, uploaded: uploadedIDs.length, uploadedIndexes, failedIndexes, requestId },
      201,
    )
  } catch (error) {
    if (error instanceof GeoError)
      return geoReply({ code: error.code, message: error.message, requestId }, error.status)
    console.error('[geo-material-upload]', error)
    return geoReply(
      { code: 'GEO_UPLOAD_FAILED', message: '图片上传或加入素材组失败，请重试。', requestId },
      500,
    )
  }
}
