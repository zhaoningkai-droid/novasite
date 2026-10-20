import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitInquiryEndpoint } from '@/endpoints/submitInquiry'

afterEach(() => vi.unstubAllEnvs())

// Reproduces the user's failing /s/<company>/zh address on the admin host.
describe('published website inquiries from the admin preview', () => {
  async function submit({
    source = 'https://admin.o669.com/s/company-a/zh',
    origin = 'https://admin.o669.com',
    referer = source,
    site = 'company-a',
    published = true,
    host = 'admin.o669.com',
  }: {
    source?: string
    origin?: string
    referer?: string
    site?: string
    published?: boolean
    host?: string
  } = {}) {
    vi.stubEnv('PLATFORM_DOMAINS_ENABLED', 'true')
    vi.stubEnv('PLATFORM_ROOT_DOMAIN', 'o669.com')
    vi.stubEnv('PLATFORM_ADMIN_HOST', 'admin.o669.com')
    vi.stubEnv('INQUIRY_PERSISTENCE_ENABLED', 'false')
    const create = vi.fn().mockResolvedValue({ id: 71 })
    const find = vi.fn().mockResolvedValue({
      docs: published
        ? [{ id: 42, fixedPages: { homepage: { inquiryRequiredFields: { phone: false } } } }]
        : [],
    })
    const req = {
      headers: new Headers({ host, origin, referer }),
      json: async () => ({
        site,
        sourcePage: source,
        name: 'Preview test',
        email: 'preview@example.com',
        message: 'Preview inquiry submission verification.',
      }),
      payload: { find, create },
    } as unknown as PayloadRequest
    return { response: await submitInquiryEndpoint.handler?.(req), find, create }
  }

  it('persists to the resolved company when the preview URL, origin and referer agree', async () => {
    const { response, find, create } = await submit()
    expect(response?.status).toBe(201)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ slug: { equals: 'company-a' } }, { status: { equals: 'published' } }] },
      }),
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenant: 42, phone: '' }),
      }),
    )
  })

  it.each([
    { site: 'company-b' },
    { origin: 'https://untrusted.example' },
    { source: 'https://untrusted.example/s/company-a/zh' },
    { referer: 'https://admin.o669.com/s/company-b/zh' },
    { source: 'https://admin.o669.com/workspace/company-a/geo/creation' },
    { source: 'https://admin.o669.com/s/company-a/invalid-language' },
  ])('rejects a mismatched company or invalid preview source: %j', async (values) => {
    const { response, create } = await submit(values)
    expect(response?.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
  })

  it('does not accept inquiries for unpublished or missing companies', async () => {
    const { response, create } = await submit({ published: false })
    expect(response?.status).toBe(404)
    expect(create).not.toHaveBeenCalled()
  })

  it('preserves the independent customer-domain submission path', async () => {
    const { response } = await submit({
      host: 'company-a.o669.com',
      origin: 'https://company-a.o669.com',
      source: 'https://company-a.o669.com/zh',
    })
    expect(response?.status).toBe(201)
  })
})
