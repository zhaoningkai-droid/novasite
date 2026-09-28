import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-05'
await mkdir(output, { recursive: true })
const checks: Record<string, unknown> = { startedAt: new Date().toISOString() }
const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const page = await context.newPage()
  await page.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await page.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
  await page.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await page.getByLabel('搜索公司').fill('VoltTrans')
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.waitForURL(`${baseURL}/workspace/volttrans/website/analytics`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/01-desktop-workspace-shell.png`, fullPage: true })
  checks.desktopTopNavigation = await page.getByRole('navigation', { name: '平台主导航' }).innerText()
  checks.desktopSideNavigation = await page.getByRole('complementary', { name: '独立站功能导航' }).innerText()

  await page.getByRole('button', { name: '社媒营销' }).click()
  checks.placeholderNotice = await page.getByRole('status').innerText()
  await page.getByRole('button', { name: '查看通知' }).click()
  checks.notificationNotice = await page.getByRole('status').innerText()
  await page.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ }).click()
  await page.screenshot({ path: `${output}/02-company-switcher-in-reference-shell.png`, fullPage: true })
  checks.companyMenuItems = await page.getByRole('menuitem').count()
  await context.close()

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await mobilePage.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
  await mobilePage.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
  await mobilePage.locator('button[type="submit"]').click()
  await mobilePage.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await mobilePage.getByLabel('搜索公司').fill('VoltTrans')
  if (await mobilePage.getByRole('link', { name: '进入工作台' }).count() === 0) await mobilePage.getByRole('button', { name: '选择公司' }).click()
  await mobilePage.getByRole('link', { name: '进入工作台' }).click()
  await mobilePage.waitForURL(`${baseURL}/workspace/volttrans/website/analytics`, { waitUntil: 'networkidle' })
  await mobilePage.screenshot({ path: `${output}/03-narrow-workspace-shell.png`, fullPage: true })
  checks.mobileViewport = { width: 390, height: 844 }
  checks.mobileHorizontalOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  await mobileContext.close()
} finally {
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
