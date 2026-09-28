import { NextResponse } from 'next/server'
import {
  revalidateWorkspaceSettings, settingsAdminRoles, settingsAPIError, workspaceSettingsScope,
} from '@/platform/workspace-settings-api'
import { parseNavigationRows, SettingsInputError, settingsObject, settingsText } from '@/platform/workspace-settings-validation'

type Context = { params: Promise<{ company: string }> }
const locales = ['zh', 'en', 'ru', 'id'] as const

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { company: slug } = await params
    const scoped = await workspaceSettingsScope(slug, settingsAdminRoles)
    if ('error' in scoped) return scoped.error
    const body = settingsObject(await request.json().catch(() => null))
    if (!locales.includes(body.localeCode as typeof locales[number])) {
      throw new SettingsInputError('导航语言无效，请重新选择。')
    }
    const locale = body.localeCode as typeof locales[number]
    const items = parseNavigationRows(body.items, '顶部菜单', true)
    const quickLinks = parseNavigationRows(body.quickLinks, '页脚链接')
    const found = await scoped.payload.find({
      collection: 'site-navigation', depth: 0, limit: 1,
      overrideAccess: false, user: scoped.user,
      where: { and: [{ tenant: { equals: scoped.company.id } }, { localeCode: { equals: locale } }] },
    })
    const data = { title: '主导航', localeCode: locale, footerIntro: settingsText(body.footerIntro), items, quickLinks }
    if (found.docs[0]) {
      await scoped.payload.update({ collection: 'site-navigation', id: found.docs[0].id, data, overrideAccess: false, user: scoped.user })
    } else {
      await scoped.payload.create({ collection: 'site-navigation', data: { ...data, tenant: scoped.company.id }, overrideAccess: false, user: scoped.user })
    }
    revalidateWorkspaceSettings(slug, 'navigation')
    return NextResponse.json({ message: '网站导航与页脚链接已保存。' })
  } catch (error) { return settingsAPIError(error, '网站导航保存未完成，请稍后重试。') }
}
