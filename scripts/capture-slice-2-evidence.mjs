import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const evidenceDir = 'docs/evidence/slice-2'
await fs.mkdir(evidenceDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 900 } })
const page = await context.newPage()
const login = await page.request.post(`${baseURL}/api/users/login`, {
  data: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
    password: process.env.SEED_ADMIN_PASSWORD || '',
  },
})
if (!login.ok()) throw new Error(`Admin login failed: ${login.status()}`)

const captureAdmin = async (path, filename) => {
  await page.goto(`${baseURL}${path}`)
  await page.locator('h1').first().waitFor()
  await page.screenshot({ path: `${evidenceDir}/${filename}`, fullPage: false })
}

await captureAdmin('/admin/collections/tenants', '01-new-site.png')
await captureAdmin('/admin/collections/templates', '02-switch-template.png')
await captureAdmin('/admin/collections/pages/create', '03-edit-blocks.png')
await captureAdmin('/admin/collections/pages', '04-preview.png')
await captureAdmin('/admin/collections/deployments', '05-publish.png')
await captureAdmin('/admin/collections/audit-logs', '06-rollback.png')

await browser.close()
console.log(evidenceDir)
