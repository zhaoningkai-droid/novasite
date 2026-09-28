import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-08'
const checks: Record<string, unknown> = { startedAt: new Date().toISOString() }
const fixture = { buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#2864e8"/></svg>'), mimeType: 'image/svg+xml', name: 'step-08-evidence.svg' }
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })

const openProduct = async (page: Awaited<ReturnType<ReturnType<typeof browser.newContext>['newPage']>>, company: string) => {
  await page.goto(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await page.getByLabel('搜索公司').fill(company)
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.getByRole('link', { name: '内容管理' }).click()
  await page.getByRole('link', { name: '编辑基础信息' }).first().click()
  await page.waitForURL(/\/workspace\/[^/]+\/website\/content\/\d+\/edit$/)
  return Number(page.url().match(/content\/(\d+)\/edit/)?.[1])
}

const jsonRequest = async (page: Awaited<ReturnType<ReturnType<typeof browser.newContext>['newPage']>>, url: string, options: RequestInit) => page.evaluate(async ({ options, url }) => {
  const response = await fetch(url, options)
  return { body: await response.json(), status: response.status }
}, { options, url })

let voltMediaID = 0
let huadongMediaID = 0
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const page = await context.newPage()
  await page.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await page.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
  await page.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })

  const voltProductID = await openProduct(page, 'VoltTrans')
  await page.getByLabel('图片说明').fill('第8步 VoltTrans 媒体库验证图片')
  await page.getByLabel('上传图片').setInputFiles(fixture)
  const uploadResponse = page.waitForResponse((response) => response.url().endsWith('/api/workspace/volttrans/media') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '上传到媒体库' }).click()
  voltMediaID = (await (await uploadResponse).json() as { media: { id: number } }).media.id
  const voltCard = page.locator('article').filter({ hasText: '第8步 VoltTrans 媒体库验证图片' })
  await voltCard.getByRole('button', { name: '绑定到产品' }).click()
  await expect(voltCard.getByText('已绑定')).toBeVisible()
  await page.screenshot({ path: `${output}/01-volttrans-upload-and-reuse.png`, fullPage: false })
  await voltCard.getByRole('button', { name: '移除' }).click()

  const huadongProductID = await openProduct(page, '华东紧固件制造有限公司')
  checks.voltMediaHiddenFromHuadong = await page.getByText('第8步 VoltTrans 媒体库验证图片').count() === 0
  await page.getByLabel('图片说明').fill('第8步 华东媒体库验证图片')
  await page.getByLabel('上传图片').setInputFiles(fixture)
  const huadongUpload = page.waitForResponse((response) => response.url().endsWith('/api/workspace/huadong-fasteners/media') && response.request().method() === 'POST')
  await page.getByRole('button', { name: '上传到媒体库' }).click()
  huadongMediaID = (await (await huadongUpload).json() as { media: { id: number } }).media.id
  const cross = await jsonRequest(page, `/api/workspace/huadong-fasteners/products/${huadongProductID}/media`, { body: JSON.stringify({ mediaID: voltMediaID, mode: 'add' }), headers: { 'Content-Type': 'application/json' }, method: 'PATCH' })
  checks.crossCompanyBindingStatus = cross.status
  checks.crossCompanyBindingMessage = cross.body.message
  await page.screenshot({ path: `${output}/02-huadong-isolated-media-library.png`, fullPage: false })
  await jsonRequest(page, `/api/workspace/huadong-fasteners/media/${huadongMediaID}`, { method: 'DELETE' })
  await context.close()
} finally {
  if (voltMediaID) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(`${baseURL}/admin/login`)
    await page.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
    await page.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(`${baseURL}/workspace/companies`)
    await openProduct(page, 'VoltTrans')
    await jsonRequest(page, `/api/workspace/volttrans/media/${voltMediaID}`, { method: 'DELETE' })
    await context.close()
  }
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
