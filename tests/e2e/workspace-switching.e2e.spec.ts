import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
  password: process.env.SEED_ADMIN_PASSWORD || '',
}

const chooseCompany = async (page: Parameters<typeof login>[0]['page'], search: string) => {
  await page.goto('/workspace/companies')
  await page.getByLabel('搜索公司').fill(search)
  const enter = page.getByRole('link', { name: '进入工作台' })
  if (await enter.count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
}

test.describe('公司工作台切换保护', () => {
  test.beforeEach(async ({ page }) => login({ page, user: adminUser }))

  test('右上角双向切换后，网址和当前公司同步更新', async ({ page }) => {
    await chooseCompany(page, 'VoltTrans')
    await expect(page).toHaveURL(/\/workspace\/volttrans\/website\/analytics$/)

    await page.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ }).click()
    await expect(page.getByRole('menu', { name: '切换公司列表' })).toBeVisible()
    await page.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
    await expect(page).toHaveURL(/\/workspace\/huadong-fasteners\/website\/analytics$/)
    await expect(page.getByRole('heading', { name: '当前工作公司：华东紧固件制造有限公司' })).toBeVisible()

    await page.getByRole('button', { name: /当前工作公司.*华东紧固件制造有限公司/ }).click()
    await expect(page.getByRole('menu', { name: '切换公司列表' })).toBeVisible()
    await page.getByRole('menuitem', { name: /VoltTrans Power Equipment/ }).click()
    await expect(page).toHaveURL(/\/workspace\/volttrans\/website\/analytics$/)
    await expect(page.getByRole('heading', { name: '当前工作公司：VoltTrans Power Equipment' })).toBeVisible()
  })

  test('页面标记未保存时，取消切换不会丢失当前工作台上下文', async ({ page }) => {
    await chooseCompany(page, 'VoltTrans')
    await page.evaluate(() => { document.documentElement.dataset.workspaceUnsaved = 'true' })
    await page.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ }).click()

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('尚未保存')
      await dialog.dismiss()
    })
    await page.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
    await expect(page).toHaveURL(/\/workspace\/volttrans\/website\/analytics$/)
    await expect(page.getByRole('heading', { name: '当前工作公司：VoltTrans Power Equipment' })).toBeVisible()

    page.once('dialog', async (dialog) => await dialog.accept())
    await page.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
    await expect(page).toHaveURL(/\/workspace\/huadong-fasteners\/website\/analytics$/)
  })

  test('多标签中旧公司上下文不会被新选择静默替换', async ({ browser }) => {
    const context = await browser.newContext()
    const firstTab = await context.newPage()
    await login({ page: firstTab, user: adminUser })
    await chooseCompany(firstTab, 'VoltTrans')
    const secondTab = await context.newPage()
    await secondTab.goto('/workspace/volttrans/website/analytics')
    await expect(secondTab.getByRole('heading', { name: '当前工作公司：VoltTrans Power Equipment' })).toBeVisible()

    await firstTab.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ }).click()
    await firstTab.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
    await expect(firstTab).toHaveURL(/\/workspace\/huadong-fasteners\/website\/analytics$/)

    await secondTab.reload()
    await expect(secondTab).toHaveURL(/\/workspace\/companies$/)
    await expect(secondTab.getByRole('heading', { name: '选择公司' })).toBeVisible()
    await expect(secondTab.getByText('华东紧固件制造有限公司 的专属工作台')).toHaveCount(0)
    await context.close()
  })
})
