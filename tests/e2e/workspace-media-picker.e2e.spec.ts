import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' }
const fixture = { buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#2864e8"/></svg>'), mimeType: 'image/svg+xml', name: 'step-08-media.svg' }

const openCompanyProduct = async (page: Parameters<typeof login>[0]['page'], name: string) => {
  await page.goto('/workspace/companies')
  await page.getByLabel('搜索公司').fill(name)
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.getByRole('link', { name: '内容管理' }).click()
  await page.getByRole('link', { name: '编辑基础信息' }).first().click()
  await page.waitForURL(/\/workspace\/[^/]+\/website\/content\/\d+\/edit$/)
  const productID = Number(page.url().match(/content\/(\d+)\/edit/)?.[1])
  expect(productID).toBeGreaterThan(0)
  return productID
}

const upload = async (page: Parameters<typeof login>[0]['page'], alt: string) => {
  await page.getByLabel('图片说明').fill(alt)
  await page.getByLabel('上传图片').setInputFiles(fixture)
  const responsePromise = page.waitForResponse((response) => response.url().includes('/api/workspace/') && /\/media$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
  await page.getByRole('button', { name: '上传到媒体库' }).click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  return (await response.json() as { media: { id: number } }).media.id
}

const requestJSON = async (page: Parameters<typeof login>[0]['page'], url: string, options: RequestInit) => page.evaluate(async ({ options, url }) => {
  const response = await fetch(url, options)
  return { body: await response.json(), status: response.status }
}, { options, url })

test('媒体库只显示当前公司，上传后可复用，且拒绝跨公司绑定', async ({ page }) => {
  await login({ page, user: adminUser })
  let voltMediaID = 0
  let huadongMediaID = 0
  try {
    const voltProductID = await openCompanyProduct(page, 'VoltTrans')
    await expect(page.getByRole('heading', { name: '产品图片' })).toBeVisible()
    voltMediaID = await upload(page, '第8步 VoltTrans 验证图片')
    const voltCard = page.locator('article').filter({ hasText: '第8步 VoltTrans 验证图片' })
    await expect(voltCard).toBeVisible()
    const bindResponse = page.waitForResponse((response) => response.url().includes(`/products/${voltProductID}/media`) && response.request().method() === 'PATCH')
    await voltCard.getByRole('button', { name: '绑定到产品' }).click()
    const bindResult = await bindResponse
    if (bindResult.status() !== 200) throw new Error(await bindResult.text())
    await expect(voltCard.getByText('已绑定')).toBeVisible()
    await voltCard.getByRole('button', { name: '移除' }).click()
    await expect(voltCard.getByRole('button', { name: '绑定到产品' })).toBeVisible()

    const huadongProductID = await openCompanyProduct(page, '华东紧固件制造有限公司')
    await expect(page.getByText('第8步 VoltTrans 验证图片')).toHaveCount(0)
    huadongMediaID = await upload(page, '第8步 华东验证图片')
    const cross = await requestJSON(page, `/api/workspace/huadong-fasteners/products/${huadongProductID}/media`, { body: JSON.stringify({ mediaID: voltMediaID, mode: 'add' }), headers: { 'Content-Type': 'application/json' }, method: 'PATCH' })
    expect(cross.status).toBe(403)
    expect(cross.body).toMatchObject({ message: '该图片不属于当前公司，不能绑定到产品。' })

    await page.getByLabel('搜索媒体').fill('第8步 华东验证图片')
    await page.getByRole('button', { name: '搜索' }).click()
    await expect(page.locator('article').filter({ hasText: '第8步 华东验证图片' })).toBeVisible()
  } finally {
    if (huadongMediaID) await requestJSON(page, `/api/workspace/huadong-fasteners/media/${huadongMediaID}`, { method: 'DELETE' })
    if (voltMediaID) {
      await openCompanyProduct(page, 'VoltTrans')
      await requestJSON(page, `/api/workspace/volttrans/media/${voltMediaID}`, { method: 'DELETE' })
    }
  }
})
