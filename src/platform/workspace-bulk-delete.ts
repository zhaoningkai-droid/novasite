import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { userHasRole } from '@/access/roles'
import { getMeUser } from '@/utilities/getMeUser'
import { getAccessibleWorkspaceCompanyBySlug } from './workspace'

type Collection = 'products' | 'news' | 'cases' | 'posts'
const names: Record<Collection, string> = {
  products: '产品', news: '新闻', cases: '案例', posts: '博客',
}
class DeleteError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function deleteWorkspaceContent(request: Request, slug: string, collection: Collection) {
  try {
    const store = await cookies()
    const { user } = await getMeUser()
    if (!user || !store.get('payload-token')?.value)
      throw new DeleteError('登录已失效，请重新登录。', 401)
    if (!userHasRole(user, ['super-admin', 'site-admin']))
      throw new DeleteError('当前账号没有删除权限。', 403)
    const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
    if (!company || store.get('payload-tenant')?.value !== String(company.id))
      throw new DeleteError('当前公司无权限或已切换，请刷新后重试。', 403)
    const body = await request.json().catch(() => null) as { ids?: unknown } | null
    if (!Array.isArray(body?.ids) || !body.ids.length || body.ids.length > 50 ||
      body.ids.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1))
      throw new DeleteError('请选择 1 至 50 条有效内容。', 422)
    const ids = [...new Set(body.ids.map(Number))]
    const payload = await getPayload({ config })
    const transactionID = await payload.db.beginTransaction()
    if (transactionID === null) throw new DeleteError('删除事务暂不可用，请稍后重试。', 503)
    try {
      const transaction = payload.db.sessions?.[String(transactionID)]?.db as
        Pick<PostgresAdapter['drizzle'], 'execute'> | undefined
      if (!transaction) throw new DeleteError('删除事务尚未就绪，请稍后重试。', 503)
      await transaction.execute(sql`SELECT id FROM tenants WHERE id = ${company.id} FOR UPDATE`)
      const req = { transactionID, user }
      const found = await payload.find({ collection, depth: 0, limit: 50,
        draft: true, overrideAccess: false, user, req,
        where: { and: [{ id: { in: ids } }, { tenant: { equals: company.id } }] } })
      if (found.docs.length !== ids.length)
        throw new DeleteError('所选内容已变更或不属于当前公司，未删除任何记录。', 403)
      for (const item of found.docs) {
        if (collection === 'products') {
          const specifications = await payload.find({ collection: 'product-specifications',
            depth: 0, pagination: false, limit: 0, overrideAccess: false, user, req,
            where: { and: [{ product: { equals: item.id } }, { tenant: { equals: company.id } }] } })
          for (const spec of specifications.docs)
            await payload.delete({ collection: 'product-specifications', id: spec.id,
              overrideAccess: false, user, req })
        }
        await payload.delete({ collection, id: item.id, overrideAccess: false, user, req })
      }
      await payload.db.commitTransaction(transactionID)
    } catch (error) {
      await payload.db.rollbackTransaction(transactionID)
      throw error
    }
    revalidatePath(`/workspace/${slug}/website/content`)
    for (const locale of ['zh', 'en', 'ru', 'id'])
      revalidatePath(`/s/${slug}/${locale}`, 'layout')
    return NextResponse.json({ message: `已删除 ${ids.length} 条${names[collection]}。` })
  } catch (error) {
    if (error instanceof DeleteError)
      return NextResponse.json({ message: error.message }, { status: error.status })
    console.error('[workspace-content-delete]', error)
    return NextResponse.json({ message: '删除未完成，本次记录变更已撤回，请稍后重试。' }, { status: 500 })
  }
}
