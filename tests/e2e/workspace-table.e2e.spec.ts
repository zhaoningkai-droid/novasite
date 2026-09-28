import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
  password: process.env.SEED_ADMIN_PASSWORD || '',
}

const selectCompany = async (page: Parameters<typeof login>[0]['page'], keyword: string) => {
  await page.goto('/workspace/companies')
  await page.getByLabel('搜索公司').fill(keyword)
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
}

test.describe('通用内容列表基础', () => {
  test.beforeEach(async ({ page }) => login({ page, user: adminUser }))

  test('从侧栏进入真实产品列表，支持搜索、筛选、分页和空状态', async ({ page }) => {
    await selectCompany(page, 'VoltTrans')
    const contentLink = page.getByRole('link', { name: '内容管理' })
    await expect(contentLink).toHaveAttribute('href', '/workspace/volttrans/website/content')
    await contentLink.click()
    await expect(page).toHaveURL(/\/workspace\/volttrans\/website\/content$/)
    await expect(page.getByRole('heading', { name: '内容管理' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByText('共 7 条', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: '下一页' })).toBeVisible()

    await page.getByLabel('搜索产品').fill('DIN 933')
    await page.getByRole('button', { name: '查询' }).click()
    await expect(page.getByText('DIN 933 六角头螺栓', { exact: true })).toBeVisible()
    await expect(page.getByText('共 1 条', { exact: true })).toBeVisible()

    await page.getByLabel('搜索产品').fill('完全不存在的产品')
    await page.getByRole('button', { name: '查询' }).click()
    await expect(page.getByRole('heading', { name: '没有匹配的产品' })).toBeVisible()

    await page.getByRole('link', { name: '重置' }).click()
    await page.waitForURL(/\/workspace\/volttrans\/website\/content$/)
    await page.getByLabel('产品分类').selectOption({ label: '标准紧固件' })
    await page.getByRole('button', { name: '查询' }).click()
    await expect(page).toHaveURL(/category=\d+/)
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByTitle('标准紧固件')).toBeVisible()
  })

  test('勾选仅保留在当前列表页面，切换公司时不会带到另一家公司', async ({ page }) => {
    await selectCompany(page, 'VoltTrans')
    await page.goto('/workspace/volttrans/website/content')
    await page.locator('tbody input[type="checkbox"]').first().check()
    await expect(page.getByText('已选择 1 项', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ }).click()
    await page.getByRole('menuitem', { name: /华东紧固件制造有限公司/ }).click()
    await expect(page).toHaveURL(/\/workspace\/huadong-fasteners\/website\/analytics$/)
    await page.getByRole('link', { name: '内容管理' }).click()
    await expect(page.getByText(/已选择 \d+ 项/)).toHaveCount(0)
    await expect(page.getByText('共 6 条', { exact: true })).toBeVisible()
  })

  test('完整查看弹窗展示被截断列的完整字段', async ({ page }) => {
    await selectCompany(page, 'VoltTrans')
    await page.goto('/workspace/volttrans/website/content')
    await page.getByRole('button', { name: '查看完整' }).first().click()
    await expect(page.getByRole('dialog', { name: '完整内容' })).toBeVisible()
    await page.getByRole('button', { name: '关闭完整内容' }).click()
    await expect(page.getByRole('dialog', { name: '完整内容' })).toHaveCount(0)
  })
})
