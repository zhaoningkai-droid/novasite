import { NextResponse } from 'next/server'
import {
  revalidateWorkspaceSettings, settingsAdminRoles, settingsAPIError, workspaceSettingsScope,
} from '@/platform/workspace-settings-api'
import { parseAboutModules, settingsObject, settingsText } from '@/platform/workspace-settings-validation'

type Context = { params: Promise<{ company: string }> }

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { company: slug } = await params
    const scoped = await workspaceSettingsScope(slug, settingsAdminRoles)
    if ('error' in scoped) return scoped.error
    const body = settingsObject(await request.json().catch(() => null))
    const { payload, company, user } = scoped
    const tenant = await payload.findByID({
      collection: 'tenants', id: company.id, depth: 0,
      locale: 'zh', fallbackLocale: false, overrideAccess: false, user,
    })
    const existingIDs = new Set((tenant.fixedPages?.about?.modules || [])
      .map((module) => module.id).filter((id): id is string => Boolean(id)))
    const modules = parseAboutModules(body.modules, existingIDs)
    const imageIDs = [...new Set(modules.flatMap((module) => module.image ? [module.image] : []))]
    const media = imageIDs.length ? await payload.find({
      collection: 'media', depth: 0, limit: imageIDs.length, overrideAccess: false, user,
      where: { and: [{ id: { in: imageIDs } }, { tenant: { equals: company.id } }] },
    }) : null
    if (media && media.docs.length !== imageIDs.length) {
      return NextResponse.json({ message: '只能选择当前公司的媒体库图片。' }, { status: 422 })
    }
    const saved = await payload.update({
      collection: 'tenants', id: company.id, depth: 1, locale: 'zh', overrideAccess: false, user,
      data: { fixedPages: { ...tenant.fixedPages, about: {
        ...tenant.fixedPages?.about,
        title: body.title === undefined ? tenant.fixedPages?.about?.title : settingsText(body.title),
        intro: body.intro === undefined ? tenant.fixedPages?.about?.intro : settingsText(body.intro),
        modules,
      } } },
    })
    revalidateWorkspaceSettings(slug, 'about')
    const about = saved.fixedPages?.about
    return NextResponse.json({
      message: '关于我们已保存，客户网站已同步更新。',
      saved: {
        title: about?.title || '', intro: about?.intro || '',
        modules: (about?.modules || []).map((module) => {
          const image = typeof module.image === 'object' ? module.image : media?.docs.find((item) => item.id === module.image)
          return {
            id: module.id, title: module.title, description: module.description,
            sortOrder: module.sortOrder ?? 0,
            image: image ? { id: image.id, url: image.url, thumbnailURL: image.sizes?.thumbnail?.url || image.url } : undefined,
          }
        }),
      },
    })
  } catch (error) { return settingsAPIError(error, '关于我们保存未完成，请稍后重试。') }
}
