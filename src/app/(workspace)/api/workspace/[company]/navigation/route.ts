import { NextResponse } from 'next/server'
import { sql } from '@payloadcms/db-postgres'
import { APIError, type PayloadRequest } from 'payload'
import type { SiteNavigation } from '@/payload-types'
import { revalidateWorkspaceSettings, settingsAdminRoles, settingsAPIError, workspaceSettingsScope } from '@/platform/workspace-settings-api'
import { parseNavigationRows, SettingsInputError, settingsObject, settingsText } from '@/platform/workspace-settings-validation'
import { contentTransaction } from '@/platform/content-translation/jobs'
import { isDefaultNavigation } from '@/platform/navigation-model'
import { syncNavigationItems } from '@/platform/navigation-sync'

type Context = { params: Promise<{ company: string }> }

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { company: slug } = await params
    const scoped = await workspaceSettingsScope(slug, settingsAdminRoles)
    if ('error' in scoped) return scoped.error
    const body = settingsObject(await request.json().catch(() => null))
    if (body.localeCode !== 'zh') throw new SettingsInputError('网站导航统一使用简体中文维护。')
    const items = parseNavigationRows(body.items, '顶部菜单', true)
    const quickLinks = parseNavigationRows(body.quickLinks, '页脚链接')
    const transactionID = await scoped.payload.db.beginTransaction()
    if (transactionID === null) throw new APIError('导航保存事务暂不可用。', 503)
    const req = { payload: scoped.payload, user: scoped.user, transactionID } as PayloadRequest
    try {
      await contentTransaction(req).execute(sql`SELECT pg_advisory_xact_lock(57291, ${scoped.company.id})`)
      const found = await scoped.payload.find({ collection: 'site-navigation', depth: 0, pagination: false,
        overrideAccess: false, user: scoped.user, req, where: { tenant: { equals: scoped.company.id } } })
      const current = found.docs.find((doc) => doc.localeCode === 'zh')
      if (current && body.updatedAt && body.updatedAt !== current.updatedAt) throw new APIError('导航已在其他页面更新。请刷新后重新修改。', 409)
      if (current?.items?.some((item) => isDefaultNavigation(item.href) && !items.some((next) => next.id === item.id)))
        throw new SettingsInputError('默认栏目可以修改名称和排序，不能删除。')
      const owned = new Set(current?.items?.map((item) => item.id).filter(Boolean) || [])
      const ids = new Set<string>()
      for (const item of items) {
        if (item.id && ((!owned.has(item.id) && !/^nav-[0-9a-f-]{36}$/.test(item.id)) || ids.has(item.id))) throw new SettingsInputError('导航栏目编号无效，请刷新后重试。')
        if (item.id) ids.add(item.id)
      }
      const data = { title: current?.title || '主导航', localeCode: 'zh' as const, footerIntro: settingsText(body.footerIntro), items, quickLinks }
      const saved = current
        ? await scoped.payload.update({ collection: 'site-navigation', id: current.id, data, req, overrideAccess: false, user: scoped.user })
        : await scoped.payload.create({ collection: 'site-navigation', data: { ...data, tenant: scoped.company.id }, req, overrideAccess: false, user: scoped.user })
      const deleted = (current?.items || []).filter((item) => !items.some((next) => next.id === item.id))
      const deletedKeys = new Set(deleted.map((item) => item.translationKey))
      for (const target of found.docs.filter((doc) => doc.localeCode !== 'zh')) {
        const old = (target.items || []).filter((item) => !deletedKeys.has(item.translationKey) && !deleted.some((entry) => entry.href && entry.href === item.href && !(saved.items || []).some((remaining) => remaining.href === entry.href)))
        const synced = syncNavigationItems(saved.items || [], old) as NonNullable<SiteNavigation['items']>
        await scoped.payload.update({ collection: 'site-navigation', id: target.id, data: { items: synced }, req,
          context: { navigationStructureSync: true }, overrideAccess: false, user: scoped.user })
      }
      await scoped.payload.db.commitTransaction(transactionID)
      revalidateWorkspaceSettings(slug, 'navigation')
      return NextResponse.json({ message: '已保存', navigation: { ...saved, footerIntro: saved.footerIntro || '', items: saved.items || [], quickLinks: saved.quickLinks || [] } })
    } catch (error) { await scoped.payload.db.rollbackTransaction(transactionID); throw error }
  } catch (error) { return settingsAPIError(error, '网站导航保存未完成，请稍后重试。') }
}
