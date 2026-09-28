import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const output = 'docs/evidence/admin-redesign/step-20'
await mkdir(output, { recursive: true })
const payload = await getPayload({ config })
const tenant = await payload.findByID({ collection: 'tenants', id: 2, depth: 1, locale: 'zh', overrideAccess: true })
const original = { contact: tenant.contact, contactPage: tenant.fixedPages?.contactPage }
const report: Record<string, unknown> = { startedAt: new Date().toISOString() }
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()
try {
  const login = await context.request.post('http://localhost:3100/api/users/login', { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
  const { token } = await login.json() as { token: string }
  await context.addCookies([{ domain: 'localhost', name: 'payload-token', path: '/', value: token }, { domain: 'localhost', name: 'payload-tenant', path: '/', value: '2' }])
  await page.goto('http://localhost:3100/workspace/huadong-fasteners/website/contact', { waitUntil: 'networkidle' })
  await page.getByLabel('地址').fill('上海市浦东新区紧固件产业园 88 号')
  await page.getByLabel('邮箱').fill('contact-step20@huadong-fasteners.test')
  await page.getByLabel('电话').fill('+86 21 6000 2020')
  await page.getByRole('textbox', { name: 'WhatsApp', exact: true }).fill('+86 138 0000 2020')
  await page.getByLabel('联系页标题').fill('第20步联系信息同步验证')
  await page.getByLabel('联系页说明').fill('由华东站工作台保存并同步展示的联系说明。')
  await page.screenshot({ path: `${output}/01-联系我们工作台编辑.png`, fullPage: true })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已保存')
  await page.screenshot({ path: `${output}/02-联系我们保存成功.png`, fullPage: true })
  await page.goto('http://localhost:3100/s/huadong-fasteners/zh/contact', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: '第20步联系信息同步验证' })).toBeVisible()
  await expect(page.getByText('上海市浦东新区紧固件产业园 88 号')).toBeVisible()
  await expect(page.getByText('WhatsApp：+86 138 0000 2020')).toBeVisible()
  report.qrCount = await page.locator('[data-site-contact-qrs] img').count()
  await page.screenshot({ path: `${output}/03-联系我们前台同步与二维码.png`, fullPage: true })
  const foreign = await context.request.patch('http://localhost:3100/api/workspace/volttrans/contact', { data: { address: '越权地址', email: 'x@example.com', phone: '1', title: '越权', intro: '', showInquiryForm: true } })
  report.crossCompanyStatus = foreign.status()
  if (foreign.status() !== 403 || Number(report.qrCount) !== 2) throw new Error(`联系人隔离或二维码验证失败：${JSON.stringify(report)}`)
} finally {
  await payload.update({ collection: 'tenants', id: 2, locale: 'zh', overrideAccess: true, data: { contact: original.contact, fixedPages: { ...tenant.fixedPages, contactPage: original.contactPage } } as any })
  report.cleaned = true; report.finishedAt = new Date().toISOString()
  await writeFile(`${output}/verify-step-20.json`, `${JSON.stringify(report, null, 2)}\n`)
  await context.close(); await browser.close()
}
