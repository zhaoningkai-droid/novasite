import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { GeoError } from './keywords'
import { isPublicSourceAddress, isSourceInScope, sourceURL } from './source-policy'
export type SourceResponse = {
  url: string
  status: number
  body: string
  type: string
  robots: string
}
type SourceAddress = { address: string; family: number }
const publicDNSCache = new Map<string, { until: number; addresses: SourceAddress[] }>()
const proxyAddress = (address: string) => /^(?:::ffff:)?198\.(?:18|19)\./u.test(address)

/** A local fake-IP proxy is not a real source address. Resolve it independently, then pin
 * the verified public answer. Private/mixed answers are still rejected, never connected to. */
export async function resolveGeoSourceAddresses(
  hostname: string,
  options: {
    lookup?: (hostname: string) => Promise<SourceAddress[]>
    fetcher?: typeof fetch
  } = {},
): Promise<SourceAddress[]> {
  const cacheable = !options.lookup && !options.fetcher
  const cached = cacheable ? publicDNSCache.get(hostname) : undefined
  if (cached && cached.until > Date.now()) return cached.addresses
  let timer: ReturnType<typeof setTimeout> | undefined
  let addresses = await Promise.race([
    options.lookup ? options.lookup(hostname) : lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new GeoError('SOURCE_TIMEOUT', '来源域名解析超时。')), 4000)
    }),
  ]).finally(() => clearTimeout(timer))
  if (addresses.length && addresses.every((a) => proxyAddress(a.address)) && !isIP(hostname)) {
    const endpoint = new URL('https://cloudflare-dns.com/dns-query')
    endpoint.searchParams.set('name', hostname)
    endpoint.searchParams.set('type', 'A')
    const response = await (options.fetcher || fetch)(endpoint, {
      headers: { accept: 'application/dns-json' },
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok || Number(response.headers.get('content-length')) > 65536)
      throw new GeoError('SOURCE_DNS', '公开来源域名解析失败，请稍后重试。')
    const raw = await response.text()
    if (raw.length > 65536) throw new GeoError('SOURCE_DNS', '公开来源域名解析响应过大。')
    const answer = JSON.parse(raw) as {
      Status?: number
      Answer?: { type: number; data: string }[]
    }
    addresses =
      answer.Status === 0 && Array.isArray(answer.Answer)
        ? answer.Answer.filter((a) => a.type === 1 && isIP(a.data) === 4)
            .slice(0, 16)
            .map((a) => ({ address: a.data, family: 4 }))
        : []
    if (addresses.length && addresses.every((a) => isPublicSourceAddress(a.address)) && cacheable) {
      if (publicDNSCache.size >= 256) publicDNSCache.clear()
      publicDNSCache.set(hostname, { until: Date.now() + 60000, addresses })
    }
  }
  if (!addresses.length || addresses.some((a) => !isPublicSourceAddress(a.address)))
    throw new GeoError('PRIVATE_SOURCE', '来源域名没有可安全访问的公网地址。')
  return addresses
}

/** DNS is checked on every redirect and pinned to the connection; no cookies or caller headers. */
export async function fetchPublicSource(
  value: string,
  root: string,
  canVisit?: (url: string) => boolean,
): Promise<SourceResponse> {
  let target = value
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isSourceInScope(target, root))
      throw new GeoError('SOURCE_SCOPE', '来源重定向超出配置范围。')
    if (canVisit && !canVisit(target))
      throw new GeoError('SOURCE_ROBOTS', '抓取规则禁止读取此来源路径。')
    const url = sourceURL(target),
      hostname = url.hostname.replace(/^\[|\]$/gu, '')
    const addresses = await resolveGeoSourceAddresses(hostname)
    const readAddress = (pinned: SourceAddress) =>
      new Promise<SourceResponse & { location: string }>((resolve, reject) => {
        const transport = url.protocol === 'https:' ? httpsRequest : httpRequest
        const req = transport(
          url,
          {
            method: 'GET',
            agent: false,
            signal: AbortSignal.timeout(6000),
            lookup: (_host, options, callback) => {
              if (options.all) callback(null, [pinned])
              else callback(null, pinned.address, pinned.family)
            },
            headers: {
              'User-Agent': 'NovaSite-GEO-Source/1.0',
              Accept: 'text/html,application/xml,text/xml,text/plain',
              'Accept-Encoding': 'identity',
            },
          },
          (res) => {
            const status = res.statusCode || 0,
              location = String(res.headers.location || '')
            const type = String(res.headers['content-type'] || '').toLowerCase()
            const robots = String(res.headers['x-robots-tag'] || '').toLowerCase()
            if (status !== 200) {
              res.destroy()
              resolve({ url: url.href, status, body: '', type, location, robots })
              return
            }
            if (
              (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') ||
              Number(res.headers['content-length']) > 512 * 1024
            ) {
              res.destroy()
              reject(new GeoError('SOURCE_SIZE', '来源响应压缩格式或体积超出读取范围。'))
              return
            }
            let bytes = 0
            const chunks: Buffer[] = []
            res.on('data', (chunk: Buffer) => {
              bytes += chunk.length
              if (bytes > 512 * 1024) {
                res.destroy()
                reject(new GeoError('SOURCE_SIZE', '来源页面超过512KB。'))
              } else chunks.push(chunk)
            })
            res.on('error', reject)
            res.on('end', () =>
              resolve({
                url: url.href,
                status,
                type,
                robots,
                location,
                body: Buffer.concat(chunks).toString('utf8'),
              }),
            )
          },
        )
        req.on('error', reject)
        req.end()
      })
    let response: (SourceResponse & { location: string }) | undefined
    for (const pinned of addresses.slice(0, 2)) {
      try {
        response = await readAddress(pinned)
        break
      } catch (error) {
        if (error instanceof GeoError) throw error
      }
    }
    if (!response)
      throw new GeoError('SOURCE_CONNECTION', '来源网站连接超时或暂不可用，请检查网址后重试。')
    if (response.status >= 300 && response.status < 400 && response.location) {
      target = new URL(response.location, url).href
      continue
    }
    return response
  }
  throw new GeoError('SOURCE_REDIRECT', '来源重定向次数过多。')
}
