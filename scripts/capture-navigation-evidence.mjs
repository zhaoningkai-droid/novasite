import { chromium } from '@playwright/test'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1512, height: 900 }, deviceScaleFactor: 1 })

const login = await page.request.post('http://localhost:3100/api/users/login', {
  data: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
    password: process.env.SEED_ADMIN_PASSWORD || '',
  },
})
if (!login.ok()) throw new Error(`Admin login failed with ${login.status()}`)
await page.goto('http://localhost:3100/admin')
await page.getByRole('heading', { name: '独立站运营控制台' }).waitFor()
const openMenu = page.getByRole('button', { name: 'Open Menu' })
if (await openMenu.isVisible()) await openMenu.click()
await page.locator('#nav-group-内容运营').waitFor()
await page.screenshot({ path: 'docs/evidence/admin-navigation-after.png', fullPage: false })

const groups = await page.locator('.nav-group').evaluateAll((elements) =>
  elements.map((element) => ({
    id: element.id,
    links: element.querySelectorAll('.nav__link').length,
    open: Boolean(element.querySelector('.nav-group__toggle--open')),
  })),
)
const ids = await page.locator('.nav__link').evaluateAll((elements) => elements.map((element) => element.id))
console.log(JSON.stringify({ groups, duplicateIDs: ids.filter((id, index) => ids.indexOf(id) !== index) }, null, 2))
await browser.close()
