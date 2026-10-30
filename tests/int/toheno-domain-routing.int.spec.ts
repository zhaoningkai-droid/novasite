// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { classifyPlatformHost, configuredCustomerDomains, configuredCustomerOrigin } from '../../src/platform/platform-hosts'
import { proxy } from '../../src/proxy'
const binding = JSON.stringify({ 'huadong-fasteners': { primary: 'www.toheno.com', aliases: ['toheno.com'] } })
beforeEach(() => {
  vi.stubEnv('PLATFORM_DOMAINS_ENABLED', 'true')
  vi.stubEnv('PLATFORM_ROOT_DOMAIN', 'o669.com')
  vi.stubEnv('PLATFORM_ADMIN_HOST', 'admin.o669.com')
  vi.stubEnv('PLATFORM_CUSTOM_DOMAINS', binding)
  vi.stubEnv('MEDIA_ACCESS_CONTROL_ENABLED', 'false')
})
afterEach(() => vi.unstubAllEnvs())
const request = (host: string, path: string, extras: Record<string, string> = {}) => new NextRequest(`https://${host}${path}`, { headers: { host, ...extras } })
describe('operator-approved customer domains: requested Toheno binding and tenant boundaries', () => {
  it('maps approved primary and alias to the existing customer without renaming its slug', () => {
    expect(classifyPlatformHost('www.toheno.com')).toEqual({ kind: 'tenant', host: 'www.toheno.com', slug: 'huadong-fasteners' })
    expect(classifyPlatformHost('toheno.com').kind).toBe('tenant')
    expect(configuredCustomerOrigin('huadong-fasteners')).toBe('https://www.toheno.com')
    expect(configuredCustomerOrigin('other')).toBeNull()
    expect(configuredCustomerOrigin('constructor')).toBeNull()
  })
  it('keeps platform admin, internal hosts and other tenant routing unchanged', () => {
    expect(classifyPlatformHost('admin.o669.com').kind).toBe('admin')
    expect(classifyPlatformHost('app').kind).toBe('internal')
    expect(classifyPlatformHost('other.o669.com')).toEqual({ kind: 'tenant', host: 'other.o669.com', slug: 'other' })
    expect(classifyPlatformHost('fake-toheno.com').kind).toBe('unknown')
  })
  it('rewrites public pages using the host binding, rejecting forwarded tenant identity', () => {
    const response = proxy(request('www.toheno.com', '/en/products/bolt', { 'x-novasite-site-slug': 'other', 'x-forwarded-host': 'other.o669.com' }))
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://www.toheno.com/s/huadong-fasteners/en/products/bolt')
    expect(response.headers.get('x-middleware-request-x-novasite-site-slug')).toBe('huadong-fasteners')
    expect(response.headers.get('x-middleware-request-x-forwarded-host')).toBeNull()
  })
  it('redirects the alias to the canonical primary preserving query parameters', () => {
    const response = proxy(request('toheno.com', '/en/products?category=bolts'))
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://www.toheno.com/en/products?category=bolts')
  })
  it('does not expose admin, another company or arbitrary text files on the customer domain', () => {
    for (const path of ['/workspace/companies', '/admin', '/s/other/zh', '/secret.txt']) expect(proxy(request('www.toheno.com', path)).status).toBe(404)
  })
  it('keeps customer sitemap and robots scoped to the existing tenant', () => {
    for (const path of ['/robots.txt', '/sitemap.xml']) expect(proxy(request('www.toheno.com', path)).headers.get('x-middleware-rewrite')).toBe(`https://www.toheno.com/s/huadong-fasteners${path}`)
  })
  it.each([
    { 'huadong-fasteners': { primary: 'https://www.toheno.com' } },
    { 'huadong-fasteners': { primary: '127.0.0.1' } },
    { 'huadong-fasteners': { primary: 'admin.o669.com' } },
    { admin: { primary: 'www.toheno.com' } },
    { a: { primary: 'www.toheno.com' }, b: { primary: 'www.toheno.com' } },
  ])('rejects malformed, internal, reserved and duplicate bindings: %j', (value) => {
    vi.stubEnv('PLATFORM_CUSTOM_DOMAINS', JSON.stringify(value))
    expect(() => configuredCustomerDomains()).toThrow()
  })
  it('allows the existing configuration to work without any custom domain', () => {
    vi.stubEnv('PLATFORM_CUSTOM_DOMAINS', '')
    expect(classifyPlatformHost('www.toheno.com').kind).toBe('unknown')
    expect(configuredCustomerOrigin('huadong-fasteners')).toBeNull()
  })
})
