import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const output = 'docs/evidence/phase-c/before'
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1512, height: 920 } })

for (const [path, name] of [
  ['/s/volttrans/en', 'volttrans-home-before.png'],
  ['/s/huadong-fasteners/zh', 'huadong-home-before.png'],
]) {
  await page.goto(`http://localhost:3100${path}`)
  await page.locator('h1').first().waitFor()
  await page.screenshot({ path: `${output}/${name}`, fullPage: false })
}

await browser.close()
console.log(output)
