import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-12'

await mkdir(output, { recursive: true })

const payload = await getPayload({ config })
const sites = await payload.find({ collection: 'tenants', depth: 0, limit: 20, overrideAccess: true, sort: 'id' })
const state = await Promise.all(sites.docs.map(async (site) => {
  const products = await payload.find({
    collection: 'products',
    depth: 1,
    fallbackLocale: 'none',
    limit: 100,
    locale: 'zh',
    overrideAccess: true,
    sort: 'id',
    where: { tenant: { equals: site.id } },
  })
  return {
    companyID: site.id,
    companyName: site.name,
    companySlug: site.slug,
    productCount: products.totalDocs,
    products: products.docs.map((product) => ({
      id: product.id,
      title: product.title,
      galleryCount: Array.isArray(product.gallery) ? product.gallery.length : 0,
      externalImageCount: Array.isArray(product.externalImages) ? product.externalImages.length : 0,
      hasDescription: Boolean(product.description),
    })),
  }
}))

await writeFile(`${output}/00-before-product-state.json`, `${JSON.stringify({ capturedAt: new Date().toISOString(), state }, null, 2)}\n`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()

try {
  const login = await context.request.post(`${baseURL}/api/users/login`, {
    data: {
      email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
      password: process.env.SEED_ADMIN_PASSWORD || '',
    },
  })
  if (!login.ok()) throw new Error(`后台登录失败：${login.status()}`)
  const token = (await login.json() as { token?: string }).token
  if (!token) throw new Error('后台登录未返回会话。')

  const primarySite = state.find((site) => site.companySlug === 'huadong-fasteners') || state[0]
  if (!primarySite?.companySlug) throw new Error('没有可用于基线截图的公司。')
  await context.addCookies([
    { name: 'payload-token', value: token, domain: 'localhost', path: '/' },
    { name: 'payload-tenant', value: String(primarySite.companyID), domain: 'localhost', path: '/' },
  ])

  await page.goto(`${baseURL}/workspace/${primarySite.companySlug}/website/content`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/01-before-content-list.png`, fullPage: true })
  const firstProduct = primarySite.products[0]
  if (firstProduct) {
    await page.goto(`${baseURL}/workspace/${primarySite.companySlug}/website/content/${firstProduct.id}/edit`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `${output}/02-before-product-editor.png`, fullPage: true })
  }

  await page.goto(`${baseURL}/s/${primarySite.companySlug}/zh/products`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/03-before-public-products.png`, fullPage: true })

  await writeFile(`${output}/00-before-browser-check.json`, `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    company: primarySite.companySlug,
    contentURL: `${baseURL}/workspace/${primarySite.companySlug}/website/content`,
    publicURL: `${baseURL}/s/${primarySite.companySlug}/zh/products`,
  }, null, 2)}\n`)
} finally {
  await browser.close()
}
