import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { height: 920, width: 1512 } })
const page = await context.newPage()
const report: Record<string, unknown> = { newsID: 4, title: '紧固件检测能力升级' }
try {
  const login = await context.request.post('http://localhost:3100/api/users/login', { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
  const { token } = (await login.json()) as { token: string }
  await context.addCookies([{ domain: 'localhost', name: 'payload-token', path: '/', value: token }, { domain: 'localhost', name: 'payload-tenant', path: '/', value: '2' }])
  await page.goto('http://localhost:3100/workspace/huadong-fasteners/website/content/news?keyword=%E6%A3%80%E6%B5%8B', { waitUntil: 'networkidle' })
  const row = page.getByRole('row').filter({ hasText: '紧固件检测能力升级' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '推荐到首页' }).click()
  await expect(row.getByRole('button', { name: '已推荐' })).toBeVisible({ timeout: 15000 })
  report.recommendedByListButton = true
  await page.screenshot({ fullPage: true, path: 'docs/evidence/admin-redesign/step-13/02-news-featured.png' })
  await page.goto('http://localhost:3100/s/huadong-fasteners/zh', { waitUntil: 'networkidle' })
  await expect(page.getByText('紧固件检测能力升级')).toBeVisible()
  report.homepageSynced = true
  await page.screenshot({ fullPage: true, path: 'docs/evidence/admin-redesign/step-13/03-public-home-news.png' })
  await page.goto('http://localhost:3100/workspace/huadong-fasteners/website/content/news?keyword=%E6%A3%80%E6%B5%8B', { waitUntil: 'networkidle' })
  await page.getByRole('row').filter({ hasText: '紧固件检测能力升级' }).getByRole('button', { name: '已推荐' }).click()
  await expect(page.getByRole('button', { name: '推荐到首页' })).toBeVisible({ timeout: 15000 })
  report.restored = true
} finally {
  await writeFile('docs/evidence/admin-redesign/step-13/verify-news-ui.json', `${JSON.stringify(report, null, 2)}\n`)
  await context.close()
  await browser.close()
}
