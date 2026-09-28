import { Plus } from 'lucide-react'
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
  ContentStatus,
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
      fallbackLocale: 'en',
      limit: contentListPageSize,
      locale: 'zh',
      overrideAccess: false,
      page,
      sort: '-updatedAt',
      user,
      where: { and: conditions },
    }),
    payload.find({
      collection: 'product-categories',
      depth: 0,
      fallbackLocale: 'en',
      limit: 0,
      locale: 'zh',
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

  return (
    <section className="workspace-content-foundation">
      <header className="workspace-content-foundation__header">
        <div>
          <p>网站配置 / 内容管理</p>
          <h1>
            产品管理
            <small className="workspace-content-foundation__count">
              {records.totalDocs} 项结果
            </small>
          </h1>
          <span className="workspace-content-foundation__description">
            集中维护产品图片、分类和发布状态，管理首页推荐。
          </span>
        </div>
        <div className="workspace-content-foundation__header-actions">
          {canEdit ? (
            <Link href={base + '/new'}>
              <Plus aria-hidden="true" size={17} />
              新增产品
            </Link>
          ) : (
            <span className="workspace-content-foundation__readonly">只读权限</span>
          )}
        </div>
      </header>
      <ContentManagementTabs active="products" companySlug={slug} />
      <form aria-label="产品筛选" className="workspace-content-foundation__filters" method="get">
        <label>
          搜索产品
          <input defaultValue={keyword} name="q" placeholder="搜索产品名称" type="search" />
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
        <div className="workspace-content-foundation__filter-actions">
          <button type="submit">查询</button>
          <Link href={base}>重置</Link>
        </div>
      </form>
      <WorkspaceTable
        ariaLabel="产品列表"
        bulkDeleteURL={canDelete ? '/api/workspace/' + slug + '/products/bulk' : undefined}
        columns={[
          { key: 'title', label: '产品名称', width: '260px' },
          { key: 'category', label: '分类', width: '120px' },
          { key: 'featured', label: '首页推荐', width: '120px' },
          { key: 'sort', label: '排序', width: '64px' },
          { key: 'status', label: '发布状态', width: '90px' },
          { key: 'updated', label: '更新时间', width: '132px' },
        ]}
        editBaseHref={canEdit ? base : undefined}
        translationBaseHref={canEdit ? base : undefined}
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
            : '产品添加后会显示在这里，草稿和已发布内容会分别标明。'
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
          return {
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
              <ContentStatus key="status" published={item._status === 'published'} />,
              <ContentUpdatedAt key="updated" value={item.updatedAt} />,
            ],
            details: [
              { label: '产品名称', value: title },
              { label: '关联分类', value: categoryName },
              { label: '产品型号', value: item.model || '—' },
              { label: '产品摘要', value: item.summary || '—' },
              { label: '首页推荐', value: item.featured ? '已推荐' : '未推荐' },
              { label: '排序', value: String(item.sortOrder ?? 0) },
              { label: '发布状态', value: item._status === 'published' ? '已发布' : '草稿' },
              { label: '更新时间', value: contentUpdatedAt(item.updatedAt) },
            ],
          }
        })}
        totalDocs={records.totalDocs}
        totalPages={totalPages}
      />
    </section>
  )
}
