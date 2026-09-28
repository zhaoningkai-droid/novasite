import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'

const adminUser = { email: process.env.SEED_ADMIN_EMAIL || '', password: process.env.SEED_ADMIN_PASSWORD || '' }

async function enterCompany(page: Parameters<typeof login>[0]['page'], company: string) {
  await page.goto('/workspace/companies')
  await page.getByLabel('搜索公司').fill(company)
  if (await page.getByRole('link', { name: '进入工作台' }).count() === 0) await page.getByRole('button', { name: '选择公司' }).click()
  await page.getByRole('link', { name: '进入工作台' }).click()
}

test('网站数据看板按范围联动、可刷新和导出，且公司上下文不串用', async ({ page }) => {
  test.skip(!adminUser.email || !adminUser.password, '需要通过 SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD 指定本地验收账号；不使用示例密码尝试登录。')
  await login({ page, user: adminUser })
  await enterCompany(page, 'VoltTrans')
  await expect(page.getByTestId('workspace-analytics')).toBeVisible()
  await expect(page.getByText('演示数据，尚未接入真实流量统计')).toBeVisible()
  const yearlyPV = await page.getByTestId('metric-pv').textContent()
  const lifetimePV = await page.getByTestId('metric-total-pv').textContent()
  await page.getByTestId('range-7d').click()
  await expect(page.getByTestId('range-7d')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('metric-pv')).not.toHaveText(yearlyPV || '')
  await expect(page.getByTestId('metric-total-pv')).toHaveText(lifetimePV || '')
  await expect(page.getByTestId('trend-chart')).toHaveAttribute('data-pv-total', (await page.getByTestId('metric-pv').textContent())?.replaceAll(',', '') || '')
  await expect(page.getByTestId('source-total')).toHaveText((await page.getByTestId('metric-pv').textContent())?.replaceAll(',', '') || '')
  await page.getByRole('button', { name: '刷新数据' }).click()
  await expect(page.getByRole('status')).toContainText('已更新近7天的演示数据')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出演示数据' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('网站数据演示.csv')

  await enterCompany(page, '华东紧固件')
  await expect(page.getByTestId('analytics-company')).toContainText('华东紧固件制造有限公司')
  await expect(page.getByTestId('metric-pv')).not.toHaveText(yearlyPV || '')
  await expect(page.getByTestId('metric-total-pv')).not.toHaveText(lifetimePV || '')
  await expect(page.getByTestId('source-chart')).toContainText('直接访问')
})
