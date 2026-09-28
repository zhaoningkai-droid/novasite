import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-03'
const collections = ['products', 'news', 'cases', 'posts', 'pages', 'leads'] as const

await mkdir(output, { recursive: true })

const payload = await getPayload({ config })
const databaseCounts = async () => Object.fromEntries(await Promise.all(collections.map(async (collection) => [collection, (await payload.count({ collection, overrideAccess: true })).totalDocs])))
const checks: Record<string, unknown> = { startedAt: new Date().toISOString(), before: await databaseCounts() }
const browser = await chromium.launch({ headless: true })

try {
  const anonymousContext = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const anonymousPage = await anonymousContext.newPage()
  await anonymousPage.goto(`${baseURL}/workspace/volttrans/website/analytics`, { waitUntil: 'domcontentloaded' })
  await anonymousPage.waitForURL('**/admin/login?redirect=/workspace/companies')
  checks.unauthenticatedWorkspaceRoute = anonymousPage.url()
  await anonymousContext.close()

  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const page = await context.newPage()
  await page.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await page.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
  await page.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })

  await page.getByLabel('搜索公司').fill('VoltTrans')
  await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.waitForURL(`${baseURL}/workspace/volttrans/website/analytics`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/01-volttrans-dedicated-workspace.png`, fullPage: true })
  checks.voltTransWorkspaceURL = page.url()
  checks.voltTransHeading = await page.getByRole('heading', { name: '当前工作公司：VoltTrans Power Equipment' }).count()

  await page.reload({ waitUntil: 'networkidle' })
  checks.voltTransAfterRefresh = await page.getByRole('heading', { name: '当前工作公司：VoltTrans Power Equipment' }).count()

  await page.goto(`${baseURL}/workspace/huadong-fasteners/website/analytics`, { waitUntil: 'networkidle' })
  await page.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/02-mismatched-company-is-returned-to-selection.png`, fullPage: true })
  checks.mismatchedCompanyRoute = page.url()
  checks.mismatchedCompanyWorkspaceShown = await page.getByText('华东紧固件制造有限公司 的专属工作台').count()

  await page.getByLabel('搜索公司').fill('华东')
  await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.waitForURL(`${baseURL}/workspace/huadong-fasteners/website/analytics`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/03-huadong-dedicated-workspace.png`, fullPage: true })
  checks.huadongWorkspaceURL = page.url()
  checks.huadongHeading = await page.getByRole('heading', { name: '当前工作公司：华东紧固件制造有限公司' }).count()
  await context.close()
} finally {
  checks.after = await databaseCounts()
  checks.businessContentUnchanged = JSON.stringify(checks.before) === JSON.stringify(checks.after)
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
