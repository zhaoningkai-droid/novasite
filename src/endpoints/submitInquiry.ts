import { APIError, type Endpoint } from 'payload'
import { classifyPlatformHost, platformDomainsEnabled } from '@/platform/platform-hosts'
import { inquiryPersistenceEnabled, persistInquiry, type InquiryData } from '@/platform/inquiry/persist'
import { inquiryRequiredFields, inquiryTextLimits } from '@/platform/inquiry/required-fields'
import { inquiryProductID, inquiryText, readInquiryRequest } from '@/platform/inquiry/request'

const recentSubmissions = new Map<string, number[]>()
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 5

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export const submitInquiryEndpoint: Endpoint = {
  path: '/submit-inquiry',
  method: 'post',
  handler: async (req) => {
    let body: Record<string, unknown>
    let input: Record<string, string>
    let productID: number | undefined
    try {
      body = await readInquiryRequest(req)
      if (inquiryText(body, 'website', 200)) return Response.json({ ok: true })
      productID = inquiryProductID(body)
      input = Object.fromEntries(Object.entries(inquiryTextLimits)
        .map(([field, maximum]) => [field, inquiryText(body, field, maximum,
          ['sourcePage', 'utmSource', 'utmCampaign'].includes(field)
          || (field === 'product' && productID !== undefined))]))
    } catch (error) {
      return Response.json({ error: error instanceof APIError ? error.message : 'Invalid request.' },
        { status: error instanceof APIError ? error.status : 400 })
    }

    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const clientKey = forwarded || req.headers.get('x-real-ip') || 'local'
    const siteSlug = input.site
    const host = platformDomainsEnabled() ? classifyPlatformHost(req.headers.get('host')) : null
    if (host && (host.kind !== 'tenant' || host.slug !== siteSlug)) return Response.json({ error: 'Site not found.' }, { status: 404 })
    const name = input.name
    const email = input.email.toLowerCase()
    const phone = input.phone
    const company = input.company
    const address = input.address
    const message = input.message
    if (!siteSlug) return Response.json({ error: 'Site not found.' }, { status: 404 })

    const sites = await req.payload.find({
      collection: 'tenants',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
      where: { and: [{ slug: { equals: siteSlug } }, host ? { status: { equals: 'published' } } : { status: { not_equals: 'suspended' } }] },
    })
    const site = sites.docs[0]
    if (!site) return Response.json({ error: 'Site not found.' }, { status: 404 })

    const configured =
      (site.fixedPages?.homepage as { inquiryRequiredFields?: Record<string, boolean> } | undefined)
        ?.inquiryRequiredFields || {}
    const required = inquiryRequiredFields(configured)
    if (
      (required.name && !name) ||
      (required.company && !company) ||
      (required.email && !isEmail(email)) ||
      (required.phone && !phone) ||
      (required.message && message.length < 10)
    ) {
      return Response.json({ error: 'Please complete the required fields.' }, { status: 400 })
    }

    const productModel = input.product
    if (productID) {
      const products = await req.payload.find({
        collection: 'products',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        req,
        where: {
          and: [
            { id: { equals: productID } },
            { tenant: { equals: site.id } },
            { _status: { equals: 'published' } },
          ],
        },
      })
      if (!products.docs[0]) return Response.json({ error: 'Invalid product.' }, { status: 400 })
    }
    const data: InquiryData = {
        tenant: site.id,
        name,
        company,
        address,
        email,
        phone,
        country: input.country,
        ...(productID ? { product: productID } : {}),
        capacity: input.capacity,
        message: productModel ? `Interested product: ${productModel}\n\n${message}` : message,
        sourcePage: input.sourcePage,
        utmSource: input.utmSource,
        utmCampaign: input.utmCampaign,
        status: 'new',
    }
    try {
      if (inquiryPersistenceEnabled()) {
        const result = await persistInquiry({ payload: req.payload, req, data, clientIP: clientKey, requestKey: req.headers.get('x-inquiry-request-id') || undefined })
        return Response.json({ ok: true }, { status: result.duplicate ? 200 : 201 })
      }
      // Local compatibility path only. Production preflight requires persistence.
      const now = Date.now()
      const localKey = `${site.id}:${clientKey}`
      const active = (recentSubmissions.get(localKey) || []).filter((time) => now - time < RATE_WINDOW_MS)
      if (active.length >= RATE_LIMIT) return Response.json({ error: 'Too many inquiries. Please try again later.' }, { status: 429 })
      await req.payload.create({ collection: 'leads', data, overrideAccess: true, req })
      recentSubmissions.set(localKey, [...active, now])
      if (recentSubmissions.size > 10000) for (const [key, times] of recentSubmissions) {
        if (!times.some((time) => now - time < RATE_WINDOW_MS)) recentSubmissions.delete(key)
      }
      return Response.json({ ok: true }, { status: 201 })
    } catch (error) {
      return Response.json({ error: error instanceof APIError ? error.message : 'Inquiry submission failed. Please retry.' }, { status: error instanceof APIError ? error.status : 503 })
    }
  },
}
