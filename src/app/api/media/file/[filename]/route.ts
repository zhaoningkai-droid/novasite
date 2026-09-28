import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const mediaDirectory = path.resolve(process.cwd(), 'public/media')

const contentTypes: Record<string, string> = {
  '.avi': 'video/x-msvideo',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.ogv': 'video/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
}

const byteRange = (value: string | null, size: number) => {
  if (!value?.startsWith('bytes=')) return null
  const [rawStart, rawEnd] = value.slice(6).split('-', 2)
  const start = rawStart ? Number(rawStart) : 0
  const end = rawEnd ? Number(rawEnd) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return 'invalid' as const
  return { end: Math.min(end, size - 1), start }
}

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params
  // Media filenames originate from Payload uploads. Reject traversal and arbitrary paths here.
  if (!filename || filename !== path.basename(filename) || filename.includes('\0')) return NextResponse.json({ message: '媒体文件不存在。' }, { status: 404 })

  const filePath = path.resolve(mediaDirectory, filename)
  if (!filePath.startsWith(`${mediaDirectory}${path.sep}`)) return NextResponse.json({ message: '媒体文件不存在。' }, { status: 404 })

  try {
    await access(filePath)
    const info = await stat(filePath)
    if (!info.isFile()) return NextResponse.json({ message: '媒体文件不存在。' }, { status: 404 })

    const range = byteRange(request.headers.get('range'), info.size)
    if (range === 'invalid') return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })

    const start = range?.start ?? 0
    const end = range?.end ?? info.size - 1
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(end - start + 1),
      'Content-Type': contentTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream',
    })
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`)

    const stream = Readable.toWeb(createReadStream(filePath, { end, start })) as ReadableStream
    return new Response(stream, { headers, status: range ? 206 : 200 })
  } catch {
    return NextResponse.json({ message: '媒体文件不存在。' }, { status: 404 })
  }
}
