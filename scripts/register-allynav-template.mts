import { getPayload } from 'payload'
import config from '../src/payload.config'
import { getNewTemplate } from '../src/platform/new-templates/registry'

// Additive catalog registration only. No schema push, existing-record updates or tenant writes.
if (process.env.NODE_ENV !== 'production')
  throw new Error('Run with NODE_ENV=production so automatic schema push is disabled.')
const definition = getNewTemplate('allynav-v1')
if (!definition) throw new Error('AllyNav template definition is missing.')
const payload = await getPayload({ config })
try {
  const found = await payload.find({
    collection: 'templates',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { key: { equals: definition.key } },
  })
  if (found.docs[0]) console.log(`Already registered: ${definition.key} (${found.docs[0].id})`)
  else {
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
        industry: definition.industry,
        description: definition.description,
        status: 'published',
        capabilities: ['products', 'blog', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
        visual: { heroStyle: 'technical', cardStyle: 'flat', navigationStyle: 'light' },
      },
    })
    console.log(`Registered: ${doc.key} (${doc.id}); customer selections unchanged.`)
  }
} finally {
  await payload.destroy()
}
