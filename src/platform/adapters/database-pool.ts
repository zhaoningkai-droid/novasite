/** Server-only runtime options; build and unconfigured local development keep the original pool. */
import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'
import { X509Certificate } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { checkServerIdentity } from 'node:tls'

type PoolOptions = PostgresAdapterArgs['pool']

function optionalInteger(env: NodeJS.ProcessEnv, name: string, minimum: number, maximum: number) {
  const value = env[name]
  if (value === undefined) return undefined
  const number = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum || number > maximum)
    throw new Error(`${name} must be an integer within its documented limits.`)
  return number
}

function certificateBundle(value: string | undefined) {
  if (!value || !isAbsolute(value) || /[\x00-\x1f\x7f]/.test(value))
    throw new Error('DATABASE_CA_FILE must be an absolute certificate path.')
  let descriptor: number | undefined
  try {
    const before = lstatSync(value)
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > 1024 * 1024)
      throw new Error()
    descriptor = openSync(value, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    const opened = fstatSync(descriptor)
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size)
      throw new Error()
    const buffer = Buffer.alloc(before.size + 1)
    let length = 0
    while (length < buffer.length) {
      const read = readSync(descriptor, buffer, length, buffer.length - length, null)
      if (!read) break
      length += read
    }
    const bytes = buffer.subarray(0, length)
    const after = fstatSync(descriptor), current = lstatSync(value)
    if (bytes.length !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs ||
        current.ino !== before.ino || current.dev !== before.dev || current.isSymbolicLink()) throw new Error()
    const contents = bytes.toString('utf8')
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(contents)) throw new Error()
    const certificates = contents.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
    if (!certificates?.length || certificates.length > 100) throw new Error()
    for (const certificate of certificates) new X509Certificate(certificate)
    // Supply only parsed certificate PEM blocks; no comments or other PEM objects are passed to TLS.
    return certificates.join('\n') + '\n'
  } catch {
    // Do not attach filesystem/parse causes, which may include paths or sensitive input.
    throw new Error('DATABASE_CA_FILE must be a readable regular PEM certificate bundle, at most 1MiB, without private keys.')
  } finally { if (descriptor !== undefined) closeSync(descriptor) }
}

export function createDatabasePoolOptions(env: NodeJS.ProcessEnv = process.env): PoolOptions {
  const connectionString = env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required.')
  const pool: PoolOptions = { connectionString }
  // Image creation uses an unreachable build placeholder and never reads the runtime CA.
  if (env.NOVASITE_IMAGE_BUILD === 'true') return pool

  const maximum = optionalInteger(env, 'DATABASE_POOL_MAX', 1, 50)
  const connectionTimeout = optionalInteger(env, 'DATABASE_CONNECTION_TIMEOUT_MS', 1000, 60000)
  const idleTimeout = optionalInteger(env, 'DATABASE_IDLE_TIMEOUT_MS', 1000, 600000)
  if (maximum !== undefined) pool.max = maximum
  if (connectionTimeout !== undefined) pool.connectionTimeoutMillis = connectionTimeout
  if (idleTimeout !== undefined) pool.idleTimeoutMillis = idleTimeout

  const hosted = env.NODE_ENV === 'production' && env.PLATFORM_DOMAINS_ENABLED === 'true'
  if (env.DATABASE_TLS_ENABLED !== undefined && !['true', 'false'].includes(env.DATABASE_TLS_ENABLED))
    throw new Error('DATABASE_TLS_ENABLED must be true or false.')
  if (hosted && env.DATABASE_TLS_ENABLED !== 'true')
    throw new Error('Hosted production requires DATABASE_TLS_ENABLED=true and a mounted provider CA.')
  const secure = env.DATABASE_TLS_ENABLED === 'true'
  if (!secure && env.DATABASE_APPLICATION_NAME === undefined) return pool

  let url: URL
  try {
    url = new URL(connectionString)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1) || url.hash)
      throw new Error()
  } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL without a fragment.') }

  if (secure) {
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Database TLS verification cannot be disabled.')
    const mode = url.searchParams.get('sslmode'), ssl = url.searchParams.get('ssl')
    if ((mode !== null && mode !== 'verify-full') || (ssl !== null && !['true', '1'].includes(ssl)) ||
        ['sslcert', 'sslkey', 'host', 'hostaddr', 'port', 'user', 'password', 'dbname', 'database']
          .some(name => url.searchParams.has(name)))
      throw new Error('Use a normal PostgreSQL URL with verify-full TLS; endpoint overrides and client-key parameters are unsupported.')
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    if (hosted && ['localhost', '127.0.0.1', '0.0.0.0', '::1', 'app'].includes(hostname.toLowerCase()))
      throw new Error('Hosted production requires an independent database endpoint.')
    const negotiation = url.searchParams.get('sslnegotiation')
    if (negotiation !== null && negotiation !== 'postgres')
      throw new Error('First-release database TLS uses traditional PostgreSQL negotiation.')
    const ca = certificateBundle(env.DATABASE_CA_FILE)
    // pg connection-string SSL parameters replace an explicitly supplied ssl object.
    // Keep one authoritative CA and hostname check, without altering user/database credentials.
    for (const name of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslnegotiation', 'uselibpqcompat'])
      url.searchParams.delete(name)
    pool.ssl = { ca, rejectUnauthorized: true, minVersion: 'TLSv1.2',
      checkServerIdentity: (_servername, certificate) => checkServerIdentity(hostname, certificate) }
  }
  if (env.DATABASE_APPLICATION_NAME !== undefined) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/.test(env.DATABASE_APPLICATION_NAME))
      throw new Error('DATABASE_APPLICATION_NAME must be a short process label without spaces.')
    url.searchParams.set('application_name', env.DATABASE_APPLICATION_NAME)
  }
  pool.connectionString = url.toString()
  return pool
}
