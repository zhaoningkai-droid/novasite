import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
  password: process.env.SEED_ADMIN_PASSWORD || '',
}

const enterVoltTrans = async (page: Parameters<typeof login>[0]['page']) => {
  await page.getByLabel('搜索公司').fill('VoltTrans')
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await expect(page).toHaveURL(/\/workspace\/volttrans\/website\/analytics$/)
}

test.describe('独立站工作台外壳', () => {
  test.beforeEach(async ({ page }) => {
    await login({ page, user: adminUser })
    await enterVoltTrans(page)
  })

  test('渲染参考结构中的顶部、侧栏与当前工作公司', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: '平台主导航' })).toContainText('首页社媒营销独立站GEO优化广告投放客户管理客户挖掘自动化营销企业知识库')
    await expect(page.getByText('独立站', { exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('complementary', { name: '独立站功能导航' })).toContainText('网站数据网站配置首页管理分类管理内容管理关于我们常见问题联系我们网站导航站点管理')
    await expect(page.getByRole('link', { name: '网站数据' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: /当前工作公司.*VoltTrans Power Equipment/ })).toBeVisible()
  })

  test('预留入口和铃铛提供明确中文提示，不改变公司上下文', async ({ page }) => {
    await page.getByRole('button', { name: '社媒营销' }).click()
    await expect(page.getByRole('status')).toHaveText('社媒营销功能开发中')
    await expect(page).toHaveURL(/\/workspace\/volttrans\/website\/analytics$/)

    await page.getByRole('button', { name: '查看通知' }).click()
    await expect(page.getByRole('status')).toHaveText('暂无通知')
    await page.getByRole('button', { name: '首页管理' }).click()
    await expect(page.getByText('首页管理将在后续步骤接入', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '当前工作公司：VoltTrans Power Equipment' })).toBeVisible()
  })
})
