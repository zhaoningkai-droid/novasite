import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { applyTemplateChange, TemplateChangeError } from '@/platform/new-templates/change-service'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string }> }
const locales = ['zh', 'en', 'ru', 'id'] as const

async function resolveActor(slug: string) {
  const { user } = await getMeUser()
  const store = await cookies()
  if (!user || !store.get('payload-token')?.value) {
    return { response: NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 }) }
  }
  if (!user.roles?.some((role) => role === 'super-admin' || role === 'site-admin')) {
    return { response: NextResponse.json({ message: '当前账号没有修改模板的权限。' }, { status: 403 }) }
  }
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || store.get('payload-tenant')?.value !== String(company.id)) {
    return { response: NextResponse.json({ message: '当前公司无权限或已切换，请刷新后重试。' }, { status: 403 }) }
  }
  return { user, company }
}

export async function GET(_request: Request, { params }: Context) {
  const { company: slug } = await params
  const access = await resolveActor(slug)
  if ('response' in access) return access.response

  const payload = await getPayload({ config })
  const [site, result] = await Promise.all([
    payload.findByID({ collection: 'tenants', id: access.company.id, depth: 0, overrideAccess: false, showHiddenFields: true, user: access.user }),
    payload.find({
      collection: 'site-template-changes',
      depth: 1,
      limit: 20,
      overrideAccess: true,
      sort: '-createdAt',
      where: { tenant: { equals: access.company.id } },
    }),
  ])
  const revision = site.templateRevision ?? 0
  return NextResponse.json({
    revision,
    changes: result.docs.map((change) => ({
      id: change.id,
      operation: change.operation,
      fromTemplate: typeof change.fromTemplate === 'object' ? change.fromTemplate?.name || '默认模板' : '默认模板',
      toTemplate: typeof change.toTemplate === 'object' ? change.toTemplate?.name || '默认模板' : '默认模板',
      fromVersion: change.fromVersion || '',
      toVersion: change.toVersion || '',
      fromRevision: change.fromRevision,
      toRevision: change.toRevision,
      createdAt: change.createdAt,
      canRollback: change.toRevision === revision,
    })),
  })
}

export async function POST(request: Request, { params }: Context) {
  const { company: slug } = await params
  const access = await resolveActor(slug)
  if ('response' in access) return access.response
  const body = await request.json().catch(() => null)
  if (!body || !['apply', 'rollback'].includes(body.operation)) {
    return NextResponse.json({ message: '模板操作内容无效。' }, { status: 422 })
  }
  const payload = await getPayload({ config })
  try {
    const result = await applyTemplateChange({
      payload,
      tenantID: access.company.id,
      user: access.user,
      input: {
        operation: body.operation,
        expectedRevision: Number(body.expectedRevision),
        idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
        templateId: body.templateId === null ? null : Number(body.templateId),
        changeId: Number(body.changeId),
      },
    })
    locales.forEach((locale) => {
      revalidatePath(`/s/${slug}/${locale}`)
      revalidatePath(`/s/${slug}/${locale}/sitemap.xml`)
    })
    return NextResponse.json({
      message: result.idempotent ? '这次模板操作已保存。' : '模板已应用，原有产品和客户内容保持不变。',
      revision: result.tenantRevision,
      selectedTemplateId: result.selectedTemplateId,
      changeId: result.change.id,
    })
  } catch (error) {
    if (error instanceof TemplateChangeError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    return NextResponse.json({ message: '模板保存失败，请刷新页面后重试。' }, { status: 500 })
  }
}
