import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tenant, User } from '@/payload-types'

const { find } = vi.hoisted(() => ({ find: vi.fn() }))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  usePathname: () => '/s/test-company/zh',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/RichText', () => ({
  default: ({ data }: { data: unknown }) => createElement('p', null, JSON.stringify(data)),
}))

import { loadIndustryTenantPage } from '@/platform/industry-templates/tenant'
import { IndustryPage } from '@/platform/industry-templates/Page'
import { requestedPage, safeDate } from '@/platform/industry-templates/model'
import { industryStructuredData } from '@/platform/industry-templates/StructuredData'

const site = (): Tenant =>
  ({
    id: 41,
    slug: 'test-company',
    branding: { companyName: '客户自己的公司' },
    fixedPages: { homepage: { showInquiryForm: false } },
  }) as Tenant
const empty = () => ({ docs: [], totalDocs: 0, totalPages: 1 })

// Scenarios derive from the user's isolation, pagination, PDF and existing-content requirements.
describe('industry template data boundaries', () => {
  beforeEach(() => {
    find.mockReset()
    find.mockResolvedValue(empty())
  })
  it('keeps new customer business content empty and never supplies demonstration files', async () => {
    for (const key of ['power-705-v1', 'autoparts-571-v1']) {
      const model = await loadIndustryTenantPage({
        site: site(),
        locale: 'zh',
        base: '/s/test-company/zh',
        template: { key },
      })
      const html = renderToStaticMarkup(createElement(IndustryPage, { model }))
      expect(html).toContain('客户自己的公司')
      expect(html).toContain('暂无已发布内容')
      expect(html).not.toMatch(/启衡|恒序|template-demos|\.pdf|DEMO-/)
      expect(model.products).toEqual([])
      expect(model.banners).toEqual([])
      expect(model.demo).toBeUndefined()
    }
  })
  it('reads published products, cases and news only within the current tenant', async () => {
    await loadIndustryTenantPage({ site: site(), locale: 'de', base: '/s/test-company/de' })
    for (const [query] of find.mock.calls) {
      expect(JSON.stringify(query.where)).toContain('"tenant":{"equals":41}')
      if (['products', 'news', 'cases'].includes(query.collection))
        expect(JSON.stringify(query.where)).toContain('"_status":{"equals":"published"}')
      expect(query.locale).toBe('de')
    }
  })
  it('retains user access checks in authenticated previews', async () => {
    const user = { id: 7 } as User
    await loadIndustryTenantPage({
      site: site(),
      locale: 'zh',
      base: '/s/test-company/zh',
      preview: true,
      user,
    })
    for (const [query] of find.mock.calls) {
      expect(query.overrideAccess).toBe(false)
      expect(query.user).toBe(user)
    }
  })
  it('uses 12 products, 9 news, 6 cases and 10 FAQ per page', async () => {
    for (const [section, limit] of [
      ['products', 12],
      ['news', 9],
      ['cases', 6],
      ['faqs', 10],
    ]) {
      find.mockClear()
      await loadIndustryTenantPage({
        site: site(),
        locale: 'en',
        base: '/s/test-company/en',
        path: [section as string],
      })
      const query = find.mock.calls.find(([query]) => query.collection === section)?.[0]
      expect(query.limit).toBe(limit)
      expect(query.page).toBe(1)
    }
  })
  it('rejects an unknown category and out-of-range page without leaking an unfiltered listing', async () => {
    await expect(
      loadIndustryTenantPage({
        site: site(),
        locale: 'en',
        base: '/s/test-company/en',
        path: ['products'],
        search: { category: 'not-ours' },
      }),
    ).rejects.toThrow('NOT_FOUND')
    expect(find.mock.calls.some(([query]) => query.collection === 'products')).toBe(false)
    find.mockClear()
    await expect(
      loadIndustryTenantPage({
        site: site(),
        locale: 'en',
        base: '/s/test-company/en',
        path: ['faqs'],
        search: { page: '999' },
      }),
    ).rejects.toThrow('NOT_FOUND')
  })
  it('includes all descendants of a selected category and keeps tenant filtering', async () => {
    find.mockImplementation(async (query) =>
      query.collection === 'product-categories'
        ? {
            docs: [
              { id: 1, name: 'Parent', slug: 'parent' },
              { id: 2, name: 'Child', slug: 'child', parent: 1 },
              { id: 3, name: 'Grandchild', slug: 'grandchild', parent: 2 },
            ],
            totalPages: 1,
          }
        : empty(),
    )
    await loadIndustryTenantPage({
      site: site(),
      locale: 'en',
      base: '/s/test-company/en',
      path: ['products'],
      search: { category: 'parent' },
    })
    const query = find.mock.calls.find(([query]) => query.collection === 'products')?.[0]
    expect(query.where.and).toContainEqual({ category: { in: [1, 2, 3] } })
    expect(query.where.and).toContainEqual({ tenant: { equals: 41 } })
  })
  it('keeps a product without its own PDF free of demo downloads and honors cleared specifications', async () => {
    find.mockImplementation(async (query) =>
      query.collection === 'products' && query.limit === 1
        ? {
            docs: [
              {
                id: 9,
                title: '客户产品',
                slug: 'own-product',
                specifications: [{ label: '旧参数', value: '旧值' }],
              },
            ],
          }
        : query.collection === 'product-specifications'
          ? { docs: [{ items: [] }] }
          : empty(),
    )
    const model = await loadIndustryTenantPage({
      site: site(),
      locale: 'zh',
      base: '/s/test-company/zh',
      path: ['products', 'own-product'],
    })
    const html = renderToStaticMarkup(createElement(IndustryPage, { model }))
    expect(html).toContain('客户产品')
    expect(model.datasheet).toBe('')
    expect(model.parameters).toEqual([])
    expect(html).not.toContain('下载规格书')
    expect(html).not.toContain('旧参数')
    expect(html).not.toContain('template-demos')
  })
  it('does not mutate content when adapting the same company for different template styles', async () => {
    const company = site()
    company.fixedPages!.homepage!.companyIntro = '客户已保存的介绍'
    const before = JSON.stringify(company)
    for (const key of ['power-705-v1', 'autoparts-571-v1']) {
      const model = await loadIndustryTenantPage({
        site: company,
        locale: 'zh',
        base: '/s/test-company/zh',
        template: { key },
      })
      expect(model.intro?.text).toBe('客户已保存的介绍')
      expect(model.catalogFirst).toBe(key === 'autoparts-571-v1')
    }
    expect(JSON.stringify(company)).toBe(before)
  })
  it('handles malformed query numbers and invalid dates without crashing', () => {
    for (const value of ['NaN', '-2', '1.5', '0', '99999999999999999999999'])
      expect(requestedPage(value)).toBe(1)
    expect(requestedPage(['2'])).toBe(2)
    expect(safeDate('not-a-date')).toBeUndefined()
    expect(safeDate('2026-09-30T12:00:00Z')).toBe('2026-09-30')
  })
  it('publishes structured data only for real visible customer content', () => {
    const model = {
      kind: 'faqs' as const,
      locale: 'zh' as const,
      company: '客户公司',
      site: 'test-company',
      base: '/s/test-company/zh',
      title: '常见问题',
      faqs: [{ id: 1, question: '客户问题', answer: null, answerText: '客户答案' }],
    }
    expect(industryStructuredData({ ...model, demo: true })).toBeNull()
    expect(industryStructuredData({ ...model, preview: true })).toBeNull()
    expect(industryStructuredData({ ...model, faqs: [] })).toBeNull()
    expect(JSON.stringify(industryStructuredData(model))).toContain('客户答案')
    const product = industryStructuredData({ ...model, kind: 'product', title: '客户产品' })
    expect(product).not.toHaveProperty('offers')
    expect(product).not.toHaveProperty('aggregateRating')
  })
})
