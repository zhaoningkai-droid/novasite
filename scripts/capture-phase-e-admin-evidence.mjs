import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/phase-e'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()
const login = await page.request.post(`${baseURL}/api/users/login`, { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
if (!login.ok()) throw new Error(`后台登录失败：${login.status()}`)

await context.addCookies([{ name: 'payload-tenant', value: '2', url: baseURL }])
await page.goto(`${baseURL}/admin/collections/product-specifications?locale=zh`, { waitUntil: 'domcontentloaded' })
await page.getByText('产品技术参数', { exact: true }).first().waitFor()
await page.waitForTimeout(1_500)
await page.screenshot({ path: `${output}/05-admin-huadong-product-specifications.png`, fullPage: false })

await page.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded' })
await page.getByText('当前工作站点', { exact: true }).waitFor()
await page.screenshot({ path: `${output}/06-admin-workspace-and-clean-navigation.png`, fullPage: false })

await browser.close()
console.log(output)
