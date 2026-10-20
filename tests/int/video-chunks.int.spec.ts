// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { stageVideoChunk } from '../../src/platform/storage/video-chunks.server'
import { VIDEO_CHUNK_BYTES, MAX_HOMEPAGE_VIDEO_BYTES, uploadVideoChunks } from '../../src/platform/storage/video-chunks'

describe('large video uploads through a request-limited CDN', () => {
  it('assembles ordered bytes, isolates company/user, and locks finalization', async () => {
    const first = Buffer.alloc(VIDEO_CHUNK_BYTES, 7), last = Buffer.from('last chunk')
    const input = { id: randomUUID(), company: 'test-company', user: 'test-user',
      name: 'check.mp4', mime: 'video/mp4', index: '0', count: '2',
      total: String(first.length + last.length), data: first }
    expect(await stageVideoChunk(input)).toEqual({ complete: false })
    const final = { ...input, index: '1', data: last }
    await expect(stageVideoChunk({ ...final, company: 'other-company' })).rejects.toMatchObject({ status: 409 })
    await expect(stageVideoChunk({ ...final, user: 'other-user' })).rejects.toMatchObject({ status: 409 })
    const result = await stageVideoChunk(final)
    expect(result.complete).toBe(true)
    if (!result.complete) throw new Error('Expected a complete video')
    try {
      const data = await readFile(result.assembled)
      expect(data.length).toBe(first.length + last.length)
      expect(data.subarray(0, 32)).toEqual(first.subarray(0, 32))
      expect(data.subarray(-last.length)).toEqual(last)
      await expect(stageVideoChunk(final)).rejects.toMatchObject({ status: 409 })
    } finally { await result.cleanup() }
    await expect(stat(result.assembled)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects oversize totals, inconsistent counts and path traversal before staging', async () => {
    const input = { id: randomUUID(), company: 'test-company', user: 'test-user',
      name: 'check.mp4', mime: 'video/mp4', index: '0', count: '1', total: '1', data: Buffer.from('a') }
    for (const values of [{ total: String(MAX_HOMEPAGE_VIDEO_BYTES + 1) },
      { count: '2' }, { index: '-1' }, { name: '../check.mp4' }, { id: '../../outside' }])
      await expect(stageVideoChunk({ ...input, ...values })).rejects.toMatchObject({ status: 422 })
  })
  it('cleans partial data when metadata is changed mid-upload', async () => {
    const input = { id: randomUUID(), company: 'test-company', user: 'test-user',
      name: 'check.mp4', mime: 'video/mp4', index: '0', count: '2',
      total: String(VIDEO_CHUNK_BYTES + 1), data: Buffer.alloc(VIDEO_CHUNK_BYTES) }
    await stageVideoChunk(input)
    await expect(stageVideoChunk({ ...input, index: '1', name: 'changed.mp4', data: Buffer.from('a') }))
      .rejects.toMatchObject({ status: 409 })
    await expect(stageVideoChunk({ ...input, index: '1', data: Buffer.from('a') }))
      .rejects.toMatchObject({ status: 409 })
  })
  it('sends small sequential requests and returns only the final saved media', async () => {
    const file = new File([new Uint8Array(VIDEO_CHUNK_BYTES * 2 + 12)], 'video.mp4', { type: 'video/mp4' })
    const parts: { size: number; index: string; id: string }[] = []
    const progress: number[] = []
    const result = await uploadVideoChunks(file, async (form, update) => {
      const chunk = form.get('file') as File
      parts.push({ size: chunk.size, index: String(form.get('chunkIndex')), id: String(form.get('videoUploadId')) })
      expect(form.get('totalSize')).toBe(String(file.size))
      update(100)
      return parts.length === 3 ? { media: { id: 123, url: '/api/media/file/video.mp4' } } : {}
    }, (value) => progress.push(value))
    expect(parts.map((part) => part.size)).toEqual([VIDEO_CHUNK_BYTES, VIDEO_CHUNK_BYTES, 12])
    expect(parts.map((part) => part.index)).toEqual(['0', '1', '2'])
    expect(new Set(parts.map((part) => part.id)).size).toBe(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
    expect(progress.at(-1)).toBe(99)
    expect(result.media?.id).toBe(123)
  })
})
