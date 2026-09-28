import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload, type RequiredDataFromCollectionSlug } from 'payload'
import config from '@payload-config'
import { userHasRole } from '@/access/roles'
import type { News } from '@/payload-types'
import { getAccessibleWorkspaceCompanyBySlug } from './workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Kind = 'news' | 'cases' | 'blog'
type Collection = 'news' | 'cases' | 'posts'
const names: Record<Kind, string> = { news: '新闻', cases: '案例', blog: '博客' }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const locales = ['zh', 'en', 'ru', 'id'] as const
const lexical = (value: string): News['content'] => ({
  root: {
    type: 'root', version: 1, direction: null, format: '', indent: 0,
    children: value.split(/\n\s*\n/).map((paragraph) => ({
      type: 'paragraph', version: 1, direction: null, format: '', indent: 0,
      children: [{ type: 'text', version: 1, text: paragraph,
        detail: 0, format: 0, mode: 'normal', style: '' }],
    })),
  },
})

export async function saveWorkspaceArticle(
  request: Request, slug: string, rawID: string | undefined, kind: Kind, creating: boolean,
) {
  try {
    const store = await cookies()
    if (!store.get('payload-token')?.value)
      return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
    const { user } = await getMeUser()
    if (!user) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 })
    if (!userHasRole(user, ['super-admin', 'site-admin', 'editor']))
      return NextResponse.json({ message: '当前账号只有查看权限，不能保存内容。' }, { status: 403 })
    const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
    if (!company || store.get('payload-tenant')?.value !== String(company.id))
      return NextResponse.json({ message: '当前公司无权限或已切换，请刷新后重试。' }, { status: 403 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ message: '保存内容格式无效，请刷新后重试。' }, { status: 422 })
    const name = names[kind]
    const collection: Collection = kind === 'blog' ? 'posts' : kind
    const title = text(body.title)
    const summary = text(kind === 'blog' ? body.description : body.summary)
    const rawContent = 'bodyText' in body ? body.bodyText : body.content
    const contentProvided = rawContent !== undefined
    const content = text(rawContent)
    const category = Number(body.category)
    const cover = body.cover === null || body.cover === '' || body.cover === undefined
      ? null : Number(body.cover)
    const sortOrder = Number(body.sortOrder ?? 0)
    const id = Number(rawID)
    if (!title || !summary || !Number.isSafeInteger(category) || category < 1 ||
      (creating && !content) || (contentProvided && !content) ||
      (kind === 'cases' && !text(body.country)) ||
      (cover !== null && (!Number.isSafeInteger(cover) || cover < 1)) ||
      !Number.isSafeInteger(sortOrder) || sortOrder < 0)
      return NextResponse.json({ message: `请填写完整的${name}分类、标题、摘要和正文，排序为非负整数。` }, { status: 422 })
    if (!creating && (!Number.isSafeInteger(id) || id < 1))
      return NextResponse.json({ message: '内容编号无效。' }, { status: 422 })
    const payload = await getPayload({ config })
    const categoryCollection = kind === 'blog' ? 'categories' :
      kind === 'news' ? 'news-categories' : 'case-categories'
    const [categoryCheck, coverCheck, existingResult] = await Promise.all([
      payload.find({ collection: categoryCollection, depth: 0, limit: 1,
        locale: 'zh', overrideAccess: false, user,
        where: { and: [{ id: { equals: category } }, { tenant: { equals: company.id } }] } }),
      cover ? payload.find({ collection: 'media', depth: 0, limit: 1,
        overrideAccess: false, user,
        where: { and: [{ id: { equals: cover } }, { tenant: { equals: company.id } }] } }) : null,
      !creating ? payload.find({ collection, depth: 0, limit: 1, locale: 'zh',
        fallbackLocale: 'none', draft: true, overrideAccess: false, user,
        where: { and: [{ id: { equals: id } }, { tenant: { equals: company.id } }] } }) : null,
    ])
    if (!categoryCheck.docs.length)
      return NextResponse.json({ message: `${name}分类不属于当前公司。` }, { status: 403 })
    if (cover && !coverCheck?.docs.length)
      return NextResponse.json({ message: `${name}封面不属于当前公司。` }, { status: 403 })
    const image = coverCheck?.docs[0]
    if (image && (!['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType || '') ||
      Number(image.filesize) > 500 * 1024))
      return NextResponse.json({ message: '封面仅支持不超过 500KB 的 JPG、PNG 或 WebP 图片。' }, { status: 422 })
    const existing = existingResult?.docs[0]
    if (!creating && !existing)
      return NextResponse.json({ message: `未找到当前公司的${name}。` }, { status: 404 })
    const priorCategories = existing && 'categories' in existing && Array.isArray(existing.categories)
      ? existing.categories.map((item) => typeof item === 'number' ? item : item.id) : []
    const data = {
      title, tenant: company.id,
      _status: existing?._status || 'published',
      ...(contentProvided ? { content: lexical(content) } : {}),
      ...(kind === 'blog' ? {
        categories: [...new Set([category, ...priorCategories.slice(1)])],
        heroImage: cover,
        meta: { ...(existing && 'meta' in existing ? existing.meta : {}),
          description: summary, image: cover },
      } : { category, summary, cover, sortOrder, featured: body.featured === true }),
      ...(kind === 'cases' ? { country: text(body.country), industry: text(body.industry) } : {}),
    }
    let result: { id: number }
    if (creating) {
      const key = text(body.idempotencyKey)
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key))
        return NextResponse.json({ message: '新建请求标识无效，请刷新后重试。' }, { status: 422 })
      const stableSlug = `workspace-${kind}-${company.id}-${key}`
      const transactionID = await payload.db.beginTransaction()
      if (transactionID === null) throw new Error('Safe transaction unavailable')
      try {
        const transaction = payload.db.sessions?.[String(transactionID)]?.db as
          Pick<PostgresAdapter['drizzle'], 'execute'> | undefined
        if (!transaction) throw new Error('Transaction not ready')
        // Serialize creations per company across server processes before deduplicating a retry.
        await transaction.execute(sql`SELECT id FROM tenants WHERE id = ${company.id} FOR UPDATE`)
        const req = { transactionID, user }
        const prior = await payload.find({ collection, depth: 0, limit: 1, locale: 'zh',
          draft: true, overrideAccess: false, user, req,
          where: { and: [{ slug: { equals: stableSlug } }, { tenant: { equals: company.id } }] } })
        result = prior.docs[0] || await payload.create({ collection,
          data: { ...data, slug: stableSlug } as RequiredDataFromCollectionSlug<Collection>,
          locale: 'zh', overrideAccess: false, user, req })
        await payload.db.commitTransaction(transactionID)
      } catch (error) {
        await payload.db.rollbackTransaction(transactionID)
        throw error
      }
    } else {
      result = await payload.update({ collection, data, id, locale: 'zh',
        overrideAccess: false, user })
    }
    revalidatePath(`/workspace/${slug}/website/content/${kind}`)
    for (const locale of locales) revalidatePath(`/s/${slug}/${locale}`, 'layout')
    return NextResponse.json({ id: result.id,
      message: existing?._status === 'draft'
        ? '内容已保存，仍为草稿。' : `保存成功，${name}内容已同步更新。` })
  } catch (error) {
    console.error('[workspace-article-save]', error)
    return NextResponse.json({ message: '保存未完成，请稍后重试。已填写的内容仍保留。' }, { status: 500 })
  }
}
