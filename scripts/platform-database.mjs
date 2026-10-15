/** Source-only operator entry point. Nothing runs until an operator invokes a command. */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OperatorError, connectionIdentity, createToolsSession, databaseMetadata,
  majorVersion, privateDirectory, toolMajor, writePrivateJSON,
} from './lib/platform-database-tools.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const command = process.argv[2] || 'help'
const abort = new AbortController()
process.once('SIGINT', () => abort.abort())
process.once('SIGTERM', () => abort.abort())
process.umask(0o077)

function optionsFor(allowed) {
  const values = {}
  const switches = new Set(['apply', 'isolated-target-approved'])
  const argumentsList = process.argv.slice(3)
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index]
    const key = argument.startsWith('--') ? argument.slice(2) : ''
    if (!allowed.includes(key) || key in values) throw new OperatorError('出现不支持、重复或位置不正确的参数；请使用 help 查看用法。')
    if (switches.has(key)) values[key] = true
    else {
      const next = argumentsList[++index]
      if (!next || next.startsWith('--')) throw new OperatorError('有参数缺少值；请使用 help 查看用法。')
      values[key] = next
    }
  }
  return values
}

function backupRoot(options) {
  const location = options.directory || process.env.PLATFORM_BACKUP_DIRECTORY || join(root, 'deploy', 'backups')
  if (!isAbsolute(location)) throw new OperatorError('PLATFORM_BACKUP_DIRECTORY 或 --directory 必须为绝对路径。')
  return resolve(location)
}

function assertOutsidePublic(directory) {
  const publicRoot = join(root, 'public')
  const below = relative(publicRoot, directory)
  if (!below || (!below.startsWith(`..${sep}`) && below !== '..' && !isAbsolute(below))) {
    throw new OperatorError('数据库备份不能放在网站 public 目录内。')
  }
}

async function prepareBackupRoot(options) {
  assertOutsidePublic(backupRoot(options))
  const directory = await privateDirectory(backupRoot(options))
  const canonical = await realpath(directory)
  assertOutsidePublic(canonical)
  return canonical
}

const timestamp = () => new Date().toISOString().replace(/[-:.]/g, '')
const digest = async (path) => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
async function checkArchiveHeader(path) {
  const handle = await open(path, 'r')
  try {
    const header = Buffer.alloc(5)
    const { bytesRead } = await handle.read(header, 0, 5, 0)
    if (bytesRead !== 5 || header.toString('ascii') !== 'PGDMP') throw new OperatorError('不是本工具使用的 PostgreSQL 自定义格式备份。')
  } finally { await handle.close() }
}
async function syncFile(path) {
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}
const print = (message) => process.stdout.write(`${message}\n`)
const labelFor = (value = 'manual') => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(value)) throw new OperatorError('--label 只能用 1–48 个字母、数字、下划线或连字符。')
  return value
}
const mediaCheckpoint = (value) => {
  if (!value || value === 'UNSET') return null
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(value)) throw new OperatorError('媒体快照标识只能使用简短作业编号；不要填写密钥、访客内容或 URL。')
  return value
}
function assertMetadataIdentity(metadata, connection) {
  if (metadata.database !== connection.database) throw new OperatorError('实际连接的数据库与指定数据库不一致；已停止。')
}

async function backup() {
  const options = optionsFor(['confirm-database', 'label', 'directory', 'media-checkpoint'])
  const connection = connectionIdentity(process.env.DATABASE_URL, 'DATABASE_URL')
  if (options['confirm-database'] !== connection.database) throw new OperatorError('备份需用 --confirm-database 写出实际源数据库名；不会从命令参数接收密码。')
  const label = labelFor(options.label)
  const media = mediaCheckpoint(options['media-checkpoint'] || process.env.MEDIA_BACKUP_CHECKPOINT)
  const directory = await mkdtemp(join(await prepareBackupRoot(options), `${timestamp()}-${label}-`))
  await chmod(directory, 0o700)
  const startedAt = new Date().toISOString()
  let session
  try {
    session = await createToolsSession({ connection, caVariable: 'DATABASE_CA_FILE', workDirectory: directory, signal: abort.signal })
    const version = (await session.run('pg_dump', ['--version'], { logName: '01-tool-version.log', timeout: 30_000 })).trim()
    const source = await databaseMetadata(session, '02-source-metadata.log')
    assertMetadataIdentity(source, connection)
    if (toolMajor(version) !== majorVersion(source.serverVersionNumber)) throw new OperatorError('请使用与源数据库同主版本的 PostgreSQL 工具；本入口不执行跨版本迁移。')
    print('正在备份完整数据库，未选择或排除任何业务 schema。')
    await session.run('pg_dump', [
      '--no-password', '--format=custom', '--compress=6', '--lock-wait-timeout=15000',
      '--file', session.path('database.dump.partial'),
    ], { logName: '03-dump.log' })
    const partial = join(directory, 'database.dump.partial')
    await chmod(partial, 0o600)
    await checkArchiveHeader(partial)
    // Listing confirms archive readability only; it is not a restore rehearsal.
    await session.run('pg_restore', ['--list', session.path('database.dump.partial')], { logName: '04-archive-list.log', outputLimit: 8_388_608 })
    await syncFile(partial)
    const sha256 = await digest(partial)
    const bytes = (await stat(partial)).size
    const completedAt = new Date().toISOString()
    await rename(partial, join(directory, 'database.dump'))
    const manifest = {
      format: 'novasite-database-backup-v1', state: 'backup-created', id: randomUUID(), label,
      startedAt, completedAt,
      archive: { file: 'database.dump', format: 'custom', bytes, sha256 },
      source: { host: connection.host, port: connection.port, database: source.database, serverVersion: source.serverVersion, serverVersionNumber: source.serverVersionNumber, schemas: source.schemas },
      tool: { runtime: session.config.runtime, image: session.config.runtime === 'docker' ? session.config.image : null, version, major: toolMajor(version) },
      release: { app: process.env.APP_IMAGE || null, worker: process.env.TRANSLATION_WORKER_IMAGE || null, migrator: process.env.MIGRATOR_IMAGE || null },
      coverage: { database: 'all-non-system-schemas', rolesAndTablespaces: 'not-exported', objectStorageFiles: 'not-in-database-archive' },
      media: { checkpoint: media, verified: false },
      restoreRehearsal: 'not-run',
    }
    await writePrivateJSON(join(directory, 'manifest.json.partial'), manifest)
    await syncFile(join(directory, 'manifest.json.partial'))
    await rename(join(directory, 'manifest.json.partial'), join(directory, 'manifest.json'))
    await syncFile(directory)
    await syncFile(dirname(directory))
    print(`数据库归档已创建：${directory}`)
    print(`大小 ${bytes} 字节；SHA-256 ${sha256}`)
    print('这不是恢复验收。媒体文件和云数据库自动备份仍需单独保存。')
  } catch (error) {
    // An interrupted durability step must not leave a success manifest discoverable.
    await rename(join(directory, 'manifest.json'), join(directory, 'manifest.json.unconfirmed')).catch(() => {})
    await writePrivateJSON(join(directory, 'backup-failure.json'), {
      state: 'backup-not-completed', startedAt, stoppedAt: new Date().toISOString(),
      note: '没有生成成功清单。partial 文件不能作为已完成备份使用。',
    }).catch(() => {})
    print(`未完成的操作目录：${directory}`)
    throw error
  } finally { await session?.cleanup() }
}

async function regularPrivateFile(path) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new OperatorError('备份文件必须是普通私有文件，权限为 600；不接受符号链接。')
  return info
}
async function readManifest(directory) {
  const canonical = await realpath(resolve(directory))
  assertOutsidePublic(canonical)
  const directoryInfo = await stat(canonical)
  if (!directoryInfo.isDirectory() || (directoryInfo.mode & 0o077) !== 0) throw new OperatorError('备份目录必须为私有目录，权限为 700。')
  const manifestPath = join(canonical, 'manifest.json')
  const info = await regularPrivateFile(manifestPath)
  if (info.size > 65_536) throw new OperatorError('备份清单过大；已停止。')
  let manifest
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) } catch { throw new OperatorError('备份清单无法读取；已停止。') }
  if (manifest.format !== 'novasite-database-backup-v1' || manifest.state !== 'backup-created' ||
      manifest.archive?.file !== 'database.dump' || manifest.archive.format !== 'custom' ||
      !Number.isSafeInteger(manifest.archive.bytes) || manifest.archive.bytes < 5 ||
      !/^[a-f0-9]{64}$/.test(manifest.archive.sha256 || '') ||
      !Number.isInteger(manifest.source?.serverVersionNumber) ||
      !Number.isInteger(manifest.tool?.major) ||
      manifest.tool.major !== majorVersion(manifest.source.serverVersionNumber) ||
      manifest.coverage?.database !== 'all-non-system-schemas' ||
      !/^[a-zA-Z0-9_][a-zA-Z0-9_.\-$]{0,62}$/.test(manifest.source.database || '') ||
      !Number.isFinite(Date.parse(manifest.completedAt))) throw new OperatorError('清单不是完整的本工具数据库备份；不能继续恢复。')
  return { directory: canonical, manifest }
}

async function list() {
  const options = optionsFor(['directory'])
  const directory = backupRoot(options)
  assertOutsidePublic(directory)
  try {
    const info = await stat(directory)
    if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new OperatorError('备份目录必须为私有目录，权限为 700。')
  } catch (error) {
    if (error?.code === 'ENOENT') { print('还没有这个目录下的数据库归档。'); return }
    throw error
  }
  const entries = await readdir(directory, { withFileTypes: true })
  let total = 0
  for (const entry of entries.sort((a, b) => b.name.localeCompare(a.name))) {
    if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]+$/.test(entry.name)) continue
    try {
      const { manifest } = await readManifest(join(directory, entry.name))
      print(`${entry.name} | ${manifest.completedAt} | ${manifest.archive.bytes} 字节 | 未在此命令核验文件或演练恢复`)
      total++
    } catch { /* Ignore incomplete operations and recovery reports; never call them backups. */ }
  }
  if (!total) print('没有带成功清单的数据库归档；未完成或格式未知的目录不计入。')
  print('该列表只读取清单，不连接数据库，不证明可以恢复。')
}

function targetConnection(manifest, options) {
  const target = connectionIdentity(process.env.RESTORE_DATABASE_URL, 'RESTORE_DATABASE_URL')
  if (!/^novasite_restore_[a-z0-9_]{1,40}$/.test(target.database)) throw new OperatorError('副本库名必须为 novasite_restore_ 加小写字母、数字或下划线；本工具不提供原库覆盖恢复。')
  const current = connectionIdentity(process.env.DATABASE_URL, 'DATABASE_URL')
  if (target.database === current.database || target.database === manifest.source.database) throw new OperatorError('恢复库不能与当前应用库或备份源库同名，即使位于另一台机器。')
  if (options['target-database'] !== target.database) throw new OperatorError('请用 --target-database 写出准备恢复的独立副本库名。')
  return target
}

async function restore() {
  const allowed = ['backup', 'target-database', 'directory']
  if (command === 'restore-copy') allowed.push('apply', 'isolated-target-approved')
  const options = optionsFor(allowed)
  if (!options.backup || !isAbsolute(options.backup)) throw new OperatorError('--backup 必须指向包含 manifest.json 和 database.dump 的备份目录绝对路径。')
  const { directory: archiveDirectory, manifest } = await readManifest(options.backup)
  const archivePath = join(archiveDirectory, 'database.dump')
  const file = await regularPrivateFile(archivePath)
  if (file.size !== manifest.archive.bytes) throw new OperatorError('备份文件大小与清单不一致；已停止。')
  const target = targetConnection(manifest, options)
  print(`源库：${manifest.source.database}；计划副本库：${target.database}`)
  print(`备份时间：${manifest.completedAt}；文件：${archivePath}`)
  print(`计划完整恢复数据库，媒体快照标识：${manifest.media?.checkpoint || '尚未填写'}`)
  if (!options.apply) {
    print('只显示计划：未连接数据库，未校验归档内容，也没有恢复任何数据。')
    print('需先创建空副本、停用副本翻译和邮件、隔离公网并获得恢复确认，才可使用 restore-copy --apply --isolated-target-approved。')
    return
  }
  if (!options['isolated-target-approved']) throw new OperatorError('实际恢复需要 --isolated-target-approved，确认仅向空副本写入，且副本应用/翻译/邮件没有连接此库。')
  const directory = await mkdtemp(join(await prepareBackupRoot(options), `${timestamp()}-restore-`))
  await chmod(directory, 0o700)
  const startedAt = new Date().toISOString()
  let session
  let restored = false
  let copied = false
  try {
    // Hash an isolated input copy so edits to the original archive cannot race restore.
    await copyFile(archivePath, join(directory, 'restore-input.dump'))
    copied = true
    await chmod(join(directory, 'restore-input.dump'), 0o600)
    if (await digest(join(directory, 'restore-input.dump')) !== manifest.archive.sha256) throw new OperatorError('备份 SHA-256 与清单不一致；未连接目标数据库。')
    await checkArchiveHeader(join(directory, 'restore-input.dump'))
    session = await createToolsSession({ connection: target, caVariable: 'RESTORE_DATABASE_CA_FILE', workDirectory: directory, readonly: true, signal: abort.signal })
    const version = (await session.run('pg_restore', ['--version'], { logName: '01-tool-version.log', timeout: 30_000 })).trim()
    if (toolMajor(version) !== manifest.tool.major) throw new OperatorError('恢复工具主版本与归档记录不一致；请使用对应版本。')
    await session.run('pg_restore', ['--list', session.path('restore-input.dump')], { logName: '02-archive-list.log', outputLimit: 8_388_608 })
    const metadata = await databaseMetadata(session, '03-target-metadata.log')
    assertMetadataIdentity(metadata, target)
    if (majorVersion(metadata.serverVersionNumber) !== majorVersion(manifest.source.serverVersionNumber)) throw new OperatorError('副本库与源库主版本必须相同；跨版本升级需要另外演练。')
    if (metadata.userObjects !== 0) throw new OperatorError('副本库不是空库；不会删除已有表、覆盖数据或自动清理。请准备另一个空副本。')
    await writePrivateJSON(join(directory, 'restore-started.json'), {
      state: 'started', startedAt, targetDatabase: target.database, archiveSHA256: manifest.archive.sha256,
      note: '此记录不是成功证明；没有连接应用或工作进程。',
    })
    print('空副本条件满足，正在恢复；没有删除或清空源库。')
    await session.run('pg_restore', [
      '--no-password', '--dbname', target.database, '--exit-on-error', '--single-transaction',
      '--no-owner', '--no-privileges', '--no-tablespaces', session.path('restore-input.dump'),
    ], { logName: '04-restore.log' })
    restored = true
    await writePrivateJSON(join(directory, 'restore-report.json'), {
      format: 'novasite-database-restore-report-v1', state: 'restore-command-completed', startedAt,
      completedAt: new Date().toISOString(), targetDatabase: target.database,
      sourceDatabase: manifest.source.database, archiveSHA256: manifest.archive.sha256,
      targetServerVersion: metadata.serverVersion, toolVersion: version,
      ownership: 'restoring-user', accessGrants: 'not-restored',
      mediaCheckpoint: manifest.media?.checkpoint || null, mediaRestored: false,
      applicationAcceptance: 'not-run', workersStarted: false, productionCutover: false,
    })
    print(`副本数据库恢复命令完成。私有报告目录：${directory}`)
    print('尚未恢复媒体或验收建站流程；没有切换生产应用、启动翻译/邮件或公开副本。')
  } catch (error) {
    await writePrivateJSON(join(directory, 'restore-failure.json'), {
      state: restored ? 'command-completed-report-not-completed' : 'failed-or-interrupted', startedAt,
      stoppedAt: new Date().toISOString(), targetDatabase: target.database,
      note: '中断不能作为事务结果证明；只检查独立副本，不盲目重复恢复。',
    }).catch(() => {})
    print(`恢复操作未完整收尾。私有操作目录：${directory}`)
    throw error
  } finally {
    await session?.cleanup()
    if (copied) await rm(join(directory, 'restore-input.dump'), { force: true })
  }
}

function help() {
  print('备份：backup --confirm-database 数据库名 [--label before-upgrade] [--media-checkpoint 快照编号]')
  print('清单：list [--directory 备份目录绝对路径]')
  print('计划：restore-plan --backup 备份目录绝对路径 --target-database novasite_restore_副本名')
  print('副本：restore-copy --backup 备份目录绝对路径 --target-database novasite_restore_副本名 --apply --isolated-target-approved')
  print('可选 --directory 设置输出目录。连接凭证只从环境配置读取，命令参数不接收密码或连接地址。')
  print('没有原库覆盖、删库、自动迁移、生产切换、自动删旧备份或恢复后启动工作进程的命令。')
}

try {
  if (command === 'backup') await backup()
  else if (command === 'list') await list()
  else if (command === 'restore-plan' || command === 'restore-copy') await restore()
  else if (command === 'help') help()
  else throw new OperatorError('不支持的命令，请使用 help 查看用法。')
} catch (error) {
  process.stderr.write(`${error instanceof OperatorError ? error.message : '维护操作无法完成；请检查私有配置、文件权限、磁盘空间和操作日志。原始错误未公开输出。'}\n`)
  process.exitCode = abort.signal.aborted ? 130 : 1
}
