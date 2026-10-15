/** Maintenance-only retrieval. No application, database, schema or worker imports. */
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { open, realpath, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { absolutePath, commitJSON, privateFile, s3Configuration, s3Session, syncPath } from './platform-media-tools.mjs'
import { boundedInteger, failBackup } from './platform-backup-tools.mjs'

const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/
const sha = /^[a-f\d]{64}$/
const partSize = 128 * 1024 ** 2
const indexLimit = 4 * 1024 ** 2
const safeVersion = value => typeof value === 'string' && value !== 'null' && value.length > 0 &&
  value.length <= 2048 && !/[\x00-\x1f\x7f]/.test(value)
const safeID = value => typeof value === 'string' && uuid.test(value)
const safeHash = value => typeof value === 'string' && sha.test(value)

export function recoveryLimits() {
  return {
    ciphertext: boundedInteger('BACKUP_RECOVERY_MAX_CIPHERTEXT_BYTES', 512 * 1024 ** 3, 1024 ** 2, 2 * 1024 ** 4),
    plaintext: boundedInteger('BACKUP_RECOVERY_MAX_PLAINTEXT_BYTES', 512 * 1024 ** 3, 1024 ** 2, 2 * 1024 ** 4),
    entries: boundedInteger('BACKUP_RECOVERY_MAX_ENTRIES', 300000, 10, 1000000),
    fileBytes: boundedInteger('BACKUP_RECOVERY_MAX_FILE_BYTES', 64 * 1024 ** 3, 1024 ** 2, 1024 ** 4),
    timeout: boundedInteger('BACKUP_RECOVERY_TIMEOUT_MINUTES', 240, 1, 1440) * 60000,
    minimumFree: boundedInteger('BACKUP_RECOVERY_MIN_FREE_BYTES', 20 * 1024 ** 3, 1024 ** 3, 1024 ** 4),
  }
}

/** Bounded, no-follow input with inode/change checks; credentials are never returned. */
export async function readPrivateInput(value, maximum, label) {
  const path = absolutePath(value, label)
  if (await realpath(path) !== path) failBackup(`${label} 不能经由符号链接读取。`)
  const before = await privateFile(path)
  if (!before.size || before.size > maximum) failBackup(`${label} 大小无效。`)
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const opened = await handle.stat()
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size)
      failBackup(`${label} 在打开前发生变化。`)
    const chunks = []; let size = 0
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length
      if (size > maximum) failBackup(`${label} 读取超过上限。`)
      chunks.push(chunk)
    }
    const after = await privateFile(path), held = await handle.stat()
    if (size !== before.size || after.ino !== before.ino || after.dev !== before.dev ||
        held.size !== before.size || held.mtimeMs !== before.mtimeMs || held.ctimeMs !== before.ctimeMs)
      failBackup(`${label} 在读取期间发生变化。`)
    return { path, bytes: Buffer.concat(chunks) }
  } finally { await handle.close() }
}

function objectJSON(bytes, label) {
  let value
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { failBackup(`${label} 不是有效的 UTF-8 JSON。`) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) failBackup(`${label} 格式无效。`)
  return value
}

function checkedArchive(value, id, indexKey, caps) {
  if (!value || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > caps.ciphertext ||
      !safeHash(value.sha256) || !Array.isArray(value.parts) || !value.parts.length ||
      value.parts.length !== Math.ceil(value.bytes / partSize)) failBackup('密文总量、哈希或分片数量无效。')
  const prefix = indexKey.slice(0, -'/index.json'.length)
  if (!prefix.endsWith(`/${id}`)) failBackup('索引路径与作业编号不一致。')
  let start = 0
  const parts = value.parts.map((item, offset) => {
    const number = offset + 1, bytes = Math.min(partSize, value.bytes - start)
    if (!item || item.number !== number || item.start !== start || item.bytes !== bytes ||
        item.key !== `${prefix}/ciphertext-${String(number).padStart(6, '0')}.part` ||
        !safeVersion(item.versionID) || !safeHash(item.sha256)) failBackup('分片路径、版本、编号或连续范围无效。')
    start += bytes
    return { number, start: item.start, key: item.key, versionID: item.versionID, bytes, sha256: item.sha256 }
  })
  return { bytes: value.bytes, sha256: value.sha256, parts }
}

export async function readUploadReceipt(path, caps) {
  const input = await readPrivateInput(path, 8 * 1024 ** 2, '可信上传收据')
  const value = objectJSON(input.bytes, '可信上传收据')
  if (value.state !== 'remote-verified' || !safeID(value.id) ||
      typeof value.bucket !== 'string' || !/^[a-z\d][a-z\d.-]{1,61}[a-z\d]$/.test(value.bucket) ||
      typeof value.region !== 'string' || !value.region || value.region.length > 100 ||
      !value.index || !safeVersion(value.index.versionID) || !safeHash(value.index.sha256) ||
      !Number.isSafeInteger(value.index.bytes) || value.index.bytes < 1 || value.index.bytes > indexLimit ||
      typeof value.index.key !== 'string' || value.index.key.length > 256 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9/_-]+\/index\.json$/.test(value.index.key) ||
      value.index.key.split('/').some(piece => !piece) || !Number.isFinite(Date.parse(value.confirmedAt)))
    failBackup('收据不是本工具已核对远端版本的完整记录。')
  let origin
  try {
    const endpoint = new URL(value.endpoint)
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search ||
        endpoint.hash || endpoint.pathname !== '/') throw new Error()
    origin = endpoint.origin
  } catch { failBackup('收据存储地址必须为无凭证的 HTTPS origin。') }
  const archive = checkedArchive(value.archive, value.id, value.index.key, caps)
  return { state: 'remote-verified', id: value.id, bucket: value.bucket, region: value.region,
    endpoint: origin, confirmedAt: value.confirmedAt, archive,
    index: { key: value.index.key, versionID: value.index.versionID, bytes: value.index.bytes, sha256: value.index.sha256 },
    locationConfirmedByOperator: value.locationConfirmedByOperator === true, restoreRehearsal: 'not-run' }
}

export function recoveryStorage(receipt) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') failBackup('取回备份不能关闭 TLS 证书验证。')
  const config = s3Configuration('BACKUP_RESTORE_S3_')
  if (config.bucket !== receipt.bucket || config.endpoint !== receipt.endpoint || config.region !== receipt.region)
    failBackup('专用只读配置与可信收据的桶、地域或地址不一致。')
  if (['BACKUP_S3_ACCESS_KEY', 'S3_ACCESS_KEY', 'MEDIA_BACKUP_S3_ACCESS_KEY']
    .some(name => process.env[name] && process.env[name] === config.credentials.accessKeyId))
    failBackup('取回入口不能复用配置中已有的网站或备份上传密钥。')
  return config
}

async function remoteObject(session, item, signal) {
  const result = await session.client.send(new session.sdk.GetObjectCommand({
    Bucket: session.bucket, Key: item.key, VersionId: item.versionID,
  }), { abortSignal: signal })
  if (!result.Body || result.VersionId !== item.versionID || result.ContentLength !== item.bytes) {
    result.Body?.destroy?.(); failBackup('指定远端版本的编号或大小不符。')
  }
  return result.Body
}
async function writeAll(handle, chunk) {
  let offset = 0
  while (offset < chunk.length) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset)
    if (!bytesWritten) failBackup('本机私有磁盘未能继续写入。')
    offset += bytesWritten
  }
}

export async function downloadEncryptedBundle(directory, receipt, config, caps, signal) {
  const session = s3Session(config)
  let handle
  try {
    const indexBody = await remoteObject(session, receipt.index, signal)
    const chunks = [], hash = createHash('sha256'); let bytes = 0
    try {
      for await (const chunk of indexBody) {
        signal.throwIfAborted(); bytes += chunk.length
        if (bytes > receipt.index.bytes) failBackup('远端索引超过可信大小。')
        hash.update(chunk); chunks.push(chunk)
      }
    } finally { indexBody.destroy?.() }
    if (bytes !== receipt.index.bytes || hash.digest('hex') !== receipt.index.sha256)
      failBackup('远端索引与可信收据不一致。')
    const rawIndex = Buffer.concat(chunks), index = objectJSON(rawIndex, '远端索引')
    if (index.format !== 'novasite-encrypted-backup-v1' || index.id !== receipt.id || index.encryption !== 'age')
      failBackup('远端索引类型或作业编号不符。')
    const archive = checkedArchive(index.archive, receipt.id, receipt.index.key, caps)
    if (JSON.stringify(archive) !== JSON.stringify(receipt.archive)) failBackup('远端分片信息与可信收据不一致。')
    await commitJSON(join(directory, 'pinned-upload-receipt.json'), receipt)
    const indexHandle = await open(join(directory, 'pinned-index.json'), 'wx', 0o600)
    try { await indexHandle.writeFile(rawIndex); await indexHandle.sync() } finally { await indexHandle.close() }
    const partial = join(directory, 'bundle.tar.age.partial')
    handle = await open(partial, 'wx', 0o600)
    const whole = createHash('sha256'); let total = 0
    for (const part of archive.parts) {
      signal.throwIfAborted()
      const body = await remoteObject(session, part, signal), hash = createHash('sha256'); let size = 0
      try {
        for await (const chunk of body) {
          signal.throwIfAborted(); size += chunk.length; total += chunk.length
          if (size > part.bytes || total > archive.bytes) failBackup('密文响应超过分片或总量限制。')
          hash.update(chunk); whole.update(chunk); await writeAll(handle, chunk)
        }
      } finally { body.destroy?.() }
      if (size !== part.bytes || hash.digest('hex') !== part.sha256) failBackup('远端分片校验失败。')
      await commitJSON(join(directory, 'download-progress.json'), { state: 'download-in-progress',
        id: receipt.id, completedParts: part.number, totalParts: archive.parts.length, bytes: total })
    }
    if (total !== archive.bytes || whole.digest('hex') !== archive.sha256) failBackup('重组密文整体校验失败。')
    signal.throwIfAborted()
    await handle.sync(); await handle.close(); handle = undefined
    const header = await open(partial, 'r')
    try {
      const bytes = Buffer.alloc(22)
      if ((await header.read(bytes, 0, bytes.length, 0)).bytesRead !== bytes.length ||
          bytes.toString() !== 'age-encryption.org/v1\n') failBackup('重组文件不是支持的 age 密文。')
    } finally { await header.close() }
    const destination = join(directory, 'bundle.tar.age')
    await rename(partial, destination); await syncPath(directory)
    await commitJSON(join(directory, 'download-receipt.json'), { state: 'ciphertext-retrieved', id: receipt.id,
      bytes: total, sha256: archive.sha256, completedAt: new Date().toISOString(),
      exactVersionsChecked: true, plaintextCreated: false, databaseRestored: false })
    signal.throwIfAborted()
    return destination
  } finally { await handle?.close(); session.client.destroy() }
}

/** Only native, unencrypted age identities. No plugins, SSH keys or password prompts. */
export async function recoveryIdentity(path) {
  const { bytes } = await readPrivateInput(path, 16384, '离线解密私钥')
  const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  if (!lines.length || lines.length > 10 || lines.some(line => !/^AGE-SECRET-KEY-1[0-9A-Z]{40,100}$/.test(line)))
    failBackup('只接受可信维护电脑上的原生 age 私钥文件；不支持插件、SSH 私钥或交互口令。')
  return bytes
}
