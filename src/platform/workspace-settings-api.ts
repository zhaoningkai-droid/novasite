import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { userHasRole, type PlatformRole } from '@/access/roles'
import { getMeUser } from '@/utilities/getMeUser'
import { getAccessibleWorkspaceCompanyBySlug } from './workspace'
import { SettingsInputError } from './workspace-settings-validation'

export const settingsAdminRoles: PlatformRole[] = ['super-admin', 'site-admin']
export const settingsEditorRoles: PlatformRole[] = ['super-admin', 'site-admin', 'editor']

export async function workspaceSettingsScope(slug: string, roles?: PlatformRole[]) {
  const store = await cookies()
  if (!store.get('payload-token')?.value) {
    return { error: NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 }) }
  }
  const { user } = await getMeUser()
  if (!user) return { error: NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 }) }
  if (roles && !userHasRole(user, roles)) {
    return { error: NextResponse.json({ message: '当前账号没有执行此操作的权限。' }, { status: 403 }) }
  }
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company) return { error: NextResponse.json({ message: '没有当前公司的管理权限。' }, { status: 403 }) }
  if (store.get('payload-tenant')?.value !== String(company.id)) {
    return { error: NextResponse.json({ message: '当前工作公司已切换，请刷新后重试。' }, { status: 409 }) }
  }
  return { company, slug, user, payload: await getPayload({ config }) }
}

export function settingsAPIError(error: unknown, message: string) {
  if (error instanceof SettingsInputError) {
    return NextResponse.json({ message: error.message }, { status: 422 })
  }
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null
  if (status === 403) return NextResponse.json({ message: '当前账号没有执行此操作的权限。' }, { status: 403 })
  if (status === 400 || status === 422) {
    return NextResponse.json({ message: '提交的信息未通过校验，请检查必填内容及地址标识。' }, { status: 422 })
  }
  return NextResponse.json({ message }, { status: 500 })
}

export function revalidateWorkspaceSettings(slug: string, page: string) {
  for (const locale of ['zh', 'en', 'ru', 'id']) revalidatePath('/s/' + slug + '/' + locale, 'layout')
  revalidatePath('/workspace/' + slug + '/website/' + page)
}
