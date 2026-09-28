import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-06'
await mkdir(output, { recursive: true })
const checks: Record<string, unknown> = { startedAt: new Date().toISOString() }
const browser = await chromium.launch({ headless: true })

const login = async (page: Awaited<ReturnType<ReturnType<typeof browser.newContext>['newPage']>>) => {
  await page.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await page.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
  await page.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
}

const choose = async (page: Awaited<ReturnType<ReturnType<typeof browser.newContext>['newPage']>>, search: string) => {
  await page.getByLabel('搜索公司').fill(search)
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
}

try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const page = await context.newPage()
  await login(page)
  await choose(page, 'VoltTrans')
  await page.goto(`${baseURL}/workspace/volttrans/website/content`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/01-volttrans-real-product-list.png`, fullPage: true })
  checks.voltTransTotal = await page.getByText(/^共 \d+ 条$/).innerText()
  checks.voltTransPageRows = await page.locator('tbody tr').count()
  checks.voltTransHasNextPage = await page.getByRole('link', { name: '下一页' }).getAttribute('aria-disabled')
  checks.chineseProductVisible = await page.getByText('安装五金配件组合', { exact: true }).count()
  checks.chineseCategoryVisible = await page.getByText('五金配件', { exact: true }).count()

  await page.locator('tbody input[type="checkbox"]').first().check()
  await page.screenshot({ path: `${output}/02-selection-batch-area.png`, fullPage: true })
  checks.selectionArea = await page.getByText(/^已选择 \d+ 项$/).innerText()

  await page.getByLabel('搜索产品').fill('完全不存在的产品')
  await page.getByRole('button', { name: '查询' }).click()
  await page.screenshot({ path: `${output}/03-real-empty-search-result.png`, fullPage: true })
  checks.emptyTitle = await page.getByRole('heading', { name: '没有匹配的产品' }).innerText()
  await page.getByRole('link', { name: '重置' }).click()
  await page.waitForURL(`${baseURL}/workspace/volttrans/website/content`, { waitUntil: 'networkidle' })
  await page.getByLabel('产品分类').selectOption({ label: '标准紧固件' })
  await page.getByRole('button', { name: '查询' }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${output}/05-chinese-category-filter.png`, fullPage: true })
  checks.categoryFilterURL = page.url()
  checks.categoryFilteredRows = await page.locator('tbody tr').count()
  checks.categoryFilterUsesChineseLabel = await page.getByText('标准紧固件', { exact: true }).count()

  await page.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ }).click()
  await page.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
  await page.waitForURL(`${baseURL}/workspace/huadong-fasteners/website/analytics`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: '内容管理' }).click()
  await page.waitForURL(`${baseURL}/workspace/huadong-fasteners/website/content`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/04-huadong-independent-product-list.png`, fullPage: true })
  checks.huadongTotal = await page.getByText(/^共 \d+ 条$/).innerText()
  checks.selectionAreaAfterSwitch = await page.getByText(/^已选择 \d+ 项$/).count()
  await context.close()

  const source = await readFile('src/app/(workspace)/workspace/[company]/website/content/page.tsx', 'utf8')
  checks.contentQueryUsesOverrideAccessFalse = (source.match(/overrideAccess:\s*false/g) || []).length
} finally {
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
