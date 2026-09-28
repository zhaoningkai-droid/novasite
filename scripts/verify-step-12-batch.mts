import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const output = 'docs/evidence/admin-redesign/step-12/09-batch-check.json'
const checks: Record<string, unknown> = { startedAt: new Date().toISOString() }
const temporaryIDs: number[] = []
const source = await payload.find({
  collection: 'products',
  depth: 0,
  limit: 1,
  locale: 'zh',
  overrideAccess: true,
  where: { tenant: { equals: 2 } },
})
const template = source.docs[0]
if (!template) throw new Error('没有可用于批量删除验证的华东产品。')
for (const suffix of ['甲', '乙']) {
  const product = await payload.create({
    collection: 'products',
    locale: 'zh',
    overrideAccess: true,
    data: {
      category: template.category,
      description: template.description,
      externalImages: [],
      gallery: template.gallery,
      model: `STEP12-BATCH-${suffix}`,
      slug: `step12-batch-${suffix}-${Date.now()}`,
      specifications: [],
      summary: '第12步批量删除临时记录。',
      tenant: 2,
      title: `第12步批量删除验证${suffix}`,
    },
  })
  temporaryIDs.push(product.id)
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
  await page.goto(
    'http://localhost:3100/workspace/huadong-fasteners/website/content?q=第12步批量删除验证',
    { waitUntil: 'networkidle' },
  )
  await expect(page.getByText('第12步批量删除验证甲')).toBeVisible()
  await page.getByLabel('选择 第12步批量删除验证甲').check()
  await page.getByLabel('选择 第12步批量删除验证乙').check()
  await page.screenshot({
    path: 'docs/evidence/admin-redesign/step-12/09-batch-selected.png',
    fullPage: true,
  })
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '批量删除' }).click()
  await expect(page.getByText('第12步批量删除验证甲')).toHaveCount(0)
  checks.deletedUI = true
  checks.deletedRecords =
    (
      await payload.find({
        collection: 'products',
        limit: 10,
        overrideAccess: true,
        where: { id: { in: temporaryIDs } },
      })
    ).totalDocs === 0
  const volt = (
    await payload.find({
      collection: 'products',
      limit: 1,
      overrideAccess: true,
      where: { tenant: { equals: 1 } },
    })
  ).docs[0]
  checks.crossCompany = await page.evaluate(async (id) => {
    const response = await fetch('/api/workspace/huadong-fasteners/products/bulk', {
      body: JSON.stringify({ ids: [id] }),
      headers: { 'content-type': 'application/json' },
      method: 'DELETE',
    })
    return { body: await response.json(), status: response.status }
  }, volt.id)
  await page.screenshot({
    path: 'docs/evidence/admin-redesign/step-12/10-batch-deleted.png',
    fullPage: true,
  })
} finally {
  for (const id of temporaryIDs)
    await payload.delete({ collection: 'products', id, overrideAccess: true }).catch(() => {})
  checks.finishedAt = new Date().toISOString()
  await writeFile(output, `${JSON.stringify(checks, null, 2)}\n`)
  await context.close()
  await browser.close()
}
