import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-04'
const collections = ['products', 'news', 'cases', 'posts', 'pages', 'leads'] as const

await mkdir(output, { recursive: true })
const payload = await getPayload({ config })
const databaseCounts = async () => Object.fromEntries(await Promise.all(collections.map(async (collection) => [collection, (await payload.count({ collection, overrideAccess: true })).totalDocs])))
const checks: Record<string, unknown> = { startedAt: new Date().toISOString(), before: await databaseCounts() }
const dashboardSource = await readFile('src/components/BeforeDashboard/index.tsx', 'utf8')
checks.legacyDashboardOverrideAccessTrueCount = (dashboardSource.match(/overrideAccess:\s*true/g) || []).length
const browser = await chromium.launch({ headless: true })

const login = async (page: Awaited<ReturnType<ReturnType<typeof browser.newContext>['newPage']>>) => {
  await page.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await page.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
  await page.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
}

const chooseAndEnter = async (page: Awaited<ReturnType<ReturnType<typeof browser.newContext>['newPage']>>, search: string) => {
  await page.getByLabel('搜索公司').fill(search)
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
}

try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const page = await context.newPage()
  await login(page)
  await chooseAndEnter(page, 'VoltTrans')
  await page.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ }).click()
  await page.screenshot({ path: `${output}/01-volttrans-switcher-open.png`, fullPage: true })
  checks.switcherItemCount = await page.getByRole('menuitem').count()

  await page.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
  await page.waitForURL(`${baseURL}/workspace/huadong-fasteners/website/analytics`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/02-huadong-after-right-top-switch.png`, fullPage: true })
  checks.afterSwitchURL = page.url()
  checks.afterSwitchHeading = await page.getByRole('heading', { name: '当前工作公司：华东紧固件制造有限公司' }).count()

  await page.getByRole('button', { name: /当前工作公司.*华东紧固件制造有限公司/ }).click()
  await page.getByRole('menuitem', { name: /VoltTrans Power Equipment/ }).click()
  await page.waitForURL(`${baseURL}/workspace/volttrans/website/analytics`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { document.documentElement.dataset.workspaceUnsaved = 'true' })
  await page.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ }).click()
  let dismissedMessage = ''
  page.once('dialog', async (dialog) => { dismissedMessage = dialog.message(); await dialog.dismiss() })
  await page.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
  await page.waitForTimeout(120)
  await page.screenshot({ path: `${output}/03-unsaved-change-cancels-switch.png`, fullPage: true })
  checks.unsavedDialogMessage = dismissedMessage
  checks.urlAfterDismissedUnsavedDialog = page.url()

  const secondTab = await context.newPage()
  await secondTab.goto(`${baseURL}/workspace/volttrans/website/analytics`, { waitUntil: 'networkidle' })
  await page.evaluate(() => { delete document.documentElement.dataset.workspaceUnsaved })
  await page.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
  await page.waitForURL(`${baseURL}/workspace/huadong-fasteners/website/analytics`, { waitUntil: 'networkidle' })
  await secondTab.reload({ waitUntil: 'networkidle' })
  await secondTab.screenshot({ path: `${output}/04-old-tab-returns-to-company-selection.png`, fullPage: true })
  checks.oldTabAfterOtherTabSwitch = secondTab.url()
  checks.oldTabNewCompanyWorkspaceShown = await secondTab.getByText('华东紧固件制造有限公司 的专属工作台').count()
  await context.close()
} finally {
  checks.after = await databaseCounts()
  checks.businessContentUnchanged = JSON.stringify(checks.before) === JSON.stringify(checks.after)
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
