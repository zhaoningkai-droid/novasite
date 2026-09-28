import type { Endpoint } from 'payload'

const recentSubmissions = new Map<string, number[]>()
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 5

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export const submitInquiryEndpoint: Endpoint = {
  path: '/submit-inquiry',
  method: 'post',
  handler: async (req) => {
    const body = (await req.json?.()) as Record<string, unknown>
    if (text(body.website, 200)) return Response.json({ ok: true })

    const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const clientKey = forwarded || req.headers.get('x-real-ip') || 'local'
    const now = Date.now()
    const active = (recentSubmissions.get(clientKey) || []).filter(
      (time) => now - time < RATE_WINDOW_MS,
    )
    if (active.length >= RATE_LIMIT) {
      return Response.json(
        { error: 'Too many inquiries. Please try again later.' },
        { status: 429 },
      )
    }

    const siteSlug = text(body.site, 80)
    const name = text(body.name, 120)
    const email = text(body.email, 200).toLowerCase()
    const phone = text(body.phone, 80)
    const company = text(body.company, 180)
    const message = text(body.message, 4000)
    if (!siteSlug) return Response.json({ error: 'Site not found.' }, { status: 404 })

    const sites = await req.payload.find({
      collection: 'tenants',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
      where: { and: [{ slug: { equals: siteSlug } }, { status: { not_equals: 'suspended' } }] },
    })
    const site = sites.docs[0]
    if (!site) return Response.json({ error: 'Site not found.' }, { status: 404 })

    const configured =
      (site.fixedPages?.homepage as { inquiryRequiredFields?: Record<string, boolean> } | undefined)
        ?.inquiryRequiredFields || {}
    const required = {
      name: true,
      company: false,
      email: true,
      phone: true,
      message: true,
      ...configured,
    }
    if (
      (required.name && !name) ||
      (required.company && !company) ||
      (required.email && !isEmail(email)) ||
      (required.phone && !phone) ||
      (required.message && message.length < 10)
    ) {
      return Response.json({ error: 'Please complete the required fields.' }, { status: 400 })
    }

    const productModel = text(body.product, 160)
    const rawProductID = text(body.productId, 32)
    const productID = rawProductID && /^\d+$/.test(rawProductID) ? Number(rawProductID) : undefined
    if (rawProductID && (!Number.isSafeInteger(productID) || !productID)) {
      return Response.json({ error: 'Invalid product.' }, { status: 400 })
    }
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
    await req.payload.create({
      collection: 'leads',
      data: {
        tenant: site.id,
        name,
        company,
        email,
        phone,
        country: text(body.country, 100),
        ...(productID ? { product: productID } : {}),
        capacity: text(body.capacity, 80),
        message: productModel ? `Interested product: ${productModel}\n\n${message}` : message,
        sourcePage: text(body.sourcePage, 500),
        utmSource: text(body.utmSource, 120),
        utmCampaign: text(body.utmCampaign, 120),
        status: 'new',
      },
      overrideAccess: true,
      req,
    })
    recentSubmissions.set(clientKey, [...active, now])

    return Response.json({ ok: true }, { status: 201 })
  },
}
