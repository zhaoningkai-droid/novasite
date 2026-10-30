import { getPayload } from 'payload'
import config from '../src/payload.config'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
const payload = await getPayload({ config })
const clean = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(clean)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => !['updatedAt', 'createdAt'].includes(k))
            .map(([k, x]) => [k, clean(x)]),
        )
      : v
try {
  const site = (
    await payload.find({
      collection: 'tenants',
      where: { slug: { equals: 'huadong-fasteners' } },
      locale: 'zh',
      depth: 0,
      limit: 1,
    })
  ).docs[0]
  const result: Record<string, unknown> = {
    siteID: site.id,
    selectedTemplate: site.selectedTemplate,
    collections: {},
  }
  for (const collection of [
    'tenants',
    'products',
    'news',
    'cases',
    'posts',
    'faqs',
    'site-navigation',
    'product-categories',
    'news-categories',
    'case-categories',
    'categories',
  ] as const) {
    const rows =
      collection === 'tenants'
        ? [site]
        : (
            await payload.find({
              collection,
              where: { tenant: { equals: site.id } },
              locale: 'all',
              depth: 0,
              pagination: false,
              sort: 'id',
            })
          ).docs
    ;(result.collections as Record<string, unknown>)[collection] = {
      count: rows.length,
      hash: createHash('sha256')
        .update(JSON.stringify(clean(rows)))
        .digest('hex'),
    }
  }
  await writeFile(process.argv[2], JSON.stringify(result, null, 2))
  console.log(
    'Snapshot saved',
    Object.fromEntries(
      Object.entries(result.collections as Record<string, { count: number }>).map(([k, v]) => [
        k,
        v.count,
      ]),
    ),
  )
} finally {
  await payload.destroy()
}
process.exit(0)
