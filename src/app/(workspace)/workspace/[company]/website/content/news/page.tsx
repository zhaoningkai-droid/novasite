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

export default async function NewsManagementPage({
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
  const base = '/workspace/' + slug + '/website/content/news'
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
      collection: 'news',
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
      collection: 'news-categories',
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
            新闻文章
            <small className="workspace-content-foundation__count">
              {records.totalDocs} 项结果
            </small>
          </h1>
          <span className="workspace-content-foundation__description">
            管理公司新闻与资讯，清楚查看分类、发布状态和首页推荐。
          </span>
        </div>
        <div className="workspace-content-foundation__header-actions">
          {canEdit ? (
            <Link href={base + '/new'}>
              <Plus aria-hidden="true" size={17} />
              新增新闻
            </Link>
          ) : (
            <span className="workspace-content-foundation__readonly">只读权限</span>
          )}
        </div>
      </header>
      <ContentManagementTabs active="news" companySlug={slug} />
      <form aria-label="新闻筛选" className="workspace-content-foundation__filters" method="get">
        <label>
          搜索新闻
          <input defaultValue={keyword} name="keyword" placeholder="搜索新闻标题" type="search" />
        </label>
        <label>
          新闻分类
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
        ariaLabel="新闻列表"
        bulkDeleteURL={canDelete ? '/api/workspace/' + slug + '/news/bulk' : undefined}
        columns={[
          { key: 'title', label: '新闻标题', width: '260px' },
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
              ? { href: base + '/new', label: '新增新闻' }
              : undefined
        }
        emptyDescription={
          filtered
            ? '调整搜索或分类条件后重新查询。'
            : '新闻添加后会显示在这里，草稿和已发布内容会分别标明。'
        }
        emptyTitle={filtered ? '没有匹配的新闻' : '暂无新闻'}
        key={makeHref(page)}
        nextHref={records.hasNextPage ? makeHref(page + 1) : undefined}
        page={page}
        pageSize={contentListPageSize}
        previousHref={records.hasPrevPage ? makeHref(page - 1) : undefined}
        rows={records.docs.map((item) => {
          const title = item.title?.trim() || '未命名新闻'
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
                description={item.summary}
                imageURL={imageURL}
                title={title}
              />,
              categoryName,
              canEdit ? (
                <FeaturedNewsToggle
                  companySlug={slug}
                  contentName={title}
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
              { label: '新闻标题', value: title },
              { label: '关联分类', value: categoryName },

              { label: '新闻摘要', value: item.summary || '—' },
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
