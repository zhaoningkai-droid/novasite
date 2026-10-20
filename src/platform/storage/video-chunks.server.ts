import { createHash } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { MAX_HOMEPAGE_VIDEO_BYTES, VIDEO_CHUNK_BYTES } from './video-chunks'

export class VideoChunkError extends Error {
  constructor(message: string, public status = 422) { super(message) }
}
type Metadata = {
  next: number; count: number; total: number; name: string; mime: string; updated: number
}
type Input = {
  company: string | number; user: string | number; id: string
  index: string; count: string; total: string; name: string; mime: string; data: Buffer
}

/** Private temporary files are namespaced by BOTH authorized company and user. */
export async function stageVideoChunk(input: Input) {
  const index = Number(input.index), count = Number(input.count), total = Number(input.total)
  if (!/^[a-f0-9-]{36}$/i.test(input.id) ||
    ![input.index, input.count, input.total].every((value) => /^\d+$/.test(value)) ||
    ![index, count, total].every(Number.isSafeInteger) || total < 1 ||
    total > MAX_HOMEPAGE_VIDEO_BYTES || count !== Math.ceil(total / VIDEO_CHUNK_BYTES) ||
    index < 0 || index >= count || !input.name || input.name.length > 200 ||
    /[/\\\x00-\x1f]/.test(input.name) ||
    input.data.length !== Math.min(VIDEO_CHUNK_BYTES, total - index * VIDEO_CHUNK_BYTES))
    throw new VideoChunkError('视频分段信息无效或文件超过 256MB，请重新上传。')

  const scope = createHash('sha256').update(JSON.stringify([input.company, input.user]))
    .digest('hex')
  const root = path.join(tmpdir(), 'novasite-video-chunks', scope)
  await mkdir(root, { recursive: true, mode: 0o700 })
  if (index === 0) {
    // Remove only this user's stale temporary sessions, never saved media.
    for (const item of await readdir(root, { withFileTypes: true })) {
      if (!item.isDirectory() || !/^[a-f0-9-]{36}$/i.test(item.name)) continue
      const directory = path.join(root, item.name)
      const modified = await stat(path.join(directory, 'manifest.json')).catch(() => null)
      if (modified && Date.now() - modified.mtimeMs > 2 * 60 * 60 * 1000)
        await rm(directory, { recursive: true, force: true })
    }
  }
  const directory = path.join(root, input.id)
  const cleanup = () => rm(directory, { recursive: true, force: true })
  const manifest = path.join(directory, 'manifest.json')
  if (index === 0) {
    try { await mkdir(directory, { mode: 0o700 }) }
    catch { throw new VideoChunkError('视频上传已开始，请勿重复提交。', 409) }
    const initial: Metadata = {
      next: 0, count, total, name: input.name, mime: input.mime, updated: Date.now(),
    }
    await writeFile(manifest, JSON.stringify(initial), { mode: 0o600, flag: 'wx' })
  }
  const lockPath = path.join(directory, 'lock')
  const lock = await open(lockPath, 'wx', 0o600).catch(() => null)
  if (!lock) throw new VideoChunkError('视频上传状态已失效或正在处理中，请重新上传。', 409)
  let completed = false
  try {
    const meta: Metadata = JSON.parse(await readFile(manifest, 'utf8'))
    if (meta.next !== index || meta.count !== count || meta.total !== total ||
      meta.name !== input.name || meta.mime !== input.mime)
      throw new VideoChunkError('视频分段不完整，请重新上传。', 409)
    await writeFile(path.join(directory, `${index}.part`), input.data, {
      flag: 'wx', mode: 0o600,
    })
    if (index + 1 !== count) {
      await writeFile(`${manifest}.next`, JSON.stringify({
        ...meta, next: index + 1, updated: Date.now(),
      }), { mode: 0o600 })
      await rename(`${manifest}.next`, manifest)
      return { complete: false as const }
    }
    // Assemble on disk; don't hold every part AND the merged video in memory.
    const assembled = path.join(directory, 'complete.video')
    const output = await open(assembled, 'wx', 0o600)
    try {
      for (let part = 0; part < count; part++) {
        const data = await readFile(path.join(directory, `${part}.part`))
        await output.writeFile(data)
      }
    } finally { await output.close() }
    if ((await stat(assembled)).size !== total)
      throw new VideoChunkError('视频分段不完整，请重新上传。', 409)
    completed = true
    return {
      complete: true as const, assembled, size: total, name: meta.name,
      cleanup: async () => { await lock.close(); await cleanup() },
    }
  } catch (error) {
    await cleanup()
    throw error
  } finally {
    if (!completed) {
      await lock.close()
      await rm(lockPath, { force: true })
    }
  }
}
