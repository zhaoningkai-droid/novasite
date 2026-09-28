import { NextResponse } from 'next/server'
import {
  revalidateWorkspaceSettings, settingsAdminRoles, settingsAPIError,
  settingsEditorRoles, workspaceSettingsScope,
} from '@/platform/workspace-settings-api'
import {
  SettingsInputError, settingsBoolean, settingsID, settingsLexical, settingsLexicalText,
  settingsObject, settingsOrder, settingsText,
} from '@/platform/workspace-settings-validation'

type Context = { params: Promise<{ company: string }> }

const faqValues = (body: Record<string, unknown>) => {
  const question = settingsText(body.question)
  const answer = settingsText(body.answer)
  if (!question || !answer) throw new SettingsInputError('请填写完整的问题和答案。')
  return { question, answer, enabled: settingsBoolean(body.enabled, true), sortOrder: settingsOrder(body.sortOrder) }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { company: slug } = await params
    const scoped = await workspaceSettingsScope(slug, settingsEditorRoles)
    if ('error' in scoped) return scoped.error
    const body = settingsObject(await request.json().catch(() => null))
    const values = faqValues(body)
    const item = await scoped.payload.create({
      collection: 'faqs', locale: 'zh', overrideAccess: false, user: scoped.user,
      data: { tenant: scoped.company.id, ...values, answer: settingsLexical(values.answer) },
    })
    revalidateWorkspaceSettings(slug, 'faqs')
    return NextResponse.json({ message: '常见问题已新增并同步到客户网站。', item: { id: item.id } })
  } catch (error) { return settingsAPIError(error, '常见问题新增未完成，请稍后重试。') }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { company: slug } = await params
    const scoped = await workspaceSettingsScope(slug, settingsEditorRoles)
    if ('error' in scoped) return scoped.error
    const body = settingsObject(await request.json().catch(() => null))
    const id = settingsID(body.id, '问题')
    if (!id) throw new SettingsInputError('问题编号无效。')
    const values = faqValues(body)
    const found = await scoped.payload.find({
      collection: 'faqs', depth: 0, limit: 1, locale: 'zh', fallbackLocale: false,
      overrideAccess: false, user: scoped.user,
      where: { and: [{ id: { equals: id } }, { tenant: { equals: scoped.company.id } }] },
    })
    const current = found.docs[0]
    if (!current) return NextResponse.json({ message: '未找到当前公司的常见问题。' }, { status: 404 })
    await scoped.payload.update({
      collection: 'faqs', id, locale: 'zh', overrideAccess: false, user: scoped.user,
      data: {
        ...values,
        answer: values.answer === settingsLexicalText(current.answer).trim()
          ? current.answer : settingsLexical(values.answer),
      },
    })
    revalidateWorkspaceSettings(slug, 'faqs')
    return NextResponse.json({ message: '常见问题已保存并同步到客户网站。' })
  } catch (error) { return settingsAPIError(error, '常见问题保存未完成，请稍后重试。') }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { company: slug } = await params
    const scoped = await workspaceSettingsScope(slug, settingsAdminRoles)
    if ('error' in scoped) return scoped.error
    const id = settingsID(new URL(request.url).searchParams.get('id'), '问题')
    if (!id) throw new SettingsInputError('问题编号无效。')
    const found = await scoped.payload.find({
      collection: 'faqs', depth: 0, limit: 1, locale: 'zh', fallbackLocale: false,
      overrideAccess: false, user: scoped.user,
      where: { and: [{ id: { equals: id } }, { tenant: { equals: scoped.company.id } }] },
    })
    if (!found.docs[0]) return NextResponse.json({ message: '未找到当前公司的常见问题。' }, { status: 404 })
    await scoped.payload.delete({ collection: 'faqs', id, overrideAccess: false, user: scoped.user })
    revalidateWorkspaceSettings(slug, 'faqs')
    return NextResponse.json({ message: '常见问题已删除。' })
  } catch (error) { return settingsAPIError(error, '常见问题删除未完成，请稍后重试。') }
}
