import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-07'
const checks: Record<string, unknown> = { startedAt: new Date().toISOString() }
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })

const login = async (page: Awaited<ReturnType<ReturnType<typeof browser.newContext>['newPage']>>) => {
  await page.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await page.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
  await page.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
}

const openEditor = async (page: Awaited<ReturnType<ReturnType<typeof browser.newContext>['newPage']>>) => {
  await page.getByLabel('搜索公司').fill('VoltTrans')
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.getByRole('link', { name: '内容管理' }).click()
  await page.getByRole('row', { name: /锌铝涂层法兰面螺栓/ }).getByRole('link', { name: '编辑基础信息' }).click()
}

try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const page = await context.newPage()
  await login(page)
  await openEditor(page)
  const originalTitle = await page.getByLabel('产品名称').inputValue()
  const originalModel = await page.getByLabel('产品型号').inputValue()
  const testTitle = `${originalTitle}第7步验证`

  await page.getByLabel('产品名称').fill(testTitle)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('保存成功。', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${output}/01-real-save-success.png`, fullPage: false })
  await page.reload({ waitUntil: 'networkidle' })
  checks.titleAfterRefresh = await page.getByLabel('产品名称').inputValue()
  checks.persistedAfterRefresh = checks.titleAfterRefresh === testTitle

  await page.getByLabel('产品名称').fill(originalTitle)
  await page.getByLabel('产品型号').fill(originalModel)
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('保存成功。', { exact: true })).toBeVisible()
  await page.getByLabel('产品名称').fill('')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByText('请输入产品名称。', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${output}/02-required-validation.png`, fullPage: false })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '取消并恢复' }).click()
  checks.titleAfterCancel = await page.getByLabel('产品名称').inputValue()
  checks.restoredAfterCancel = checks.titleAfterCancel === originalTitle

  let networkRequests = 0
  await page.route('**/api/workspace/volttrans/products/*', async (route) => {
    networkRequests += 1
    await route.abort('failed')
  })
  const failedTitle = '网络失败后仍保留的产品名称'
  await page.getByLabel('产品名称').fill(failedTitle)
  await page.getByRole('button', { name: '保存' }).dblclick()
  await expect(page.getByText('保存未完成，请检查网络后重试。已填写的内容已保留。', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${output}/03-network-failure-keeps-input.png`, fullPage: false })
  checks.networkFailureKeepsInput = await page.getByLabel('产品名称').inputValue() === failedTitle
  checks.networkRequestsAfterDoubleClick = networkRequests
  await context.close()

  const source = await readFile('src/app/(workspace)/api/workspace/[company]/products/[productID]/route.ts', 'utf8')
  const productSchema = await readFile('src/collections/Products.ts', 'utf8')
  const specificationSchema = await readFile('src/collections/ProductSpecifications.ts', 'utf8')
  checks.secureCurrentCompanyCookieCheck = source.includes("cookieStore.get('payload-tenant')?.value !== String(company.id)")
  checks.secureTenantScopedQuery = source.includes("{ tenant: { equals: company.id } }")
  checks.securePayloadAccess = (source.match(/overrideAccess:\s*false/g) || []).length
  checks.legacyCompatibilityIsInternalOnly = source.includes('context: { workspaceBaseEdit: true }')
    && productSchema.includes("req.context?.workspaceBaseEdit")
  checks.normalCreateChineseFieldsRemainRequired = productSchema.includes("{ name: 'title', label: '产品名称', type: 'text', localized: true, required: true }")
    && productSchema.includes("{ name: 'summary', label: '列表摘要', type: 'textarea', localized: true, required: true }")
    && productSchema.includes("{ name: 'description', label: '产品详情', type: 'richText', localized: true, required: true }")
    && specificationSchema.includes("{ name: 'label', label: '参数名称', type: 'text', required: true }")
    && specificationSchema.includes("{ name: 'value', label: '参数值', type: 'text', required: true }")
} finally {
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
