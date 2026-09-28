import { Plus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload, type Where } from 'payload'

import config from '@payload-config'
import { userHasRole } from '@/access/roles'
import { ContentManagementTabs } from '@/platform/components/ContentManagementTabs/ContentManagementTabs'
import { FeaturedNewsToggle } from '@/platform/components/FeaturedNewsToggle/FeaturedNewsToggle'
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

import '../content-foundation.scss'

export default async function CasesManagementPage({
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

  const base = '/workspace/' + slug + '/website/content/cases'
  const page = listQueryPage(query.page)
  const keyword = listQueryText(query.keyword)
  const category = listQueryCategory(query.category)
  const featured = listQueryText(query.featured) === '1'
  const filtered = Boolean(keyword || category || featured)
  const makeHref = (targetPage: number) =>
    contentListHref(
      base,
      {
        category,
        keyword,
        searchKey: 'keyword',
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
      collection: 'cases',
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
      collection: 'case-categories',
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
            案例管理
            <small className="workspace-content-foundation__count">
              {records.totalDocs} 项结果
            </small>
          </h1>
          <span className="workspace-content-foundation__description">
            维护项目案例、客户行业与关联产品，管理首页案例推荐。
          </span>
        </div>
        <div className="workspace-content-foundation__header-actions">
          {canEdit ? (
            <Link href={base + '/new'}>
              <Plus aria-hidden="true" size={17} />
              新增案例
            </Link>
          ) : (
            <span className="workspace-content-foundation__readonly">只读权限</span>
          )}
        </div>
      </header>
      <ContentManagementTabs active="cases" companySlug={slug} />
      <form aria-label="案例筛选" className="workspace-content-foundation__filters" method="get">
        <label>
          搜索案例
          <input defaultValue={keyword} name="keyword" placeholder="搜索案例名称" type="search" />
        </label>
        <label>
          案例分类
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
        bulkDeleteURL={canDelete ? `/api/workspace/${slug}/cases/bulk` : undefined}
        ariaLabel="案例列表"

        columns={[
          { key: 'title', label: '案例名称', width: '260px' },
          { key: 'category', label: '分类', width: '120px' },
          { key: 'featured', label: '首页推荐', width: '120px' },
          { key: 'sort', label: '排序', width: '64px' },
          { key: 'status', label: '发布状态', width: '90px' },
          { key: 'updated', label: '更新时间', width: '132px' },
        ]}
        editBaseHref={canEdit ? base : undefined}

        emptyAction={
          filtered
            ? { href: base, label: '清除筛选' }
            : canEdit
              ? { href: base + '/new', label: '新增案例' }
              : undefined
        }
        emptyDescription={
          filtered
            ? '调整搜索或分类条件后重新查询。'
            : '案例添加后会显示在这里，草稿和已发布内容会分别标明。'
        }
        emptyTitle={filtered ? '没有匹配的案例' : '暂无案例'}
        key={makeHref(page)}
        nextHref={records.hasNextPage ? makeHref(page + 1) : undefined}
        page={page}
        pageSize={contentListPageSize}
        previousHref={records.hasPrevPage ? makeHref(page - 1) : undefined}
        rows={records.docs.map((item) => {
          const title = item.title?.trim() || '未命名案例'
          const imageURL = contentMediaURL(item.cover)
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
                description={
                  [item.country, item.industry].filter(Boolean).join(' · ') || item.summary
                }
                imageURL={imageURL}
                title={title}
              />,
              categoryName,
              canEdit ? (
                <FeaturedNewsToggle
                  companySlug={slug}
                  contentName={title}
                  endpoint={'/api/workspace/' + slug + '/cases/' + item.id + '/featured'}
                  featured={Boolean(item.featured)}
                  newsID={item.id}
                />
              ) : (
                <ContentFeaturedStatus featured={Boolean(item.featured)} />
              ),
              String(item.sortOrder ?? 0),
              <ContentStatus key="status" published={item._status === 'published'} />,
              <ContentUpdatedAt key="updated" value={item.updatedAt} />,
            ],
            details: [
              { label: '案例名称', value: title },
              { label: '关联分类', value: categoryName },
              { label: '项目国家', value: item.country || '—' },
              { label: '应用行业', value: item.industry || '—' },
              { label: '案例摘要', value: item.summary || '—' },
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
