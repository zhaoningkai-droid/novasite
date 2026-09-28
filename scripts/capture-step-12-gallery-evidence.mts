import { chromium, expect } from '@playwright/test'

const baseURL = 'http://localhost:3100'
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
  const { token } = (await login.json()) as { token: string }
  await context.addCookies([
    { domain: 'localhost', name: 'payload-token', path: '/', value: token },
    { domain: 'localhost', name: 'payload-tenant', path: '/', value: '2' },
  ])
  await page.goto(`${baseURL}/workspace/huadong-fasteners/website/content`, {
    waitUntil: 'networkidle',
  })
  await expect(page.getByText('产品图片')).toBeVisible()
  await page.screenshot({
    path: 'docs/evidence/admin-redesign/step-12/12-content-list-gallery.png',
    fullPage: true,
  })
  await page.goto(`${baseURL}/s/huadong-fasteners/zh/products`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: '产品中心' })).toBeVisible()
  await page.screenshot({
    path: 'docs/evidence/admin-redesign/step-12/13-public-products-gallery.png',
    fullPage: true,
  })
} finally {
  await context.close()
  await browser.close()
}
