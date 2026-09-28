import { NextResponse } from 'next/server'
import {
  revalidateWorkspaceSettings, settingsAdminRoles, settingsAPIError, settingsEditorRoles, workspaceSettingsScope,
} from '@/platform/workspace-settings-api'
import {
  categoryLocalizedName, categoryRelationshipID, findOwnedWorkspaceCategory,
  getWorkspaceCategoryDependencies, getWorkspaceCategoryRow, isWorkspaceCategoryKind,
  validateWorkspaceCategoryParent, workspaceCategoryConfig,
} from '@/platform/workspace-category-service'
import { SettingsInputError, settingsID, settingsObject, settingsOrder, settingsText } from '@/platform/workspace-settings-validation'

type Context = { params: Promise<{ categoryID: string; categoryType: string; company: string }> }
const locales = ['zh', 'en', 'ru', 'id'] as const

export async function GET(_request: Request, { params }: Context) {
  try {
    const { categoryID: rawID, categoryType, company: slug } = await params
    if (!isWorkspaceCategoryKind(categoryType)) throw new SettingsInputError('分类类型无效。')
    const id = settingsID(rawID, '分类')
    if (!id) throw new SettingsInputError('分类编号无效。')
    const scoped = await workspaceSettingsScope(slug)
    if ('error' in scoped) return scoped.error
    const doc = await findOwnedWorkspaceCategory(scoped.payload, categoryType, id, scoped.company.id, scoped.user)
    if (!doc) return NextResponse.json({ message: '未找到当前公司的分类。' }, { status: 404 })
    const translations = Object.fromEntries(locales.map((locale) => [locale,
      categoryLocalizedName(doc, workspaceCategoryConfig[categoryType].field, locale),
    ]))
    return NextResponse.json({ translations })
  } catch (error) { return settingsAPIError(error, '分类翻译暂时无法读取，请稍后重试。') }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { categoryID: rawID, categoryType, company: slug } = await params
    if (!isWorkspaceCategoryKind(categoryType)) throw new SettingsInputError('分类类型无效。')
    const id = settingsID(rawID, '分类')
    if (!id) throw new SettingsInputError('分类编号无效。')
    const scoped = await workspaceSettingsScope(slug, settingsEditorRoles)
    if ('error' in scoped) return scoped.error
    const current = await findOwnedWorkspaceCategory(scoped.payload, categoryType, id, scoped.company.id, scoped.user)
    if (!current) return NextResponse.json({ message: '未找到当前公司的分类。' }, { status: 404 })
    const body = settingsObject(await request.json().catch(() => null))
    const locale = body.locale === undefined ? 'zh' : body.locale
    if (!locales.includes(locale as typeof locales[number])) throw new SettingsInputError('分类语言无效，请重新选择。')
    const name = settingsText(body.name)
    if (!name) throw new SettingsInputError('分类名称不能为空。')
    const parentID = body.parentID === undefined ? categoryRelationshipID(current.parent) : settingsID(body.parentID, '上级分类')
    if (locale === 'zh') await validateWorkspaceCategoryParent(scoped.payload, categoryType, parentID, scoped.company.id, scoped.user, id)
    const categorySlug = body.slug === undefined ? String(current.slug || '') : settingsText(body.slug)
    if (locale === 'zh' && !categorySlug) throw new SettingsInputError('分类地址标识不能为空。')
    await scoped.payload.update({
      collection: workspaceCategoryConfig[categoryType].collection, id, locale: locale as typeof locales[number],
      overrideAccess: false, user: scoped.user,
      data: { [workspaceCategoryConfig[categoryType].field]: name, ...(locale === 'zh' ? {
        parent: parentID, slug: categorySlug, sortOrder: settingsOrder(body.sortOrder, Number(current.sortOrder || 0)),
      } : {}) } as never,
    })
    const category = await getWorkspaceCategoryRow(scoped.payload, categoryType, id, scoped.company.id, scoped.user)
    revalidateWorkspaceSettings(slug, 'categories')
    return NextResponse.json({ category, message: locale === 'zh' ? '分类已保存。' : '该语言已保存。' })
  } catch (error) { return settingsAPIError(error, '分类保存未完成，请稍后重试。') }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { categoryID: rawID, categoryType, company: slug } = await params
    if (!isWorkspaceCategoryKind(categoryType)) throw new SettingsInputError('分类类型无效。')
    const id = settingsID(rawID, '分类')
    if (!id) throw new SettingsInputError('分类编号无效。')
    const scoped = await workspaceSettingsScope(slug, settingsAdminRoles)
    if ('error' in scoped) return scoped.error
    const transactionID = await scoped.payload.db.beginTransaction()
    if (transactionID === null) throw new Error('Transaction unavailable')
    try {
      const req = { transactionID, user: scoped.user }
      const current = await findOwnedWorkspaceCategory(scoped.payload, categoryType, id, scoped.company.id, scoped.user, req)
      if (!current) {
        await scoped.payload.db.rollbackTransaction(transactionID)
        return NextResponse.json({ message: '未找到当前公司的分类。' }, { status: 404 })
      }
      const counts = await getWorkspaceCategoryDependencies(scoped.payload, categoryType, id, scoped.company.id, scoped.user, req)
      if (counts.childCount) throw new SettingsInputError('该分类下仍有二级分类，不能删除。请先处理二级分类。')
      if (counts.contentCount) throw new SettingsInputError('该分类仍有关联内容，不能删除。请先在内容管理中调整所属分类。')
      await scoped.payload.delete({ collection: workspaceCategoryConfig[categoryType].collection, id,
        overrideAccess: false, user: scoped.user, req })
      await scoped.payload.db.commitTransaction(transactionID)
    } catch (error) {
      await scoped.payload.db.rollbackTransaction(transactionID)
      throw error
    }
    revalidateWorkspaceSettings(slug, 'categories')
    return NextResponse.json({ message: '分类已删除，未删除任何内容。' })
  } catch (error) { return settingsAPIError(error, '分类删除未完成，请稍后重试。') }
}
