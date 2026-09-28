import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-09'
const checks: Record<string, unknown> = { startedAt: new Date().toISOString() }
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  page.setDefaultNavigationTimeout(8000)
  const login = await context.request.post(`${baseURL}/api/users/login`, { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
  const { token } = await login.json() as { token: string }
  await context.addCookies([{ domain: 'localhost', name: 'payload-token', path: '/', value: token }])
  await page.goto(`${baseURL}/workspace/companies`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('搜索公司').fill('VoltTrans')
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.getByRole('link', { name: '内容管理' }).click()
  await page.getByRole('link', { name: '维护四语' }).first().click()
  await page.waitForURL(/\/translations$/)
  for (const language of ['简体中文', '英语', '俄语', '印尼语']) await expect(page.locator('.workspace-translations__locale').filter({ hasText: language })).toBeVisible()
  checks.visibleLanguageTabs = await page.locator('.workspace-translations__locale').count()
  await page.screenshot({ path: `${output}/01-four-language-status.png`, fullPage: false })

  await page.locator('.workspace-translations__locale').filter({ hasText: '英语' }).click()
  const originalTitle = await page.getByLabel('英语产品名称').inputValue()
  const originalSummary = await page.getByLabel('英语列表摘要').inputValue()
  const testTitle = `${originalTitle} Step 9 Test`
  await page.getByLabel('英语产品名称').fill(testTitle)
  await page.getByRole('button', { name: '保存英语' }).click()
  await expect(page.getByText('当前语言已保存。')).toBeVisible()
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.workspace-translations__locale').filter({ hasText: '英语' }).click()
  checks.englishPersistedAfterRefresh = await page.getByLabel('英语产品名称').inputValue() === testTitle
  await page.screenshot({ path: `${output}/02-english-save-and-refresh.png`, fullPage: false })
  await page.getByLabel('英语产品名称').fill(originalTitle)
  await page.getByLabel('英语列表摘要').fill(originalSummary)
  await page.getByRole('button', { name: '保存英语' }).click()
  await expect(page.getByText('当前语言已保存。')).toBeVisible()
  await page.locator('.workspace-translations__locale').filter({ hasText: '简体中文' }).click()
  checks.chineseUnaffectedByEnglishSave = (await page.getByLabel('简体中文产品名称').inputValue()) !== testTitle
  const pageSource = await readFile('src/app/(workspace)/workspace/[company]/website/content/[productID]/translations/page.tsx', 'utf8')
  checks.noFallbackLocaleForCompletion = pageSource.includes('fallbackLocale: false')
  await context.close()
} finally {
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
