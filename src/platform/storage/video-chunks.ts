export const VIDEO_CHUNK_BYTES = 32 * 1024 * 1024
export const MAX_HOMEPAGE_VIDEO_BYTES = 256 * 1024 * 1024

type UploadResult = { media?: { id?: number; url?: string | null }; message?: string }
type Send = (form: FormData, progress: (value: number) => void) => Promise<UploadResult>

/** Keep every HTTP request below the CDN body limit, without changing the domain. */
export async function uploadVideoChunks(file: File, send: Send, progress: (value: number) => void) {
  if (!file.size || file.size > MAX_HOMEPAGE_VIDEO_BYTES)
    throw new Error('本地视频大小须大于 0 且不超过 256MB。')
  const id = crypto.randomUUID()
  const count = Math.ceil(file.size / VIDEO_CHUNK_BYTES)
  let result: UploadResult = {}
  for (let index = 0; index < count; index++) {
    const offset = index * VIDEO_CHUNK_BYTES
    const chunk = file.slice(offset, Math.min(file.size, offset + VIDEO_CHUNK_BYTES), file.type)
    const form = new FormData()
    form.set('file', chunk, file.name)
    form.set('alt', '首页官方视频')
    form.set('homepageVideo', 'true')
    form.set('videoUploadId', id)
    form.set('chunkIndex', String(index))
    form.set('chunkCount', String(count))
    form.set('totalSize', String(file.size))
    result = await send(form, (value) => progress(Math.min(99,
      Math.floor((offset + chunk.size * value / 100) / file.size * 100),
    )))
  }
  if (!result.media?.id) throw new Error(result.message || '视频合并失败，请重新上传。')
  return result
}
