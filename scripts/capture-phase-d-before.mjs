import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/phase-d/before'
await fs.mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()
await page.goto(`${baseURL}/s/huadong-fasteners/zh`, { waitUntil: 'networkidle' })
await page.locator('h1').first().waitFor()
await page.screenshot({ path: `${output}/01-huadong-home.png`, fullPage: false })

const login = await page.request.post(`${baseURL}/api/users/login`, {
  data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' },
})
if (!login.ok()) throw new Error(`后台登录失败：${login.status()}`)
await context.addCookies([{ name: 'payload-tenant', value: '2', url: baseURL }])
await page.goto(`${baseURL}/admin/collections/tenants/2?locale=zh`, { waitUntil: 'networkidle' })
await page.locator('h1').first().waitFor()
await page.screenshot({ path: `${output}/02-site-settings-before.png`, fullPage: false })
await browser.close()
console.log(output)
