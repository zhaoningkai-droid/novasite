import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { submitInquiryEndpoint } from '@/endpoints/submitInquiry'
import { ExecutiveTenantInquiryForm } from '@/platform/legacy-templates/ExecutiveTenantInquiryForm'

afterEach(() => vi.unstubAllEnvs())

// Scenarios come from the user's demo/live screenshots and optional-phone confirmation.
describe('executive live homepage inquiry matches the selected template', () => {
  it('renders the template panel, four business fields and optional telephone in Chinese', () => {
    const html = renderToStaticMarkup(
      createElement(ExecutiveTenantInquiryForm, {
        locale: 'zh',
        site: 'tenant-a',
        requiredFields: { phone: true },
      }),
    )
    expect(html).toContain('class="ed-inquiry-form"')
    expect(html).toContain('class="ed-inquiry-form__row"')
    expect(html).toContain('称呼')
    expect(html).toContain('项目需求')
    expect(html).toContain('（选填）')
    expect(html).toContain('ed-button ed-button--blue')
    const dom = document.createElement('div')
    dom.innerHTML = html
    expect(dom.querySelector('input[name="phone"]')?.hasAttribute('required')).toBe(false)
    expect(html).not.toContain('name="capacity"')
    expect(html).not.toContain('name="country"')
    expect(html).not.toContain('name="product"')
    expect(html).not.toContain('name="company"')
    expect(html).not.toContain('演示表单')
  })

  it('localizes the form and keeps a company field if that customer requires it', () => {
    const html = renderToStaticMarkup(
      createElement(ExecutiveTenantInquiryForm, {
        locale: 'en',
        site: 'tenant-b',
        requiredFields: { company: true },
      }),
    )
    expect(html).toContain('Project requirements')
    expect(html).toContain('(optional)')
    const dom = document.createElement('div')
    dom.innerHTML = html
    expect(dom.querySelector('input[name="company"]')?.hasAttribute('required')).toBe(true)
    expect(html).not.toContain('项目需求')
  })

  async function send(templateKey: string, clientTemplate?: string) {
    vi.stubEnv('INQUIRY_PERSISTENCE_ENABLED', 'false')
    vi.stubEnv('PLATFORM_ROOT_DOMAIN', '')
    const create = vi.fn().mockResolvedValue({ id: 1 })
    const find = vi
      .fn()
      .mockImplementation(async ({ collection }) =>
        collection === 'templates'
          ? { docs: [{ id: 3, key: templateKey }] }
          : {
              docs: [
                {
                  id: 42,
                  selectedTemplate: 3,
                  fixedPages: { homepage: { inquiryRequiredFields: { phone: true } } },
                },
              ],
            },
      )
    const req = {
      headers: new Headers(),
      json: async () => ({
        site: 'tenant-inquiry-test',
        name: 'Form verification',
        email: 'inquiry-test@example.com',
        message: 'Please quote standard bolts.',
        ...(clientTemplate ? { templateKey: clientTemplate } : {}),
      }),
      payload: { create, find },
    } as unknown as PayloadRequest
    return { response: await submitInquiryEndpoint.handler?.(req), create }
  }

  it('accepts a real executive-template inquiry without phone and preserves tenant attribution', async () => {
    const { response, create } = await send('executive-industrial-pro-v1')
    expect(response?.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'leads',
        data: expect.objectContaining({ tenant: 42, phone: '' }),
      }),
    )
  })

  it('does not let the browser change another template’s required telephone rule', async () => {
    const { response, create } = await send('power-engineering-v1', 'executive-industrial-pro-v1')
    expect(response?.status).toBe(400)
    expect(create).not.toHaveBeenCalled()
  })
})
