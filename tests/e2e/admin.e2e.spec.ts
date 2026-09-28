import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
  password: process.env.SEED_ADMIN_PASSWORD || '',
}

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => login({ page, user: adminUser }))

  test('sends an authenticated user to company selection', async ({ page }) => {
    await expect(page).toHaveURL(/\/workspace\/companies$/)
    await expect(page.getByRole('heading', { name: '选择公司' })).toBeVisible()
    await expect(page.getByRole('button', { name: '选择公司' })).toHaveCount(2)
  })

  for (const path of ['tenants', 'products', 'posts', 'leads', 'templates', 'deployments']) {
    test(`opens ${path}`, async ({ page }) => {
      await page.goto(`/admin/collections/${path}`)
      await expect(page).toHaveURL(new RegExp(`/admin/collections/${path}(?:\\?.*)?$`))
      await expect(page.locator('h1').first()).toBeVisible()
    })
  }

  test('keeps one clean navigation entry per entity and collapses system settings', async ({ page }) => {
    await page.goto('/admin/collections/products')
    await page.getByRole('button', { name: /打开.*菜单/ }).click()
    const adminNavigation = page.getByRole('complementary').getByRole('navigation')
    for (const group of ['建站与发布', '内容运营', '产品中心', '客户与询盘']) {
      await adminNavigation.getByRole('button', { name: group }).click()
    }
    for (const label of ['页面', '案例', 'FAQ', '博客', '产品管理', '产品分类', '询盘收件箱', '网站导航', '产品技术参数']) {
      await expect(adminNavigation.getByText(label, { exact: true })).toHaveCount(1)
    }
    await expect(adminNavigation.locator('a[href="/admin/globals/header"]')).toHaveCount(0)
    await expect(adminNavigation.locator('a[href="/admin/globals/footer"]')).toHaveCount(0)
    await expect(page.locator('#nav-group-系统设置 .nav-group__toggle')).not.toHaveClass(/nav-group__toggle--open/)
  })
})
