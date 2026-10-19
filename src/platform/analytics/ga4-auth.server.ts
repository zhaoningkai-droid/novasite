import { constants, type KeyObject, createPrivateKey, sign } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { open } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const READ_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
let cached: { identity: string; expires: number; token: string } | undefined
let pending: Promise<string> | undefined

export class Ga4ApiError extends Error {
  constructor(public category: 'missing_credentials' | 'permission_denied' | 'unavailable') {
    super(category)
  }
}

async function credentials() {
  const file = process.env.GA4_CREDENTIALS_FILE
  if (!file || !isAbsolute(file)) throw new Ga4ApiError('missing_credentials')
  try {
    const handle = await open(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0))
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > 65536 || (process.platform !== 'win32' && (stat.mode & 0o077)))
        throw new Error('Invalid credential file')
      const data = JSON.parse(await handle.readFile('utf8'))
      if (data.type !== 'service_account' || typeof data.client_email !== 'string' ||
        !/^[\w.+-]+@[\w.-]+\.iam\.gserviceaccount\.com$/.test(data.client_email) ||
        typeof data.private_key !== 'string' || data.token_uri !== TOKEN_URL)
        throw new Error('Invalid credential format')
      const key = createPrivateKey(data.private_key)
      if (key.asymmetricKeyType !== 'rsa') throw new Error('Invalid credential key')
      return { email: data.client_email as string, key, identity: `${file}:${stat.mtimeMs}:${stat.size}` }
    } finally { await handle.close() }
  } catch { throw new Ga4ApiError('missing_credentials') }
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** Google service-account OAuth REST flow. Only a read-only Analytics scope is requested. */
async function requestToken(email: string, key: KeyObject): Promise<{ token: string; expires: number }> {
  const now = Math.floor(Date.now() / 1000)
  const input = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: email, scope: READ_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`
  const assertion = `${input}.${sign('RSA-SHA256', Buffer.from(input), { key, padding: constants.RSA_PKCS1_PADDING }).toString('base64url')}`
  const response = await fetch(TOKEN_URL, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const result = await response.json()
  if (!response.ok || typeof result.access_token !== 'string') throw new Ga4ApiError('permission_denied')
  const seconds = Number(result.expires_in)
  return { token: result.access_token, expires: Date.now() + (Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, 3600) - 60) : 300) * 1000 }
}

export async function ga4AccessToken() {
  const data = await credentials()
  if (cached?.identity === data.identity && cached.expires > Date.now()) return cached.token
  // Credentials are server-controlled; concurrent requests share only the current token exchange.
  if (pending) return pending
  pending = requestToken(data.email, data.key).then((value) => {
    cached = { ...value, identity: data.identity }
    return value.token
  }).finally(() => { pending = undefined })
  return pending
}

export async function ga4Post(path: string, body: unknown) {
  const token = await ga4AccessToken()
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/${path}`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Ga4ApiError(response.status === 401 || response.status === 403 ? 'permission_denied' : 'unavailable')
  return response.json()
}
