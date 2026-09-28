import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/phase-d/after'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
console.log('浏览器已启动')
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()

const capturePublic = async (path, name, visibleText) => {
  console.log(`开始打开 ${path}`)
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
  console.log(`已加载 ${path}，等待页面文案`)
  await page.getByText(visibleText, { exact: true }).first().waitFor()
  await page.screenshot({ path: `${output}/${name}`, fullPage: false })
  console.log(`已保存 ${name}`)
}

await capturePublic('/s/huadong-fasteners/zh', '01-home-edited.png', '华东紧固件：稳定连接，可靠交付')
await capturePublic('/s/huadong-fasteners/en', '06-language-switch-en.png', 'Reliable Fasteners for Every Connection')
await capturePublic('/s/huadong-fasteners/zh/about', '02-about-page.png', '关于我们的制造能力')
await capturePublic('/s/huadong-fasteners/zh/contact', '03-contact-page.png', '联系外贸团队')

const login = await page.request.post(`${baseURL}/api/users/login`, { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
console.log(`后台登录响应：${login.status()}`)
if (!login.ok()) throw new Error(`后台登录失败：${login.status()}`)
await context.addCookies([{ name: 'payload-tenant', value: '2', url: baseURL }])

await page.goto(`${baseURL}/admin/collections/site-navigation?locale=zh`, { waitUntil: 'domcontentloaded' })
console.log('已加载导航管理页')
await page.getByText('网站导航', { exact: true }).first().waitFor()
await page.screenshot({ path: `${output}/04-admin-navigation.png`, fullPage: false })

await page.goto(`${baseURL}/admin/collections/tenants/2?locale=zh`, { waitUntil: 'domcontentloaded' })
console.log('已加载客户站点编辑页')
await page.getByText('固定页面编辑', { exact: true }).scrollIntoViewIfNeeded()
await page.getByText('固定页面编辑', { exact: true }).click()
await page.getByText('首页模块', { exact: true }).click()
await page.getByText('首屏主标题', { exact: true }).waitFor()
await page.screenshot({ path: `${output}/05-admin-home-modules.png`, fullPage: false })

await browser.close()
console.log(output)
