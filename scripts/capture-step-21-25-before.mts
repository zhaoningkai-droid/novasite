import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'
const output = 'docs/evidence/admin-redesign/step-21-25'
await mkdir(output, { recursive: true })
const payload = await getPayload({ config })
const tenants = await payload.find({ collection: 'tenants', depth: 0, locale: 'zh', limit: 100, overrideAccess: true })
await writeFile(`${output}/00-改前-站点与语言基线.json`, `${JSON.stringify(tenants.docs.map((item) => ({ id: item.id, name: item.name, slug: item.slug, status: item.status, primaryDomain: item.primaryDomain, defaultLocale: item.defaultLocale, enabledLocales: item.enabledLocales, updatedAt: item.updatedAt })), null, 2)}\n`)
const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1512, height: 920 } })
try { await page.goto('http://localhost:3100/s/huadong-fasteners/zh', { waitUntil: 'networkidle' }); await page.screenshot({ path: `${output}/00-改前-华东导航页脚.png`, fullPage: true }) } finally { await browser.close() }
