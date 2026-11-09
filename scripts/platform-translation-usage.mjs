/** Read-only operator report. Never imports Payload, calls AI, or installs schema. */
import { mkdtemp, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OperatorError, connectionIdentity, createToolsSession, privateDirectory, writePrivateJSON,
} from './lib/platform-database-tools.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const abort = new AbortController()
process.once('SIGINT', () => abort.abort())
process.once('SIGTERM', () => abort.abort())
process.umask(0o077)

function options() {
  const result = {}
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    const key = args[index].startsWith('--') ? args[index].slice(2) : ''
    if (!['company', 'directory'].includes(key) || key in result) throw new OperatorError('只支持 --company 公司数字编号、--directory 私有绝对目录；参数不能重复。')
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new OperatorError('参数缺少值。')
    result[key] = value
  }
  if (result.company && (!/^[1-9]\d*$/.test(result.company) || Number(result.company) > 2_147_483_647)) throw new OperatorError('公司编号必须是有效正整数。')
  return result
}

function outsidePublic(directory) {
  const location = relative(join(root, 'public'), directory)
  if (!location || (!isAbsolute(location) && location !== '..' && !location.startsWith(`..${sep}`))) throw new OperatorError('用量报告不能放在网站 public 目录内。')
}

const psqlArguments = (query) => [
  '--no-psqlrc', '--no-password', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
  '--command', `BEGIN READ ONLY; SET LOCAL statement_timeout='45s'; ${query} COMMIT;`,
]
async function readJSON(session, query, logName) {
  const output = await session.run('psql', psqlArguments(query), { logName, timeout: 60_000, outputLimit: 2_097_152 })
  try { return JSON.parse(output.trim()) } catch { throw new OperatorError('用量报告返回格式不完整，未记录为成功。') }
}

const statsSQL = `json_build_object(
  'requests', count(*)::text,
  'chargedUnits', COALESCE(sum(charged_units),0)::text,
  'knownRequests', count(*) FILTER (WHERE status='known')::text,
  'reservedRequests', count(*) FILTER (WHERE status='reserved')::text,
  'unknownRequests', count(*) FILTER (WHERE status='unknown')::text,
  'knownInputTokens', COALESCE(sum(input_tokens) FILTER (WHERE status='known'),0)::text,
  'knownOutputTokens', COALESCE(sum(output_tokens) FILTER (WHERE status='known'),0)::text,
  'knownCacheHitInputTokens', COALESCE(sum(cache_hit_input_tokens),0)::text,
  'knownCacheMissInputTokens', COALESCE(sum(cache_miss_input_tokens),0)::text,
  'cacheUnknownRequests', count(*) FILTER (WHERE status='known' AND cache_hit_input_tokens IS NULL)::text,
  'reservedOrUnknownUnits', COALESCE(sum(charged_units) FILTER (WHERE status<>'known'),0)::text,
  'overReservationRequests', count(*) FILTER (WHERE status='known' AND charged_units>reserved_units)::text,
  'firstRequestAt', min(created_at), 'lastRequestAt', max(created_at)
)`

function reportQuery(company) {
  // company is a validated positive integer, never user-supplied SQL or a name.
  const companyFilter = company ? `WHERE tenant_id=${Number(company)}` : ''
  return `WITH clock AS (
    SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date AS day,
      date_trunc('month',now() AT TIME ZONE 'Asia/Shanghai')::date AS month
  ), period AS (
    SELECT usage.* FROM platform_jobs.translation_usage AS usage, clock
    WHERE usage.accounting_month=clock.month
  ), companies AS (
    SELECT tenant_id, ${statsSQL} AS monthly,
      COALESCE(sum(charged_units) FILTER (WHERE accounting_day=(SELECT day FROM clock)),0)::text AS daily_units
    FROM period ${companyFilter} GROUP BY tenant_id
  ), models AS (
    SELECT model, ${statsSQL} AS monthly FROM period GROUP BY model
  ) SELECT json_build_object(
    'database',current_database(), 'capturedAt',now(), 'timeZone','Asia/Shanghai',
    'accountingDay',(SELECT day FROM clock), 'accountingMonth',(SELECT month FROM clock),
    'globalMonthly',(SELECT ${statsSQL} FROM period),
    'globalDaily',(SELECT ${statsSQL} FROM period WHERE accounting_day=(SELECT day FROM clock)),
    'companies',COALESCE((SELECT json_agg(json_build_object('companyID',tenant_id,'monthly',monthly,'dailyUnits',daily_units) ORDER BY tenant_id) FROM companies),'[]'::json),
    'models',COALESCE((SELECT json_agg(json_build_object('model',model,'monthly',monthly) ORDER BY model) FROM models),'[]'::json)
  )::text;`
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--help') {
    process.stdout.write('用法：bash deploy/platform.sh translation-usage [--company 公司数字编号] [--directory 私有绝对目录]\n只读取内部用量汇总，不调用 AI、不写数据库、不安装新表。\n')
    return
  }
  const input = options()
  const location = input.directory || process.env.PLATFORM_OPERATIONS_DIRECTORY || join(root, 'deploy', 'operations')
  if (!isAbsolute(location)) throw new OperatorError('报告目录必须是绝对路径。')
  outsidePublic(resolve(location))
  const directory = await realpath(await privateDirectory(location))
  outsidePublic(directory)
  const work = await mkdtemp(join(directory, 'translation-usage-'))
  const separateConnection = Boolean(process.env.TRANSLATION_USAGE_DATABASE_URL)
  const connection = connectionIdentity(separateConnection ? process.env.TRANSLATION_USAGE_DATABASE_URL : process.env.DATABASE_URL, separateConnection ? 'TRANSLATION_USAGE_DATABASE_URL' : 'DATABASE_URL')
  const session = await createToolsSession({ connection, caVariable: separateConnection ? 'TRANSLATION_USAGE_DATABASE_CA_FILE' : 'DATABASE_CA_FILE', workDirectory: work, readonly: true, signal: abort.signal })
  try {
    const availability = await readJSON(session, "SELECT json_build_object('database',current_database(),'installed',to_regclass('platform_jobs.translation_usage') IS NOT NULL)::text;", 'availability.stderr.private.log')
    if (availability.database !== connection.database) throw new OperatorError('连接的数据库与配置不一致，已停止。')
    if (availability.installed !== true) throw new OperatorError('翻译用量表尚未安装；不会自动安装，也不会把未记录用量报告为零。')
    const totals = await readJSON(session, reportQuery(input.company), 'usage.stderr.private.log')
    if (totals.database !== connection.database || totals.timeZone !== 'Asia/Shanghai' || !Array.isArray(totals.companies) || !Array.isArray(totals.models)) throw new OperatorError('用量汇总不完整，未记录为成功。')
    const report = {
      reportVersion: 2, ...totals, quotaEnforced: false,
      selectedCompany: input.company ? Number(input.company) : null,
      coverage: 'Only requests recorded by this platform ledger. Earlier requests, other applications and provider invoice totals are not included. Missing provider usage remains an estimate, never zero.',
      runtimeAttested: false, providerInvoiceReconciled: false,
    }
    const reportPath = join(work, 'usage.json')
    await writePrivateJSON(reportPath, report)
    process.stdout.write(`翻译用量报告已保存：${reportPath}\n统计周期：北京时间 ${totals.accountingDay}，月份 ${totals.accountingMonth}\n`)
    process.stdout.write(`平台当天用量单位：${totals.globalDaily.chargedUnits}；本月：${totals.globalMonthly.chargedUnits}\n`)
    process.stdout.write('只汇总内部用量；未知用量不视为零，实际费用以服务商账单为准。没有调用 AI 或修改数据库。\n')
  } finally { await session.cleanup() }
}

try { await main() } catch (error) {
  process.stderr.write(`${error instanceof OperatorError ? error.message : '用量报告未完成；请检查私有操作目录，不在终端公开原始错误。'}\n`)
  process.exitCode = 1
}
