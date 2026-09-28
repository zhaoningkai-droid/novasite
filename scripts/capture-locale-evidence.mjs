import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const slug = 'iec-60076-transformer-documentation'

for (const locale of ['en', 'zh', 'ru', 'id']) {
  await page.goto(`http://localhost:3100/s/volttrans/${locale}/blog/${slug}`)
  await page.locator('h1').waitFor()
  await page.screenshot({ path: `docs/evidence/article-${locale}.png`, fullPage: false })
  console.log(`${locale}: ${await page.locator('h1').innerText()}`)
}

await browser.close()
