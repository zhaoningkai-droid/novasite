import { expect, test, type Locator, type Page } from '@playwright/test'

import { login } from '../helpers/login'

// Scenarios come from the owner's 2026-09-28 request to review all UI and bugs.
// All workspace writes are intercepted before they reach the server.
const companySlug = process.env.ADMIN_UI_REVIEW_COMPANY_SLUG || 'volttrans'
const fixture = process.env.ADMIN_UI_REVIEW_FIXTURE === '1'
const base = '/workspace/' + companySlug + '/website/content'
const user = {
  email: process.env.SEED_ADMIN_EMAIL || '',
  password: process.env.SEED_ADMIN_PASSWORD || '',
}
const lists = [
  { suffix: '', heading: '产品管理', search: '搜索产品', parameter: 'q' },
  { suffix: '/news', heading: '新闻文章', search: '搜索新闻', parameter: 'keyword' },
  { suffix: '/cases', heading: '案例管理', search: '搜索案例', parameter: 'keyword' },
  { suffix: '/blog', heading: '博客管理', search: '搜索博客', parameter: 'keyword' },
]

test.use({ contextOptions: { reducedMotion: 'reduce' }, trace: 'off', viewport: { height: 900, width: 1366 } })

const selectContext = async (page: Page) => {
  const response = await page.request.get('/api/tenants', {
    params: { depth: 0, limit: 1, 'where[slug][equals]': companySlug },
  })
  expect(response.ok()).toBeTruthy()
  const result = (await response.json()) as { docs: Array<{ id: number }> }
  expect(result.docs).toHaveLength(1)
  await page
    .context()
    .addCookies([
      { name: 'payload-tenant', value: String(result.docs[0].id), url: 'http://localhost:3100' },
    ])
}

const rowAction = async (page: Page, row: Locator, name: RegExp) => {
  const more = row.getByRole('button', { name: /更多操作$/ })
  if (await more.count()) {
    await more.click()
    await page.getByRole('menuitem', { name }).click()
    return more
  }
  const action = row.getByRole('button', { name })
  await action.click()
  return action
}

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.SEED_ADMIN_EMAIL || !process.env.SEED_ADMIN_PASSWORD, '需要通过 SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD 指定本地验收账号；不使用示例密码尝试登录。')
  await page.route('**/api/workspace/**', async (route) => {
    if (['DELETE', 'PATCH', 'POST', 'PUT'].includes(route.request().method())) {
      await route.fulfill({
        body: JSON.stringify({ message: '验收拦截：模拟网络失败，未修改服务器数据。' }),
        contentType: 'application/json',
        status: 503,
      })
    } else await route.continue()
  })
  await login({ page, user })
  await selectContext(page)
})

test('四类内容有明确标题、真实筛选、重复参数和空态', async ({ page }) => {
  for (const list of lists) {
    await page.goto(base + list.suffix)
    await expect(
      page.getByRole('heading', { level: 1, name: new RegExp(list.heading) }),
    ).toBeVisible()
    await expect(page.getByRole('navigation', { name: '内容管理类型' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '列表分页' })).toBeVisible()
    await page.getByLabel(list.search).fill('ADMIN-UI-NO-MATCH-20260928')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByRole('heading', { level: 2, name: /^没有匹配的/ })).toBeVisible()
    await expect(page.getByRole('link', { name: '清除筛选', exact: true })).toBeVisible()
    await page.goto(
      base + list.suffix + '?' + list.parameter + '=first&' + list.parameter + '=second',
    )
    await expect(page.getByLabel(list.search)).toHaveValue('first')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
})

test('四类真实分页与超大页码纠正', async ({ page }) => {
  for (const list of lists) {
    await page.goto(base + list.suffix)
    if (fixture) {
      await expect(page.locator('tbody tr')).toHaveCount(10)
      await expect(page.getByRole('link', { name: '下一页', exact: true })).toBeVisible()
      await page.getByRole('link', { name: '下一页', exact: true }).click()
      await expect(page).toHaveURL(/page=2/)
      await expect(page.locator('tbody tr')).toHaveCount(1)
      await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
    }
    await page.goto(base + list.suffix + '?page=999999')
    await expect(page).not.toHaveURL(/page=999999/)
    await expect(page.getByRole('navigation', { name: '列表分页' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
})

test('重新筛选清空选择，全选支持部分选中状态', async ({ page }) => {
  await page.goto(base)
  const rowCheckbox = page.locator('tbody input[type="checkbox"]').first()
  await rowCheckbox.check()
  await expect(page.getByText('已选择 1 项', { exact: true })).toBeVisible()
  if ((await page.locator('tbody tr').count()) > 1) {
    await expect(page.getByRole('checkbox', { name: '选择本页全部内容' })).toHaveJSProperty(
      'indeterminate',
      true,
    )
  }
  const title = await page.locator('tbody tr').first().locator('strong').first().innerText()
  await page.getByLabel('搜索产品').fill(title)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText(/^已选择 \d+ 项$/)).toHaveCount(0)
})

test('详情弹窗只读，Tab留在弹窗，Escape恢复焦点', async ({ page }) => {
  await page.goto(base)
  const opener = await rowAction(page, page.locator('tbody tr').first(), /^查看 .* 完整信息$/)
  const dialog = page.getByRole('dialog', { name: '完整内容', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('switch')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.locator(':focus')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('删除确认显示目标名称，取消和失败均保留记录', async ({ page }) => {
  await page.goto(base)
  const beforeRows = await page.locator('tbody tr').count()
  const row = page.locator('tbody tr').first()
  const title = await row.locator('strong').first().innerText()
  await rowAction(page, row, /^删除 /)
  const dialog = page.getByRole('dialog', { name: '确认删除内容', exact: true })
  await expect(dialog.getByText(title, { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('tbody tr')).toHaveCount(beforeRows)
  await rowAction(page, row, /^删除 /)
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('未修改服务器数据')
  await expect(page.locator('tbody tr')).toHaveCount(beforeRows)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
})

test('推荐网络失败显示反馈，开关不误报成功', async ({ page }) => {
  await page.route('**/api/workspace/**/featured', async (route) => {
    await route.abort('failed')
  })
  await page.goto(base)
  const toggle = page.getByRole('switch').first()
  const beforeValue = await toggle.getAttribute('aria-checked')
  await toggle.click()
  await expect(page.getByRole('alert')).toContainText('连接中断')
  await expect(toggle).toHaveAttribute('aria-checked', beforeValue || 'false')
  await expect(page.getByRole('button', { name: '刷新确认', exact: true })).toBeVisible()
})

test('窄屏筛选可操作，列表只在自身滚动，减少动态设置生效', async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 })
  for (const list of lists) {
    await page.goto(base + list.suffix)
    await expect(page.getByLabel(list.search)).toBeVisible()
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeVisible()
    const dimensions = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }))
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1)
  }
  await page.goto(base)
  await rowAction(page, page.locator('tbody tr').first(), /^查看 .* 完整信息$/)
  await expect(page.getByRole('dialog', { name: '完整内容' })).toHaveCSS('animation-duration', '0s')
})
