/** Configuration-only deployment gate. Does not contact or change any service. */
import { lstatSync } from 'node:fs'
import { isAbsolute } from 'node:path'

const errors = []
const requireValue = (name, minimum = 1) => {
  const value = process.env[name] || ''
  if (value.length < minimum || /REPLACE|your-platform-domain|example\.com|changeme/i.test(value)) errors.push(`${name} 未填写正式值。`)
  return value
}
const hostPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const root = requireValue('PLATFORM_ROOT_DOMAIN').toLowerCase()
const admin = requireValue('PLATFORM_ADMIN_HOST').toLowerCase()
if (!hostPattern.test(root) || !hostPattern.test(admin) || admin === root || !admin.endsWith(`.${root}`)) errors.push('平台主域名与后台子域名关系不正确。')
if (process.env.PLATFORM_DOMAINS_ENABLED !== 'true') errors.push('PLATFORM_DOMAINS_ENABLED 必须启用。')
try {
  const url = new URL(requireValue('NEXT_PUBLIC_SERVER_URL'))
  if (url.protocol !== 'https:' || url.hostname !== admin || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) errors.push('NEXT_PUBLIC_SERVER_URL 必须是后台 HTTPS 地址。')
} catch { errors.push('NEXT_PUBLIC_SERVER_URL 不是有效网址。') }
try {
  const url = new URL(requireValue('DATABASE_URL'))
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'app'].includes(hostname) || !url.hostname || !url.pathname.slice(1) || url.hash)
    errors.push('DATABASE_URL 必须指向独立 PostgreSQL 数据库且不含 fragment。')
  if (url.searchParams.has('sslmode') && url.searchParams.get('sslmode') !== 'verify-full') errors.push('DATABASE_URL 的 sslmode 必须为 verify-full；运行时同时校验证书链和主机名。')
  if (url.searchParams.has('ssl') && !['true', '1'].includes(url.searchParams.get('ssl'))) errors.push('DATABASE_URL 不得关闭 SSL 校验。')
  if (['sslcert', 'sslkey', 'host', 'hostaddr', 'port', 'user', 'password', 'dbname', 'database'].some(name => url.searchParams.has(name))) errors.push('首版连接地址不支持客户端私钥及查询参数覆盖数据库端点或凭证。')
  if (url.searchParams.has('sslnegotiation') && url.searchParams.get('sslnegotiation') !== 'postgres') errors.push('首版数据库使用 PostgreSQL 标准 TLS 协商，不使用 direct。')
} catch { errors.push('DATABASE_URL 不是有效连接地址。') }
if (process.env.DATABASE_TLS_ENABLED !== 'true') errors.push('正式应用和工作进程必须启用 DATABASE_TLS_ENABLED。')
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') errors.push('不能通过 NODE_TLS_REJECT_UNAUTHORIZED=0 关闭 TLS 证书验证。')
const certificatePath = requireValue('DATABASE_CA_FILE')
if (!isAbsolute(certificatePath) || /[\u0000-\u001f\u007f]/.test(certificatePath)) errors.push('DATABASE_CA_FILE 必须是宿主机 CA 文件绝对路径。')
else {
  try {
    const certificate = lstatSync(certificatePath)
    if (!certificate.isFile() || certificate.isSymbolicLink() || certificate.size < 1 || certificate.size > 1024 * 1024)
      errors.push('数据库 CA 必须是普通非链接文件，大小不超过1MiB，不能是目录。')
    else if (!(certificate.mode & 0o004) && !(certificate.uid === 1001 && (certificate.mode & 0o400)))
      errors.push('数据库 CA 公共证书须能被应用 UID 1001 读取；不要把私钥放到此路径。')
  } catch { errors.push('宿主机数据库 CA 文件不存在或不可读取；部署不会自动创建空目录。') }
}
const databaseInteger = (name, minimum, maximum) => {
  const value = process.env[name] || '', number = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum || number > maximum) {
    errors.push(`${name} 必须填写 ${minimum}–${maximum} 的整数。`)
    return null
  }
  return number
}
const pools = ['DATABASE_WEB_POOL_MAX', 'DATABASE_TRANSLATION_POOL_MAX', 'DATABASE_NOTIFICATION_POOL_MAX', 'DATABASE_MIGRATOR_POOL_MAX']
  .map(name => databaseInteger(name, 1, 50))
const connectionLimit = databaseInteger('DATABASE_CONNECTION_LIMIT', 1, 100000)
const reservedConnections = databaseInteger('DATABASE_RESERVED_CONNECTIONS', 1, 10000)
if (connectionLimit !== null && reservedConnections !== null && pools.every(value => value !== null) &&
    pools.reduce((total, value) => total + value, 0) + reservedConnections > connectionLimit)
  errors.push('单实例部署的四个连接池上限加预留连接超过填写的数据库连接限额；购买/扩容后须按实际值配置。')
databaseInteger('DATABASE_CONNECTION_TIMEOUT_MS', 1000, 60000)
databaseInteger('DATABASE_IDLE_TIMEOUT_MS', 1000, 600000)
for (const name of ['PAYLOAD_SECRET', 'CRON_SECRET', 'PREVIEW_SECRET']) requireValue(name, 32)
if (new Set(['PAYLOAD_SECRET', 'CRON_SECRET', 'PREVIEW_SECRET'].map((name) => process.env[name])).size < 3) errors.push('三个用途的密钥必须不同。')
const mode = process.env.PLATFORM_DEPLOYMENT_MODE || 'managed'
if (!['managed', 'single-ecs'].includes(mode)) errors.push('PLATFORM_DEPLOYMENT_MODE 必须为 managed 或 single-ecs。')
if (mode === 'single-ecs') {
  if (process.env.S3_ENABLED !== 'false') errors.push('单机部署须明确 S3_ENABLED=false，并挂载私有文件目录。')
  try {
    const url = new URL(process.env.DATABASE_URL || '')
    if (url.hostname !== 'postgres' || (url.port && url.port !== '5432')) errors.push('单机数据库必须使用私有容器 postgres:5432。')
  } catch { /* The common database gate above reports invalid URLs. */ }
  const directory = process.env.MEDIA_PRIVATE_DIRECTORY || ''
  if (!isAbsolute(directory) || directory.includes('/public')) errors.push('单机媒体目录必须是 public 之外的绝对路径。')
  else {
    try {
      const file = lstatSync(directory)
      if (!file.isDirectory() || file.isSymbolicLink() || file.uid !== 1001 || !(file.mode & 0o200))
        errors.push('单机私有媒体目录必须存在、不可是链接，且由应用 UID 1001 拥有并可写。')
    } catch { errors.push('单机私有媒体目录未挂载。') }
  }
} else {
if (process.env.S3_ENABLED !== 'true') errors.push('正式上传必须启用对象存储 S3_ENABLED。')
for (const name of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_REGION']) requireValue(name)
try {
  const url = new URL(process.env.S3_ENDPOINT || '')
  if (url.protocol !== 'https:' || url.username || url.password || url.search ||
      url.hash || url.pathname !== '/') errors.push('S3_ENDPOINT 必须是无路径、凭证和参数的存储 HTTPS 地址。')
} catch { errors.push('S3_ENDPOINT 不是有效的存储地址。') }
if (!/^[a-z\d][a-z\d.-]{1,61}[a-z\d]$/.test(process.env.S3_BUCKET || '') ||
    /\.\.|\.\-|\-\./.test(process.env.S3_BUCKET || '')) errors.push('S3_BUCKET 必须是有效的对象存储桶名。')
if (!['true', 'false'].includes(process.env.S3_FORCE_PATH_STYLE || '')) errors.push('S3_FORCE_PATH_STYLE 必须明确填写 true 或 false。')
if (process.env.S3_CLIENT_UPLOADS !== 'false') errors.push('首版部署先使用服务端上传：S3_CLIENT_UPLOADS=false。')
}
if (process.env.MEDIA_ACCESS_CONTROL_ENABLED !== 'true') errors.push('正式部署必须在私有存储与权限演练后启用 MEDIA_ACCESS_CONTROL_ENABLED。')
const mediaScanLimit = process.env.MEDIA_REFERENCE_SCAN_LIMIT || '5000'
if (!/^\d+$/.test(mediaScanLimit) || !Number.isSafeInteger(Number(mediaScanLimit)) || Number(mediaScanLimit) < 100 || Number(mediaScanLimit) > 50000) errors.push('MEDIA_REFERENCE_SCAN_LIMIT 必须为100至50000的整数。')
if (process.env.MEDIA_PRIVATE_DIRECTORY && (!process.env.MEDIA_PRIVATE_DIRECTORY.startsWith('/') || /[\u0000-\u001f\u007f]/.test(process.env.MEDIA_PRIVATE_DIRECTORY))) errors.push('MEDIA_PRIVATE_DIRECTORY 必须是私有目录的绝对路径。')
if (process.env.PRODUCT_TRANSLATION_QUEUE_ENABLED !== 'true') errors.push('必须启用持久翻译任务。')
if (process.env.TRANSLATION_BUDGET_ENABLED !== 'true') errors.push('正式部署必须在批准安装用量表后启用 TRANSLATION_BUDGET_ENABLED。')
const translationLimits = Object.fromEntries([
  ['TRANSLATION_GLOBAL_DAILY_UNITS', 1_000_000_000],
  ['TRANSLATION_GLOBAL_MONTHLY_UNITS', 10_000_000_000],
  ['TRANSLATION_COMPANY_DAILY_UNITS', 1_000_000_000],
  ['TRANSLATION_COMPANY_MONTHLY_UNITS', 10_000_000_000],
  ['TRANSLATION_MAX_REQUESTS_PER_JOB', 1000],
].map(([name, maximum]) => {
  const value = process.env[name] || ''
  const number = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > maximum) errors.push(`${name} 必须填写有效的正整数额度。`)
  return [name, number]
}))
if (translationLimits.TRANSLATION_GLOBAL_DAILY_UNITS > translationLimits.TRANSLATION_GLOBAL_MONTHLY_UNITS ||
    translationLimits.TRANSLATION_COMPANY_DAILY_UNITS > translationLimits.TRANSLATION_COMPANY_MONTHLY_UNITS ||
    translationLimits.TRANSLATION_COMPANY_DAILY_UNITS > translationLimits.TRANSLATION_GLOBAL_DAILY_UNITS ||
    translationLimits.TRANSLATION_COMPANY_MONTHLY_UNITS > translationLimits.TRANSLATION_GLOBAL_MONTHLY_UNITS) errors.push('翻译每日/每月额度关系不正确，公司额度不得超过平台额度。')
if (process.env.INQUIRY_PERSISTENCE_ENABLED !== 'true') errors.push('正式部署必须在迁移后启用持久询盘 INQUIRY_PERSISTENCE_ENABLED。')
if (process.env.INQUIRY_NOTIFICATIONS_ENABLED === 'true') {
  const smtpHost = requireValue('SMTP_HOST')
  if (!/^[a-z\d.-]+$/i.test(smtpHost)) errors.push('SMTP_HOST 必须是邮件服务主机名。')
  if (!['465', '587'].includes(process.env.SMTP_PORT || '465')) errors.push('SMTP_PORT 必须为 465 或 587；不关闭 TLS 校验。')
  for (const name of ['SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_ADDRESS']) requireValue(name)
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(process.env.SMTP_FROM_ADDRESS || '')) errors.push('SMTP_FROM_ADDRESS 必须是已配置的发信邮箱。')
}
requireValue('DEEPSEEK_API_KEY', 20)
requireValue('DEEPSEEK_MODEL')
const email = requireValue('TLS_CONTACT_EMAIL')
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('TLS_CONTACT_EMAIL 必须是维护邮箱。')
for (const name of ['APP_IMAGE', 'TRANSLATION_WORKER_IMAGE', 'MIGRATOR_IMAGE']) {
  const image = requireValue(name)
  if (!image.includes(':') && !image.includes('@sha256:')) errors.push(`${name} 必须包含固定版本或 digest。`)
  if (/:latest$/.test(image)) errors.push(`${name} 不得使用 latest。`)
}
if (errors.length) {
  for (const message of [...new Set(errors)]) process.stderr.write(`${message}\n`)
  process.stderr.write('已停止；没有连接数据库、没有迁移、没有启动容器。\n')
  process.exit(1)
}
process.stdout.write('配置格式及宿主机CA文件元信息检查通过。尚未检查证书内容、DNS、数据库连接、存储兼容、镜像构建或真实业务。\n')
