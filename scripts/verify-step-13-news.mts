import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const report: Record<string, unknown> = {}
const categoryResult = await payload.find({
  collection: 'news-categories',
  limit: 1,
  locale: 'zh',
  overrideAccess: true,
  where: { tenant: { equals: 2 } },
})
const category = categoryResult.docs[0]
if (!category) throw new Error('没有可验证的华东新闻分类。')
const stamp = Date.now()
const title = `第13步新闻闭环验证-${stamp}`
const news = await payload.create({
  collection: 'news',
  data: {
    _status: 'published',
    category: category.id,
    content: { root: { children: [{ children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: '这是新闻正文同步验证内容。', type: 'text', version: 1 }], direction: null, format: '', indent: 0, type: 'paragraph', version: 1 }], direction: null, format: '', indent: 0, type: 'root', version: 1 } },
    featured: false,
    slug: `step13-news-${stamp}`,
    sortOrder: 13,
    summary: '这是第13步的新闻摘要，用于验证当前公司前台同步。',
    tenant: 2,
    title,
  },
  locale: 'zh',
  overrideAccess: true,
})
report.created = { id: news.id, slug: news.slug, title: news.title }
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { height: 920, width: 1512 } })
const page = await context.newPage()
try {
  const login = await context.request.post('http://localhost:3100/api/users/login', { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
  const { token } = (await login.json()) as { token: string }
  await context.addCookies([{ domain: 'localhost', name: 'payload-token', path: '/', value: token }, { domain: 'localhost', name: 'payload-tenant', path: '/', value: '2' }])
  await page.goto('http://localhost:3100/workspace/huadong-fasteners/website/content/news?keyword=%E7%AC%AC13%E6%AD%A5', { waitUntil: 'networkidle' })
  await expect(page.getByText(title)).toBeVisible()
  await page.screenshot({ fullPage: true, path: 'docs/evidence/admin-redesign/step-13/01-news-list-and-filter.png' })
  await page.getByRole('button', { name: '推荐到首页' }).click()
  await page.waitForTimeout(3500)
  await page.screenshot({ fullPage: true, path: 'docs/evidence/admin-redesign/step-13/02-news-featured.png' })
  const updated = await payload.findByID({ collection: 'news', id: news.id, locale: 'zh', overrideAccess: true })
  report.featuredAfterClick = updated.featured
  await page.goto(`http://localhost:3100/s/huadong-fasteners/zh/news/${news.slug}`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByText('这是新闻正文同步验证内容。')).toBeVisible()
  await page.screenshot({ fullPage: true, path: 'docs/evidence/admin-redesign/step-13/03-public-news-detail.png' })
  const foreign = await context.request.patch(`http://localhost:3100/api/workspace/volttrans/news/${news.id}/featured`, { data: { featured: false } })
  report.crossCompanyStatus = foreign.status()
  if (updated.featured !== true || foreign.status() !== 403) throw new Error(`新闻推荐或隔离验证失败：${JSON.stringify(report)}`)
} finally {
  await payload.delete({ collection: 'news', id: news.id, overrideAccess: true })
  report.cleaned = true
  await mkdir('docs/evidence/admin-redesign/step-13', { recursive: true })
  await writeFile('docs/evidence/admin-redesign/step-13/verify-news.json', `${JSON.stringify(report, null, 2)}\n`)
  await context.close()
  await browser.close()
}
