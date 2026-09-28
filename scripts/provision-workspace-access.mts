import { getPayload } from 'payload'

import config from '../src/payload.config'

const required = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`缺少 ${name}`)
  return value
}

const primaryEmailBefore = required('PRIMARY_EMAIL_BEFORE').toLowerCase()
const primaryEmail = required('PRIMARY_EMAIL').toLowerCase()
const primaryPassword = required('PRIMARY_PASSWORD')
const reviewerEmail = required('REVIEWER_EMAIL').toLowerCase()
const reviewerPassword = required('REVIEWER_PASSWORD')
const tenantSlug = process.env.REVIEWER_TENANT_SLUG?.trim() || 'volttrans'
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

const payload = await getPayload({ config })

const primary = await payload.find({
  collection: 'users',
  limit: 1,
  overrideAccess: true,
  where: { email: { equals: primaryEmailBefore } },
})

if (!primary.docs[0]) throw new Error('未找到需要迁移的主账号。')

const tenantResult = await payload.find({
  collection: 'tenants',
  limit: 1,
  overrideAccess: true,
  where: { slug: { equals: tenantSlug } },
})
const tenant = tenantResult.docs[0]
if (!tenant) throw new Error(`未找到站点：${tenantSlug}`)

await payload.update({
  collection: 'users',
  id: primary.docs[0].id,
  overrideAccess: true,
  data: {
    email: primaryEmail,
    password: primaryPassword,
    roles: ['super-admin'],
    expiresAt: null,
  },
})

const existingReviewer = await payload.find({
  collection: 'users',
  limit: 1,
  overrideAccess: true,
  where: { email: { equals: reviewerEmail } },
})

const reviewerData = {
  email: reviewerEmail,
  name: '临时查看账号（7 天）',
  password: reviewerPassword,
  roles: ['viewer'] as const,
  expiresAt: expiresAt.toISOString(),
  tenants: [{ tenant: tenant.id }],
}

if (existingReviewer.docs[0]) {
  await payload.update({ collection: 'users', id: existingReviewer.docs[0].id, overrideAccess: true, data: reviewerData })
} else {
  await payload.create({ collection: 'users', overrideAccess: true, data: reviewerData })
}

console.log(JSON.stringify({
  primaryAccountUpdated: true,
  primaryRole: 'super-admin',
  reviewerAccountReady: true,
  reviewerRole: 'viewer',
  reviewerTenant: tenant.slug,
  expiresAt: expiresAt.toISOString(),
}, null, 2))
