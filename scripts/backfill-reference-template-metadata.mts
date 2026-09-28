import { getPayload } from 'payload'

import config from '../src/payload.config'
import { newTemplates } from '../src/platform/new-templates/registry'

if (process.env.NODE_ENV !== 'production') {
  throw new Error('Run with NODE_ENV=production so the script cannot push a schema.')
}

const payload = await getPayload({ config })
try {
  const existing = await Promise.all(newTemplates.map(async (definition) => {
    const result = await payload.find({
      collection: 'templates',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: definition.key } },
    })
    if (!result.docs[0]) throw new Error(`Template ${definition.key} is missing; register templates first.`)
    return { definition, template: result.docs[0] }
  }))

  for (const { definition, template } of existing) {
    const changed = template.referenceCode !== definition.reference
      || template.referenceURL !== definition.referenceURL
      || template.schemaVersion !== definition.schemaVersion
      || template.industry !== definition.industry
    if (!changed) {
      console.log(`Metadata already current: ${definition.key}`)
      continue
    }
    await payload.update({
      collection: 'templates',
      id: template.id,
      overrideAccess: true,
      data: {
        referenceCode: definition.reference,
        referenceURL: definition.referenceURL,
        schemaVersion: definition.schemaVersion,
        industry: definition.industry,
      },
    })
    console.log(`Metadata updated: ${definition.key}`)
  }
} finally {
  await payload.destroy()
}
