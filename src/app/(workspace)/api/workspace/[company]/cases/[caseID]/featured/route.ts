import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'
type Context = { params: Promise<{ caseID: string; company: string }> }
export async function PATCH(request: Request, context: Context) { const { company: slug, caseID } = await context.params; const body = await request.json().catch(() => null); const id = Number(caseID); if (typeof body?.featured !== 'boolean' || !Number.isInteger(id)) return NextResponse.json({ message: '推荐状态无效。' }, { status: 422 }); const { user } = await getMeUser(); const store = await cookies(); if (!user || !store.get('payload-token')?.value) return NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 }); const company = await getAccessibleWorkspaceCompanyBySlug(user, slug); if (!company || store.get('payload-tenant')?.value !== String(company.id)) return NextResponse.json({ message: '当前公司无权限或已切换，请刷新后重试。' }, { status: 403 }); const payload = await getPayload({ config }); const found = await payload.find({ collection: 'cases', limit: 1, overrideAccess: false, user, where: { and: [{ id: { equals: id } }, { tenant: { equals: company.id } }] } }); if (!found.docs[0]) return NextResponse.json({ message: '未找到当前公司的案例。' }, { status: 404 }); await payload.update({ collection: 'cases', data: { featured: body.featured }, id, overrideAccess: false, user }); revalidatePath(`/workspace/${slug}/website/content/cases`); revalidatePath(`/s/${slug}/zh`); return NextResponse.json({ featured: body.featured, message: body.featured ? '已推荐到首页案例模块。' : '已取消首页案例推荐。' }) }
