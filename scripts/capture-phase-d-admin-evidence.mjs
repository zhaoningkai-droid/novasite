import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/phase-d/after'
await fs.mkdir(output, { recursive: true })

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
await page.goto(`${baseURL}/admin/collections/tenants/2?locale=zh`, { waitUntil: 'domcontentloaded' })
const fixedPages = page.getByText('固定页面编辑', { exact: true }).last()
await fixedPages.scrollIntoViewIfNeeded({ timeout: 15_000 })
await fixedPages.click({ timeout: 15_000 })
await page.waitForTimeout(500)
await page.screenshot({ path: `${output}/05-admin-home-modules.png`, fullPage: false })

await browser.close()
console.log(`${output}/05-admin-home-modules.png`)
