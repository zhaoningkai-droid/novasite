import { Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload, type Where } from 'payload'

import config from '@payload-config'
import { userHasRole } from '@/access/roles'
import { ContentManagementTabs } from '@/platform/components/ContentManagementTabs/ContentManagementTabs'
import { FeaturedProductToggle } from '@/platform/components/FeaturedProductToggle/FeaturedProductToggle'
import {
  ContentFeaturedStatus,
  ContentListItem,
  ContentUpdatedAt,
  contentListHref,
  contentListPageSize,
  contentMediaURL,
  contentUpdatedAt,
  listQueryCategory,
  listQueryPage,
  listQueryText,
  type ContentListSearchParams,
} from '@/platform/components/WorkspaceTable/ContentListPrimitives'
import { WorkspaceTable } from '@/platform/components/WorkspaceTable/WorkspaceTable'
import { richTextToHTML } from '@/platform/rich-text'
import {
  fingerprintFromProductTranslationMarker,
  productTranslationFingerprint,
} from '@/platform/product-translation'
import { companyTranslationTargets } from '@/platform/site-locales'
import {
  productTranslationViews,
  translationQueueEnabled,
} from '@/platform/product-translation/jobs'
import { translationViewLabel } from '@/platform/product-translation/job-view'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

import './content-foundation.scss'

export default async function ProductsManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>
  searchParams: Promise<ContentListSearchParams>
}) {
  const { company: slug } = await params
  const query = await searchParams
  const { user } = await getMeUser({
    nullUserRedirect: '/admin/login?redirect=/workspace/companies',
  })
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return null
  const canEdit = userHasRole(user, ['super-admin', 'site-admin', 'editor'])
  const canDelete = userHasRole(user, ['super-admin', 'site-admin'])
  const base = '/workspace/' + slug + '/website/content'
  const page = listQueryPage(query.page)
  const keyword = listQueryText(query.q)
  const category = listQueryCategory(query.category)
  const featured = listQueryText(query.featured) === '1'
  const filtered = Boolean(keyword || category || featured)
  const makeHref = (targetPage: number) =>
    contentListHref(
      base,
      {
        category,
        keyword,
        searchKey: 'q',
        featured,
      },
      targetPage,
    )
  const payload = await getPayload({ config })
  const conditions: Where[] = [{ tenant: { equals: company.id } }]
  if (keyword) conditions.push({ title: { contains: keyword } })
  if (category) conditions.push({ category: { equals: category } })
  if (featured) conditions.push({ featured: { equals: true } })
  const [records, categories] = await Promise.all([
    payload.find({
      collection: 'products',
      depth: 1,
      draft: true,
      fallbackLocale: company.defaultLocale,
      limit: contentListPageSize,
      locale: company.defaultLocale,
      overrideAccess: false,
      page,
      sort: '-updatedAt',
      user,
      where: { and: conditions },
    }),
    payload.find({
      collection: 'product-categories',
      depth: 0,
      fallbackLocale: company.defaultLocale,
      limit: 0,
      locale: company.defaultLocale,
      overrideAccess: false,
      pagination: false,
      select: { name: true },
      sort: 'sortOrder',
      user,
      where: { tenant: { equals: company.id } },
    }),
  ])
  const totalPages = Math.max(records.totalPages, 1)
  if (page > totalPages) redirect(makeHref(totalPages))
  const productIDs = records.docs.map((item) => item.id)
  const site = await payload.findByID({
    collection: 'tenants',
    id: company.id,
    depth: 0,
    overrideAccess: false,
    user,
  })
  const targetLocales = companyTranslationTargets(site)
  const translationViews =
    canEdit && productIDs.length && translationQueueEnabled()
      ? (await productTranslationViews(payload, site, user, productIDs)).views
      : []
  const [sourceSpecificationRecords, translationRecords] = productIDs.length
    ? await Promise.all([
        payload.find({
          collection: 'product-specifications',
          depth: 0,
          limit: 0,
          overrideAccess: false,
          pagination: false,
          sort: '-updatedAt',
          user,
          where: {
            and: [
              { product: { in: productIDs } },
              { tenant: { equals: company.id } },
              { localeCode: { equals: company.defaultLocale } },
            ],
          },
        }),
        payload.find({
          collection: 'audit-logs',
          depth: 0,
          limit: 1000,
          overrideAccess: true,
          sort: '-createdAt',
          where: {
            and: [
              { collection: { equals: 'products' } },
              { documentId: { in: productIDs.map(String) } },
              {
                summary: {
                  contains: `product-translation:v1:${company.id}:${company.defaultLocale}:`,
                },
              },
            ],
          },
        }),
      ])
    : [{ docs: [] }, { docs: [] }]
  const specificationsByProduct = new Map<
    number,
    (typeof sourceSpecificationRecords.docs)[number]
  >()
  for (const specification of sourceSpecificationRecords.docs) {
    const productID =
      typeof specification.product === 'object' ? specification.product.id : specification.product
    if (typeof productID === 'number' && !specificationsByProduct.has(productID))
      specificationsByProduct.set(productID, specification)
  }
  const completedByProduct = new Map<number, Array<{ fingerprint: string; targets: string[] }>>()
  for (const audit of translationRecords.docs) {
    const productID = Number(audit.documentId)
    const fingerprint = fingerprintFromProductTranslationMarker(audit.summary)
    const metadata = audit.metadata as { companyID?: number; targets?: string[] } | undefined
    if (
      Number.isSafeInteger(productID) &&
      fingerprint &&
      metadata?.companyID === company.id &&
      Array.isArray(metadata.targets)
    ) {
      const items = completedByProduct.get(productID) || []
      items.push({ fingerprint, targets: metadata.targets })
      completedByProduct.set(productID, items)
    }
  }

  return (
    <section className="workspace-content-foundation">
      <header className="workspace-content-foundation__header">
        <div>

          <h1>
            产品管理
            <small className="workspace-content-foundation__count">
              {records.totalDocs} 项结果
            </small>
          </h1>

        </div>
        {!canEdit && (
          <div className="workspace-content-foundation__header-actions">
            <span className="workspace-content-foundation__readonly">只读权限</span>
          </div>
        )}
      </header>
      <ContentManagementTabs active="products" companySlug={slug} />
      <WorkspaceTable
        ariaLabel="产品列表"
        asyncTranslation={translationQueueEnabled()}
        bulkDeleteURL={canDelete ? '/api/workspace/' + slug + '/products/bulk' : undefined}
        bulkTranslateURL={
          canEdit ? '/api/workspace/' + slug + '/products/bulk-translate' : undefined
        }
        columns={[
          { key: 'title', label: '产品名称', width: '260px' },
          { key: 'category', label: '分类', width: '120px' },
          { key: 'featured', label: '首页推荐', width: '120px' },
          { key: 'sort', label: '排序', width: '64px' },
          { key: 'translation', label: '翻译状态', width: '110px' },
          { key: 'updated', label: '更新时间', width: '150px' },
        ]}
        editBaseHref={canEdit ? base : undefined}
        emptyAction={
          filtered
            ? { href: base, label: '清除筛选' }
            : canEdit
              ? { href: base + '/new', label: '新增产品' }
              : undefined
        }
        emptyDescription={
          filtered
            ? '调整搜索或分类条件后重新查询。'
            : '产品添加后会显示在这里，并可查看翻译进度和更新时间。'
        }
        emptyTitle={filtered ? '没有匹配的产品' : '暂无产品'}
        key={makeHref(page)}
        nextHref={records.hasNextPage ? makeHref(page + 1) : undefined}
        page={page}
        pageSize={contentListPageSize}
        previousHref={records.hasPrevPage ? makeHref(page - 1) : undefined}
        rows={records.docs.map((item) => {
          const title = item.title?.trim() || '未命名产品'
          const imageURL =
            item.gallery?.map(contentMediaURL).find(Boolean) || item.externalImages?.[0]?.url || ''
          const categoryName =
            typeof item.category === 'object' && item.category
              ? item.category.name || '未分类'
              : '未分类'
          const sourceSpecification = specificationsByProduct.get(item.id)
          const source = {
            detailHTML: item.detailHTML || richTextToHTML(item.description),
            externalImageAlts: item.externalImages?.map((image) => image.alt),
            keywords: item.keywords,
            legacySpecifications: item.specifications?.map((specification) => ({
              group: specification.group,
              label: specification.label,
              value: specification.value,
            })),
            specificationSet: sourceSpecification
              ? {
                  items: sourceSpecification.items?.map((specification) => ({
                    group: specification.group,
                    label: specification.label,
                    value: specification.value,
                  })),
                  title: sourceSpecification.title,
                }
              : null,
            summary: item.summary,
            tags: item.tags?.map((tag) => tag.label),
            title: item.title,
          }
          const fingerprint = productTranslationFingerprint(company.defaultLocale, source)
          const translationComplete =
            targetLocales.length > 0 &&
            targetLocales.every((locale) =>
              completedByProduct
                .get(item.id)
                ?.some(
                  (audit) => audit.fingerprint === fingerprint && audit.targets.includes(locale),
                ),
            )
          const translation = translationViews.find((view) => view.productID === item.id)
          const translationLabel = translation
            ? translationViewLabel(translation)
            : translationComplete ? '已完成' : '未翻译'
          return {
            canTranslate: targetLocales.length > 0 && !translationComplete,
            translation,
            id: item.id,
            label: title,
            cells: [
              <ContentListItem
                key="identity"
                description={item.summary}
                imageURL={imageURL}
                title={title}
              />,
              categoryName,
              canEdit ? (
                <FeaturedProductToggle
                  endpoint={'/api/workspace/' + slug + '/products/' + item.id + '/featured'}
                  initial={Boolean(item.featured)}
                  productName={title}
                />
              ) : (
                <ContentFeaturedStatus featured={Boolean(item.featured)} />
              ),
              String(item.sortOrder ?? 0),
              translationLabel,
              <ContentUpdatedAt key="updated" value={item.updatedAt} />,
            ],
            details: [
              { label: '产品名称', value: title },
              { label: '关联分类', value: categoryName },
              { label: '产品型号', value: item.model || '—' },
              { label: '产品摘要', value: item.summary || '—' },
              { label: '首页推荐', value: item.featured ? '已推荐' : '未推荐' },
              { label: '排序', value: String(item.sortOrder ?? 0) },
              { label: '翻译状态', value: translationLabel },
              { label: '更新时间', value: contentUpdatedAt(item.updatedAt) },
            ],
          }
        })}
        selectionEnabled={canEdit}
        showDetailsAction={false}
        totalDocs={records.totalDocs}
        totalPages={totalPages}
        toolbarContent={
          <form
            aria-label="产品筛选"
            className="workspace-content-foundation__filters workspace-content-foundation__filters--table"
            method="get"
          >
            <label>
              搜索产品
              <span className="workspace-content-foundation__search-field">
                <input defaultValue={keyword} name="q" placeholder="搜索产品名称" type="search" />
                <button aria-label="搜索产品" title="搜索产品" type="submit">
                  <Search aria-hidden="true" size={17} />
                </button>
              </span>
            </label>
            <label>
              产品分类
              <select defaultValue={category ? String(category) : ''} name="category">
                <option value="">全部分类</option>
                {categories.docs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || '未命名分类'}
                  </option>
                ))}
              </select>
            </label>
            <label className="workspace-content-foundation__check">
              <input defaultChecked={featured} name="featured" type="checkbox" value="1" />
              仅看首页推荐
            </label>
          </form>
        }
        toolbarActionContent={
          canEdit ? (
            <Link className="workspace-table__toolbar-add" href={base + '/new'}>
              <Plus aria-hidden="true" size={16} />
              新增产品
            </Link>
          ) : undefined
        }
      />
    </section>
  )
}
