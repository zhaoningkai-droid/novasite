import { Plus } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload, type Where } from 'payload'

import config from '@payload-config'
import { userHasRole } from '@/access/roles'
import { ContentManagementTabs } from '@/platform/components/ContentManagementTabs/ContentManagementTabs'

import {
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

export default async function BlogManagementPage({
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

  const base = '/workspace/' + slug + '/website/content/blog'
  const page = listQueryPage(query.page)
  const keyword = listQueryText(query.keyword)
  const category = listQueryCategory(query.category)

  const filtered = Boolean(keyword || category)
  const makeHref = (targetPage: number) =>
    contentListHref(
      base,
      {
        category,
        keyword,
        searchKey: 'keyword',
      },
      targetPage,
    )
  const payload = await getPayload({ config })
  const conditions: Where[] = [{ tenant: { equals: company.id } }]
  if (keyword) conditions.push({ title: { contains: keyword } })
  if (category) conditions.push({ categories: { contains: category } })

  const [records, categories] = await Promise.all([
    payload.find({
      collection: 'posts',
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
      collection: 'categories',
      depth: 0,
      fallbackLocale: 'en',
      limit: 0,
      locale: 'zh',
      overrideAccess: false,
      pagination: false,
      select: { title: true },
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
            博客管理
            <small className="workspace-content-foundation__count">
              {records.totalDocs} 项结果
            </small>
          </h1>
          <span className="workspace-content-foundation__description">
            维护技术文章与知识内容，查看全部关联分类和发布状态。
          </span>
        </div>
        <div className="workspace-content-foundation__header-actions">
          {canEdit ? (
            <Link href={base + '/new'}>
              <Plus aria-hidden="true" size={17} />
              新增博客
            </Link>
          ) : (
            <span className="workspace-content-foundation__readonly">只读权限</span>
          )}
        </div>
      </header>
      <ContentManagementTabs active="blog" companySlug={slug} />
      <form aria-label="博客筛选" className="workspace-content-foundation__filters" method="get">
        <label>
          搜索博客
          <input defaultValue={keyword} name="keyword" placeholder="搜索博客标题" type="search" />
        </label>
        <label>
          博客分类
          <select defaultValue={category ? String(category) : ''} name="category">
            <option value="">全部分类</option>
            {categories.docs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title || '未命名分类'}
              </option>
            ))}
          </select>
        </label>

        <div className="workspace-content-foundation__filter-actions">
          <button type="submit">查询</button>
          <Link href={base}>重置</Link>
        </div>
      </form>
      <WorkspaceTable
        bulkDeleteURL={canDelete ? `/api/workspace/${slug}/blog/bulk` : undefined}
        ariaLabel="博客列表"

        columns={[
          { key: 'title', label: '博客标题', width: '340px' },
          { key: 'category', label: '分类', width: '200px' },

          { key: 'status', label: '发布状态', width: '90px' },
          { key: 'updated', label: '更新时间', width: '132px' },
        ]}
        editBaseHref={canEdit ? base : undefined}

        emptyAction={
          filtered
            ? { href: base, label: '清除筛选' }
            : canEdit
              ? { href: base + '/new', label: '新增博客' }
              : undefined
        }
        emptyDescription={filtered ? '调整搜索或分类条件后重新查询。' : '博客添加后会显示在这里。'}
        emptyTitle={filtered ? '没有匹配的博客' : '暂无博客'}
        key={makeHref(page)}
        nextHref={records.hasNextPage ? makeHref(page + 1) : undefined}
        page={page}
        pageSize={contentListPageSize}
        previousHref={records.hasPrevPage ? makeHref(page - 1) : undefined}
        rows={records.docs.map((item) => {
          const title = item.title?.trim() || '未命名博客'
          const imageURL = contentMediaURL(item.heroImage)
          const categoryName =
            item.categories
              ?.map((category) =>
                typeof category === 'object' && category
                  ? category.title || '未命名分类'
                  : '未命名分类',
              )
              .join('、') || '未分类'
          return {
            id: item.id,
            label: title,
            cells: [
              <ContentListItem
                key="identity"
                description={item.meta?.description}
                imageURL={imageURL}
                title={title}
              />,
              categoryName,

              <ContentStatus key="status" published={item._status === 'published'} />,
              <ContentUpdatedAt key="updated" value={item.updatedAt} />,
            ],
            details: [
              { label: '博客标题', value: title },
              { label: '关联分类', value: categoryName },

              { label: '博客摘要', value: item.meta?.description || '—' },

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
