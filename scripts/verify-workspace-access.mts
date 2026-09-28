import { getPayload } from 'payload'

import config from '../src/payload.config'
import { Products } from '../src/collections/Products'

const reviewerEmail = process.env.REVIEWER_EMAIL || ''
const reviewerPassword = process.env.REVIEWER_PASSWORD || ''
const primaryEmail = process.env.PRIMARY_EMAIL || ''
const primaryPassword = process.env.PRIMARY_PASSWORD || ''

if (![reviewerEmail, reviewerPassword, primaryEmail, primaryPassword].every(Boolean)) {
  throw new Error('缺少验证账号环境变量。')
}

const payload = await getPayload({ config })
const reviewerLogin = await payload.login({ collection: 'users', data: { email: reviewerEmail, password: reviewerPassword } })
const primaryLogin = await payload.login({ collection: 'users', data: { email: primaryEmail, password: primaryPassword } })
if (!reviewerLogin.token || !primaryLogin.token) throw new Error('账号登录验证失败。')

const reviewer = reviewerLogin.user
const primary = primaryLogin.user
if (!reviewer || !primary) throw new Error('登录用户信息缺失。')

const reviewerCompanies = await payload.find({
  collection: 'tenants',
  depth: 0,
  limit: 100,
  overrideAccess: false,
  user: reviewer,
})
const reviewerTenant = reviewerCompanies.docs[0]
if (!reviewerTenant) throw new Error('临时账号没有可访问的站点。')

const primaryCompanies = await payload.find({ collection: 'tenants', depth: 0, limit: 100, overrideAccess: false, user: primary })
const products = await payload.find({ collection: 'products', depth: 0, limit: 1, overrideAccess: false, user: reviewer, where: { tenant: { equals: reviewerTenant.id } } })
let reviewerDeleteDenied = true
if (products.docs[0]) {
  try {
    await payload.delete({ collection: 'products', id: products.docs[0].id, overrideAccess: false, user: reviewer })
    reviewerDeleteDenied = false
  } catch {
    reviewerDeleteDenied = true
  }
}

const primaryCanDeleteProducts = Boolean(await Products.access?.delete?.({ req: { user: primary } } as never))

console.log(JSON.stringify({
  reviewerLogin: true,
  reviewerCompanySlugs: reviewerCompanies.docs.map((company) => company.slug),
  reviewerDeleteDenied,
  primaryLogin: true,
  primaryCompanyCount: primaryCompanies.totalDocs,
  primaryCanDeleteProducts,
}, null, 2))
