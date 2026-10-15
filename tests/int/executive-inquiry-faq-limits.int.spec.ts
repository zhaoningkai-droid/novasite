import { APIError, type PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { submitInquiryEndpoint } from '@/endpoints/submitInquiry'
import {
  assertTenantFAQCapacity,
  TENANT_FAQ_LIMIT,
  TENANT_FAQ_LIMIT_MESSAGE,
} from '@/platform/faq-limits'

describe('generic inquiry address and FAQ limit', () => {
  it('stores the visitor address on the lead record', async () => {
    const create = vi.fn().mockResolvedValue({ id: 1 })
    const find = vi.fn().mockResolvedValue({
      docs: [{ id: 42, fixedPages: { homepage: {} } }],
    })
    const request = {
      headers: new Headers({ 'x-forwarded-for': '198.51.100.27' }),
      json: async () => ({
        address: '18 Heritage Lane, Nanjing',
        email: 'visitor@example.com',
        message: 'Please send the product catalogue and pricing.',
        name: 'Visitor',
        phone: '+86 138 0000 0000',
        site: 'tenant-address-test',
      }),
      payload: { create, find },
    } as unknown as PayloadRequest

    const response = await submitInquiryEndpoint.handler?.(request)

    expect(response?.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'leads',
        data: expect.objectContaining({ address: '18 Heritage Lane, Nanjing', tenant: 42 }),
      }),
    )
  })

  it('allows FAQ additions below the limit and rejects the 26th record', () => {
    expect(() => assertTenantFAQCapacity(TENANT_FAQ_LIMIT - 1)).not.toThrow()
    expect(() => assertTenantFAQCapacity(TENANT_FAQ_LIMIT)).toThrowError(
      expect.objectContaining({
        message: TENANT_FAQ_LIMIT_MESSAGE,
        status: 422,
      }),
    )
    try {
      assertTenantFAQCapacity(TENANT_FAQ_LIMIT)
    } catch (error) {
      expect(error).toBeInstanceOf(APIError)
    }
  })
})
