#!/usr/bin/env node
/** Explicit operator actions only. No application, database, migrations or workers. */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readdir, realpath, rename } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MediaOperatorError, absolutePath, archiveStream, assertOutsidePublic, commitJSON,
  copyRegularFile, limits, privateDirectory, privateFile, readJSON,
  safeCloudError, safeFilePath, s3Configuration, s3Session, syncPath, within, writeJSON,
} from './lib/platform-media-tools.mjs'

process.umask(0o077)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const format = 'novasite-media-backup-v1'
const liveCopyFormat = 'novasite-media-live-copy-v1'
const lockKey = '.novasite-media-restore-lock'
const schemas = {
  'backup-local': ['source', 'directory', 'label', 'maintenance-window-confirmed'],
  'snapshot-local': ['source', 'directory', 'label'],
  'snapshot-s3': ['confirm-bucket', 'directory', 'label'],
  'backup-s3': ['confirm-bucket', 'directory', 'label', 'maintenance-window-confirmed'],
  list: ['directory'],
  'restore-plan': ['backup', 'target'],
  'restore-copy': ['backup', 'target', 'apply', 'isolated-target-approved'],
  'restore-s3-plan': ['backup', 'confirm-bucket', 'key-prefix'],
  'restore-s3-copy': ['backup', 'confirm-bucket', 'key-prefix', 'apply', 'isolated-target-approved'],
  help: [],
}
const flags = new Set(['maintenance-window-confirmed', 'apply', 'isolated-target-approved'])
const fail = (message) => { throw new MediaOperatorError(message) }
const output = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n')
const integer = (value) => Number.isSafeInteger(value) && value >= 0
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')
const now = () => new Date().toISOString()
const localMimeType = (path) => ({
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  svg: 'image/svg+xml', avif: 'image/avif', gif: 'image/gif', ico: 'image/x-icon',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  ogv: 'video/ogg', m4v: 'video/x-m4v', avi: 'video/x-msvideo', mkv: 'video/x-matroska',
})[path.split('.').at(-1)?.toLowerCase()] || 'application/octet-stream'
let operationDirectory
let controller

function argumentsFor() {
  const [command = 'help', ...args] = process.argv.slice(2)
  if (!Object.hasOwn(schemas, command)) fail('不支持的命令，请使用 help 查看源码提供的入口。')
  const values = {}
  for (let index = 0; index < args.length; index++) {
    const name = args[index].startsWith('--') ? args[index].slice(2) : ''
    if (!schemas[command].includes(name) || Object.hasOwn(values, name))
      fail('参数不存在、重复或不属于当前命令。')
    if (flags.has(name)) values[name] = true
    else {
      const value = args[++index]
      if (!value || value.startsWith('--')) fail('参数缺少值。')
      values[name] = value
    }
  }
  return { command, values }
}
async function existingPrivateDirectory(path) {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077))
    fail('归档或恢复父目录必须是权限 700 的普通私有目录。')
  const actual = await realpath(path)
  assertOutsidePublic(root, actual)
  return actual
}
function backupDirectory(value) {
  return absolutePath(value || process.env.PLATFORM_MEDIA_BACKUP_DIRECTORY ||
    join(process.env.PLATFORM_BACKUP_DIRECTORY || join(root, 'deploy/backups'), 'media'), '文件归档目录')
}
function acceptedLabel(value = 'manual') {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) fail('归档标签仅接受 1–80 个字母、数字、下划线或连字符。')
  return value
}
function checkTotal(objects, caps) {
  let bytes = 0
  if (objects.length > caps.files) fail('文件数量超过配置上限，操作停止而不截断。')
  for (const item of objects) {
    if (!integer(item.bytes) || item.bytes > caps.fileBytes) fail('文件大小无效或超过单文件限制。')
    bytes += item.bytes
    if (!integer(bytes) || bytes > caps.bytes) fail('归档总大小超过配置上限。')
  }
  return { files: objects.length, bytes }
}
async function startOperation(parent, prefix) {
  const directory = await privateDirectory(parent)
  assertOutsidePublic(root, directory)
  operationDirectory = await mkdtemp(join(directory, `${prefix}-${stamp()}-`))
  await syncPath(directory)
  return operationDirectory
}
async function localInventory(directory, caps) {
  const files = []
  const directories = []
  const signature = (info) => [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs]
  const walk = async (path, relativePath, depth) => {
    controller.signal.throwIfAborted()
    if (depth > 100 || directories.length > caps.files) fail('目录层级或目录数量超过工具限制。')
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isDirectory()) fail('源目录包含符号链接或特殊目录，停止而不跳过。')
    const actual = await realpath(path)
    if (!within(directory, actual)) fail('源路径越出媒体目录。')
    directories.push({ path: relativePath, signature: signature(info) })
    const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => compare(a.name, b.name))
    for (const entry of entries) {
      controller.signal.throwIfAborted()
      const child = join(path, entry.name)
      const name = safeFilePath(relativePath ? `${relativePath}/${entry.name}` : entry.name)
      const current = await lstat(child)
      if (current.isSymbolicLink()) fail('源目录包含符号链接，停止而不跳过。')
      if (current.isDirectory()) await walk(child, name, depth + 1)
      else if (current.isFile()) {
        files.push({ path: name, bytes: current.size, signature: signature(current) })
        if (files.length > caps.files || current.size > caps.fileBytes)
          fail('源文件数量或大小超过配置限制。')
      } else fail('源目录包含非普通文件，停止而不跳过。')
    }
  }
  await walk(directory, '', 0)
  checkTotal(files, caps)
  return { files, directories }
}
async function cloudRequest(session, command) {
  controller.signal.throwIfAborted()
  return session.client.send(command, { abortSignal: controller.signal })
}
async function requireVersioning(session) {
  const value = await cloudRequest(session, new session.sdk.GetBucketVersioningCommand({ Bucket: session.bucket }))
  if (value.Status !== 'Enabled') fail('云桶必须已启用对象版本；工具不会自动开启或降级为非版本备份。')
}
async function cloudInventory(session, caps) {
  const objects = []
  const deleted = []
  const keys = new Set()
  const markers = new Set()
  let keyMarker
  let versionMarker
  let scanned = 0
  while (true) {
    const page = await cloudRequest(session, new session.sdk.ListObjectVersionsCommand({
      Bucket: session.bucket, MaxKeys: 1000, KeyMarker: keyMarker, VersionIdMarker: versionMarker,
    }))
    if (!Array.isArray(page.Versions || []) || !Array.isArray(page.DeleteMarkers || []))
      fail('云服务没有返回完整对象版本清单。')
    scanned += (page.Versions || []).length + (page.DeleteMarkers || []).length
    if (scanned > caps.versions) fail('历史版本扫描量超过配置上限，停止而不跳过剩余页。')
    const addKey = (item) => {
      const key = safeFilePath(item.Key)
      if (!item.VersionId || keys.has(key)) fail('最新对象版本清单不完整或重复，请重新取得稳定维护窗口。')
      keys.add(key)
      if (keys.size > caps.files) fail('云桶当前文件和删除标记数量超过配置上限。')
      return key
    }
    for (const item of page.Versions || []) if (item.IsLatest === true) {
      objects.push({ path: addKey(item), bytes: item.Size, versionID: item.VersionId,
        etag: item.ETag || '', lastModified: item.LastModified?.toISOString() || '' })
    }
    for (const item of page.DeleteMarkers || []) if (item.IsLatest === true) {
      deleted.push({ path: addKey(item), versionID: item.VersionId,
        lastModified: item.LastModified?.toISOString() || '' })
    }
    if (!page.IsTruncated) break
    if (!page.NextKeyMarker || !page.NextVersionIdMarker) fail('云版本分页缺少继续标记，不能记为完整备份。')
    const token = JSON.stringify([page.NextKeyMarker, page.NextVersionIdMarker])
    if (markers.has(token)) fail('云版本分页标记循环，停止操作。')
    markers.add(token)
    keyMarker = page.NextKeyMarker; versionMarker = page.NextVersionIdMarker
  }
  objects.sort((a, b) => compare(a.path, b.path))
  deleted.sort((a, b) => compare(a.path, b.path))
  checkTotal(objects, caps)
  return { objects, deleted, scanned }
}
const cleanHeader = (value) => typeof value === 'string' && value.length <= 1024 &&
  !/[\x00-\x1f\x7f]/.test(value) ? value : undefined

async function createBackup(values, caps, cloud, liveCopy = false) {
  if (!liveCopy && !values['maintenance-window-confirmed'])
    fail('备份前须安排暂停上传、替换和删除的维护窗口，再提供 --maintenance-window-confirmed。')
  const label = acceptedLabel(values.label)
  const target = backupDirectory(values.directory)
  assertOutsidePublic(root, target)
  let source
  let inventory
  let session
  let cloudConfig
  let directory
  try {
    if (cloud) {
      cloudConfig = s3Configuration('MEDIA_BACKUP_S3_', { source: true })
      if (values['confirm-bucket'] !== cloudConfig.bucket) fail('请明确确认与源配置完全一致的云桶名称。')
      session = s3Session(cloudConfig)
      await requireVersioning(session)
      inventory = await cloudInventory(session, caps)
      source = { mode: 's3-versioned', bucket: cloudConfig.bucket, endpoint: cloudConfig.endpoint,
        region: cloudConfig.region, keyLayout: 'full-bucket-keys' }
    } else {
      const path = absolutePath(values.source, '本机媒体源目录')
      const info = await lstat(path)
      if (!info.isDirectory() || info.isSymbolicLink()) fail('本机源必须是已有普通目录。')
      directory = await realpath(path)
      if (within(directory, target) || within(target, directory)) fail('源媒体与归档目录不能相互包含。')
      inventory = await localInventory(directory, caps)
      source = { mode: 'local', directory, keyLayout: 'relative-local-paths' }
    }
    const archive = await startOperation(target, liveCopy ? 'media-live-copy' : 'media')
    if (!cloud && (within(directory, archive) || within(archive, directory)))
      fail('真实归档路径与源目录重叠。')
    await privateDirectory(join(archive, 'objects'))
    const startedAt = now()
    const id = randomUUID()
    await writeJSON(join(archive, 'operation.json'), { id, startedAt, label, source,
      state: liveCopy ? 'live-file-copy-in-progress' : 'backup-in-progress',
      maintenanceWindowConfirmed: !liveCopy, databaseConsistency: 'not-verified' })
    const objects = []
    const files = cloud ? inventory.objects : inventory.files
    for (let index = 0; index < files.length; index++) {
      controller.signal.throwIfAborted()
      const item = files[index]
      const file = `objects/${String(index + 1).padStart(8, '0')}.bin`
      let result
      let metadata = {}
      if (cloud) {
        const response = await cloudRequest(session, new session.sdk.GetObjectCommand({
          Bucket: session.bucket, Key: item.path, VersionId: item.versionID,
          ...(item.etag ? { IfMatch: item.etag } : {}),
        }))
        if (!response.Body || response.ContentLength !== item.bytes || response.VersionId !== item.versionID) {
          response.Body?.destroy?.()
          fail('云文件响应的版本或大小与清单不一致。')
        }
        result = await archiveStream(response.Body, join(archive, file),
          { expectedBytes: item.bytes, maxBytes: caps.fileBytes, signal: controller.signal })
        metadata = { versionID: item.versionID, etag: item.etag, lastModified: item.lastModified,
          contentType: cleanHeader(response.ContentType),
          contentDisposition: cleanHeader(response.ContentDisposition),
          contentEncoding: cleanHeader(response.ContentEncoding),
          contentLanguage: cleanHeader(response.ContentLanguage),
          cacheControl: cleanHeader(response.CacheControl) }
      } else {
        const path = join(directory, item.path)
        if (!within(directory, await realpath(path))) fail('源文件真实路径越出媒体目录。')
        result = await copyRegularFile(path, join(archive, file),
          { expectedBytes: item.bytes, maxBytes: caps.fileBytes, signal: controller.signal })
      }
      objects.push({ path: item.path, archive: file, ...result, ...metadata })
    }
    if (cloud) {
      await requireVersioning(session)
      const after = await cloudInventory(session, caps)
      if (JSON.stringify(after) !== JSON.stringify(inventory))
        fail('备份期间云桶清单变化，本次归档不能记为成功。')
    } else if (JSON.stringify(await localInventory(directory, caps)) !== JSON.stringify(inventory))
      fail('备份期间本机媒体清单变化，本次归档不能记为成功。')
    await syncPath(join(archive, 'objects'))
    const manifest = { format: liveCopy ? liveCopyFormat : format, id,
      state: liveCopy ? 'live-file-copy-created' : 'backup-created', label, source, startedAt,
      completedAt: now(), objects, deleted: cloud ? inventory.deleted : [],
      totals: checkTotal(objects, caps), coverage: 'current-regular-files-and-derived-sizes',
      historicalObjectVersionsIncluded: false, emptyDirectoriesIncluded: false,
      maintenanceWindowConfirmed: !liveCopy, fileInventoryUnchangedDuringCopy: true,
      databaseConsistency: 'not-verified', restoreRehearsal: 'not-run' }
    await commitJSON(join(archive, 'manifest.json'), manifest)
    output({ state: manifest.state, id, directory: archive, ...manifest.totals,
      ...(!liveCopy ? { mediaCheckpoint: id } : {}),
      maintenanceWindowConfirmed: !liveCopy, fileInventoryUnchangedDuringCopy: true,
      databaseConsistency: 'not-verified', restoreRehearsal: 'not-run' })
  } finally { session?.client.destroy() }
}

async function loadBackup(path, caps) {
  const directory = await existingPrivateDirectory(absolutePath(path, '文件归档目录'))
  const objectsDirectory = await existingPrivateDirectory(join(directory, 'objects'))
  if (objectsDirectory !== join(directory, 'objects')) fail('归档对象目录真实路径不一致。')
  const manifest = await readJSON(join(directory, 'manifest.json'))
  const completedBackup = manifest.format === format && manifest.state === 'backup-created' && manifest.maintenanceWindowConfirmed === true
  const completedCopy = manifest.format === liveCopyFormat && manifest.state === 'live-file-copy-created' &&
    manifest.maintenanceWindowConfirmed === false && manifest.fileInventoryUnchangedDuringCopy === true &&
    ['local', 's3-versioned'].includes(manifest.source?.mode)
  if ((!completedBackup && !completedCopy) ||
      !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(manifest.id || '') ||
      !['local', 's3-versioned'].includes(manifest.source?.mode) || !Array.isArray(manifest.objects))
    fail('不是本工具完成的文件归档或在线副本清单。')
  const totals = checkTotal(manifest.objects, caps)
  if (manifest.totals?.files !== totals.files || manifest.totals?.bytes !== totals.bytes)
    fail('归档总量与清单不符。')
  const names = new Set()
  const blobs = new Set()
  for (const item of manifest.objects) {
    controller.signal.throwIfAborted()
    safeFilePath(item.path)
    if (!/^objects\/\d{8}\.bin$/.test(item.archive || '') ||
        !/^[a-f\d]{64}$/.test(item.sha256 || '') || names.has(item.path) || blobs.has(item.archive))
      fail('归档文件路径、校验值或重复项无效。')
    names.add(item.path); blobs.add(item.archive)
    for (const key of ['contentType', 'contentDisposition', 'contentEncoding', 'contentLanguage', 'cacheControl'])
      if (item[key] !== undefined && cleanHeader(item[key]) !== item[key])
        fail('归档包含不支持的文件响应头。')
    const info = await privateFile(join(directory, item.archive))
    if (info.size !== item.bytes) fail('归档文件大小与清单不符。')
  }
  return { directory, manifest }
}
async function newLocalTarget(value, backup) {
  const target = absolutePath(value, '恢复副本目录')
  if (!/^novasite-media-restore-[a-zA-Z0-9_-]{1,80}$/.test(basename(target)))
    fail('恢复目录须命名为 novasite-media-restore-副本名。')
  assertOutsidePublic(root, target)
  const parent = await existingPrivateDirectory(dirname(target))
  const actual = join(parent, basename(target))
  if (within(backup.directory, actual) || within(actual, backup.directory)) fail('恢复副本不能与归档重叠。')
  if (backup.manifest.source.mode === 'local') {
    const source = absolutePath(backup.manifest.source.directory, '清单源目录')
    if (within(source, actual) || within(actual, source)) fail('恢复副本不能与原媒体目录重叠。')
  }
  assertOutsidePublic(root, actual)
  try { await lstat(actual); fail('恢复副本目录已存在，拒绝覆盖或复用。') }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  return actual
}
function assertApply(values) {
  if (!values.apply || !values['isolated-target-approved'])
    fail('实际副本恢复需要 --apply 和 --isolated-target-approved；没有授权时请先看 plan。')
}
async function verifiedInput(backup, caps) {
  const operation = await startOperation(dirname(backup.directory), 'media-restore-operation')
  await privateDirectory(join(operation, 'verified'))
  for (const item of backup.manifest.objects) {
    const digest = await copyRegularFile(join(backup.directory, item.archive),
      join(operation, 'verified', basename(item.archive)),
      { expectedBytes: item.bytes, maxBytes: caps.fileBytes, signal: controller.signal, privateInput: true })
    if (digest.sha256 !== item.sha256) fail('归档 SHA-256 不匹配；没有开始向恢复目标写入。')
  }
  await syncPath(join(operation, 'verified'))
  return operation
}
async function restoreLocal(values, caps, apply) {
  if (apply) assertApply(values)
  const backup = await loadBackup(values.backup, caps)
  const target = await newLocalTarget(values.target, backup)
  const plan = { state: 'restore-plan', backupID: backup.manifest.id, target,
    sourceState: backup.manifest.state, maintenanceWindowConfirmed: backup.manifest.maintenanceWindowConfirmed,
    databaseConsistency: 'not-verified',
    keyLayout: backup.manifest.source.keyLayout, ...backup.manifest.totals,
    archiveHashChecked: false, targetWritten: false, applicationAcceptance: 'not-run' }
  if (!apply) { output(plan); return }
  const operation = await verifiedInput(backup, caps)
  await mkdir(target, { mode: 0o700 })
  await syncPath(dirname(target))
  const files = await privateDirectory(join(target, 'files'))
  const startedAt = now()
  await writeJSON(join(operation, 'operation.json'), { ...plan, startedAt, state: 'restore-in-progress' })
  const parents = new Set([files])
  for (const item of backup.manifest.objects) {
    controller.signal.throwIfAborted()
    const destination = join(files, item.path)
    if (!within(files, destination)) fail('恢复文件路径越出副本目录。')
    const parent = await privateDirectory(dirname(destination))
    if (!within(files, parent)) fail('恢复父目录真实路径越出副本目录。')
    for (let current = parent; within(files, current); current = dirname(current)) {
      parents.add(current)
      if (current === files) break
    }
    const result = await copyRegularFile(join(operation, 'verified', basename(item.archive)), destination,
      { expectedBytes: item.bytes, maxBytes: caps.fileBytes, signal: controller.signal, privateInput: true })
    if (result.sha256 !== item.sha256) fail('副本写入校验失败。')
  }
  for (const parent of [...parents].sort((a, b) => b.length - a.length)) await syncPath(parent)
  await syncPath(target)
  const report = { ...plan, state: 'files-copied-to-isolated-directory', startedAt, completedAt: now(),
    archiveHashChecked: true, targetWritten: true, databaseRestored: false,
    workersStarted: false, productionCutover: false }
  await commitJSON(join(operation, 'restore-report.json'), report)
  output({ ...report, operationDirectory: operation })
}
function restoreCloudConfiguration(values, backup) {
  const configuration = s3Configuration('RESTORE_S3_')
  if (values['confirm-bucket'] !== configuration.bucket ||
      !/^novasite-restore-[a-z\d][a-z\d-]{0,42}$/.test(configuration.bucket))
    fail('目标桶须命名为 novasite-restore-副本名，且与明确确认的桶名一致。')
  if ([process.env.S3_BUCKET, backup.manifest.source.bucket].includes(configuration.bucket))
    fail('恢复桶不能与当前应用桶或清单源桶同名。')
  let prefix = ''
  if (backup.manifest.source.mode === 'local') {
    if (!values['key-prefix']) fail('本机归档转到云副本时必须明确 --key-prefix，例如 media。')
    prefix = safeFilePath(values['key-prefix'].replace(/\/$/, '')) + '/'
  } else if (values['key-prefix']) fail('云归档恢复必须保留完整对象键，不能额外添加前缀。')
  const objects = backup.manifest.objects.map((item) => ({ ...item, key: safeFilePath(prefix + item.path) }))
  if (objects.some((item) => item.key === lockKey)) fail('源归档使用了工具保留的恢复锁对象键。')
  return { configuration, objects }
}
async function assertEmptyCloud(session) {
  await requireVersioning(session)
  const [versions, current, uploads] = await Promise.all([
    cloudRequest(session, new session.sdk.ListObjectVersionsCommand({ Bucket: session.bucket, MaxKeys: 1 })),
    cloudRequest(session, new session.sdk.ListObjectsV2Command({ Bucket: session.bucket, MaxKeys: 1 })),
    cloudRequest(session, new session.sdk.ListMultipartUploadsCommand({ Bucket: session.bucket, MaxUploads: 1 })),
  ])
  if (versions.IsTruncated || versions.Versions?.length || versions.DeleteMarkers?.length ||
      current.IsTruncated || current.Contents?.length || uploads.IsTruncated || uploads.Uploads?.length)
    fail('目标桶包含文件、历史版本、删除标记或未完成分段上传，拒绝复用。')
}
async function hashCloudBody(body, item, caps) {
  let bytes = 0
  const hash = createHash('sha256')
  const stop = () => body.destroy?.(controller.signal.reason)
  controller.signal.addEventListener('abort', stop, { once: true })
  try {
    controller.signal.throwIfAborted()
    for await (const chunk of body) {
      controller.signal.throwIfAborted()
      bytes += chunk.length
      if (bytes > item.bytes || bytes > caps.fileBytes) fail('云恢复回读大小超过清单。')
      hash.update(chunk)
    }
    if (bytes !== item.bytes || hash.digest('hex') !== item.sha256)
      fail('云恢复文件回读 SHA-256 或大小不符。')
  } finally {
    controller.signal.removeEventListener('abort', stop)
    body.destroy?.()
  }
}
async function restoreCloud(values, caps, apply) {
  if (apply) assertApply(values)
  const backup = await loadBackup(values.backup, caps)
  const { configuration, objects } = restoreCloudConfiguration(values, backup)
  const plan = { state: 'restore-s3-plan', backupID: backup.manifest.id,
    sourceState: backup.manifest.state, maintenanceWindowConfirmed: backup.manifest.maintenanceWindowConfirmed,
    databaseConsistency: 'not-verified',
    targetBucket: configuration.bucket, endpoint: configuration.endpoint,
    ...backup.manifest.totals, keyLayout: backup.manifest.source.mode === 'local'
      ? `explicit-prefix:${values['key-prefix']}` : 'full-bucket-keys',
    archiveHashChecked: false, bucketEmptyChecked: false, targetWritten: false,
    applicationAcceptance: 'not-run' }
  if (!apply) { output(plan); return }
  const operation = await verifiedInput(backup, caps)
  const session = s3Session(configuration)
  const startedAt = now()
  const destinationCaps = { ...caps, files: caps.files + 1, bytes: caps.bytes + 4096,
    fileBytes: Math.max(caps.fileBytes, 4096), versions: caps.versions + 1 }
  let journal
  try {
    await writeJSON(join(operation, 'operation.json'), { ...plan, startedAt, state: 'restore-s3-in-progress' })
    await assertEmptyCloud(session)
    const lock = await cloudRequest(session, new session.sdk.PutObjectCommand({
      Bucket: session.bucket, Key: lockKey, IfNoneMatch: '*',
      ContentType: 'application/json', CacheControl: 'private, no-store',
      Body: Buffer.from(JSON.stringify({ format, backupID: backup.manifest.id, startedAt })),
    }))
    if (!lock.VersionId || lock.VersionId === 'null') fail('恢复锁未获得明确对象版本，停止操作。')
    const locked = await cloudInventory(session, destinationCaps)
    if (locked.objects.length !== 1 || locked.deleted.length || locked.scanned !== 1 ||
        locked.objects[0].path !== lockKey || locked.objects[0].versionID !== lock.VersionId)
      fail('获得恢复锁后目标桶不再独占，停止操作。')
    journal = await open(join(operation, 'copied-objects.ndjson'), 'wx', 0o600)
    const writtenVersions = new Map([[lockKey, lock.VersionId]])
    for (const item of objects) {
      const path = join(operation, 'verified', basename(item.archive))
      const before = await privateFile(path)
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
      let result
      let stream
      try {
        const opened = await handle.stat()
        if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== item.bytes)
          fail('已校验输入在上传前发生变化。')
        stream = handle.createReadStream({ autoClose: false })
        result = await cloudRequest(session, new session.sdk.PutObjectCommand({
          Bucket: session.bucket, Key: item.key, IfNoneMatch: '*', Body: stream,
          ContentLength: item.bytes, ContentType: item.contentType || localMimeType(item.path),
          ...(item.contentDisposition ? { ContentDisposition: item.contentDisposition } : {}),
          ...(item.contentEncoding ? { ContentEncoding: item.contentEncoding } : {}),
          ...(item.contentLanguage ? { ContentLanguage: item.contentLanguage } : {}),
          CacheControl: item.cacheControl || 'private, no-store',
          Metadata: { 'novasite-sha256': item.sha256 },
        }))
        const after = await handle.stat()
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs)
          fail('上传期间已校验输入发生变化。')
      } finally { stream?.destroy(); await handle.close() }
      if (!result.VersionId || result.VersionId === 'null') fail('恢复文件未取得明确对象版本。')
      const response = await cloudRequest(session, new session.sdk.GetObjectCommand({
        Bucket: session.bucket, Key: item.key, VersionId: result.VersionId,
      }))
      if (!response.Body || response.ContentLength !== item.bytes || response.VersionId !== result.VersionId) {
        response.Body?.destroy?.(); fail('恢复文件回读版本或大小不一致。')
      }
      await hashCloudBody(response.Body, item, caps)
      writtenVersions.set(item.key, result.VersionId)
      await journal.write(JSON.stringify({ key: item.key, bytes: item.bytes, sha256: item.sha256,
        versionID: result.VersionId, checkedAt: now() }) + '\n')
      await journal.sync()
    }
    await requireVersioning(session)
    const final = await cloudInventory(session, destinationCaps)
    if (final.deleted.length || final.objects.length !== writtenVersions.size ||
        final.scanned !== writtenVersions.size || final.objects.some((item) => writtenVersions.get(item.path) !== item.versionID))
      fail('恢复结束时目标桶的对象版本与本次写入不一致。')
    const report = { ...plan, state: 'files-copied-to-isolated-bucket', startedAt, completedAt: now(),
      archiveHashChecked: true, bucketEmptyChecked: true, targetWritten: true,
      readbackHashChecked: true, restoreLockRetained: true, databaseRestored: false,
      workersStarted: false, productionCutover: false }
    await commitJSON(join(operation, 'restore-report.json'), report)
    output({ ...report, operationDirectory: operation })
  } finally { await journal?.close(); session.client.destroy() }
}
async function listBackups(values, caps) {
  const path = backupDirectory(values.directory)
  assertOutsidePublic(root, path)
  let directory
  try { directory = await existingPrivateDirectory(path) }
  catch (error) { if (error.code === 'ENOENT') { output({ backups: [], fileCopies: [], archiveHashChecked: false }); return } throw error }
  const backups = []
  const fileCopies = []
  let incompleteDirectories = 0
  const entries = await readdir(directory, { withFileTypes: true })
  if (entries.length > caps.files) fail('归档目录条目过多，请先按维护策略整理目录。')
  for (const entry of entries) if (entry.name.startsWith('media-') && !entry.name.startsWith('media-restore-')) {
    controller.signal.throwIfAborted()
    if (!entry.isDirectory() || entry.isSymbolicLink()) { incompleteDirectories++; continue }
    try {
      const archive = await loadBackup(join(directory, entry.name), caps)
      const target = archive.manifest.format === liveCopyFormat ? fileCopies : backups
      target.push({ id: archive.manifest.id, directory: archive.directory, label: archive.manifest.label,
        completedAt: archive.manifest.completedAt, sourceMode: archive.manifest.source.mode,
        state: archive.manifest.state, maintenanceWindowConfirmed: archive.manifest.maintenanceWindowConfirmed,
        databaseConsistency: 'not-verified',
        ...archive.manifest.totals, restoreRehearsal: 'not-proven-by-list' })
    } catch { incompleteDirectories++ }
  }
  backups.sort((a, b) => compare(b.completedAt || '', a.completedAt || ''))
  fileCopies.sort((a, b) => compare(b.completedAt || '', a.completedAt || ''))
  output({ backups, fileCopies, incompleteDirectories, archiveHashChecked: false, networkUsed: false })
}
async function main() {
  const { command, values } = argumentsFor()
  if (command === 'help') {
    process.stdout.write('文件维护命令：backup-local、snapshot-local、snapshot-s3、backup-s3、list、restore-plan、restore-copy、restore-s3-plan、restore-s3-copy。\nsnapshot-local/snapshot-s3 不停服务，只保存经文件清单对照的在线副本，不代表数据库配套备份；云源必须启用版本管理。\n详见 docs/v1/MEDIA-BACKUP-RESTORE-HANDBOOK-20261001.md；任何实际操作先按手册明确源和独立目标。\n')
    return
  }
  const caps = limits()
  controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new MediaOperatorError('操作超过配置时限。')), caps.timeout)
  const interrupt = () => controller.abort(new MediaOperatorError('操作已中断。'))
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt)
  try {
    if (command === 'backup-local' || command === 'backup-s3') await createBackup(values, caps, command === 'backup-s3')
    else if (command === 'snapshot-local' || command === 'snapshot-s3') await createBackup(values, caps, command === 'snapshot-s3', true)
    else if (command === 'list') await listBackups(values, caps)
    else if (command === 'restore-plan' || command === 'restore-copy') await restoreLocal(values, caps, command === 'restore-copy')
    else await restoreCloud(values, caps, command === 'restore-s3-copy')
  } finally {
    clearTimeout(timeout)
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt)
  }
}
try { await main() }
catch (error) {
  if (operationDirectory) {
    // A failed final fsync must not leave a discoverable success manifest/report.
    for (const filename of ['manifest.json', 'restore-report.json']) {
      try { await rename(join(operationDirectory, filename), join(operationDirectory, `${filename}.unconfirmed`)) }
      catch {}
    }
    try { await writeJSON(join(operationDirectory, 'failure.json'), {
      state: 'operation-incomplete', failedAt: now(), error: safeCloudError(error),
      originalFilesDeleted: false, productionCutover: false,
    }) } catch {}
  }
  const message = error instanceof MediaOperatorError ? error.message
    : '文件操作未完成；保留独立操作目录，查明原因后使用新的恢复目标，不自动覆盖或删除。'
  process.stderr.write(message + '\n')
  if (operationDirectory) output({ state: 'operation-incomplete', operationDirectory,
    details: safeCloudError(error), originalFilesDeleted: false, productionCutover: false })
  process.exitCode = 1
}
