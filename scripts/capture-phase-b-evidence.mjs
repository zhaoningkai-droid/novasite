import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const evidenceDir = 'docs/evidence/phase-b/after'
await fs.mkdir(evidenceDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()
const login = await page.request.post(`${baseURL}/api/users/login`, {
  data: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
    password: process.env.SEED_ADMIN_PASSWORD || '',
  },
})
if (!login.ok()) throw new Error(`后台登录失败：${login.status()}`)

await context.addCookies([{ name: 'payload-tenant', value: '2', url: baseURL }])

const capture = async (path, filename, ready) => {
  await page.goto(`${baseURL}${path}`)
  await page.locator('h1').first().waitFor()
  if (ready) await ready()
  await page.screenshot({ path: `${evidenceDir}/${filename}`, fullPage: false })
}

await capture('/admin', '01-dashboard-huadong.png')
await capture('/admin/collections/tenants/2', '02-site-settings-and-media-reuse.png', async () => {
  await page.getByRole('heading', { name: '品牌信息' }).click()
  await page.getByText('微信二维码', { exact: true }).waitFor()
})
await capture('/admin/collections/tenants/2', '02b-contact-qr-media-reuse.png', async () => {
  await page.getByRole('heading', { name: '品牌信息' }).click()
  const contactHeading = page.getByText('询盘与联系方式', { exact: true })
  await contactHeading.scrollIntoViewIfNeeded()
  await page.getByText('WhatsApp 二维码', { exact: true }).waitFor()
})
await capture('/admin/collections/media', '03-media-library.png')
await capture('/admin/collections/products', '04-list-search-filter-bulk.png', async () => {
  await page.getByRole('button', { name: '过滤条件' }).click()
  await page.getByRole('checkbox').nth(1).check()
  await page.getByText('已选择 1 个').waitFor()
})

await browser.close()
console.log(evidenceDir)
