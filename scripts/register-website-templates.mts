import { getPayload } from 'payload'
import config from '../src/payload.config'
import { getNewTemplate } from '../src/platform/new-templates/registry'

// Catalog records only: never migrate, seed, update existing templates or select a tenant template.
if (process.env.NODE_ENV !== 'production') {
  throw new Error(
    'Use NODE_ENV=production to disable automatic development schema synchronization.',
  )
}

const keys = ['plush-607-v1', 'plush-712-v1', 'allynav-v1'] as const
const payload = await getPayload({ config })
try {
  for (const key of keys) {
    const definition = getNewTemplate(key)
    if (!definition) throw new Error(`Template definition missing: ${key}`)
    const existing = await payload.find({
      collection: 'templates',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: key } },
    })
    if (existing.docs[0]) {
      console.log(`Preserved existing catalog record: ${key}`)
      continue
    }
    await payload.create({
      collection: 'templates',
      overrideAccess: true,
      data: {
        key,
        name: definition.name,
        version: definition.version,
        schemaVersion: definition.schemaVersion,
        referenceCode: definition.reference,
        referenceURL: definition.referenceURL,
        industry: definition.industry,
        description: definition.description,
        status: 'published',
        capabilities: ['products', 'blog', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
        visual: { heroStyle: 'technical', cardStyle: 'flat', navigationStyle: 'light' },
      },
    })
    console.log(`Added catalog record: ${key}`)
  }
} finally {
  await payload.destroy()
}
process.exit(0)
