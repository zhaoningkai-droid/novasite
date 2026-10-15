/** Operator-only initialization. Never seed a tenant, media or demo content. */
import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { newTemplates } from '../src/platform/new-templates/registry'

if (process.env.PLATFORM_DEPLOYMENT_MODE !== 'single-ecs' || process.env.BOOTSTRAP_EMPTY_DATABASE !== 'true')
  throw new Error('Explicit empty single-ECS initialization is required.')
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || ''
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Administrator email is required.')
const password = (await readFile('/run/novasite/bootstrap-password', 'utf8')).trim()
if (password.length < 24) throw new Error('Use a generated strong bootstrap password.')
const payload = await getPayload({ config })
try {
  const tenants = await payload.count({ collection: 'tenants', overrideAccess: true })
  const users = await payload.count({ collection: 'users', overrideAccess: true })
  if (tenants.totalDocs || users.totalDocs) throw new Error('Initialization refused: database already has companies or users.')
  // This is a trusted offline system operation, before the web server is exposed.
  await payload.create({ collection: 'users', overrideAccess: true,
    data: { email, password, name: '平台管理员', roles: ['super-admin'] } })
  for (const definition of newTemplates.filter(t => ['power-705-v1', 'autoparts-571-v1'].includes(t.key))) {
    const existing = await payload.find({ collection: 'templates', depth: 0, limit: 1,
      overrideAccess: true, where: { key: { equals: definition.key } } })
    if (!existing.docs.length) await payload.create({ collection: 'templates', overrideAccess: true, data: {
      key: definition.key, name: definition.name, version: definition.version,
      schemaVersion: definition.schemaVersion, industry: definition.industry,
      description: definition.description, referenceCode: definition.reference,
      referenceURL: definition.referenceURL, status: 'published',
      capabilities: ['products', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
      visual: { heroStyle: 'industrial', cardStyle: 'elevated', navigationStyle: 'dark' },
    } })
  }
  process.stdout.write('Initialized one platform administrator and industry template records. No company or customer content created.\n')
} finally { await payload.destroy() }
