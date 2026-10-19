import { BlockList, isIP } from 'node:net'
import { GeoError } from './keywords'
const denied = new BlockList()
for (const [ip, size] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['192.88.99.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  denied.addSubnet(ip, size, 'ipv4')
const ipv6Global = new BlockList()
ipv6Global.addSubnet('2000::', 3, 'ipv6')
for (const [ip, size] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3ffe::', 16],
] as const)
  denied.addSubnet(ip, size, 'ipv6')
export const isPublicSourceAddress = (address: string) => {
  const family = isIP(address)
  if (family === 4) return !denied.check(address, 'ipv4')
  return family === 6 && ipv6Global.check(address, 'ipv6') && !denied.check(address, 'ipv6')
}
export function sourceURL(value: string) {
  const url = new URL(value)
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/iu.test(url.hostname)
  )
    throw new GeoError('INVALID_SOURCE', '来源网址必须是无凭据的公开HTTP(S)地址。')
  const host = url.hostname.replace(/^\[|\]$/gu, '')
  if (isIP(host) && !isPublicSourceAddress(host))
    throw new GeoError('PRIVATE_SOURCE', '来源网址不能访问本地或内网地址。')
  url.hash = ''
  if (/%(?:2f|5c|25(?:2e|2f|5c))/iu.test(url.pathname))
    throw new GeoError('INVALID_SOURCE', '来源路径不能包含编码后的路径分隔符。')
  if (url.href.length > 2048) throw new GeoError('INVALID_SOURCE', '来源网址过长。')
  return url
}
export function isSourceInScope(value: string, root: string, childOnly = false) {
  try {
    const url = sourceURL(value),
      base = sourceURL(root)
    const sameOrigin =
      url.origin === base.origin ||
      (base.protocol === 'http:' && url.protocol === 'https:' && url.hostname === base.hostname)
    const path = base.pathname.replace(/\/+$/u, '')
    const candidate = url.pathname.replace(/\/+$/u, '')
    return sameOrigin && (candidate === path ? !childOnly : candidate.startsWith(path + '/'))
  } catch {
    return false
  }
}
type RobotRule = { allow: boolean; value: string }
export function robotsRules(text: string): RobotRule[] {
  const groups: { agents: string[]; rules: RobotRule[] }[] = []
  let current = { agents: [] as string[], rules: [] as RobotRule[] }
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.split('#')[0].trim(),
      colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase(),
      value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      if (current.rules.length) {
        groups.push(current)
        current = { agents: [], rules: [] }
      }
      if (value) current.agents.push(value.toLowerCase())
    } else if ((key === 'allow' || key === 'disallow') && value && current.agents.length)
      current.rules.push({ allow: key === 'allow', value })
  }
  groups.push(current)
  const specific = groups.filter((g) =>
    g.agents.some((a) => a !== '*' && 'novasite-geo-source'.includes(a)),
  )
  return (specific.length ? specific : groups.filter((g) => g.agents.includes('*'))).flatMap(
    (g) => g.rules,
  )
}
export function robotsAllows(url: string, rules: RobotRule[]) {
  const parsed = new URL(url),
    path = parsed.pathname + parsed.search
  const normalizedPath = (value: string) =>
    value
      .replace(/[^\x00-\x7f]/gu, (s) => encodeURIComponent(s))
      .replace(/%[0-9a-f]{2}/giu, (s) => {
        const decoded = String.fromCharCode(parseInt(s.slice(1), 16))
        return /[a-z0-9._~-]/iu.test(decoded) ? decoded : s.toUpperCase()
      })
  const matching = rules
    .map((rule) => ({ ...rule, value: normalizedPath(rule.value) }))
    .filter((rule) => {
      const pattern = rule.value
        .split('*')
        .map((s) => s.replace(/[.+?^{}()|[\]\\]/gu, '\\$&'))
        .join('.*')
      return new RegExp('^' + pattern).test(normalizedPath(path))
    })
    .sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow))
  return matching[0]?.allow ?? true
}
export const decodeSourceText = (value: string) =>
  value
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/gu,
      (m) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
          '&nbsp;': ' ',
        })[m] || m,
    )
    .replace(/&#(x[0-9a-f]+|\d+);/giu, (_m, n: string) => {
      const point = n.toLowerCase().startsWith('x') ? parseInt(n.slice(1), 16) : Number(n)
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
    })
export function sourceAttributes(tag: string) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)].map((m) => [
      m[1].toLowerCase(),
      decodeSourceText(m[2] ?? m[3] ?? m[4]),
    ]),
  )
}
export const sourcePlainText = (html: string) =>
  decodeSourceText(
    html
      .replace(/<(script|style|nav|footer|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
      .replace(/<[^>]*>/gu, ' '),
  )
    .replace(/\s+/gu, ' ')
    .trim()
