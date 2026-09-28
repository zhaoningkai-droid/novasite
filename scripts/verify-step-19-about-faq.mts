import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const output = 'docs/evidence/admin-redesign/step-19'
await mkdir(output, { recursive: true })
const payload = await getPayload({ config })
const report: Record<string, unknown> = { startedAt: new Date().toISOString() }
const tenant = await payload.findByID({ collection: 'tenants', id: 2, depth: 0, locale: 'zh', overrideAccess: true })
const originalAbout = tenant.fixedPages?.about
const stamp = Date.now()
let faqID = 0
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()
try {
  const faq = await payload.create({ collection: 'faqs', locale: 'zh', overrideAccess: true, data: { tenant: 2, question: `第19步真实FAQ验证-${stamp}`, answer: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: '这是由当前华东站常见问题记录驱动的前台答案。', version: 1 }], direction: null, format: '', indent: 0, version: 1 }], direction: null, format: '', indent: 0, version: 1 } }, enabled: true, sortOrder: -19 } as any })
  faqID = faq.id
  const writtenTenant = await payload.update({ collection: 'tenants', id: 2, locale: 'zh', overrideAccess: true, data: { fixedPages: { ...tenant.fixedPages, about: { ...originalAbout, modules: [{ title: `第19步企业介绍模块-${stamp}`, description: '此模块由当前客户工作台保存，并在客户站关于我们页面真实显示。', sortOrder: -19 }] } } } as any })
  report.aboutAfterWrite = (writtenTenant.fixedPages?.about as any)?.modules || []
  const login = await context.request.post('http://localhost:3100/api/users/login', { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
  const { token } = await login.json() as { token: string }
  await context.addCookies([{ domain: 'localhost', name: 'payload-token', path: '/', value: token }, { domain: 'localhost', name: 'payload-tenant', path: '/', value: '2' }])
  await page.goto('http://localhost:3100/workspace/huadong-fasteners/website/faqs', { waitUntil: 'networkidle' })
  await expect(page.getByText(`第19步真实FAQ验证-${stamp}`)).toBeVisible()
  await page.screenshot({ path: `${output}/01-FAQ工作台真实数据.png`, fullPage: true })
  await page.goto('http://localhost:3100/s/huadong-fasteners/zh/faqs', { waitUntil: 'networkidle' })
  await expect(page.getByText(`第19步真实FAQ验证-${stamp}`)).toBeVisible()
  await expect(page.getByText('这是由当前华东站常见问题记录驱动的前台答案。')).toBeVisible()
  await page.screenshot({ path: `${output}/02-FAQ前台与JSONLD.png`, fullPage: true })
  const source = await page.content(); report.faqJsonLD = source.includes('第19步真实FAQ验证') && source.includes('FAQPage')
  await page.goto('http://localhost:3100/workspace/huadong-fasteners/website/about', { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/03-关于我们工作台模块.png`, fullPage: true })
  report.aboutWorkspaceText = await page.getByLabel('模块名称 1').evaluate((element) => (element as HTMLInputElement).value)
  if (report.aboutWorkspaceText !== `第19步企业介绍模块-${stamp}`) throw new Error(`企业介绍模块未写入工作台：${JSON.stringify(report)}`)
  await page.goto('http://localhost:3100/s/huadong-fasteners/zh/about', { waitUntil: 'networkidle' })
  await expect(page.getByText(/第19步企业介绍模块/)).toBeVisible()
  await page.screenshot({ path: `${output}/04-关于我们前台模块.png`, fullPage: true })
  const foreign = await context.request.patch('http://localhost:3100/api/workspace/volttrans/faqs', { data: { id: faqID, question: '越权修改', answer: '越权修改', enabled: true, sortOrder: 0 } })
  report.crossCompanyStatus = foreign.status()
  if (foreign.status() !== 403 || !report.faqJsonLD) throw new Error(`隔离或结构化数据验证失败：${JSON.stringify(report)}`)
} finally {
  if (faqID) await payload.delete({ collection: 'faqs', id: faqID, overrideAccess: true })
  await payload.update({ collection: 'tenants', id: 2, locale: 'zh', overrideAccess: true, data: { fixedPages: { ...tenant.fixedPages, about: originalAbout } } as any })
  report.cleaned = true; report.finishedAt = new Date().toISOString()
  await writeFile(`${output}/verify-step-19.json`, `${JSON.stringify(report, null, 2)}\n`)
  await context.close(); await browser.close()
}
