#!/usr/bin/env node
/** Explicit/scheduled maintenance. No schema push, application restart or restore. */
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, statfs } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectionIdentity, OperatorError, toolsConfiguration } from './lib/platform-database-tools.mjs'
import { absolutePath, assertOutsidePublic, commitJSON, MediaOperatorError, privateDirectory, readJSON, safeCloudError, s3Configuration } from './lib/platform-media-tools.mjs'
import { BackupOperatorError, boundedInteger, encryptBundle, failBackup, recipientFile, remoteBackupConfiguration, runBackupTool, safeSystemEnvironment, uploadEncryptedBundle } from './lib/platform-backup-tools.mjs'

process.umask(0o077)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const format = 'novasite-scheduled-backup-v1'
const command = process.argv[2] || 'help'
const now = () => new Date().toISOString()
const enabled = () => process.env.BACKUP_AUTOMATION_ENABLED === 'true'
const print = value => process.stdout.write(JSON.stringify(value, null, 2) + '\n')
const directoryFor = () => absolutePath(process.env.BACKUP_JOB_DIRECTORY || join(root, '.private/scheduled-backups'), '备份作业目录')
const defined = key => Boolean(process.env[key] && !/(?:^|:\/\/|[:@/])(?:REPLACE_|YOUR_)/.test(process.env[key]))
const required = ['DATABASE_URL', 'BACKUP_AGE_RECIPIENT_FILE', 'BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET',
  'BACKUP_S3_REGION', 'BACKUP_S3_ACCESS_KEY', 'BACKUP_S3_SECRET_KEY', 'BACKUP_MEDIA_SOURCE_MODE']
const controller = new AbortController()
process.once('SIGINT', () => controller.abort())
process.once('SIGTERM', () => controller.abort())
let jobDirectory, job, lockDirectory, lockOwner

function plan() {
  const missing = required.filter(key => !defined(key))
  if (process.env.BACKUP_MEDIA_SOURCE_MODE === 'local' && !defined('BACKUP_LOCAL_MEDIA_DIRECTORY')) missing.push('BACKUP_LOCAL_MEDIA_DIRECTORY')
  if (process.env.BACKUP_MEDIA_SOURCE_MODE === 's3') {
    for (const key of ['ACCESS_KEY', 'SECRET_KEY']) if (!defined(`MEDIA_BACKUP_S3_${key}`)) missing.push(`MEDIA_BACKUP_S3_${key}`)
    for (const key of ['ENDPOINT', 'BUCKET', 'REGION']) if (!defined(`MEDIA_BACKUP_S3_${key}`) && !defined(`S3_${key}`)) missing.push(`MEDIA_BACKUP_S3_${key}`)
  }
  if ((process.env.POSTGRES_TOOLS_RUNTIME || 'docker') === 'docker' && !defined('POSTGRES_TOOLS_IMAGE')) missing.push('POSTGRES_TOOLS_IMAGE')
  try {
    const url = new URL(process.env.DATABASE_URL)
    if (url.searchParams.get('sslmode') !== 'disable' && !url.searchParams.get('sslrootcert') && !defined('DATABASE_CA_FILE')) missing.push('DATABASE_CA_FILE')
  } catch { /* DATABASE_URL is already listed when absent; plan does not validate a connection. */ }
  if (process.env.BACKUP_OFFSITE_CONFIRMED !== 'true') missing.push('BACKUP_OFFSITE_CONFIRMED')
  print({ state: enabled() ? 'configuration-plan' : 'disabled-configuration-plan', enabled: enabled(), directory: directoryFor(),
    missingConfiguration: missing, sourceMode: ['local', 's3'].includes(process.env.BACKUP_MEDIA_SOURCE_MODE) ? process.env.BACKUP_MEDIA_SOURCE_MODE : 'not-configured',
    encryption: 'age-public-key', scheduleInstalledByThisCommand: false, networkRequests: false, databaseRequests: false,
    databaseConsistency: 'not-verified', automaticallyDeletesBackups: false,
    steps: ['export-database', 'copy-media-without-stopping-service', 'encrypt-archive', 'upload-ciphertext-parts', 'read-exact-remote-versions', 'record-result'] })
}
async function updateJob(state, details = {}) {
  job = { ...job, ...details, state, updatedAt: now() }
  await commitJSON(join(jobDirectory, 'job.json'), job)
}
async function discoverComponent(directory, kind) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const path = join(directory, entry.name)
    try {
      const manifest = await readJSON(join(path, 'manifest.json'))
      if (kind === 'database' && manifest.format === 'novasite-database-backup-v1' && manifest.state === 'backup-created')
        found.push({ directory: path, relativeDirectory: `${kind}/${entry.name}`, id: manifest.id, bytes: manifest.archive?.bytes, sha256: manifest.archive?.sha256 })
      if (kind === 'media' && manifest.format === 'novasite-media-live-copy-v1' && manifest.state === 'live-file-copy-created' && manifest.fileInventoryUnchangedDuringCopy === true)
        found.push({ directory: path, relativeDirectory: `${kind}/${entry.name}`, id: manifest.id, files: manifest.totals?.files, bytes: manifest.totals?.bytes })
    } catch { /* A missing/incomplete manifest cannot become a successful component. */ }
  }
  if (found.length !== 1) failBackup('子任务没有生成唯一的成功归档，停止后续加密与上传。')
  return found[0]
}
function childEnvironment(kind) {
  const allowed = kind === 'database'
    ? /^(DATABASE_(URL|CA_FILE)|POSTGRES_TOOLS_(RUNTIME|IMAGE|BIN_DIR)|POSTGRES_TOOL_TIMEOUT_MINUTES|APP_IMAGE|TRANSLATION_WORKER_IMAGE|MIGRATOR_IMAGE)$/
    : /^(MEDIA_BACKUP_(S3_[A-Z_]+|MAX_[A-Z_]+|TIMEOUT_MINUTES)|S3_(BUCKET|ENDPOINT|REGION|FORCE_PATH_STYLE))$/
  return { ...safeSystemEnvironment(), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key))),
    // Online jobs never borrow an unrelated manually-entered pairing identifier.
    MEDIA_BACKUP_CHECKPOINT: 'UNSET' }
}
async function run() {
  if (!enabled()) failBackup('自动备份保持关闭；配置正式资源并安排启用后，再设置 BACKUP_AUTOMATION_ENABLED=true。')
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') failBackup('备份进程不能关闭远程 TLS 证书验证。')
  const connection = connectionIdentity(process.env.DATABASE_URL, 'DATABASE_URL')
  toolsConfiguration()
  const recipients = await recipientFile(process.env.BACKUP_AGE_RECIPIENT_FILE)
  const remote = remoteBackupConfiguration()
  const mode = process.env.BACKUP_MEDIA_SOURCE_MODE
  if (!['local', 's3'].includes(mode)) failBackup('BACKUP_MEDIA_SOURCE_MODE 必须为 local 或 s3。')
  const source = mode === 'local' ? absolutePath(process.env.BACKUP_LOCAL_MEDIA_DIRECTORY, '本机媒体源')
    : s3Configuration('MEDIA_BACKUP_S3_', { source: true })
  if (mode === 's3' && remote.bucket === source.bucket) failBackup('来源文件桶和备份桶不能相同。')
  const maximum = boundedInteger('BACKUP_MAX_CIPHERTEXT_BYTES', 512 * 1024 ** 3, 1024 * 1024, 2 * 1024 ** 4)
  const timeout = boundedInteger('BACKUP_JOB_TIMEOUT_MINUTES', 240, 5, 1440) * 60000
  const requested = directoryFor()
  assertOutsidePublic(root, requested)
  const directory = await privateDirectory(requested)
  assertOutsidePublic(root, directory)
  const minimumFree = BigInt(boundedInteger('BACKUP_MIN_FREE_BYTES', 20 * 1024 ** 3, 1024 ** 3, 1024 ** 4))
  const requireSpace = async () => {
    const space = await statfs(directory, { bigint: true })
    if (space.bavail * space.bsize < minimumFree) failBackup('备份卷剩余空间低于保留水位，停止备份；不要删除网站原文件。')
  }
  await requireSpace()
  lockDirectory = join(directory, '.backup-lock')
  try { await mkdir(lockDirectory, { mode: 0o700 }) }
  catch (error) { if (error.code === 'EEXIST') failBackup('已有备份任务或残留锁；请查看状态，不启动第二个任务。'); throw error }
  lockOwner = randomUUID()
  await commitJSON(join(lockDirectory, 'owner.json'), { id: lockOwner, pid: process.pid, startedAt: now() })
  const timer = setTimeout(() => controller.abort(), timeout)
  let spaceFailure
  const spaceTimer = setInterval(() => {
    requireSpace().catch(error => { spaceFailure = error; controller.abort() })
  }, 10000)
  try {
    jobDirectory = await mkdtemp(join(directory, `backup-${now().replace(/[:.]/g, '-')}-`))
    job = { format, id: randomUUID(), state: 'started', startedAt: now(), updatedAt: now(),
      sourceMode: mode, lockOwner, consistency: 'online-components-not-atomic', maintenanceWindowConfirmed: false,
      databaseConsistency: 'not-verified', restoreRehearsal: 'not-run', automaticDeletion: false }
    await commitJSON(join(jobDirectory, 'job.json'), job)
    const databaseDirectory = await privateDirectory(join(jobDirectory, 'database'))
    const mediaDirectory = await privateDirectory(join(jobDirectory, 'media'))
    await updateJob('exporting-database')
    await runBackupTool(join(root, 'scripts/platform-database.mjs'), ['backup', '--directory', databaseDirectory,
      '--confirm-database', connection.database, '--label', 'scheduled-online'], childEnvironment('database'), jobDirectory, 'database', controller.signal)
    const database = await discoverComponent(databaseDirectory, 'database')
    await updateJob('copying-media', { database })
    const args = mode === 'local' ? ['snapshot-local', '--source', source] : ['snapshot-s3', '--confirm-bucket', source.bucket]
    await runBackupTool(join(root, 'scripts/platform-media.mjs'), [...args, '--directory', mediaDirectory, '--label', 'scheduled-online'],
      childEnvironment('media'), jobDirectory, 'media', controller.signal)
    const media = await discoverComponent(mediaDirectory, 'media')
    await commitJSON(join(jobDirectory, 'bundle.json'), { format, id: job.id, startedAt: job.startedAt, database, media,
      maintenanceWindowConfirmed: false, databaseConsistency: 'not-verified', restoreRehearsal: 'not-run',
      layout: 'database-and-media-component-subdirectories', coverage: 'business-database-and-current-media-not-environment-secrets' })
    await updateJob('encrypting', { media })
    const encrypted = await encryptBundle(jobDirectory, recipients, maximum, controller.signal)
    await updateJob('uploading', { encrypted })
    const saved = await uploadEncryptedBundle(jobDirectory, encrypted, job.id, remote, controller.signal)
    await updateJob('remote-verified', { remote: saved, completedAt: now() })
    print({ state: job.state, id: job.id, directory: jobDirectory, ciphertextBytes: encrypted.bytes,
      remoteParts: saved.parts, databaseConsistency: 'not-verified', restoreRehearsal: 'not-run',
      originalFilesDeleted: false, servicesStopped: false })
  } catch (error) { throw spaceFailure || error }
  finally { clearTimeout(timer); clearInterval(spaceTimer) }
}

async function recordedJobs() {
  const location = directoryFor()
  assertOutsidePublic(root, location)
  try {
    const info = await lstat(location)
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) failBackup('作业目录必须是权限 700 的普通私有目录。')
  } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  const actual = await realpath(location)
  assertOutsidePublic(root, actual)
  const entries = await readdir(actual, { withFileTypes: true })
  if (entries.length > 10000) failBackup('备份作业数量超过状态读取上限，需按维护手册整理。')
  const jobs = []
  for (const entry of entries) if (entry.name.startsWith('backup-') && entry.isDirectory() && !entry.isSymbolicLink()) {
    const path = join(actual, entry.name)
    try {
      const data = await readJSON(join(path, 'job.json'))
      if (data.format !== format || !Number.isFinite(Date.parse(data.startedAt))) continue
      if (data.state === 'remote-verified') {
        const receipt = await readJSON(join(path, 'upload-receipt.json'))
        if (receipt.state !== 'remote-verified' || receipt.id !== data.id || !Number.isFinite(Date.parse(data.completedAt))) continue
      }
      jobs.push({ ...data, directory: path })
    } catch { /* Unreadable records are not counted as successes. */ }
  }
  return jobs.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}
async function status() {
  const jobs = await recordedJobs(), latest = jobs[0]
  const success = jobs.find(job => job.state === 'remote-verified')
  const staleHours = boundedInteger('BACKUP_STALE_HOURS', 36, 1, 168)
  const stale = !success || Date.now() - Date.parse(success.completedAt) > staleHours * 3600000
  const healthy = enabled() && !stale && latest?.state === 'remote-verified'
  let running = false
  if (latest && ['started', 'exporting-database', 'copying-media', 'encrypting', 'uploading'].includes(latest.state)) {
    try {
      const owner = await readJSON(join(directoryFor(), '.backup-lock/owner.json'))
      if (owner.id === latest.lockOwner && Number.isInteger(owner.pid) && owner.pid > 0) { process.kill(owner.pid, 0); running = true }
    } catch { /* A record without an identifiable live process is not called running. */ }
  }
  print({ state: !enabled() ? 'disabled' : healthy ? 'recorded-healthy' : running ? 'running' : 'attention-required', enabled: enabled(),
    latest: latest ? { id: latest.id, state: latest.state, startedAt: latest.startedAt, updatedAt: latest.updatedAt } : null,
    lastRecordedRemoteSuccessAt: success?.completedAt || null, stale, staleHours,
    cloudRechecked: false, restoreRehearsal: 'not-run' })
  if (!healthy && !(enabled() && running && !stale)) process.exitCode = 2
}
async function retentionPlan() {
  const jobs = (await recordedJobs()).filter(job => job.state === 'remote-verified')
  const daily = boundedInteger('BACKUP_KEEP_DAILY', 7, 1, 90), weekly = boundedInteger('BACKUP_KEEP_WEEKLY', 4, 1, 52)
  const monthly = boundedInteger('BACKUP_KEEP_MONTHLY', 6, 1, 60)
  const kept = new Set(), days = new Set(), weeks = new Set(), months = new Set()
  for (const job of jobs) {
    const date = new Date(job.completedAt), day = date.toISOString().slice(0, 10), month = day.slice(0, 7)
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
    const week = date.toISOString().slice(0, 10)
    if ((!days.has(day) && days.size < daily) || (!weeks.has(week) && weeks.size < weekly) || (!months.has(month) && months.size < monthly)) kept.add(job.id)
    days.add(day); weeks.add(week); months.add(month)
  }
  if (jobs[0]) kept.add(jobs[0].id)
  print({ state: 'retention-plan-only', retention: { daily, weekly, monthly }, keep: jobs.filter(job => kept.has(job.id)).map(job => ({ id: job.id, directory: job.directory })),
    reviewCandidates: jobs.filter(job => !kept.has(job.id)).map(job => ({ id: job.id, directory: job.directory })),
    unfinishedJobsExcluded: true, deletedFiles: 0, deletedCloudObjects: 0, cloudRechecked: false })
}

try {
  if (process.argv.length > 3) failBackup('该入口不接收额外参数或明文凭证。')
  if (command === 'plan') plan()
  else if (command === 'run') await run()
  else if (command === 'status') await status()
  else if (command === 'retention-plan') await retentionPlan()
  else if (command === 'help') print({ commands: ['plan', 'run', 'status', 'retention-plan'],
    runtimeEnabledByDefault: false, scheduleInstalledAutomatically: false,
    note: '详见 docs/v1/AUTOMATIC-BACKUP-HANDBOOK-20261001.md；不自动迁移、停止服务、恢复或删除旧备份。' })
  else failBackup('未知备份命令，请先查看 help。')
} catch (error) {
  if (jobDirectory && job) {
    try { await updateJob('job-failed', { lastCompletedState: job.state, stoppedAt: now(), error: safeCloudError(error) }) }
    catch { /* A failed job never acquires a successful manifest by fallback. */ }
  }
  process.stderr.write((error instanceof BackupOperatorError || error instanceof OperatorError || error instanceof MediaOperatorError
    ? error.message : '备份作业未完成；请保留私有作业目录，不删除文件或绕过校验。') + '\n')
  process.exitCode = 1
} finally {
  // Only release the lock created by this invocation; never remove another job's lock.
  if (lockDirectory && lockOwner) {
    try { if ((await readJSON(join(lockDirectory, 'owner.json'))).id === lockOwner) await rm(lockDirectory, { recursive: true }) }
    catch { /* Unknown lock ownership requires an operator inspection. */ }
  }
}
