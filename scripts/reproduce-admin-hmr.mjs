import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1512, height: 900 } })
const login = await page.request.post('http://localhost:3100/api/users/login', {
  data: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
    password: process.env.SEED_ADMIN_PASSWORD || '',
  },
})
if (!login.ok()) throw new Error(`Admin login failed with ${login.status()}`)
await page.goto('http://localhost:3100/admin')
await page.locator('#nav-group-内容运营').waitFor()

const samples = []
for (let index = 0; index < 60; index += 1) {
  const sample = await page.locator('.nav__link').evaluateAll((links) => {
    const ids = links.map((link) => link.id)
    return {
      count: ids.length,
      duplicates: ids.filter((id, position) => ids.indexOf(id) !== position),
    }
  })
  samples.push({ elapsedMs: index * 500, ...sample })
  await page.waitForTimeout(500)
}

await page.reload()
await page.locator('#nav-group-内容运营').waitFor()
const afterReload = await page.locator('.nav__link').evaluateAll((links) => {
  const ids = links.map((link) => link.id)
  return { count: ids.length, duplicates: ids.filter((id, position) => ids.indexOf(id) !== position) }
})
console.log(JSON.stringify({ samples, afterReload }, null, 2))
await browser.close()
