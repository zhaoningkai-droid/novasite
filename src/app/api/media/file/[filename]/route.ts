import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { byteRange } from '@/platform/storage/byte-range'
import { mediaAccessControlEnabled, privateMediaHeaders, validMediaFilename } from '@/platform/storage/access-mode'
import { localMediaDirectory } from '@/platform/storage/local-directory'
import { classifyPlatformHost, platformDomainsEnabled } from '@/platform/platform-hosts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
}

type Context = { params: Promise<{ filename: string }> }
async function serve(request: Request, { params }: Context, head = false) {
  const { filename } = await params
  const controlled = mediaAccessControlEnabled()
  const failure = (status: number) => new Response(head ? null : status === 503
    ? '文件服务暂时不可用，请稍后重试。' : '媒体文件不存在。',
    { status, headers: controlled ? privateMediaHeaders() : undefined })
  // Media filenames originate from Payload uploads. Reject traversal and arbitrary paths here.
  if (!validMediaFilename(filename)) return failure(404)

  if (process.env.S3_ENABLED === 'true') {
    // Delegate to the installed adapter, including its document prefix, access
    // control, MIME and Range handling. Local mode has no Payload/DB dependency.
    try {
      const [{ REST_GET }, { default: config }] = await Promise.all([
        import('@payloadcms/next/routes'), import('@payload-config'),
      ])
      const response = await REST_GET(config)(
        head ? new Request(request, { method: 'GET' }) : request,
        { params: Promise.resolve({ slug: ['media', 'file', filename] }) },
      )
      if (controlled && response.status === 403) {
        await response.body?.cancel()
        return failure(404)
      }
      const responseHeaders = controlled ? privateMediaHeaders(new Headers(response.headers)) : response.headers
      if (!head) return controlled
        ? new Response(response.body, { headers: responseHeaders, status: response.status }) : response
      await response.body?.cancel()
      return new Response(null, { headers: responseHeaders, status: response.status })
    } catch {
      return failure(503)
    }
  }

  let mediaDirectory: string
  try {
    mediaDirectory = localMediaDirectory()
    if (controlled) {
      const [{ getPayload }, { default: config }, { authorizeMediaFile }] = await Promise.all([
        import('payload'), import('@payload-config'), import('@/platform/storage/access-control'),
      ])
      const payload = await getPayload({ config })
      const customerHost = platformDomainsEnabled() && classifyPlatformHost(request.headers.get('host')).kind === 'tenant'
      const user = customerHost ? undefined : (await payload.auth({ headers: request.headers })).user
      if (!await authorizeMediaFile(payload, request.headers, filename, user)) return failure(404)
    }
  } catch { return failure(503) }

  const filePath = path.resolve(mediaDirectory, filename)
  if (!filePath.startsWith(`${mediaDirectory}${path.sep}`)) return failure(404)

  try {
    const [root, resolved] = await Promise.all([realpath(mediaDirectory), realpath(filePath)])
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('Invalid media path')
    if (controlled) {
      const publicRoot = await realpath(path.resolve(process.cwd(), 'public'))
      if (root === publicRoot || root.startsWith(`${publicRoot}${path.sep}`) ||
          publicRoot.startsWith(`${root}${path.sep}`)) throw new Error('Public directory cannot contain private media')
    }
    const info = await stat(resolved)
    if (!info.isFile()) return failure(404)

    const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`
    const modified = info.mtime.toUTCString()
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Content-Type': contentTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream',
      'ETag': etag,
      'Last-Modified': modified,
      'X-Content-Type-Options': 'nosniff',
    })
    if (path.extname(filename).toLowerCase() === '.svg')
      headers.set('Content-Security-Policy', "sandbox; script-src 'none'")
    if (path.extname(filename).toLowerCase() === '.pdf') {
      const encoded = encodeURIComponent(filename).replace(/['()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
      headers.set('Content-Disposition', `inline; filename*=UTF-8''${encoded}`)
    }
    if (controlled) privateMediaHeaders(headers)
    const ifNoneMatch = request.headers.get('if-none-match')
    const ifModifiedSince = Date.parse(request.headers.get('if-modified-since') || '')
    if ((ifNoneMatch && ifNoneMatch.split(',').some((value) =>
      value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''))) ||
      (!ifNoneMatch && Number.isFinite(ifModifiedSince) && Date.parse(modified) <= ifModifiedSince))
      return new Response(null, { headers, status: 304 })
    // Weak validators cannot satisfy If-Range. Matching dates may use a byte range.
    const ifRange = request.headers.get('if-range')
    const ifRangeDate = Date.parse(ifRange || '')
    const useRange = !ifRange || (Number.isFinite(ifRangeDate) && Date.parse(modified) <= ifRangeDate)
    const range = byteRange(useRange ? request.headers.get('range') : null, info.size)
    if (range === 'invalid') {
      headers.set('Content-Range', `bytes */${info.size}`)
      return new Response(null, { status: 416, headers })
    }

    const start = range?.start ?? 0
    const end = range?.end ?? info.size - 1
    headers.set('Content-Length', String(range ? end - start + 1 : info.size))
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`)

    if (head || info.size === 0) return new Response(null, { headers, status: range ? 206 : 200 })
    const nodeStream = createReadStream(resolved, { end, start })
    const abort = () => nodeStream.destroy()
    request.signal.addEventListener('abort', abort, { once: true })
    nodeStream.once('close', () => request.signal.removeEventListener('abort', abort))
    if (request.signal.aborted) abort()
    const stream = Readable.toWeb(nodeStream) as ReadableStream
    return new Response(stream, { headers, status: range ? 206 : 200 })
  } catch {
    return failure(404)
  }
}

export const GET = (request: Request, context: Context) => serve(request, context)
export const HEAD = (request: Request, context: Context) => serve(request, context, true)
