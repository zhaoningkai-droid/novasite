/** Operator tools only. This module never imports Payload or starts its schema push. */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

export class OperatorError extends Error {}
const controlCharacters = /[\x00-\x1f\x7f]/
const systemEnvironment = () => Object.fromEntries(
  ['PATH', 'HOME', 'SystemRoot', 'SYSTEMROOT', 'TMPDIR', 'TEMP', 'TMP', 'DOCKER_HOST', 'DOCKER_CONTEXT']
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
)

export function connectionIdentity(value, variableName) {
  let url
  try { url = new URL(value || '') } catch { throw new OperatorError(`${variableName} 未填写有效的 PostgreSQL 连接地址。`) }
  const decode = (text) => {
    try { return decodeURIComponent(text) } catch { throw new OperatorError(`${variableName} 的编码无效。`) }
  }
  const database = decode(url.pathname.slice(1))
  const user = decode(url.username)
  const password = decode(url.password)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !host || url.hash ||
      !/^[a-zA-Z0-9_][a-zA-Z0-9_.\-$]{0,62}$/.test(database) || !user || !password ||
      [host, user, password].some((item) => controlCharacters.test(item)) ||
      !/^[a-zA-Z0-9_.:-]+$/.test(host) || /[\s*]/.test(host + user)) {
    throw new OperatorError(`${variableName} 必须包含主机、独立数据库名、用户和密码；不接受多主机、通配名称或控制字符。`)
  }
  const keys = [...url.searchParams.keys()]
  if (keys.some((key) => !['sslmode', 'sslrootcert'].includes(key)) || new Set(keys).size !== keys.length) {
    throw new OperatorError(`${variableName} 仅支持 sslmode 和 sslrootcert 参数；其他连接选项需单独适配，不能静默忽略。`)
  }
  const port = url.port || '5432'
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new OperatorError(`${variableName} 端口无效。`)
  const sslmode = url.searchParams.get('sslmode') || 'verify-full'
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase())
  if (sslmode !== 'verify-full' && !(loopback && sslmode === 'disable')) {
    throw new OperatorError(`${variableName} 的远程连接必须使用 sslmode=verify-full；只有本机回环地址允许显式 sslmode=disable。`)
  }
  return { host, port, database, user, password, sslmode, ca: url.searchParams.get('sslrootcert') || '', loopback }
}

export function toolsConfiguration() {
  const runtime = process.env.POSTGRES_TOOLS_RUNTIME || 'docker'
  if (!['docker', 'local'].includes(runtime)) throw new OperatorError('POSTGRES_TOOLS_RUNTIME 只能是 docker 或 local。')
  const image = process.env.POSTGRES_TOOLS_IMAGE || ''
  if (runtime === 'docker' && !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new OperatorError('请填写经过选择的 PostgreSQL 工具镜像及 sha256 digest；工具不会自动拉取镜像。')
  }
  const binDirectory = process.env.POSTGRES_TOOLS_BIN_DIR || ''
  if (runtime === 'local' && binDirectory && !isAbsolute(binDirectory)) throw new OperatorError('POSTGRES_TOOLS_BIN_DIR 必须是绝对路径。')
  const minutes = Number(process.env.POSTGRES_TOOL_TIMEOUT_MINUTES || '60')
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw new OperatorError('POSTGRES_TOOL_TIMEOUT_MINUTES 必须是 1–180 的整数。')
  return { runtime, image, binDirectory, timeout: minutes * 60_000 }
}

async function runChild(command, args, { env, timeout, signal, logPath, outputLimit = 1_048_576 }) {
  if (signal?.aborted) throw new OperatorError('操作已中断；没有记录为成功。')
  let stdout = Buffer.alloc(0)
  let stderr = Buffer.alloc(0)
  let limitExceeded = false
  let interrupted = false
  let launchFailed = false
  const result = await new Promise((done) => {
    const child = spawn(command, args, { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let killTimer
    const terminate = () => {
      interrupted = true
      child.kill('SIGTERM')
      killTimer ||= setTimeout(() => child.kill('SIGKILL'), 15_000)
    }
    const timer = setTimeout(terminate, timeout)
    const aborted = () => terminate()
    signal?.addEventListener('abort', aborted, { once: true })
    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > outputLimit) { limitExceeded = true; terminate(); return }
      stdout = Buffer.concat([stdout, chunk])
    })
    child.stderr.on('data', (chunk) => {
      const remaining = 1_048_576 - stderr.length
      if (remaining > 0) stderr = Buffer.concat([stderr, chunk.subarray(0, remaining)])
    })
    child.once('error', () => { launchFailed = true })
    child.once('close', (code) => {
      clearTimeout(timer); clearTimeout(killTimer)
      signal?.removeEventListener('abort', aborted)
      done({ code })
    })
  })
  if (stderr.length && logPath) {
    await writeFile(logPath, stderr, { mode: 0o600, flag: 'wx' })
    await chmod(logPath, 0o600)
  }
  if (launchFailed) throw new OperatorError('工具无法启动；请按手册安装 Docker 或匹配版本的 PostgreSQL 客户端。')
  if (limitExceeded) throw new OperatorError('工具输出超过限制；已停止，不能记录为成功。')
  if (interrupted || signal?.aborted) throw new OperatorError('工具超时或被中断；请检查独立副本及私有日志，不能认定操作成功。')
  if (result.code !== 0) throw new OperatorError(`数据库工具退出码 ${result.code ?? '未知'}；详细信息仅保存在私有操作目录，不在终端输出原始错误。`)
  return stdout.toString('utf8')
}

const pgpassEscape = (value) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:')
const mountArgument = (source, destination, readonly) => {
  if (/[\r\n,]/.test(source)) throw new OperatorError('Docker 挂载路径不能包含换行或逗号。')
  return `type=bind,src=${source},dst=${destination}${readonly ? ',readonly' : ''}`
}

/** Private password file, fixed PostgreSQL environment, and a single private work directory. */
export async function createToolsSession({ connection, caVariable, workDirectory, readonly = false, signal }) {
  const config = toolsConfiguration()
  if (config.runtime === 'docker' && connection.loopback) throw new OperatorError('Docker 工具中的 localhost 是工具容器自身；本机数据库请选择 local 工具模式。')
  const credentials = await mkdtemp(join(tmpdir(), 'novasite-pg-credentials-'))
  await chmod(credentials, 0o700)
  let cleaned = false
  try {
    const localPassfile = join(credentials, 'pgpass')
    const values = [connection.host, connection.port, connection.database, connection.user, connection.password]
    await writeFile(localPassfile, `${values.map(pgpassEscape).join(':')}\n`, { mode: 0o600, flag: 'wx' })
    const pgEnvironment = {
      PGHOST: connection.host, PGPORT: connection.port, PGDATABASE: connection.database, PGUSER: connection.user,
      PGPASSFILE: config.runtime === 'docker' ? '/run/novasite-db/pgpass' : localPassfile,
      PGSSLMODE: connection.sslmode, PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'novasite-database-maintenance',
      PGSSLMINPROTOCOLVERSION: 'TLSv1.2', PGGSSENCMODE: 'disable', PGOPTIONS: '-c lock_timeout=15000',
    }
    const suppliedCA = process.env[caVariable] || ''
    if (suppliedCA && connection.ca && resolve(suppliedCA) !== resolve(connection.ca)) throw new OperatorError('连接地址与 CA 文件配置不一致；请保留一种明确的配置。')
    const caFile = suppliedCA || connection.ca
    if (connection.sslmode === 'verify-full') {
      if (!caFile || !isAbsolute(caFile)) throw new OperatorError(`${caVariable} 或 sslrootcert 必须指向云数据库的 CA 文件绝对路径。`)
      const info = await stat(caFile)
      if (!info.isFile() || info.size < 1 || info.size > 2_097_152) throw new OperatorError('数据库 CA 文件无效。')
      await copyFile(caFile, join(credentials, 'ca.pem'))
      await chmod(join(credentials, 'ca.pem'), 0o600)
      pgEnvironment.PGSSLROOTCERT = config.runtime === 'docker' ? '/run/novasite-db/ca.pem' : join(credentials, 'ca.pem')
    }
    const envFile = join(credentials, 'postgres.env')
    await writeFile(envFile, Object.entries(pgEnvironment).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' })
    const cleanup = async () => {
      if (cleaned) return
      cleaned = true
      await rm(credentials, { recursive: true, force: true })
    }
    const run = async (tool, args, { logName, timeout = config.timeout, outputLimit } = {}) => {
      if (!['psql', 'pg_dump', 'pg_restore'].includes(tool)) throw new OperatorError('不支持这个维护工具。')
      const logPath = logName ? join(workDirectory, logName) : undefined
      if (config.runtime === 'local') {
        return runChild(config.binDirectory ? join(config.binDirectory, tool) : tool, args, {
          env: { ...systemEnvironment(), ...pgEnvironment }, timeout, signal, logPath, outputLimit,
        })
      }
      const name = `novasite-db-tool-${randomUUID()}`
      const dockerArgs = [
        'run', '--rm', '--pull=never', '--name', name, '--read-only', '--cap-drop=ALL',
        '--security-opt=no-new-privileges', '--pids-limit=64', '--memory=512m', '--cpus=0.5',
        '--user', `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--env-file', envFile,
        '--mount', mountArgument(credentials, '/run/novasite-db', true),
        '--mount', mountArgument(workDirectory, '/backup', readonly), '--entrypoint', tool,
        config.image, ...args,
      ]
      try {
        return await runChild('docker', dockerArgs, { env: systemEnvironment(), timeout, signal, logPath, outputLimit })
      } finally {
        // A killed Docker client must not leave its private tool container running.
        // Only this randomly named container can be removed, never application services.
        await runChild('docker', ['rm', '--force', name], { env: systemEnvironment(), timeout: 20_000 }).catch(() => {})
      }
    }
    return {
      config, cleanup, run,
      path: (name) => config.runtime === 'docker' ? `/backup/${name}` : join(workDirectory, name),
    }
  } catch (error) {
    await rm(credentials, { recursive: true, force: true })
    throw error
  }
}

export const majorVersion = (versionNumber) => Math.floor(Number(versionNumber) / 10_000)
export const toolMajor = (version) => {
  const match = version.match(/PostgreSQL\)?\s+(\d+)\./)
  if (!match) throw new OperatorError('无法识别 PostgreSQL 工具版本。')
  return Number(match[1])
}

/** No business record values are read. Counts describe database objects, not customer rows. */
export async function databaseMetadata(session, logName) {
  const query = `SELECT json_build_object(
    'database', current_database(),
    'serverVersion', current_setting('server_version'),
    'serverVersionNumber', current_setting('server_version_num')::int,
    'schemas', (SELECT COALESCE(json_agg(nspname ORDER BY nspname), '[]'::json)
      FROM pg_namespace WHERE nspname <> 'information_schema' AND left(nspname, 3) <> 'pg_'),
    'userObjects', (
      SELECT count(*) FROM (
        SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
        UNION ALL SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
        UNION ALL SELECT t.oid FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname <> 'information_schema' AND left(n.nspname, 3) <> 'pg_'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
        UNION ALL SELECT oid FROM pg_namespace WHERE nspname <> 'public' AND nspname <> 'information_schema' AND left(nspname, 3) <> 'pg_'
        UNION ALL SELECT oid FROM pg_extension WHERE extname <> 'plpgsql'
        UNION ALL SELECT oid FROM pg_publication
        UNION ALL SELECT oid FROM pg_subscription
      ) AS objects
    )
  )::text;`
  const result = await session.run('psql', ['--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--command', query], { logName, timeout: 60_000 })
  let value
  try { value = JSON.parse(result.trim()) } catch { throw new OperatorError('数据库元数据返回格式无效；已停止。') }
  if (!value || typeof value.database !== 'string' || !Number.isInteger(value.serverVersionNumber) ||
      !Number.isInteger(value.userObjects) || !Array.isArray(value.schemas)) throw new OperatorError('数据库元数据不完整；已停止。')
  return value
}

export async function privateDirectory(directory) {
  const resolved = resolve(directory)
  await mkdir(resolved, { recursive: true, mode: 0o700 })
  const info = await stat(resolved)
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new OperatorError('备份目录必须为私有目录，请先设置 chmod 700。')
  return resolved
}

export async function writePrivateJSON(path, value) {
  const content = JSON.stringify(value, null, 2) + '\n'
  await writeFile(path, content, { mode: 0o600, flag: 'wx' })
  await chmod(path, 0o600)
  const handle = await open(path, 'r')
  try { await handle.sync() } finally { await handle.close() }
}
