/** Operator-only file helpers. Never import Payload, connect a DB or start workers. */
import { createHash } from 'node:crypto'
import { constants, createWriteStream } from 'node:fs'
import { chmod, lstat, mkdir, open, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export class MediaOperatorError extends Error {}
export const MAX_MANIFEST_BYTES = 64 * 1024 * 1024
const controls = /[\x00-\x1f\x7f]/
const require = createRequire(import.meta.url)

export function within(parent, child) {
  const path = relative(parent, child)
  return !path || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}
export function absolutePath(value, label) {
  if (!value || !isAbsolute(value) || controls.test(value))
    throw new MediaOperatorError(`${label} 必须填写不含控制字符的绝对路径。`)
  return resolve(value)
}
export function safeFilePath(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || controls.test(value) ||
      value.includes('\\') || value.startsWith('/') ||
      value.split('/').some((part) => !part || part === '.' || part === '..'))
    throw new MediaOperatorError('文件清单包含不支持的路径；停止而不跳过文件。')
  return value
}
export function limits() {
  const positive = (name, fallback, maximum) => {
    const value = process.env[name] || String(fallback)
    const number = Number(value)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > maximum)
      throw new MediaOperatorError(`${name} 必须填写有效的正整数。`)
    return number
  }
  return {
    files: positive('MEDIA_BACKUP_MAX_FILES', 100_000, 250_000),
    bytes: positive('MEDIA_BACKUP_MAX_BYTES', 250 * 1024 ** 3, 1024 ** 4),
    fileBytes: positive('MEDIA_BACKUP_MAX_FILE_BYTES', 2 * 1024 ** 3, 5_000_000_000),
    versions: positive('MEDIA_BACKUP_MAX_VERSIONS', 1_000_000, 10_000_000),
    timeout: positive('MEDIA_BACKUP_TIMEOUT_MINUTES', 180, 1440) * 60_000,
  }
}
export function assertOutsidePublic(root, path) {
  if (within(join(root, 'public'), path))
    throw new MediaOperatorError('备份和恢复资料不能放在网站 public 目录内。')
}
export async function privateDirectory(path) {
  await mkdir(path, { mode: 0o700, recursive: true })
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new MediaOperatorError('操作目录须为权限 700 的普通私有目录，不接受符号链接。')
  return realpath(path)
}
export async function privateFile(path) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw new MediaOperatorError('归档文件须为权限 600 的普通文件，不接受符号链接。')
  return info
}
export async function syncPath(path) {
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}
export async function writeJSON(path, data) {
  const bytes = Buffer.from(JSON.stringify(data, null, 2) + '\n')
  if (bytes.length > MAX_MANIFEST_BYTES) throw new MediaOperatorError('操作清单超过 64MB 限制。')
  await writeFile(path, bytes, { mode: 0o600, flag: 'wx' })
  await syncPath(path)
}
export async function commitJSON(path, data) {
  await writeJSON(`${path}.partial`, data)
  await rename(`${path}.partial`, path)
  await syncPath(dirname(path))
}

/** Exclusive output; bounded streaming and hash of the bytes actually written. */
export async function archiveStream(stream, destination, { expectedBytes, maxBytes, signal }) {
  let bytes = 0
  const hash = createHash('sha256')
  const measure = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length
      if (bytes > maxBytes || bytes > expectedBytes)
        return callback(new MediaOperatorError('文件传输大小超出清单或单文件限制。'))
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  await pipeline(stream, measure, createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    { signal })
  if (bytes !== expectedBytes) throw new MediaOperatorError('文件实际大小与清单不一致。')
  await chmod(destination, 0o600)
  await syncPath(destination)
  return { bytes, sha256: hash.digest('hex') }
}
export async function copyRegularFile(source, destination, { expectedBytes, maxBytes, signal, privateInput = false }) {
  const before = privateInput ? await privateFile(source) : await lstat(source)
  if (!before.isFile() || before.isSymbolicLink() || before.size !== expectedBytes)
    throw new MediaOperatorError('源文件类型或大小已变化，不能继续复制。')
  const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const opened = await handle.stat()
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size)
      throw new MediaOperatorError('源文件在打开前已变化。')
    const result = await archiveStream(handle.createReadStream({ autoClose: false }), destination,
      { expectedBytes, maxBytes, signal })
    const after = await handle.stat()
    const current = await lstat(source)
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs || current.ino !== before.ino ||
        current.dev !== before.dev || current.isSymbolicLink())
      throw new MediaOperatorError('复制期间源文件发生变化；本次操作不能记为成功。')
    return result
  } finally { await handle.close() }
}
export async function digestPrivateFile(path, maximum, signal) {
  const info = await privateFile(path)
  if (info.size > maximum) throw new MediaOperatorError('归档单文件超过配置限制。')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  const hash = createHash('sha256')
  let bytes = 0
  try {
    const opened = await handle.stat()
    if (opened.ino !== info.ino || opened.dev !== info.dev || opened.size !== info.size)
      throw new MediaOperatorError('归档文件在打开前发生变化。')
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      if (signal?.aborted) throw new MediaOperatorError('操作已中断。')
      bytes += chunk.length
      if (bytes > maximum) throw new MediaOperatorError('归档文件在读取时超过限制。')
      hash.update(chunk)
    }
    if (bytes !== info.size) throw new MediaOperatorError('归档文件大小在读取期间变化。')
    const after = await handle.stat()
    const current = await lstat(path)
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs ||
        after.ctimeMs !== info.ctimeMs || current.ino !== info.ino ||
        current.dev !== info.dev || current.isSymbolicLink())
      throw new MediaOperatorError('归档文件在读取期间发生变化。')
    return { bytes, sha256: hash.digest('hex') }
  } finally { await handle.close() }
}
export async function readJSON(path) {
  const info = await privateFile(path)
  if (info.size > MAX_MANIFEST_BYTES) throw new MediaOperatorError('清单超过 64MB 限制。')
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch { throw new MediaOperatorError('操作清单无法读取。') }
}

/** Resolve the SDK already bundled with the installed storage adapter; no install. */
export function s3Configuration(prefix, { source = false } = {}) {
  const get = (suffix, fallback) => process.env[`${prefix}${suffix}`] || fallback || ''
  const bucket = get('BUCKET', source ? process.env.S3_BUCKET : '')
  const endpoint = get('ENDPOINT', source ? process.env.S3_ENDPOINT : '')
  const region = get('REGION', source ? process.env.S3_REGION : '')
  // Backup and restore credentials are separate; do not silently use write credentials.
  const accessKeyId = get('ACCESS_KEY')
  const secretAccessKey = get('SECRET_KEY')
  const sessionToken = get('SESSION_TOKEN') || undefined
  const style = get('FORCE_PATH_STYLE', source ? process.env.S3_FORCE_PATH_STYLE || 'false' : 'false')
  let origin
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.username || url.password || url.search ||
        url.hash || url.pathname !== '/') throw new Error()
    origin = url.origin
  } catch { throw new MediaOperatorError(`${prefix}ENDPOINT 须为无路径、参数和凭证的 HTTPS origin。`) }
  if (!/^[a-z\d][a-z\d.-]{1,61}[a-z\d]$/.test(bucket) || /\.\.|\.-|-\./.test(bucket) ||
      !region || !accessKeyId || !secretAccessKey || !['true', 'false'].includes(style))
    throw new MediaOperatorError(`${prefix} 存储参数不完整或格式无效；凭证仅从私有环境读取。`)
  return { bucket, endpoint: origin, region, credentials: { accessKeyId, secretAccessKey, sessionToken },
    forcePathStyle: style === 'true' }
}
export function s3Session(configuration) {
  let sdk
  try {
    const adapterRequire = createRequire(require.resolve('@payloadcms/storage-s3'))
    sdk = adapterRequire('@aws-sdk/client-s3')
  } catch { throw new MediaOperatorError('已安装存储适配器的 AWS SDK 不可用；未自动安装依赖。') }
  const { bucket, ...options } = configuration
  const client = new sdk.S3Client({ ...options, maxAttempts: 3 })
  return { sdk, client, bucket }
}
export const safeCloudError = (error) => ({
  name: typeof error?.name === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(error.name)
    ? error.name : 'unavailable',
  status: Number.isInteger(error?.$metadata?.httpStatusCode) ? error.$metadata.httpStatusCode : null,
})
