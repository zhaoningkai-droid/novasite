import { GeoError, geoObject, normalizeGeoText } from './keywords'
export type GeoMaterialValues = { name: string; description: string; mediaIds: number[] }
export type GeoMaterialKind = 'folder' | 'group'
export type GeoMaterialFolder = { id: string; name: string; updatedAt: string }
export type GeoMaterialImage = {
  id: number
  alt: string
  filename: string
  url: string
  thumbnailURL: string
  available: boolean
}
export type GeoMaterialGroup = GeoMaterialValues & {
  id: string
  tenantID: number
  version: number
  archived: boolean
  updatedAt: string
  parentGroupID: string | null
  images: GeoMaterialImage[]
}
export const geoImageTypes = ['image/jpeg', 'image/png', 'image/webp']
export function parseMaterialFolderName(input: unknown): string {
  if (typeof input !== 'string') throw new GeoError('INVALID_NAME', '请填写目录名称。')
  const name = input.normalize('NFKC').trim()
  if (!name || name.length > 15 || /[\r\n\u0000-\u001f]/u.test(name) || !normalizeGeoText(name))
    throw new GeoError('INVALID_NAME', '目录名称须为1—15个字符。')
  return name
}
export function parseMaterialValues(input: unknown): GeoMaterialValues {
  const body = geoObject(input)
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 15)
    throw new GeoError('INVALID_NAME', '素材组名称须为1—15个字符。')
  if (
    body.description !== undefined &&
    (typeof body.description !== 'string' || body.description.length > 500)
  )
    throw new GeoError('INVALID_DESCRIPTION', '素材组说明不超过500个字符。')
  if (
    !Array.isArray(body.mediaIds) ||
    body.mediaIds.some((id) => !Number.isSafeInteger(id) || Number(id) < 1) ||
    new Set(body.mediaIds).size !== body.mediaIds.length
  )
    throw new GeoError('INVALID_MEDIA', '素材图片编号须有效且不重复。')
  const name = body.name.normalize('NFKC').trim()
  if (!normalizeGeoText(name) || /[\r\n\u0000-\u001f]/u.test(name))
    throw new GeoError('INVALID_NAME', '请填写有效的素材组名称。')
  return { name, description: String(body.description || '').trim(), mediaIds: body.mediaIds }
}
