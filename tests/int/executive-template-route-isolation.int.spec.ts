import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  getPayload: vi.fn(),
  renderSelectedTemplate: vi.fn(),
}))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: mocks.getPayload }))
vi.mock('@/components/RichText', () => ({ default: () => null }))
vi.mock('@/platform/new-templates/selected', () => ({
  renderSelectedTemplate: mocks.renderSelectedTemplate,
}))

import SiteHome from '@/app/(sites)/s/[site]/[lang]/page'
import ProductsPage from '@/app/(sites)/s/[site]/[lang]/products/page'
import NewsPage from '@/app/(sites)/s/[site]/[lang]/news/page'
import CasesPage from '@/app/(sites)/s/[site]/[lang]/cases/page'
import FAQPage from '@/app/(sites)/s/[site]/[lang]/faqs/page'
import ContactPage from '@/app/(sites)/s/[site]/[lang]/contact/page'
import TemplateDemoPage from '@/app/(sites)/template-demo/[key]/[lang]/page'

const tenant = {
  branding: { companyName: '租户甲' },
  contact: {},
  fixedPages: { homepage: { executiveHome: {} } },
  id: 42,
  selectedTemplate: { key: 'executive-industrial-pro-v1' },
  slug: 'tenant-a',
  status: 'active',
}

describe('executive template route isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPayload.mockResolvedValue({ find: mocks.find })
    mocks.renderSelectedTemplate.mockResolvedValue(null)
    mocks.find.mockImplementation(async ({ collection }: { collection: string }) => ({
      docs: collection === 'tenants' ? [tenant] : [],
    }))
  })

  it('keeps the demo route independent from Payload and tenant data', async () => {
    const page = await TemplateDemoPage({
      params: Promise.resolve({ key: 'executive-industrial-pro-v1', lang: 'zh' }),
    })
    const html = renderToStaticMarkup(createElement(() => page))

    expect(html).toContain('模板演示')
    expect(html).toContain('匠境古建')
    expect(mocks.getPayload).not.toHaveBeenCalled()
  })

  it('keeps the remote asset manifest in sync with every demo photo reference', () => {
    const demoData = readFileSync(
      resolve(process.cwd(), 'src/platform/legacy-templates/executive-demo-data.ts'),
      'utf8',
    )
    const manifest = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'public/template-demos/executive-industrial-pro-v1/assets-manifest.json',
        ),
        'utf8',
      ),
    ) as { photos: Array<{ id: number; source: string }> }
    const referencedIDs = [...demoData.matchAll(/\bimage\((\d+)/g)]
      .map((match) => Number(match[1]))
      .filter((id, index, all) => all.indexOf(id) === index)
      .sort((a, b) => a - b)
    const manifestIDs = manifest.photos.map((photo) => photo.id).sort((a, b) => a - b)

    expect(manifestIDs).toEqual(referencedIDs)
    expect(
      manifest.photos.every((photo) => photo.source.startsWith('https://www.pexels.com/')),
    ).toBe(true)
  })

  it('scopes tenant homepage collection queries and leaves an empty tenant empty', async () => {
    const page = await SiteHome({
      params: Promise.resolve({ lang: 'zh', site: 'tenant-a' }),
    })
    const html = renderToStaticMarkup(createElement(() => page))
    const collectionQueries = mocks.find.mock.calls
      .map(([query]) => query as { collection: string; where?: unknown })
      .filter((query) => query.collection !== 'tenants')

    expect(collectionQueries.length).toBeGreaterThan(0)
    for (const query of collectionQueries) {
      expect(JSON.stringify(query.where)).toContain('"tenant":{"equals":42}')
    }
    expect(html).toContain('租户甲')
    expect(html).toContain('网站内容准备中')
    expect(html).not.toContain('匠境古建')
    expect(html).not.toContain('青瓦筒瓦')
    expect(html).not.toContain('images.pexels.com')
  })

  it('keeps customer inner pages empty and tenant-scoped instead of falling back to demo content', async () => {
    const [products, news, cases, faqs, contact] = await Promise.all([
      ProductsPage({
        params: Promise.resolve({ lang: 'zh', site: 'tenant-a' }),
        searchParams: Promise.resolve({}),
      }),
      NewsPage({
        params: Promise.resolve({ lang: 'zh', site: 'tenant-a' }),
        searchParams: Promise.resolve({}),
      }),
      CasesPage({
        params: Promise.resolve({ lang: 'zh', site: 'tenant-a' }),
        searchParams: Promise.resolve({}),
      }),
      FAQPage({
        params: Promise.resolve({ lang: 'zh', site: 'tenant-a' }),
        searchParams: Promise.resolve({}),
      }),
      ContactPage({ params: Promise.resolve({ lang: 'zh', site: 'tenant-a' }) }),
    ])
    const html = [products, news, cases, faqs, contact]
      .map((page) => renderToStaticMarkup(createElement(() => page)))
      .join('\n')
    const contentQueries = mocks.find.mock.calls
      .map(([query]) => query as { collection: string; where?: unknown })
      .filter((query) => query.collection !== 'tenants')

    expect(contentQueries.length).toBeGreaterThanOrEqual(4)
    for (const query of contentQueries) {
      expect(JSON.stringify(query.where)).toContain('"tenant":{"equals":42}')
    }
    expect(html).toContain('name="address"')
    expect(html).not.toContain('匠境古建')
    expect(html).not.toContain('images.pexels.com')
  })
})
