/** Backup maintenance only. Never import Payload or invoke application workers. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, open, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { commitJSON, digestPrivateFile, privateFile, s3Configuration, s3Session, syncPath } from './platform-media-tools.mjs'

export class BackupOperatorError extends Error {}
export const safeSystemEnvironment = () => Object.fromEntries(
  ['PATH', 'HOME', 'SystemRoot', 'SYSTEMROOT', 'TMPDIR', 'TEMP', 'TMP', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]),
)
export const failBackup = message => { throw new BackupOperatorError(message) }

export function boundedInteger(name, fallback, minimum, maximum) {
  const value = process.env[name] || String(fallback), number = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum || number > maximum)
    failBackup(`${name} 必须填写 ${minimum}–${maximum} 的整数。`)
  return number
}
export async function recipientFile(value) {
  if (!value || !isAbsolute(value)) failBackup('BACKUP_AGE_RECIPIENT_FILE 必须是公钥文件绝对路径。')
  const info = await privateFile(value)
  if (info.size < 1 || info.size > 16384) failBackup('备份公钥文件大小无效。')
  const recipients = (await readFile(value, 'utf8')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  if (!recipients.length || recipients.length > 10 || recipients.some(line => !/^age1[0-9a-z]{20,120}$/.test(line)))
    failBackup('这里只接受 age 公钥；不要把解密私钥或其他配置放入服务器公钥文件。')
  return value
}

function startChild(command, args, env, signal) {
  const child = spawn(command, args, { env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = Buffer.alloc(0), forceTimer
  child.stderr.on('data', chunk => {
    if (stderr.length < 1048576) stderr = Buffer.concat([stderr, chunk.subarray(0, 1048576 - stderr.length)])
  })
  const stop = () => {
    child.kill('SIGTERM')
    forceTimer ||= setTimeout(() => child.kill('SIGKILL'), 10000)
    forceTimer.unref()
  }
  signal.addEventListener('abort', stop, { once: true })
  if (signal.aborted) stop()
  const done = new Promise((ok, reject) => {
    child.once('error', () => reject(new BackupOperatorError('备份工具无法启动，请检查已安装的 Node、tar、age 或数据库工具。')))
    child.once('close', code => code === 0 && !signal.aborted ? ok() : reject(new BackupOperatorError('备份子任务未成功，详情只保存在私有作业目录。')))
  })
  const cleanup = () => { signal.removeEventListener('abort', stop); clearTimeout(forceTimer) }
  return { child, done, stop, cleanup, stderr: () => stderr }
}
async function saveLog(path, bytes) {
  if (bytes.length) await writeFile(path, bytes, { mode: 0o600, flag: 'wx' })
}
export async function runBackupTool(script, args, env, directory, name, signal) {
  const task = startChild(process.execPath, [script, ...args], env, signal)
  let stdout = Buffer.alloc(0)
  task.child.stdin.end()
  task.child.stdout.on('data', chunk => {
    if (stdout.length + chunk.length > 1048576) task.stop()
    else stdout = Buffer.concat([stdout, chunk])
  })
  try { await task.done }
  finally {
    task.cleanup()
    await saveLog(join(directory, `${name}-stdout.log`), stdout)
    await saveLog(join(directory, `${name}-stderr.log`), task.stderr())
  }
}

async function assertPlainArchiveTree(directory, maxEntries = 300000) {
  const { readdir } = await import('node:fs/promises')
  let visited = 0
  const visit = async (path, depth) => {
    if (++visited > maxEntries || depth > 12) failBackup('备份目录条目或层级超过限制。')
    const info = await lstat(path)
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || (info.mode & 0o077))
      failBackup('待加密备份必须是私有普通目录/文件，不接受符号链接或其他特殊文件。')
    if (info.isDirectory()) for (const entry of await readdir(path)) await visit(join(path, entry), depth + 1)
  }
  await visit(directory, 0)
}

export async function encryptBundle(directory, recipients, maximum, signal) {
  for (const entry of ['database', 'media', 'bundle.json']) await assertPlainArchiveTree(join(directory, entry))
  const partial = join(directory, 'bundle.tar.age.partial'), final = join(directory, 'bundle.tar.age')
  const env = safeSystemEnvironment()
  const tar = startChild('tar', ['-C', directory, '-cf', '-', 'database', 'media', 'bundle.json'], env, signal)
  const age = startChild('age', ['--encrypt', '--recipients-file', recipients], env, signal)
  tar.child.stdin.end()
  let bytes = 0
  const cap = new Transform({ transform(chunk, encoding, callback) {
    bytes += chunk.length
    callback(bytes > maximum ? new BackupOperatorError('加密归档超过配置容量上限。') : null, chunk)
  } })
  try {
    await Promise.all([
      tar.done, age.done,
      pipeline(tar.child.stdout, age.child.stdin, { signal }),
      pipeline(age.child.stdout, cap, createWriteStream(partial, { mode: 0o600, flags: 'wx' }), { signal }),
    ])
    if (!bytes) failBackup('加密归档为空，不能标记完成。')
    const handle = await open(partial, 'r')
    try {
      const header = Buffer.alloc(32); await handle.read(header, 0, 32, 0)
      if (!header.toString('ascii').startsWith('age-encryption.org/v1\n')) failBackup('加密归档头无效。')
      await handle.sync()
    } finally { await handle.close() }
    const digest = await digestPrivateFile(partial, maximum, signal)
    await rename(partial, final); await syncPath(directory)
    return { path: final, ...digest }
  } catch (error) { tar.stop(); age.stop(); await Promise.allSettled([tar.done, age.done]); throw error }
  finally {
    tar.cleanup(); age.cleanup()
    await saveLog(join(directory, 'encrypt-tar.log'), tar.stderr())
    await saveLog(join(directory, 'encrypt-age.log'), age.stderr())
  }
}

export function remoteBackupConfiguration() {
  if (process.env.BACKUP_OFFSITE_CONFIRMED !== 'true')
    failBackup('必须先确认独立账号/地域的备份存储，再设置 BACKUP_OFFSITE_CONFIRMED=true。')
  const config = s3Configuration('BACKUP_S3_')
  if (config.bucket === process.env.S3_BUCKET || config.bucket === process.env.MEDIA_BACKUP_S3_BUCKET ||
      config.credentials.accessKeyId === process.env.S3_ACCESS_KEY ||
      config.credentials.accessKeyId === process.env.MEDIA_BACKUP_S3_ACCESS_KEY)
    failBackup('异地归档必须使用独立备份桶及专用凭证，不能复用网站文件桶或凭证。')
  const prefix = process.env.BACKUP_S3_KEY_PREFIX || 'novasite-backups'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,159}$/.test(prefix) || prefix.split('/').some(part => !part))
    failBackup('BACKUP_S3_KEY_PREFIX 格式无效。')
  return { ...config, prefix }
}

export async function uploadEncryptedBundle(directory, archive, id, config, signal) {
  const { prefix, ...storage } = config
  const { bucket, ...clientConfiguration } = storage
  const session = s3Session(storage)
  // The SDK must not retry an already-consumed upload stream automatically.
  session.client.destroy()
  session.client = new session.sdk.S3Client({ ...clientConfiguration, maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })
  const send = command => session.client.send(command, { abortSignal: signal })
  const put = async (key, body, bytes, sha256, type) => {
    try {
      const result = await send(new session.sdk.PutObjectCommand({ Bucket: bucket, Key: key,
        Body: body, ContentLength: bytes, ContentType: type, IfNoneMatch: '*',
        ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64') }))
      if (!result.VersionId || result.VersionId === 'null') failBackup('远端未返回真实版本编号，不能确认上传。')
      const saved = await send(new session.sdk.GetObjectCommand({ Bucket: bucket, Key: key, VersionId: result.VersionId }))
      if (!saved.Body || saved.ContentLength !== bytes || saved.VersionId !== result.VersionId) {
        saved.Body?.destroy?.(); failBackup('远端归档版本或大小不匹配。')
      }
      const hash = createHash('sha256'); let received = 0
      for await (const chunk of saved.Body) {
        signal.throwIfAborted(); received += chunk.length
        if (received > bytes) { saved.Body.destroy?.(); failBackup('远端归档响应超过预期大小。') }
        hash.update(chunk)
      }
      if (received !== bytes || hash.digest('hex') !== sha256) failBackup('远端归档校验不符，不能标为完成。')
      return { key, versionID: result.VersionId, bytes, sha256 }
    } finally { body?.destroy?.() }
  }
  try {
    const versioning = await send(new session.sdk.GetBucketVersioningCommand({ Bucket: bucket }))
    const blocks = await send(new session.sdk.GetPublicAccessBlockCommand({ Bucket: bucket }))
    const policy = await send(new session.sdk.GetBucketPolicyStatusCommand({ Bucket: bucket }))
    if (versioning.Status !== 'Enabled' || policy.PolicyStatus?.IsPublic !== false ||
        !['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(key => blocks.PublicAccessBlockConfiguration?.[key] === true))
      failBackup('备份桶必须开启版本管理并阻止公开访问；工具不自动修改桶策略。')
    const before = await privateFile(archive.path)
    if (before.size !== archive.bytes) failBackup('加密归档大小与清单不符。')
    const wholeHash = createHash('sha256')
    const parts = [], partBytes = 128 * 1024 * 1024
    for (let start = 0, index = 1; start < before.size; start += partBytes, index++) {
      signal.throwIfAborted()
      const end = Math.min(before.size - 1, start + partBytes - 1), bytes = end - start + 1
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(archive.path, { start, end, signal })) { hash.update(chunk); wholeHash.update(chunk) }
      const sha256 = hash.digest('hex')
      const part = await put(`${prefix}/${id}/ciphertext-${String(index).padStart(6, '0')}.part`,
        createReadStream(archive.path, { start, end, signal }), bytes, sha256, 'application/octet-stream')
      parts.push({ number: index, start, ...part })
      await commitJSON(join(directory, 'upload-progress.json'), { state: 'upload-in-progress', id, parts })
    }
    const after = await privateFile(archive.path)
    if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || wholeHash.digest('hex') !== archive.sha256)
      failBackup('上传期间本机加密归档发生变化。')
    const index = { format: 'novasite-encrypted-backup-v1', id, encryption: 'age', archive: {
      bytes: archive.bytes, sha256: archive.sha256, parts,
    }, databaseConsistency: 'not-verified', restoreRehearsal: 'not-run' }
    const body = Buffer.from(JSON.stringify(index) + '\n')
    if (body.length > 4 * 1024 * 1024) failBackup('远端索引超过限制。')
    const receipt = await put(`${prefix}/${id}/index.json`, body, body.length,
      createHash('sha256').update(body).digest('hex'), 'application/json')
    await commitJSON(join(directory, 'upload-receipt.json'), { state: 'remote-verified', id,
      bucket, endpoint: storage.endpoint, region: storage.region,
      locationConfirmedByOperator: true, archive: index.archive, index: receipt,
      confirmedAt: new Date().toISOString(), restoreRehearsal: 'not-run' })
    return { bucket, index: receipt, parts: parts.length }
  } finally { session.client.destroy() }
}
