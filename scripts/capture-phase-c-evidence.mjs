import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/phase-c/after'
await fs.mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()

const capturePublic = async (path, name) => {
  await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
  await page.locator('h1').first().waitFor()
  await page.screenshot({ path: `${output}/${name}`, fullPage: false })
}

await capturePublic('/s/huadong-fasteners/zh', '01-huadong-home.png')
await capturePublic('/s/huadong-fasteners/zh/products', '02-huadong-products.png')
await capturePublic('/s/huadong-fasteners/zh/news', '03-huadong-news.png')
await capturePublic('/s/huadong-fasteners/zh/cases', '04-huadong-cases.png')
await capturePublic('/s/huadong-fasteners/zh/blog', '05-huadong-blog.png')
await capturePublic('/s/volttrans/en/products', '06-volttrans-products.png')

const login = await page.request.post(`${baseURL}/api/users/login`, {
  data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' },
})
if (!login.ok()) throw new Error(`后台登录失败：${login.status()}`)
await context.addCookies([{ name: 'payload-tenant', value: '2', url: baseURL }])

const captureAdmin = async (path, name) => {
  await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
  await page.locator('h1').first().waitFor()
  await page.screenshot({ path: `${output}/${name}`, fullPage: false })
}

await captureAdmin('/admin/collections/product-categories?locale=zh', '07-admin-product-categories-zh.png')
await captureAdmin('/admin/collections/products?locale=zh', '08-admin-products-zh.png')
await captureAdmin('/admin/collections/news?locale=zh', '09-admin-news-zh.png')
await captureAdmin('/admin/collections/cases?locale=zh', '10-admin-cases-zh.png')
await captureAdmin('/admin/collections/posts?locale=zh', '11-admin-blog-zh.png')

await browser.close()
console.log(output)
