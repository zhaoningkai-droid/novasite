import { NextResponse } from 'next/server'
import {
  revalidateWorkspaceSettings, settingsAPIError, settingsEditorRoles, workspaceSettingsScope,
} from '@/platform/workspace-settings-api'
import {
  getWorkspaceCategoryRow, isWorkspaceCategoryKind, validateWorkspaceCategoryParent, workspaceCategoryConfig,
} from '@/platform/workspace-category-service'
import { SettingsInputError, settingsID, settingsObject, settingsOrder, settingsText } from '@/platform/workspace-settings-validation'

type Context = { params: Promise<{ categoryType: string; company: string }> }

export async function GET(_request: Request, { params }: Context) {
  try {
    const { categoryType, company: slug } = await params
    if (!isWorkspaceCategoryKind(categoryType)) throw new SettingsInputError('分类类型无效。')
    const scoped = await workspaceSettingsScope(slug)
    if ('error' in scoped) return scoped.error
    const mapping = workspaceCategoryConfig[categoryType]
    const result = await scoped.payload.find({
      collection: mapping.collection, depth: 0, pagination: false, limit: 0, locale: 'zh', fallbackLocale: false,
      overrideAccess: false, sort: 'sortOrder', user: scoped.user, where: { tenant: { equals: scoped.company.id } },
    })
    return NextResponse.json({ docs: result.docs.map((item) => ({
      id: item.id, name: settingsText((item as unknown as Record<string, unknown>)[mapping.field]),
    })) })
  } catch (error) { return settingsAPIError(error, '分类列表暂时无法读取，请稍后重试。') }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { categoryType, company: slug } = await params
    if (!isWorkspaceCategoryKind(categoryType)) throw new SettingsInputError('分类类型无效。')
    const scoped = await workspaceSettingsScope(slug, settingsEditorRoles)
    if ('error' in scoped) return scoped.error
    const body = settingsObject(await request.json().catch(() => null))
    const name = settingsText(body.name)
    const categorySlug = settingsText(body.slug)
    if (!name || !categorySlug) throw new SettingsInputError('请填写分类名称和分类地址标识。')
    const parentID = settingsID(body.parentID, '上级分类')
    await validateWorkspaceCategoryParent(scoped.payload, categoryType, parentID, scoped.company.id, scoped.user)
    const mapping = workspaceCategoryConfig[categoryType]
    const created = await scoped.payload.create({
      collection: mapping.collection, locale: 'zh', overrideAccess: false, user: scoped.user,
      data: { [mapping.field]: name, parent: parentID, slug: categorySlug, sortOrder: settingsOrder(body.sortOrder), tenant: scoped.company.id } as never,
    })
    const category = await getWorkspaceCategoryRow(scoped.payload, categoryType, Number(created.id), scoped.company.id, scoped.user)
    revalidateWorkspaceSettings(slug, 'categories')
    return NextResponse.json({ category, message: '分类已新增。' })
  } catch (error) { return settingsAPIError(error, '分类新增未完成，请稍后重试。') }
}
