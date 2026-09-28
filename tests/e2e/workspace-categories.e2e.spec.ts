import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' }
const testSlug = 'step11-temporary-category'

async function enterVoltTrans(page: Parameters<typeof login>[0]['page']) {
  await page.goto('/workspace/companies')
  await page.getByLabel('搜索公司').fill('VoltTrans')
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.getByRole('link', { name: '分类管理' }).click()
  await expect(page).toHaveURL(/\/workspace\/volttrans\/website\/categories$/)
}

test('四类分类真实按公司隔离，支持两级、四语，且阻止错误删除', async ({ page }) => {
  await login({ page, user: adminUser })
  await enterVoltTrans(page)
  for (const tab of ['产品分类', '文章分类', '案例分类', '博客分类']) await expect(page.getByRole('button', { name: tab })).toBeVisible()

  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '删除' }).first().click()
  await expect(page.getByRole('status')).toContainText('该分类下仍有二级分类，不能删除')
  await page.locator('tr', { hasText: '非标定制' }).getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('status')).toContainText('该分类仍有关联内容，不能删除')

  await page.getByRole('button', { name: /新增/ }).click()
  await page.getByLabel('分类名称').fill('第11步临时一级分类')
  await page.getByLabel('分类地址标识').fill(testSlug)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('分类已新增')
  const row = page.locator('tr', { hasText: '第11步临时一级分类' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '添加二级' }).click()
  await page.getByLabel('分类名称').fill('第11步临时二级分类')
  await page.getByLabel('分类地址标识').fill(`${testSlug}-child`)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('第11步临时二级分类')).toBeVisible()

  await row.getByRole('button', { name: '翻译' }).click()
  await page.getByLabel('简体中文分类名称').fill('第11步临时一级分类')
  await page.getByLabel('英语分类名称').fill('Step 11 Temporary Main Category')
  await page.getByLabel('俄语分类名称').fill('Временная категория шага 11')
  await page.getByLabel('印尼语分类名称').fill('Kategori Sementara Langkah 11')
  await expect(page.getByLabel('简体中文分类名称')).not.toHaveValue('')
  await expect(page.getByLabel('英语分类名称')).not.toHaveValue('')
  await expect(page.getByLabel('俄语分类名称')).not.toHaveValue('')
  await expect(page.getByLabel('印尼语分类名称')).not.toHaveValue('')
  await page.getByRole('button', { name: '保存四语' }).click()
  await expect(page.getByRole('status')).toContainText('四种语言分类名称已保存')

  const crossCompany = await page.request.post('/api/workspace/huadong-fasteners/categories/products', { data: {} })
  expect(crossCompany.status()).toBe(409)

  const childRow = page.locator('tr', { hasText: '第11步临时二级分类' })
  await childRow.getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('status')).toContainText('分类已删除')
  await row.getByRole('button', { name: '删除' }).click()
  await expect(page.getByRole('status')).toContainText('分类已删除')
})
