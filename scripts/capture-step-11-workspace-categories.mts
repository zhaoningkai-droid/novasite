import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-11'
const checks: Record<string, unknown> = { migration: '20260907_144259_step11_category_hierarchy 已生成；本机开发库历史自动同步，未强行补跑全量迁移', startedAt: new Date().toISOString() }
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })

async function enterCompany(page: import('@playwright/test').Page, name: string) {
  await page.goto(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await page.getByLabel('搜索公司').fill(name)
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.getByRole('link', { name: '分类管理' }).click()
}

try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const login = await context.request.post(`${baseURL}/api/users/login`, { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
  const { token } = await login.json() as { token: string }
  await context.addCookies([{ domain: 'localhost', name: 'payload-token', path: '/', value: token }])
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('dialog', (dialog) => dialog.accept())
  await enterCompany(page, 'VoltTrans')
  await expect(page.getByRole('heading', { name: '分类管理' })).toBeVisible()
  await page.screenshot({ path: `${output}/01-product-categories.png`, fullPage: false })
  for (const tab of ['文章分类', '案例分类', '博客分类']) { await page.getByRole('button', { name: tab }).click(); await expect(page.getByRole('columnheader', { name: '分类名称' })).toBeVisible() }
  checks.fourTabsVisible = true
  await page.screenshot({ path: `${output}/02-blog-categories.png`, fullPage: false })
  await page.getByRole('button', { name: '产品分类' }).click()
  await page.getByRole('button', { name: /新增/ }).click()
  await page.getByLabel('分类名称').fill('第11步证据临时分类')
  await page.getByLabel('分类地址标识').fill('step11-evidence-temporary')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const temp = page.locator('tr', { hasText: '第11步证据临时分类' })
  await expect(temp).toBeVisible()
  await temp.getByRole('button', { name: '翻译' }).click()
  await expect(page.getByLabel('英语分类名称')).toBeVisible()
  await page.getByLabel('简体中文分类名称').fill('第11步证据临时分类')
  await page.getByLabel('英语分类名称').fill('Step 11 Evidence Category')
  await page.getByLabel('俄语分类名称').fill('Категория доказательства шага 11')
  await page.getByLabel('印尼语分类名称').fill('Kategori Bukti Langkah 11')
  await page.screenshot({ path: `${output}/03-four-language-category-editor.png`, fullPage: false })
  await page.getByRole('button', { name: '保存四语' }).click()
  await expect(page.getByRole('status')).toContainText('四种语言分类名称已保存')
  await page.locator('tr', { hasText: '标准紧固件' }).getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('status')).toContainText('二级分类')
  await page.screenshot({ path: `${output}/04-delete-protection.png`, fullPage: false })
  await page.locator('tr', { hasText: '第11步证据临时分类' }).getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('status')).toContainText('分类已删除')
  checks.temporaryCategoryCleaned = await page.getByText('第11步证据临时分类').count() === 0
  const rejected = await page.request.post(`${baseURL}/api/workspace/huadong-fasteners/categories/products`, { data: {} })
  checks.crossCompanyWriteRejected = rejected.status() === 409
  await enterCompany(page, '华东紧固件')
  await expect(page.getByText('当前公司：华东紧固件制造有限公司')).toBeVisible()
  await page.screenshot({ path: `${output}/05-huadong-isolated-categories.png`, fullPage: false })
  await context.close()
} finally {
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
