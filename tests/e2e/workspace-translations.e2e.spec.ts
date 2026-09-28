import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = { email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local', password: process.env.SEED_ADMIN_PASSWORD || '' }

test('同一产品可分别维护四语，保存一种语言不会改写其它语言', async ({ page }) => {
  await login({ page, user: adminUser })
  await page.goto('/workspace/companies')
  await page.getByLabel('搜索公司').fill('VoltTrans')
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.getByRole('link', { name: '内容管理' }).click()
  await page.getByRole('link', { name: '维护四语' }).first().click()
  await expect(page).toHaveURL(/\/translations$/)
  for (const label of ['简体中文', '英语', '俄语', '印尼语']) await expect(page.locator('.workspace-translations__locale').filter({ hasText: label })).toBeVisible()

  await page.locator('.workspace-translations__locale').filter({ hasText: '英语' }).click()
  const originalTitle = await page.getByLabel('英语产品名称').inputValue()
  const originalSummary = await page.getByLabel('英语列表摘要').inputValue()
  const temporaryTitle = `${originalTitle} Translation Test`
  await page.getByLabel('英语产品名称').fill(temporaryTitle)
  await page.getByRole('button', { name: '保存英语' }).click()
  await expect(page.getByText('当前语言已保存。')).toBeVisible()

  await page.locator('.workspace-translations__locale').filter({ hasText: '简体中文' }).click()
  await expect(page.getByLabel('简体中文产品名称')).not.toHaveValue(temporaryTitle)
  await page.locator('.workspace-translations__locale').filter({ hasText: '英语' }).click()
  await page.getByLabel('英语产品名称').fill(originalTitle)
  await page.getByLabel('英语列表摘要').fill(originalSummary)
  await page.getByRole('button', { name: '保存英语' }).click()
  await expect(page.getByText('当前语言已保存。')).toBeVisible()
})
