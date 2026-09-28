import { expect, test } from '@playwright/test'

import { requiredUnlessLegacyBaseEdit } from '../../src/collections/Products'
import { login } from '../helpers/login'

const adminUser = {
  email: process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local',
  password: process.env.SEED_ADMIN_PASSWORD || '',
}

const selectVoltTrans = async (page: Parameters<typeof login>[0]['page']) => {
  await page.goto('/workspace/companies')
  await page.getByLabel('搜索公司').fill('VoltTrans')
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
  await page.getByRole('link', { name: '内容管理' }).click()
}

const openVoltTransProductEditor = async (page: Parameters<typeof login>[0]['page']) => {
  await page.getByRole('row', { name: /锌铝涂层法兰面螺栓/ }).getByRole('link', { name: '编辑基础信息' }).click()
  await expect(page).toHaveURL(/\/workspace\/volttrans\/website\/content\/\d+\/edit$/)
}

test.describe('公共编辑保存', () => {
  test.beforeEach(async ({ page }) => login({ page, user: adminUser }))

  test('保存真实产品后刷新仍保留，随后恢复原值', async ({ page }) => {
    await selectVoltTrans(page)
    await openVoltTransProductEditor(page)
    const originalTitle = await page.getByLabel('产品名称').inputValue()
    const originalModel = await page.getByLabel('产品型号').inputValue()
    const testTitle = `${originalTitle}保存验证`

    await page.getByLabel('产品名称').fill(testTitle)
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('保存成功。', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('产品名称')).toHaveValue(testTitle)

    await page.getByLabel('产品名称').fill(originalTitle)
    await page.getByLabel('产品型号').fill(originalModel)
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('保存成功。', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('产品名称')).toHaveValue(originalTitle)
  })

  test('中文必填校验与取消恢复不会误写记录', async ({ page }) => {
    await selectVoltTrans(page)
    await openVoltTransProductEditor(page)
    const originalTitle = await page.getByLabel('产品名称').inputValue()

    await page.getByLabel('产品名称').fill('')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText('请输入产品名称。', { exact: true })).toBeVisible()
    await expect(page.getByLabel('产品名称')).toHaveValue('')

    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '取消并恢复' }).click()
    await expect(page.getByLabel('产品名称')).toHaveValue(originalTitle)
    await expect(page.getByText('已恢复为最近一次保存的内容。', { exact: true })).toBeVisible()
  })

  test('网络失败保留输入，并阻止连续重复提交', async ({ page }) => {
    await selectVoltTrans(page)
    await openVoltTransProductEditor(page)
    const failedTitle = '网络失败后仍保留的产品名称'
    let requestCount = 0
    await page.route('**/api/workspace/volttrans/products/*', async (route) => {
      requestCount += 1
      await route.abort('failed')
    })
    await page.getByLabel('产品名称').fill(failedTitle)
    await page.getByRole('button', { name: '保存' }).dblclick()
    await expect(page.getByText('保存未完成，请检查网络后重试。已填写的内容已保留。', { exact: true })).toBeVisible()
    await expect(page.getByLabel('产品名称')).toHaveValue(failedTitle)
    expect(requestCount).toBe(1)
  })

  test('正常新建内容的中文必填规则不因历史兼容而放宽', () => {
    const validateChineseAlt = requiredUnlessLegacyBaseEdit('替代文本')
    expect(validateChineseAlt('', { req: { context: {} } })).toBe('请输入替代文本。')
    expect(validateChineseAlt('', { req: { context: { workspaceBaseEdit: true } } })).toBe(true)
  })
})
