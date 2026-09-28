import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
  password: process.env.SEED_ADMIN_PASSWORD || '',
}

test.describe('Company selection', () => {
  test.beforeEach(async ({ page }) => login({ page, user: adminUser }))

  test('searches companies, enters the dedicated workspace and keeps it after refresh', async ({ page }) => {
    await page.getByLabel('搜索公司').fill('华东')
    await expect(page.getByRole('cell', { name: '华东紧固件制造有限公司' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'VoltTrans Power Equipment' })).toHaveCount(0)

    await page.getByRole('button', { name: '选择公司' }).click()
    await expect(page.getByRole('link', { name: '进入工作台' })).toBeVisible()
    await expect.poll(() => page.context().cookies()).toContainEqual(expect.objectContaining({ name: 'payload-tenant', value: '2' }))

    await page.reload()
    await expect(page.getByText('当前已选')).toBeVisible()
    await page.getByRole('link', { name: '进入工作台' }).click()
    await expect(page).toHaveURL(/\/workspace\/huadong-fasteners\/website\/analytics$/)
    await expect(page.getByRole('heading', { name: '当前工作公司：华东紧固件制造有限公司' })).toBeVisible()
    await expect(page.getByText('华东紧固件制造有限公司 的专属工作台')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: '当前工作公司：华东紧固件制造有限公司' })).toBeVisible()
  })

  test('shows a clear empty state when search has no match', async ({ page }) => {
    await page.getByLabel('搜索公司').fill('不存在的客户')
    await expect(page.getByRole('heading', { name: '未找到匹配的公司' })).toBeVisible()
  })

  test('does not allow an unselected or mismatched company into the workspace', async ({ page }) => {
    await page.evaluate(() => {
      document.cookie = 'payload-tenant=; Max-Age=0; Path=/; SameSite=Lax'
    })
    await page.goto('/workspace/volttrans/website/analytics')
    await expect(page).toHaveURL(/\/workspace\/companies$/)
    await expect(page.getByRole('heading', { name: '选择公司' })).toBeVisible()

    await page.getByLabel('搜索公司').fill('VoltTrans')
    await page.getByRole('button', { name: '选择公司' }).click()
    await page.goto('/workspace/huadong-fasteners/website/analytics')
    await expect(page).toHaveURL(/\/workspace\/companies$/)
    await expect(page.getByRole('heading', { name: '选择公司' })).toBeVisible()
  })
})
