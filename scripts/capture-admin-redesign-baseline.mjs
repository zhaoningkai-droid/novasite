import { chromium } from '@playwright/test'
import pg from 'pg'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// 第1步只读现状采集：不提交内容表单、不初始化Payload、不执行迁移。
const base = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-01'
await mkdir(output, { recursive: true })
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const quote = (name) => `"${name.replaceAll('"', '""')}"`
const business = /^(tenants|products|product_categories|product_specifications|posts|categories|news|news_categories|cases|case_categories|pages|faqs|media|leads|site_navigation|deployments)(_|$)/
const snapshot = async () => {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(x => x.table_name).filter(x => business.test(x))
    const state = {}
    for (const table of tables) {
      const rows = (await client.query(`SELECT to_jsonb(t) AS doc FROM ${quote(table)} t ORDER BY to_jsonb(t)::text`)).rows.map(x => x.doc)
      state[table] = { count: rows.length, sha256: hash(rows) }
    }
    const sites = (await client.query('SELECT id,name,slug,status FROM tenants ORDER BY id')).rows
    for (const site of sites) {
      site.counts = {}
      for (const table of ['products','news','cases','posts','leads','pages','media','faqs','product_categories','news_categories','case_categories','categories','product_specifications','site_navigation']) {
        site.counts[table] = Number((await client.query(`SELECT count(*) FROM ${quote(table)} WHERE tenant_id=$1`, [site.id])).rows[0].count)
      }
    }
    return { capturedAt: new Date().toISOString(), method: 'PostgreSQL REPEATABLE READ READ ONLY; content hashes exclude accounts/sessions', sites, tables: state }
  } finally { await client.query('ROLLBACK') }
}
const before = await snapshot()
await writeFile(`${output}/data-before.json`, JSON.stringify(before, null, 2))
const browser = await chromium.launch({ headless: true })
const publicContext = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const admin = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const results = []
const capture = async (context, route, file, expected) => {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.evaluate(() => document.fonts.ready)
    const body = await page.locator('body').innerText()
    const images = await page.locator('img').evaluateAll(nodes => nodes.map(n => ({ src: n.currentSrc, loaded: n.complete && n.naturalWidth > 0 })))
    await page.screenshot({ path: `${output}/${file}`, fullPage: true })
    const result = { route, finalURL: page.url(), status: response?.status(), screenshot: file, expected, expectedPresent: !expected || body.includes(expected), errors, images, bodyText: body }
    results.push(result)
    console.log(JSON.stringify({ file, status: result.status, expectedPresent: result.expectedPresent, errors: errors.length }))
  } catch (error) {
    results.push({ route, screenshot: file, error: error.message })
    await page.screenshot({ path: `${output}/${file}`, fullPage: true }).catch(() => {})
    console.log(JSON.stringify({ file, error: error.message }))
  } finally { await page.close() }
}
try {
  await capture(publicContext, '/admin/login', '01-login.png', '登录')
  const login = await admin.request.post(`${base}/api/users/login`, { data: { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' } })
  if (!login.ok()) throw new Error(`登录失败 ${login.status()}`)
  await capture(admin, '/admin/collections/tenants?locale=zh', '02-company-list.png', '进入工作台')
  const sampleRecords = []
  for (const site of before.sites) {
    await admin.addCookies([{ name: 'payload-tenant', value: String(site.id), url: base }])
    await capture(admin, '/admin?locale=zh', `03-${site.slug}-dashboard.png`, site.name)
    await capture(admin, '/admin/collections/products?locale=zh', `04-${site.slug}-products-admin.png`, '产品')
    for (const collection of ['products','news','cases','posts','pages']) {
      const query = new URLSearchParams({ 'where[tenant][equals]': String(site.id), locale: 'all', depth: '0', limit: '1', sort: 'id', 'fallback-locale': 'none' })
      const response = await admin.request.get(`${base}/api/${collection}?${query}`)
      if (!response.ok()) throw new Error(`代表记录读取失败 ${collection}: ${response.status()}`)
      sampleRecords.push({ tenantID: site.id, site: site.slug, collection, ...(await response.json()) })
    }
    const language = site.slug === 'volttrans' ? 'en' : 'zh'
    await capture(publicContext, `/s/${site.slug}/${language}`, `05-${site.slug}-home.png`, language === 'zh' ? '华东紧固件' : 'Fasteners')
    await capture(publicContext, `/s/${site.slug}/${language}/products`, `06-${site.slug}-products.png`, language === 'zh' ? '产品' : 'Products')
    await capture(publicContext, `/s/${site.slug}/${language}/contact`, `07-${site.slug}-contact.png`, language === 'zh' ? '联系' : 'Contact')
  }
  await writeFile(`${output}/representative-content.json`, JSON.stringify(sampleRecords, null, 2))
  // 实际点击现有“进入工作台”，不以手工设置cookie代替入口验证。
  const page = await admin.newPage()
  await page.goto(`${base}/admin/collections/tenants?locale=zh`, { waitUntil: 'networkidle' })
  const button = page.getByRole('button', { name: '进入工作台' }).first()
  await button.click()
  await page.waitForURL('**/admin/collections/pages**')
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${output}/08-existing-enter-workspace.png`, fullPage: true })
  results.push({ action: '实际点击站点列表第一条进入工作台', finalURL: page.url(), screenshot: '08-existing-enter-workspace.png', bodyText: await page.locator('body').innerText() })
  await page.close()
} finally {
  const after = await snapshot()
  await writeFile(`${output}/data-after.json`, JSON.stringify(after, null, 2))
  await writeFile(`${output}/checks.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: '步骤1现状基线，不是新功能验收。公开页使用未登录独立浏览器上下文；后台登录会创建会话，但未提交业务内容。', contentUnchanged: JSON.stringify(before.tables) === JSON.stringify(after.tables), changedTables: Object.keys(before.tables).filter(t => JSON.stringify(before.tables[t]) !== JSON.stringify(after.tables[t])), results }, null, 2))
  await browser.close()
  await client.end()
}
