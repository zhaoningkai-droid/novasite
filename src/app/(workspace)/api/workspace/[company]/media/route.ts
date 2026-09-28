import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import config from '@payload-config'
import { getAccessibleWorkspaceCompanyBySlug } from '@/platform/workspace'
import { getMeUser } from '@/utilities/getMeUser'

type Context = { params: Promise<{ company: string }> }

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'])
const videoExtensions = new Set(['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'mpeg', 'mpg', 'ogv', '3gp'])
const videoMimeByExtension: Record<string, string> = { '3gp': 'video/3gpp', avi: 'video/x-msvideo', m4v: 'video/mp4', mkv: 'video/x-matroska', mov: 'video/quicktime', mp4: 'video/mp4', mpeg: 'video/mpeg', mpg: 'video/mpeg', ogv: 'video/ogg', webm: 'video/webm' }
const maxImageSize = 500 * 1024
const formatSize = (bytes: number) => `${(bytes / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 0)}KB`

const workspaceRequest = async (slug: string) => {
  const cookieStore = await cookies()
  if (!cookieStore.get('payload-token')?.value) return { error: NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 }) }
  const { user } = await getMeUser()
  if (!user) return { error: NextResponse.json({ message: '登录已失效，请重新登录。' }, { status: 401 }) }
  const company = await getAccessibleWorkspaceCompanyBySlug(user, slug)
  if (!company || cookieStore.get('payload-tenant')?.value !== String(company.id)) return { error: NextResponse.json({ message: '当前工作公司已切换，请返回公司选择后重试。' }, { status: 409 }) }
  return { company, user }
}

export async function GET(request: Request, { params }: Context) {
  const { company: slug } = await params
  const access = await workspaceRequest(slug)
  if ('error' in access) return access.error
  const query = new URL(request.url).searchParams.get('query')?.trim() || ''
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'media',
    depth: 0,
    limit: 48,
    locale: 'zh',
    overrideAccess: false,
    select: { alt: true, filename: true, thumbnailURL: true, url: true, updatedAt: true },
    sort: '-updatedAt',
    user: access.user,
    where: {
      and: [
        { tenant: { equals: access.company.id } },
        ...(query ? [{ or: [{ filename: { contains: query } }, { alt: { contains: query } }] }] : []),
      ],
    },
  })
  return NextResponse.json({ docs: result.docs, totalDocs: result.totalDocs })
}

export async function POST(request: Request, { params }: Context) {
  const { company: slug } = await params
  const access = await workspaceRequest(slug)
  if ('error' in access) return access.error
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const alt = typeof form?.get('alt') === 'string' ? String(form.get('alt')).trim() : ''
  const productImage = form?.get('productImage') === 'true'
  const homepageBanner = form?.get('homepageBanner') === 'true'
  const homepageVideo = form?.get('homepageVideo') === 'true'
  const fileExtension = file instanceof File ? file.name.split('.').pop()?.toLowerCase() || '' : ''
  const resolvedMimeType = file instanceof File && file.type ? file.type : videoMimeByExtension[fileExtension] || ''
  const isVideo = Boolean(resolvedMimeType.startsWith('video/') || videoExtensions.has(fileExtension))
  if (!(file instanceof File)) return NextResponse.json({ message: '请选择要上传的文件。' }, { status: 422 })
  if (!alt) return NextResponse.json({ message: '请输入文件说明。' }, { status: 422 })
  if (homepageVideo ? !isVideo : !imageTypes.has(file.type) || ((productImage || homepageBanner) && file.type === 'image/svg+xml')) return NextResponse.json({ message: homepageVideo ? '请选择视频文件。推荐 MP4 或 WebM，其他常见视频格式也可上传。' : productImage || homepageBanner ? '图片仅支持 JPG、PNG 或 WebP。' : '仅支持 JPG、PNG、WebP 或 SVG 图片。' }, { status: 422 })
  const limit = homepageVideo ? 512 * 1024 * 1024 : maxImageSize
  if (file.size === 0 || file.size > limit) return NextResponse.json({
    message: homepageVideo
      ? '本地视频大小须大于 0 且不超过 512MB。'
      : file.size === 0
        ? '图片文件为空，请重新选择。'
        : `图片大小为 ${formatSize(file.size)}，超过单张 500KB 限制，请压缩后重新上传。`,
  }, { status: 422 })

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const payload = await getPayload({ config })
    const media = await payload.create({
      collection: 'media',
      data: { alt, tenant: access.company.id },
      file: { data: buffer, mimetype: resolvedMimeType || file.type, name: file.name, size: file.size },
      depth: 0,
      locale: 'zh',
      overrideAccess: false,
      user: access.user,
    })
    return NextResponse.json({ media, message: homepageVideo ? '视频已上传成功。' : '图片已上传成功。' }, { status: 201 })
  } catch (error) {
    console.error('[workspace-media-upload]', error)
    return NextResponse.json({ message: homepageVideo ? '视频上传失败，请确认文件为常见视频格式且不超过 512MB。' : '图片上传失败，请稍后重试。' }, { status: 500 })
  }
}
