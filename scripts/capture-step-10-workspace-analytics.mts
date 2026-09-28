import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-10'
const checks: Record<string, unknown> = { dataNature: '固定可重复演示数据，尚未接入真实流量统计', startedAt: new Date().toISOString() }
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })

async function enterCompany(page: import('@playwright/test').Page, company: string) {
  await page.goto(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await page.getByLabel('搜索公司').fill(company)
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
}

try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const login = await context.request.post(`${baseURL}/api/users/login`, { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
  const { token } = await login.json() as { token: string }
  await context.addCookies([{ domain: 'localhost', name: 'payload-token', path: '/', value: token }])
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  await enterCompany(page, 'VoltTrans')
  await expect(page.getByText('演示数据，尚未接入真实流量统计')).toBeVisible()
  await page.screenshot({ path: `${output}/01-volttrans-year-dashboard.png`, fullPage: false })
  const yearPV = await page.getByTestId('metric-pv').textContent()
  await page.getByTestId('range-7d').click()
  await expect(page.getByTestId('range-7d')).toHaveAttribute('aria-pressed', 'true')
  const weekPV = await page.getByTestId('metric-pv').textContent()
  checks.rangeChangesAllMetrics = yearPV !== weekPV
  await page.getByRole('button', { name: '刷新数据' }).click()
  await expect(page.getByRole('status')).toContainText('已刷新近7天的演示数据')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出数据' }).click()
  const download = await downloadPromise
  checks.exportedCSV = download.suggestedFilename()
  await page.screenshot({ path: `${output}/02-range-refresh-and-export.png`, fullPage: false })
  await enterCompany(page, '华东紧固件')
  const huadongPV = await page.getByTestId('metric-pv').textContent()
  checks.companyContextChangesDashboard = huadongPV !== yearPV && huadongPV !== weekPV
  await expect(page.getByTestId('analytics-company')).toContainText('华东紧固件制造有限公司')
  await page.screenshot({ path: `${output}/03-huadong-independent-dashboard.png`, fullPage: false })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('workspace-analytics')).toBeVisible()
  checks.narrowViewportNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  await page.screenshot({ path: `${output}/04-narrow-dashboard.png`, fullPage: false })
  await context.close()
} finally {
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
