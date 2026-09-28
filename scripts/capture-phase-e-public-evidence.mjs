import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/phase-e'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1512, height: 920 } })
const page = await context.newPage()

const capture = async (path, name, text) => {
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
  await page.getByText(text, { exact: true }).first().waitFor()
  await page.screenshot({ path: `${output}/${name}`, fullPage: false })
}

await capture('/s/volttrans/en', '01-volttrans-home-en.png', 'Reliable Fasteners for Every Connection')
await capture('/s/huadong-fasteners/zh', '02-huadong-home-zh.png', '华东紧固件：稳定连接，可靠交付')
await page.goto(`${baseURL}/s/volttrans/en/products/voltfast-din-933-hex-bolt`, { waitUntil: 'domcontentloaded' })
await page.getByText('DIN / ISO / drawing', { exact: true }).waitFor()
await page.locator('.site-specs').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${output}/03-volttrans-product-specifications-en.png`, fullPage: false })

await page.goto(`${baseURL}/s/huadong-fasteners/zh/products/huadong-din-933-hex-bolt`, { waitUntil: 'domcontentloaded' })
await page.getByText('DIN / ISO / 图纸要求', { exact: true }).waitFor()
await page.locator('.site-specs').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${output}/04-huadong-product-specifications-zh.png`, fullPage: false })

await browser.close()
console.log(output)
