#!/usr/bin/env node
/** Explicit retrieval/decryption only. Never restores a DB or overwrites original media. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rename, statfs } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { absolutePath, assertOutsidePublic, commitJSON, copyRegularFile, MediaOperatorError,
  privateDirectory, readJSON, safeCloudError, syncPath, within } from './lib/platform-media-tools.mjs'
import { BackupOperatorError, failBackup, safeSystemEnvironment } from './lib/platform-backup-tools.mjs'
import { downloadEncryptedBundle, readUploadReceipt, recoveryIdentity, recoveryLimits, recoveryStorage } from './lib/platform-backup-recovery-tools.mjs'

process.umask(0o077)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [command = 'help', ...args] = process.argv.slice(2)
const output = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')
const controller = new AbortController()
process.once('SIGINT', () => controller.abort())
process.once('SIGTERM', () => controller.abort())
let directory, timer, spaceTimer
const schemas = { help: [], plan: ['receipt'], download: ['receipt', 'apply'],
  unpack: ['receipt', 'archive', 'apply', 'trusted-maintenance-host'] }

function optionsFor() {
  if (!Object.hasOwn(schemas, command)) failBackup('不支持的命令，请查看 help。')
  const values = {}
  for (let position = 0; position < args.length; position++) {
    const name = args[position].slice(2)
    if (!args[position].startsWith('--') || !schemas[command].includes(name) || Object.hasOwn(values, name))
      failBackup('参数未知、重复或顺序无效。')
    if (['apply', 'trusted-maintenance-host'].includes(name)) values[name] = true
    else {
      const value = args[++position]
      if (!value || value.startsWith('--')) failBackup('参数值缺失。')
      values[name] = value
    }
  }
  return values
}
function startProcess(executable, args) {
  const child = spawn(executable, args, { env: safeSystemEnvironment(), shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
  let forceTimer
  const stop = () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM'); forceTimer ||= setTimeout(() => child.kill('SIGKILL'), 5000)
      forceTimer.unref()
    }
  }
  const done = new Promise((ok, reject) => {
    child.once('error', () => reject(new BackupOperatorError('维护工具无法启动；请检查可信来源安装的 age 和 Python 3.12 或以上。')))
    child.once('close', code => code === 0 && !controller.signal.aborted ? ok()
      : reject(new BackupOperatorError('解密或解包没有成功，不能将文件用于恢复。')))
  })
  // Drain but never store subprocess stderr: an identity parser may echo sensitive input.
  child.stderr.resume()
  controller.signal.addEventListener('abort', stop, { once: true })
  if (controller.signal.aborted) stop()
  return { child, done, stop, cleanup: () => {
    controller.signal.removeEventListener('abort', stop); clearTimeout(forceTimer)
  } }
}
async function stage(state, extra = {}) {
  await commitJSON(join(directory, 'recovery-stage.json'), { state, updatedAt: new Date().toISOString(),
    databaseRestored: false, originalMediaWritten: false, ...extra })
}
async function createWork(kind, receipt, caps) {
  const requested = absolutePath(process.env.BACKUP_RECOVERY_DIRECTORY || join(root, '.private/backup-recovery'), '私有取回目录')
  assertOutsidePublic(root, requested)
  const mediaRoot = join(root, 'media')
  if (within(mediaRoot, requested) || within(requested, mediaRoot))
    failBackup('私有取回目录不能与项目原媒体目录重叠。')
  const parent = await privateDirectory(requested)
  assertOutsidePublic(root, parent)
  if (within(mediaRoot, parent) || within(parent, mediaRoot))
    failBackup('私有取回目录的真实位置不能与项目原媒体目录重叠。')
  // age encrypts an uncompressed tar. Plaintext may not exceed the pinned ciphertext size.
  const required = kind === 'download' ? receipt.archive.bytes
    : receipt.archive.bytes + 2 * Math.min(caps.plaintext, receipt.archive.bytes)
  const space = await statfs(parent, { bigint: true })
  if (space.bavail * space.bsize < BigInt(caps.minimumFree + required))
    failBackup('私有磁盘不足以保存本次密文及解密副本；不能删除网站原文件腾空间。')
  directory = await mkdtemp(join(parent, `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}-`))
  await syncPath(parent)
  timer = setTimeout(() => controller.abort(), caps.timeout)
  spaceTimer = setInterval(() => {
    statfs(parent, { bigint: true }).then(current => {
      if (current.bavail * current.bsize < BigInt(caps.minimumFree)) controller.abort()
    }).catch(() => controller.abort())
  }, 10000)
  await stage('started', { id: receipt.id, operation: kind })
}

async function decrypt(archive, identity, maximum) {
  const task = startProcess('age', ['--decrypt', '--identity', '-', archive])
  const partial = join(directory, 'payload.tar.partial')
  const digest = createHash('sha256'); let bytes = 0
  const measure = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length
    if (bytes > maximum) return callback(new BackupOperatorError('解密输出超过明文容量限制。'))
    digest.update(chunk); callback(null, chunk)
  } })
  task.child.stdin.on('error', () => task.stop())
  task.child.stdin.end(identity)
  try {
    // A late age authentication failure leaves only .partial, even if plaintext was already streamed.
    await Promise.all([task.done,
      pipeline(task.child.stdout, measure, createWriteStream(partial, { flags: 'wx', mode: 0o600 }), { signal: controller.signal })])
    if (!bytes) failBackup('解密输出为空。')
    await syncPath(partial)
    const path = join(directory, 'payload.tar')
    await rename(partial, path); await syncPath(directory)
    return { path, bytes, sha256: digest.digest('hex') }
  } catch (error) { task.stop(); await task.done.catch(() => {}); throw error }
  finally { task.cleanup() }
}

async function unpack(values, receipt, caps) {
  if (!values.archive || !values['trusted-maintenance-host'])
    failBackup('解密需要 --archive 和 --trusted-maintenance-host；只在可信维护电脑操作。')
  const identityPath = absolutePath(process.env.BACKUP_RECOVERY_AGE_IDENTITY_FILE, '离线私钥')
  if (within(root, identityPath)) failBackup('解密私钥不能放在项目目录内。')
  const identity = await recoveryIdentity(identityPath)
  try {
    await createWork('unpack', receipt, caps)
    const archive = join(directory, 'verified-input.age')
    const copied = await copyRegularFile(absolutePath(values.archive, '已取回密文'), archive,
      { expectedBytes: receipt.archive.bytes, maxBytes: caps.ciphertext, privateInput: true, signal: controller.signal })
    if (copied.sha256 !== receipt.archive.sha256) failBackup('本机密文与可信收据不一致，未开始解密。')
    await stage('decrypting', { id: receipt.id })
    const plaintext = await decrypt(archive, identity, Math.min(caps.plaintext, receipt.archive.bytes))
    identity.fill(0)
    await stage('inspecting-and-extracting', { id: receipt.id })
    const partial = join(directory, 'unpacked.partial'), reportPath = join(directory, 'unpack-result.json')
    const task = startProcess('python3', ['-I', join(root, 'scripts/lib/unpack-platform-backup.py'),
      plaintext.path, partial, receipt.id, plaintext.sha256, String(caps.plaintext), String(caps.entries),
      String(caps.fileBytes), reportPath])
    task.child.stdin.end(); task.child.stdout.resume()
    try { await task.done } finally { task.cleanup() }
    const report = await readJSON(reportPath)
    if (report.format !== 'novasite-unpacked-backup-v1' || report.id !== receipt.id ||
        report.state !== 'components-extracted-and-hash-checked' || report.plaintextSHA256 !== plaintext.sha256)
      failBackup('解包结果没有形成完整的组件校验记录。')
    const destination = join(directory, 'unpacked')
    await rename(partial, destination); await syncPath(directory)
    const components = Object.fromEntries(['database', 'media'].map(kind => {
      const path = report.relativeComponentPaths?.[kind]
      if (typeof path !== 'string' || path.split('/').length !== 2 || path.split('/')[0] !== kind ||
          path.split('/').some(piece => !piece || piece === '.' || piece === '..') || path.includes('\\'))
        failBackup('组件路径无效。')
      return [kind, join(destination, path)]
    }))
    const result = { state: 'ready-for-isolated-restore-planning', id: receipt.id, completedAt: new Date().toISOString(),
      directory, components, componentDetails: report.components, archiveHashChecked: true,
      ageDecryptionSucceeded: true, componentHashesChecked: true, maintenanceHostConfirmedByOperator: true,
      databaseConsistency: 'not-verified', restoreRehearsal: 'not-run', databaseRestored: false,
      originalMediaWritten: false, applicationRestarted: false, plaintextRetainedPrivately: true }
    controller.signal.throwIfAborted()
    await commitJSON(join(directory, 'recovery-ready.json'), result)
    controller.signal.throwIfAborted()
    output(result)
  } finally { identity.fill(0) }
}

try {
  const values = optionsFor()
  if (command === 'help') {
    process.stdout.write('备份取回：plan [--receipt 私有收据绝对路径]；download --receipt 收据 --apply；unpack --receipt 收据 --archive 密文绝对路径 --apply --trusted-maintenance-host。\n使用独立 .env.backup-recovery，不加载后台凭证。解密私钥放在可信维护电脑、项目目录之外；这些命令从不恢复生产库。\n')
  } else {
    const caps = recoveryLimits(), receipt = values.receipt ? await readUploadReceipt(values.receipt, caps) : null
    if (command === 'plan') output({ state: 'recovery-configuration-plan', enabled: process.env.BACKUP_RECOVERY_ENABLED === 'true',
      receipt: receipt ? { id: receipt.id, bytes: receipt.archive.bytes, parts: receipt.archive.parts.length, indexVersionPinned: true } : 'not-selected',
      missingConfiguration: ['BACKUP_RESTORE_S3_ENDPOINT', 'BACKUP_RESTORE_S3_BUCKET', 'BACKUP_RESTORE_S3_REGION',
        'BACKUP_RESTORE_S3_ACCESS_KEY', 'BACKUP_RESTORE_S3_SECRET_KEY'].filter(name => !process.env[name]),
      networkRequests: false, privateKeyRead: false, plaintextCreated: false, databaseRequests: false,
      steps: ['read-trusted-receipt', 'download-exact-versions', 'verify-ciphertext', 'decrypt-on-trusted-host',
        'inspect-and-extract-to-new-private-directory', 'hand-off-to-independent-restore-tools'], limits: caps })
    else {
      if (!values.apply || process.env.BACKUP_RECOVERY_ENABLED !== 'true')
        failBackup('实际取回/解密需要专用 BACKUP_RECOVERY_ENABLED=true 和 --apply；本次保持未执行。')
      if (!receipt) failBackup('--receipt 必须指向原样保留的可信上传收据。')
      if (command === 'download') {
        const config = recoveryStorage(receipt)
        await createWork('download', receipt, caps)
        await stage('downloading', { id: receipt.id })
        const archive = await downloadEncryptedBundle(directory, receipt, config, caps, controller.signal)
        output({ state: 'ciphertext-retrieved', id: receipt.id, directory, archive,
          receipt: join(directory, 'pinned-upload-receipt.json'), plaintextCreated: false, databaseRestored: false })
      } else await unpack(values, receipt, caps)
    }
  }
} catch (error) {
  if (directory) {
    // A failed final durability step must not leave a success record discoverable.
    for (const name of ['download-receipt.json', 'recovery-ready.json'])
      await rename(join(directory, name), join(directory, `${name}.unconfirmed`)).catch(() => {})
    await commitJSON(join(directory, 'recovery-failure.json'), { state: 'failed-or-interrupted',
      stoppedAt: new Date().toISOString(), databaseRestored: false, originalMediaWritten: false,
      note: '本目录为未完成的私有操作；没有执行数据库或原媒体恢复。' }).catch(() => {})
  }
  const known = error instanceof BackupOperatorError || error instanceof MediaOperatorError
  output({ state: 'not-completed', directory: directory || null,
    reason: known ? error.message : '取回或解包失败；不要使用未完成文件。',
    provider: known ? undefined : safeCloudError(error), databaseRestored: false })
  process.exitCode = 1
} finally { clearTimeout(timer); clearInterval(spaceTimer) }
