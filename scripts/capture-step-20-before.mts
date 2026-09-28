import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const output = 'docs/evidence/admin-redesign/step-20'
await mkdir(output, { recursive: true })
const payload = await getPayload({ config })
const tenants = await payload.find({ collection: 'tenants', depth: 0, locale: 'zh', fallbackLocale: false, limit: 100, overrideAccess: true })
const report = tenants.docs.map((tenant) => ({
  id: tenant.id,
  name: tenant.name,
  contact: {
    address: Boolean(tenant.contact?.address),
    email: Boolean(tenant.contact?.email),
    phone: Boolean(tenant.contact?.phone),
    wechatQRCode: Boolean(tenant.contact?.wechatQRCode),
    whatsapp: Boolean(tenant.contact?.whatsapp),
    whatsappQRCode: Boolean(tenant.contact?.whatsappQRCode),
  },
  contactPage: {
    intro: Boolean(tenant.fixedPages?.contactPage?.intro),
    showInquiryForm: tenant.fixedPages?.contactPage?.showInquiryForm !== false,
    title: Boolean(tenant.fixedPages?.contactPage?.title),
  },
}))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1512, height: 920 } })
try {
  await page.goto('http://localhost:3100/s/huadong-fasteners/zh/contact', { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/00-改前-华东联系我们前台.png`, fullPage: true })
} finally { await browser.close() }
await writeFile(`${output}/before-contact-fields.json`, `${JSON.stringify(report, null, 2)}\n`)
