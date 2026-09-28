import { chromium } from '@playwright/test'
import { getPayload } from 'payload'
import { writeFile, mkdir } from 'node:fs/promises'

import config from '../src/payload.config'

const baseURL = 'http://localhost:3100'
const output = 'docs/evidence/admin-redesign/step-02'
const restrictedEmail = 'step-02-company-access-check@novasite.local'
const restrictedPassword = 'Step02-Temporary-Check-2026!'
await mkdir(output, { recursive: true })

const payload = await getPayload({ config })
const databaseCounts = async () => Object.fromEntries(await Promise.all(['products', 'news', 'cases', 'posts', 'pages', 'leads'].map(async (collection) => [collection, (await payload.count({ collection: collection as 'products', overrideAccess: true })).totalDocs])))
const before = await databaseCounts()
let temporaryUserID: number | undefined
const checks: Record<string, unknown> = { startedAt: new Date().toISOString(), before }
const browser = await chromium.launch({ headless: true })

try {
  const publicContext = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const publicPage = await publicContext.newPage()
  await publicPage.goto(`${baseURL}/workspace/companies`, { waitUntil: 'domcontentloaded' })
  await publicPage.waitForURL('**/admin/login?redirect=/workspace/companies')
  checks.unauthenticatedRoute = publicPage.url()
  await publicContext.close()

  const adminContext = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const adminPage = await adminContext.newPage()
  await adminPage.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await adminPage.locator('#field-email').fill(process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local')
  await adminPage.locator('#field-password').fill(process.env.SEED_ADMIN_PASSWORD || '')
  await adminPage.locator('button[type="submit"]').click()
  await adminPage.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await adminPage.screenshot({ path: `${output}/01-login-redirects-to-company-selection.png`, fullPage: true })
  checks.adminLoginDestination = adminPage.url()
  checks.adminCompanyRows = await adminPage.locator('tbody tr').count()

  await adminPage.getByLabel('搜索公司').fill('华东')
  await adminPage.screenshot({ path: `${output}/02-searches-huadong-company.png`, fullPage: true })
  await adminPage.getByRole('button', { name: '选择公司' }).click()
  await adminPage.waitForTimeout(100)
  await adminPage.screenshot({ path: `${output}/03-selects-huadong-company.png`, fullPage: true })
  checks.selectedCookie = (await adminContext.cookies()).find((cookie) => cookie.name === 'payload-tenant')?.value
  await adminPage.reload({ waitUntil: 'networkidle' })
  checks.selectionAfterRefresh = await adminPage.getByText('当前已选').count()
  await adminContext.close()

  await payload.delete({ collection: 'users', overrideAccess: true, where: { email: { equals: restrictedEmail } } })
  const temporaryUser = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: { email: restrictedEmail, name: '第2步临时权限核验账号', password: restrictedPassword, roles: ['editor'], tenants: [{ tenant: 2 }] },
  })
  temporaryUserID = temporaryUser.id
  const restrictedContext = await browser.newContext({ viewport: { width: 1512, height: 920 } })
  const restrictedPage = await restrictedContext.newPage()
  await restrictedPage.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })
  await restrictedPage.locator('#field-email').fill(restrictedEmail)
  await restrictedPage.locator('#field-password').fill(restrictedPassword)
  await restrictedPage.locator('button[type="submit"]').click()
  await restrictedPage.waitForURL(`${baseURL}/workspace/companies`, { waitUntil: 'networkidle' })
  await restrictedPage.screenshot({ path: `${output}/04-restricted-account-only-sees-assigned-company.png`, fullPage: true })
  checks.restrictedCompanyRows = await restrictedPage.locator('tbody tr').count()
  checks.restrictedPageText = await restrictedPage.locator('tbody').innerText()
  await restrictedContext.close()
} finally {
  if (temporaryUserID) await payload.delete({ collection: 'users', id: temporaryUserID, overrideAccess: true })
  checks.after = await databaseCounts()
  checks.businessContentUnchanged = JSON.stringify(checks.before) === JSON.stringify(checks.after)
  checks.finishedAt = new Date().toISOString()
  await writeFile(`${output}/checks.json`, `${JSON.stringify(checks, null, 2)}\n`)
  await browser.close()
}
