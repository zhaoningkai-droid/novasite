import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const source = await payload.find({
  collection: 'products',
  limit: 1,
  locale: 'zh',
  overrideAccess: true,
  where: { tenant: { equals: 2 } },
})
const product = source.docs[0]
if (!product) throw new Error('没有可验证的华东产品。')
const original = Boolean(product.featured)
const report: Record<string, unknown> = {
  productID: product.id,
  productTitle: product.title,
  original,
}
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()
try {
  const login = await context.request.post('http://localhost:3100/api/users/login', {
    data: {
      email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
      password: process.env.SEED_ADMIN_PASSWORD || '',
    },
  })
  const { token } = (await login.json()) as { token: string }
  await context.addCookies([
    { domain: 'localhost', name: 'payload-token', path: '/', value: token },
    { domain: 'localhost', name: 'payload-tenant', path: '/', value: '2' },
  ])
  await page.goto('http://localhost:3100/workspace/huadong-fasteners/website/content', {
    waitUntil: 'networkidle',
  })
  const label = `${original ? '取消推荐' : '推荐'} ${product.title} 到首页`
  await page.getByLabel(label).click()
  await expect(
    page.getByLabel(`${original ? '推荐' : '取消推荐'} ${product.title} 到首页`),
  ).toBeVisible()
  const changed = await payload.findByID({
    collection: 'products',
    id: product.id,
    locale: 'zh',
    overrideAccess: true,
  })
  report.changed = Boolean(changed.featured)
  await page.screenshot({
    path: 'docs/evidence/admin-redesign/step-12/15-featured-toggle.png',
    fullPage: true,
  })
  await page.getByLabel(`${original ? '推荐' : '取消推荐'} ${product.title} 到首页`).click()
  await expect(page.getByLabel(label)).toBeVisible()
  const restored = await payload.findByID({
    collection: 'products',
    id: product.id,
    locale: 'zh',
    overrideAccess: true,
  })
  report.restored = Boolean(restored.featured)
  if (report.changed !== !original || report.restored !== original)
    throw new Error(`推荐状态回归失败：${JSON.stringify(report)}`)
} finally {
  await writeFile(
    'docs/evidence/admin-redesign/step-12/15-featured-toggle.json',
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await context.close()
  await browser.close()
}
