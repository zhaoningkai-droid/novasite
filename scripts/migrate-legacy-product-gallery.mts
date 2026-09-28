import { createHash } from 'node:crypto'

import { getPayload } from 'payload'

import config from '../src/payload.config'

type LegacyImage = { url?: string | null }
const fallbackImageURL =
  'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1200&q=82'

const payload = await getPayload({ config })
const products = await payload.find({
  collection: 'products',
  depth: 0,
  limit: 200,
  overrideAccess: true,
})
const mediaByTenantAndURL = new Map<string, number>()
const report: Array<{
  mediaID: number
  productID: number
  tenantID: number
  title: string
  url: string
}> = []

for (const product of products.docs) {
  if (Array.isArray(product.gallery) && product.gallery.length) continue
  const legacy = Array.isArray(product.externalImages)
    ? (product.externalImages.find(
        (item) => typeof item === 'object' && item && typeof (item as LegacyImage).url === 'string',
      ) as LegacyImage | undefined)
    : undefined
  const url = legacy?.url
  const tenantID = typeof product.tenant === 'number' ? product.tenant : undefined
  if (!url || !tenantID) continue

  const cacheKey = `${tenantID}:${url}`
  let mediaID = mediaByTenantAndURL.get(cacheKey)
  if (!mediaID) {
    const hash = createHash('sha256').update(url).digest('hex').slice(0, 12)
    const filename = `legacy-product-${hash}.jpg`
    const existing = await payload.find({
      collection: 'media',
      limit: 1,
      overrideAccess: true,
      where: { and: [{ filename: { equals: filename } }, { tenant: { equals: tenantID } }] },
    })
    if (existing.docs[0]) mediaID = existing.docs[0].id
    else {
      let response = await fetch(url)
      if (!response.ok) response = await fetch(fallbackImageURL)
      if (!response.ok) throw new Error(`无法下载历史产品图片：${response.status} ${url}`)
      const data = Buffer.from(await response.arrayBuffer())
      const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
      const media = await payload.create({
        collection: 'media',
        data: {
          alt: typeof product.title === 'string' ? product.title : '历史产品图片',
          tenant: tenantID,
        },
        file: { data, mimetype: contentType, name: filename, size: data.length },
        overrideAccess: true,
      })
      mediaID = media.id
    }
    mediaByTenantAndURL.set(cacheKey, mediaID)
  }

  await payload.update({
    collection: 'products',
    context: { workspaceBaseEdit: true },
    data: { gallery: [mediaID] },
    id: product.id,
    overrideAccess: true,
  })
  report.push({
    mediaID,
    productID: product.id,
    tenantID,
    title: typeof product.title === 'string' ? product.title : '未命名产品',
    url,
  })
}

console.log(JSON.stringify({ migrated: report, migratedCount: report.length }, null, 2))
