import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-12'
await mkdir(output, { recursive: true })
const checks: Record<string, unknown> = { startedAt: new Date().toISOString() }
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()
let productID = 0
let mediaID = 0
try {
  const login = await context.request.post(`${baseURL}/api/users/login`, {
    data: {
      email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
      password: process.env.SEED_ADMIN_PASSWORD || '',
    },
  })
  const { token } = (await login.json()) as { token: string }
  await context.addCookies([
    { domain: 'localhost', name: 'payload-token', path: '/', value: token },
  ])
  await page.goto(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await page.getByLabel('搜索公司').fill('华东')
  if ((await page.getByRole('link', { name: '进入工作台' }).count()) === 0)
    await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.goto(`${baseURL}/workspace/huadong-fasteners/website/content/new`, {
    waitUntil: 'networkidle',
  })
  await page.screenshot({ path: `${output}/04-new-product-empty.png`, fullPage: true })
  await page.getByLabel('产品分类').selectOption({ index: 1 })
  await page.getByLabel('产品名称').fill('第12步完整流程验证螺栓')
  await page.getByLabel('关键词').fill('六角螺栓, 出口紧固件')
  await page.getByLabel('产品描述').fill('用于验证完整产品内容管理流程。')
  await page.getByLabel('新增产品标签').fill('流程验证')
  await page.getByRole('button', { name: '+ 新增标签' }).click()
  await page.getByLabel('产品排序').fill('12')
  await page.getByLabel('上传产品图片').setInputFiles({
    buffer: await readFile('public/media/产品2-500x500.jpg'),
    mimeType: 'image/jpeg',
    name: 'step12-product.jpg',
  })
  await expect(page.getByText(/图片已上传/)).toBeVisible()
  await page.getByLabel('产品详情').fill('第12步产品详情：可保存的完整正文。')
  await page.getByLabel('产品详情').evaluate((element) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await page.getByRole('button', { name: '加粗' }).click()
  await page.getByLabel('颜色').selectOption('#2563eb')
  await page.getByRole('button', { name: '居中' }).click()
  await page.getByLabel('产品详情').evaluate((element) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await page.getByRole('button', { name: '表格' }).click()
  await page.getByLabel('产品详情').evaluate((element) => {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)
  })
  await page.getByRole('button', { name: '插图' }).click()
  await page.screenshot({ path: `${output}/05-new-product-filled.png`, fullPage: true })
  const saveResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/products/manage') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const saved = await saveResponse
  checks.saveResponse = { body: await saved.text(), status: saved.status() }
  if (saved.status() !== 200)
    throw new Error(`保存接口失败：${JSON.stringify(checks.saveResponse)}`)
  await expect(page.getByRole('status')).toContainText('保存成功')
  const match = page.url().match(/content\/(\d+)\/edit/)
  if (!match) throw new Error(`保存后网址不正确：${page.url()}`)
  productID = Number(match[1])
  await page.screenshot({ path: `${output}/06-save-success.png`, fullPage: true })
  const savedData = JSON.parse(checks.saveResponse.body as string) as { id: number }
  const productRecord = await page.request.get(
    `${baseURL}/api/products/${savedData.id}?locale=zh&depth=1`,
  )
  const savedProduct = (await productRecord.json()) as {
    detailHTML?: string
    gallery?: Array<{ id: number }>
    slug: string
  }
  checks.savedDetailHTML = savedProduct.detailHTML
  checks.richTextPersistence = {
    hasImage: Boolean(savedProduct.detailHTML?.includes('<img ')),
    hasTable: Boolean(savedProduct.detailHTML?.includes('<table')),
    hasTextColor: Boolean(savedProduct.detailHTML?.includes('color:#2563eb')),
  }
  if (!Object.values(checks.richTextPersistence).every(Boolean))
    throw new Error(`富文本内容未完整保存：${JSON.stringify(checks.richTextPersistence)}`)
  mediaID = savedProduct.gallery?.[0]?.id || 0
  await page.goto(`${baseURL}/s/huadong-fasteners/zh/products/${savedProduct.slug}`, {
    waitUntil: 'networkidle',
  })
  await expect(page.getByRole('heading', { name: '第12步完整流程验证螺栓' })).toBeVisible()
  await page.screenshot({ path: `${output}/07-public-product-gallery.png`, fullPage: true })
  const response = await page.request.get(`${baseURL}/api/products/${productID}?locale=zh&depth=1`)
  checks.savedProduct = await response.json()
  checks.productID = productID
} finally {
  if (productID) {
    await page.request.delete(`${baseURL}/api/products/${productID}`)
    checks.cleanedProduct = productID
  }
  if (mediaID) {
    const mediaResponse = await page.request.delete(
      `${baseURL}/api/workspace/huadong-fasteners/media/${mediaID}`,
    )
    checks.cleanedMedia = { id: mediaID, status: mediaResponse.status() }
  }
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await context.close()
  await browser.close()
}
