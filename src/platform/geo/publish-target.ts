import type { Payload, PayloadRequest } from 'payload'
import type { User as PlatformUser } from '@/payload-types'
import { getBaseURL } from '../site'
import { GeoError } from './keywords'
import type { GeoPublishTarget } from './publishing'
export async function loadGeoPublishTarget(
  payload: Payload,
  user: PlatformUser,
  tenantID: number,
  collection: 'news' | 'posts',
  categoryID: number,
  locale: string,
  req?: Partial<PayloadRequest>,
  options: { allowUnpublished?: boolean } = {},
): Promise<GeoPublishTarget> {
  const company = await payload.findByID({
    collection: 'tenants',
    id: tenantID,
    depth: 0,
    overrideAccess: false,
    user,
    req,
  })
  if (company.status !== 'published' && !options.allowUnpublished)
    throw new GeoError('SITE_NOT_PUBLISHED', '当前客户站点尚未发布或已暂停，不能发布GEO文章。')
  if (
    company.defaultLocale !== locale ||
    !company.enabledLocales?.includes(locale as typeof company.defaultLocale)
  )
    throw new GeoError(
      'PUBLISH_LANGUAGE',
      '本步只发布客户默认语言。请先选择默认语言文章，其他语言沿用现有翻译管理。',
    )
  const categories = await payload.find({
    collection: collection === 'news' ? 'news-categories' : 'categories',
    depth: 0,
    limit: 1,
    locale: company.defaultLocale,
    fallbackLocale: false,
    overrideAccess: false,
    user,
    req,
    where: { and: [{ id: { equals: categoryID } }, { tenant: { equals: tenantID } }] },
  })
  const category = categories.docs[0]
  if (!category) throw new GeoError('INVALID_CATEGORY', '目标分类不属于当前客户或已经删除。', 403)
  return {
    collection,
    categoryID,
    categoryName: ('name' in category ? category.name : category.title) || `分类 ${category.id}`,
    categoryUpdatedAt: category.updatedAt,
    locale,
    companySlug: company.slug,
    origin: getBaseURL(company, company.slug),
    companyUpdatedAt: company.updatedAt,
  }
}
export const sameGeoPublishTarget = (a: GeoPublishTarget, b: GeoPublishTarget) =>
  ['collection', 'categoryID', 'categoryUpdatedAt', 'locale', 'companySlug', 'origin'].every(
    (k) => a[k as keyof GeoPublishTarget] === b[k as keyof GeoPublishTarget],
  )
