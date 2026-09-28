import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = await readFile(path.resolve(directory, '../docs/evidence/phase-b/fixture-media.svg'))
const payload = await getPayload({ config })
const existing = await payload.find({
  collection: 'media',
  where: { filename: { equals: 'phase-b-media-library.svg' } },
  limit: 1,
  depth: 0,
  overrideAccess: true,
})
const media = existing.docs[0] || await payload.create({
  collection: 'media',
  data: {
    alt: '华东紧固件制造有限公司媒体库验收素材',
    tenant: 2,
  },
  file: {
    data: fixture,
    mimetype: 'image/svg+xml',
    name: 'phase-b-media-library.svg',
    size: fixture.byteLength,
  },
  depth: 0,
  overrideAccess: true,
})

await payload.update({
  collection: 'tenants',
  id: 2,
  data: {
    branding: { favicon: media.id },
    contact: {
      phone: '+86 21 5555 2026',
      wechatQRCode: media.id,
      whatsappQRCode: media.id,
    },
  },
  depth: 0,
  overrideAccess: true,
})

const product = await payload.find({
  collection: 'products',
  where: { tenant: { equals: 2 } },
  limit: 1,
  depth: 0,
  overrideAccess: true,
})
if (!product.docs[0]) throw new Error('未找到华东站产品，无法验证媒体复用。')

const gallery = Array.isArray(product.docs[0].gallery) ? product.docs[0].gallery : []
const galleryIds = gallery.map((item) => typeof item === 'number' ? item : item.id)
if (!galleryIds.includes(media.id)) {
  await payload.update({
    collection: 'products',
    id: product.docs[0].id,
    data: { gallery: [...galleryIds, media.id] },
    depth: 0,
    overrideAccess: true,
  })
}

console.log(JSON.stringify({ mediaId: media.id, productId: product.docs[0].id, filename: media.filename }, null, 2))
