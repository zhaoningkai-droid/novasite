import { getPayload } from 'payload'
import config from '../src/payload.config'
import { newTemplates } from '../src/platform/new-templates/registry'

// No schema push: NODE_ENV=production is required for this additive local installation.
// Only create absent template records. Never update existing records or tenant selections.
if (process.env.NODE_ENV !== 'production') {
  throw new Error('Run with NODE_ENV=production to disable automatic schema push.')
}
const payload = await getPayload({ config })
try {
  for (const definition of newTemplates) {
    const found = await payload.find({
      collection: 'templates',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: definition.key } },
    })
    if (found.docs.length) {
      console.log(`Already registered: ${definition.key} (${found.docs[0].id})`)
      continue
    }
    const doc = await payload.create({
      collection: 'templates',
      overrideAccess: true,
      data: {
        key: definition.key,
        name: definition.name,
        version: definition.version,
        schemaVersion: definition.schemaVersion,
        referenceCode: definition.reference,
        referenceURL: definition.referenceURL,
        status: 'published',
        industry: definition.industry,
        description: definition.description,
        capabilities: ['products', 'blog', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
        visual: { heroStyle: 'technical', cardStyle: 'flat', navigationStyle: 'light' },
      },
    })
    console.log(`Registered: ${doc.key} (${doc.id})`)
  }
} finally {
  await payload.destroy()
}
