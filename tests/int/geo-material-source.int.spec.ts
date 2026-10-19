import { describe, expect, it } from 'vitest'
import { parseMaterialValues } from '../../src/platform/geo/materials'
import {
  isPublicSourceAddress,
  isSourceInScope,
  robotsAllows,
  robotsRules,
} from '../../src/platform/geo/source-policy'
import { discoverGeoSources } from '../../src/platform/geo/source-discovery'
import type { GeoKeyword } from '../../src/platform/geo/keywords'

// Requirements: groups only; no cross-customer media; no invented or private source URLs.
const config: GeoKeyword = {
  id: 'dfd7eb10-935b-411b-b642-576912c90e6e',
  tenantID: 101,
  version: 1,
  brand: '测试电气',
  aliases: [],
  core: '配电柜',
  terms: Array.from({ length: 10 }, (_, i) => `类型${i}配电柜`),
  website: 'https://fixture.example/',
  blog: '',
  termLinks: [],
  createdAt: '',
  updatedAt: '',
}
describe('GEO material and source policies', () => {
  it('rechecks only saved detail URLs and can use core-word product evidence without inventing a subterm match', async () => {
    const called: string[] = []
    const url = 'https://fixture.example/product/10.html'
    const pages = await discoverGeoSources(
      config,
      [{ url, title: 'GGD配电柜' }],
      async (target) => {
        called.push(target)
        return {
          url: target,
          status: 200,
          type: 'text/html',
          robots: '',
          body: target.endsWith('/robots.txt')
            ? 'User-agent: *\nAllow: /'
            : `<title>GGD配电柜</title><p>${'配电柜用于工业配电，具体选型结合现场条件及产品资料确认。'.repeat(15)}</p><a href='/product/11.html'>其他产品</a>`,
        }
      },
      { seedsOnly: true },
    )
    expect(called).toEqual(['https://fixture.example/robots.txt', url])
    expect(pages.filter((page) => page.status === 'available')).toMatchObject([
      { url, terms: ['配电柜'] },
    ])
    expect(pages.flatMap((page) => page.terms)).not.toContain(config.terms[0])
  })
  it('accepts uncapped group membership and rejects duplicate or invalid IDs', () => {
    expect(
      parseMaterialValues({ name: '产品图', description: '', mediaIds: [2, 1] }).mediaIds,
    ).toEqual([2, 1])
    expect(
      parseMaterialValues({
        name: '产品图',
        mediaIds: Array.from({ length: 201 }, (_, i) => i + 1),
      }).mediaIds,
    ).toHaveLength(201)
    for (const mediaIds of [[1, 1], [-1], ['1']])
      expect(() => parseMaterialValues({ name: '产品图', mediaIds })).toThrow()
  })
  it('matches the reference material group name limit', () => {
    expect(parseMaterialValues({ name: '十五个字符素材组名称示例测试啊', mediaIds: [] }).name).toBe(
      '十五个字符素材组名称示例测试啊',
    )
    expect(() =>
      parseMaterialValues({ name: '十六个字符素材组名称示例测试啊哈', mediaIds: [] }),
    ).toThrow('1—15个字符')
  })
  it('blocks local, cloud metadata, private, reserved and mapped private addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.2',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '2001:db8::1',
    ])
      expect(isPublicSourceAddress(ip), ip).toBe(false)
    expect(isPublicSourceAddress('8.8.8.8')).toBe(true)
    expect(isPublicSourceAddress('2606:4700:4700::1111')).toBe(true)
  })
  it('requires the configured origin/path and a real child path for eligible references', () => {
    const root = 'https://fixture.example/blog/'
    expect(isSourceInScope(root + 'cabinet', root, true)).toBe(true)
    for (const url of [
      root,
      root + '?id=1',
      'https://fixture.example/blog-more/page',
      'https://other.example/blog/page',
      'https://user:pass@fixture.example/blog/page',
      'http://127.0.0.1/blog/page',
      'https://fixture.example:8443/blog/page',
    ])
      expect(isSourceInScope(url, root, true), url).toBe(false)
  })
  it('respects robot restrictions and the most specific allow rule', () => {
    const rules = robotsRules('User-agent: *\nDisallow: /private\nAllow: /private/public\n')
    expect(robotsAllows('https://fixture.example/private/file', rules)).toBe(false)
    expect(robotsAllows('https://fixture.example/%70rivate/file', rules)).toBe(false)
    expect(robotsAllows('https://fixture.example/private/public/page', rules)).toBe(true)
    expect(robotsAllows('https://fixture.example/products/a', rules)).toBe(true)
    expect(
      robotsAllows(
        'https://fixture.example/%E7%A7%81%E5%AF%86/page',
        robotsRules('User-agent: *\nDisallow: /私密/'),
      ),
    ).toBe(false)
  })
  it('only accepts independently read, relevant pages and rejects noindex content', async () => {
    const called: string[] = []
    const pages = await discoverGeoSources(config, [], async (url) => {
      called.push(url)
      const path = new URL(url).pathname
      const body =
        path === '/'
          ? '<a href="/products/a">产品</a><a href="/private/x">私密</a><a href="/products/hidden">隐藏</a>'
          : path === '/robots.txt'
            ? 'User-agent: *\nDisallow: /private/'
            : path === '/sitemap.xml'
              ? '<urlset></urlset>'
              : `<html><title>类型0配电柜产品</title>${path.endsWith('hidden') ? '<meta name="robots" content="noindex">' : ''}<p>${'类型0配电柜产品及配置说明。'.repeat(20)}</p></html>`
      return {
        url,
        body,
        status: 200,
        type: path.endsWith('.xml') ? 'text/xml' : 'text/html',
        robots: '',
      }
    })
    expect(called.some((url) => url.includes('/private/'))).toBe(false)
    expect(pages.filter((p) => p.status === 'available')).toHaveLength(1)
    expect(pages.find((p) => p.status === 'available')?.terms).toEqual(['类型0配电柜'])
    expect(pages.find((p) => p.url.endsWith('/hidden'))?.status).toBe('invalid')
  })
  it('keeps missing sources pending instead of fabricating links', async () => {
    const pages = await discoverGeoSources(config, [], async (url) => ({
      url,
      body: '',
      status: 404,
      type: 'text/plain',
      robots: '',
    }))
    expect(pages).toHaveLength(1)
    expect(pages[0].status).toBe('pending')
    expect(pages[0].url).toBe(config.website)
  })
  it('checks each explicitly configured subterm URL instead of substituting a nearby page', async () => {
    const mapped = {
      ...config,
      termLinks: config.terms.map((term, index) => ({
        term,
        website: `https://fixture.example/products/${index}`,
        blog: '',
      })),
    }
    const called: string[] = []
    const pages = await discoverGeoSources(mapped, [], async (url) => {
      called.push(url)
      const path = new URL(url).pathname
      const index = Number(path.split('/').at(-1))
      return {
        url,
        body:
          path === '/robots.txt'
            ? 'User-agent: *\nAllow: /'
            : `<html><title>${mapped.terms[index]} product page</title><p>${`${mapped.terms[index]}产品配置及应用说明。`.repeat(12)}</p></html>`,
        status: 200,
        type: 'text/html',
        robots: '',
      }
    })
    expect(called).toHaveLength(11)
    expect(called).not.toContain('https://fixture.example/')
    expect(pages.filter((page) => page.status === 'available')).toHaveLength(10)
    expect(pages.every((page) => page.terms.length === 1)).toBe(true)
  })
  it('supplements partial legacy URL hints with verified pages from the site', async () => {
    const partiallyMapped = {
      ...config,
      termLinks: [
        { term: config.terms[0], website: 'https://fixture.example/products/0', blog: '' },
      ],
    }
    const called: string[] = []
    const pages = await discoverGeoSources(partiallyMapped, [], async (url) => {
      called.push(url)
      const path = new URL(url).pathname
      const body =
        path === '/robots.txt'
          ? 'User-agent: *\nAllow: /'
          : path === '/'
            ? '<a href="/products/1">产品</a>'
            : path === '/sitemap.xml'
              ? `<urlset>${config.terms.map((_, index) => `<url><loc>https://fixture.example/products/${index}</loc></url>`).join('')}</urlset>`
              : `<html><title>${config.terms[Number(path.split('/').at(-1))]}</title><p>${`${config.terms[Number(path.split('/').at(-1))]}产品配置及应用说明。`.repeat(12)}</p></html>`
      return {
        url,
        body,
        status: 200,
        type: path.endsWith('.xml') ? 'application/xml' : 'text/html',
        robots: '',
      }
    })

    expect(called).toContain('https://fixture.example/')
    expect(called).toContain('https://fixture.example/sitemap.xml')
    expect(pages.filter((page) => page.status === 'available')).toHaveLength(10)
    expect(new Set(pages.flatMap((page) => page.terms))).toEqual(new Set(config.terms))
  })
})
