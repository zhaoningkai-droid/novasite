import { getPayload } from 'payload'

import config from '../src/payload.config'

const email = process.env.PRIMARY_EMAIL || ''
const password = process.env.PRIMARY_PASSWORD || ''
if (!email || !password) throw new Error('缺少主账号验证信息。')

const payload = await getPayload({ config })
const login = await payload.login({ collection: 'users', data: { email, password } })
if (!login.token) throw new Error('主账号登录失败。')
const tenantResult = await payload.find({ collection: 'tenants', limit: 1, overrideAccess: true, where: { slug: { equals: 'volttrans' } } })
const tenant = tenantResult.docs[0]
if (!tenant) throw new Error('未找到测试站点。')
const categoryResult = await payload.find({ collection: 'product-categories', limit: 1, overrideAccess: true, where: { tenant: { equals: tenant.id } } })
const category = categoryResult.docs[0]
if (!category) throw new Error('测试站点缺少产品分类。')

const testProduct = await payload.create({
  collection: 'products',
  locale: 'zh',
  overrideAccess: true,
  data: {
    tenant: tenant.id,
    category: category.id,
    title: '__NovaSite_delete_verification__',
    slug: `delete-verification-${Date.now()}`,
    description: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ text: 'temporary verification', type: 'text', version: 1 }], direction: null, format: '', indent: 0, version: 1 }], direction: null, format: '', indent: 0, version: 1 } },
  } as never,
})

await payload.create({
  collection: 'product-specifications',
  overrideAccess: true,
  data: {
    tenant: tenant.id,
    product: testProduct.id,
    title: 'temporary verification',
    localeCode: 'zh',
    items: [{ label: 'verification', value: 'ok' }],
  },
})

try {
  const response = await fetch('http://localhost:3100/api/workspace/volttrans/products/bulk', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `payload-token=${login.token}; payload-tenant=${tenant.id}`,
    },
    body: JSON.stringify({ ids: [testProduct.id] }),
  })
  const result = await response.json() as { message?: string }
  const stillExists = await payload.findByID({ collection: 'products', id: testProduct.id, overrideAccess: true }).then(() => true).catch(() => false)
  if (!response.ok || stillExists) throw new Error(result.message || '产品删除接口验证失败。')
  console.log(JSON.stringify({ primaryProductDeleteRoute: 'passed' }, null, 2))
} finally {
  const remains = await payload.findByID({ collection: 'products', id: testProduct.id, overrideAccess: true }).then(() => true).catch(() => false)
  if (remains) await payload.delete({ collection: 'products', id: testProduct.id, overrideAccess: true })
}
