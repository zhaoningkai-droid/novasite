import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const origin = process.env.TEMPLATE_REVIEW_ORIGIN || 'http://localhost:3100'
const directory = 'docs/evidence/v1-step-01-20260930/after'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const results = []
const errors = []
const writes = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => {
  if (request.method() === 'POST' && request.url().includes('/api/')) writes.push(request.url())
})
const routes = [
  '',
  'products',
  'products/sample-1',
  'news',
  'news/sample-1',
  'cases',
  'cases/sample-1',
  'about',
  'faqs',
  'contact',
]
async function visit(url, status = 200) {
  const response = await page.goto(origin + url)
  assert.equal(response?.status(), status, url)
  await page.waitForLoadState('networkidle')
}
async function shot(name, fullPage = true) {
  // Hide only Next's development-tool badge, which is absent from production builds.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage })
}
try {
  for (const key of ['power-705-v1', 'autoparts-571-v1']) {
    const base = `/template-demo/${key}/zh`
    for (const width of [390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const route of routes) {
        await visit(`${base}${route ? `/${route}` : ''}`)
        const size = await page.evaluate(() => ({
          viewport: innerWidth,
          document: document.documentElement.scrollWidth,
        }))
        assert.ok(size.document <= size.viewport + 1, `${key}/${route} overflows at ${width}`)
        const visibleHeadings = await page.locator('h1:visible').count()
        assert.equal(visibleHeadings, 1, `${key}/${route} visible main heading`)
        if (width === 390 || width === 1440)
          await shot(`${key}-${route.replaceAll('/', '-') || 'home'}-${width}`)
        results.push({ key, route: route || 'home', width, status: 200, ...size })
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    for (const [section, first, second] of [
      ['products', 12, 2],
      ['news', 9, 3],
      ['cases', 6, 2],
    ]) {
      await visit(`${base}/${section}`)
      assert.equal(await page.locator('main .it-card').count(), first)
      await visit(`${base}/${section}?page=2`)
      assert.equal(await page.locator('main .it-card').count(), second)
      await visit(`${base}/${section}?page=99`, 404)
    }
    await visit(`${base}/faqs`)
    assert.equal(await page.locator('.it-faq-list details').count(), 10)
    assert.equal(await page.locator('.it-faq-list details[open]').count(), 0)
    await page.locator('.it-faq-list summary').nth(0).click()
    await page.locator('.it-faq-list summary').nth(1).click()
    assert.equal(await page.locator('.it-faq-list details[open]').count(), 2)
    await page.locator('.it-pagination a').filter({ hasText: /^2$/ }).click()
    await page.waitForURL('**/faqs?page=2')
    assert.equal(await page.locator('.it-faq-list details').count(), 2)
    assert.equal(await page.locator('.it-faq-list details[open]').count(), 0)

    await visit(base)
    const productGroup = page.locator('.it-nav-group').filter({
      has: page.locator(`.it-nav-label a[href="${base}/products"]`),
    })
    await productGroup.locator('.it-nav-label>a').hover()
    assert.equal(await productGroup.locator('.it-megamenu').isVisible(), true)
    await shot(`${key}-category-menu`, false)
    await page.mouse.move(100, 950)
    assert.equal(await productGroup.locator('.it-megamenu').isVisible(), false)

    const trigger = page.locator('.it-header-quote > button')
    await trigger.click()
    let dialog = page.locator('dialog[open]')
    assert.equal(await dialog.count(), 1)
    await shot(`${key}-quote-dialog`, false)
    await dialog.locator('input[name=name]').fill('Template reviewer')
    await dialog.locator('input[name=email]').fill('reviewer@example.com')
    await dialog.locator('input[name=phone]').fill('+10000000000')
    await dialog.locator('textarea[name=message]').fill('Testing the demonstration form only.')
    await dialog.locator('.nt-inquiry-message button').click()
    await dialog.locator('[role=status]').filter({ hasText: '演示提交成功' }).waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('dialog[open]').count(), 0)
    // The native close event and React effect cleanup follow the Escape key event.
    await page.waitForFunction(() => document.body.style.overflow !== 'hidden')
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
    assert.equal(await trigger.evaluate((element) => element === document.activeElement), true)

    await visit(`${base}/products/sample-1`)
    const firstSource = await page.locator('.nt-gallery-main img').getAttribute('src')
    await page.locator('.nt-gallery-thumbnails button').nth(1).click()
    assert.notEqual(await page.locator('.nt-gallery-main img').getAttribute('src'), firstSource)
    const pdf = await page.locator('a').filter({ hasText: '下载规格书' }).getAttribute('href')
    const pdfResponse = await page.request.get(origin + pdf)
    assert.equal(pdfResponse.status(), 200)
    assert.equal((await pdfResponse.body()).subarray(0, 5).toString(), '%PDF-')
    await page.locator('.it-product-actions>button').click()
    dialog = page.locator('dialog[open]')
    assert.match(await dialog.locator('input[name=product]').inputValue(), /01/)
    await page.keyboard.press('Escape')
    await page.locator('.it-language>button').click()
    const german = page.locator('#it-language-list a[lang=de]')
    assert.ok((await german.getAttribute('href')).endsWith('/de/products/sample-1'))
    await german.click()
    await page.waitForURL('**/de/products/sample-1')

    for (const locale of ['en', 'es', 'ar', 'id', 'de']) {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        for (const route of ['', 'products/sample-1', 'faqs', 'contact']) {
          await visit(`/template-demo/${key}/${locale}${route ? `/${route}` : ''}`)
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `${locale} overflow at ${key}/${route}/${width}`,
          )
          assert.equal(
            await page.locator('html').getAttribute('dir'),
            locale === 'ar' ? 'rtl' : 'ltr',
          )
          if (!route) await shot(`${key}-${locale}-home-${width}`)
          results.push({ key, route: route || 'home', locale, width, status: 200 })
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await visit(base)
    await page.locator('.it-menu-button').click()
    await expect(page.locator('#it-navigation')).toBeVisible()
    const mobileProducts = page.locator('.it-nav-group').filter({
      has: page.locator(`.it-nav-label a[href="${base}/products"]`),
    })
    await mobileProducts.locator('.it-nav-label button').click()
    await expect(mobileProducts.locator('.it-megamenu')).toBeVisible()
    await mobileProducts.locator('.it-megamenu a').first().click()
    await page.waitForURL('**/products?category=family-1')
    await expect(page.locator('#it-navigation')).toBeHidden()
    await visit(`${base}/products/no-such-product`, 404)
    await visit(`${base}/products?category=not-ours`, 404)
    console.log(key, 'layout, paging, forms, navigation and locales passed')
  }
  assert.equal(writes.length, 0, 'Demo generated API POST requests')
  assert.deepEqual(errors, [], 'Browser runtime errors')
  await writeFile(
    `${directory}/browser-report.json`,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        results,
        writes,
        errors,
        scenarios: [
          'five viewport sizes',
          'six languages',
          '12/9/6/10 pagination',
          'multiple FAQ expansion and reset',
          'hover and mobile category menus',
          'quote modal and demo-only submission',
          'product gallery and sample PDF',
          'product path retained during language switch',
          'unknown categories, products and pages return 404',
        ],
      },
      null,
      2,
    ),
  )
  console.log(`${results.length} page/layout checks; no API writes or runtime errors`)
} catch (error) {
  await shot('failure', false)
  await writeFile(
    `${directory}/browser-failure.json`,
    JSON.stringify({ error: String(error), results, errors, writes, url: page.url() }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
