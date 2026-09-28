import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const [media, products] = await Promise.all([
  payload.find({
    collection: 'media',
    depth: 0,
    limit: 100,
    overrideAccess: true,
    where: { filename: { contains: 'step12-product' } },
  }),
  payload.find({ collection: 'products', depth: 0, limit: 200, overrideAccess: true }),
])
const referenced = new Set(
  products.docs.flatMap((product) =>
    Array.isArray(product.gallery)
      ? product.gallery.filter((id): id is number => typeof id === 'number')
      : [],
  ),
)
const removed: number[] = []
const retained: number[] = []

for (const item of media.docs) {
  if (referenced.has(item.id)) retained.push(item.id)
  else {
    await payload.delete({ collection: 'media', id: item.id, overrideAccess: true })
    removed.push(item.id)
  }
}

console.log(JSON.stringify({ removed, retained }, null, 2))
