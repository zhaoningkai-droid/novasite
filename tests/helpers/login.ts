import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: {
    email: string
    password: string
  }
}

/**
 * Logs the user into the admin panel via the login page.
 */
export async function login({
  page,
  serverURL = 'http://localhost:3100',
  user,
}: LoginOptions): Promise<void> {
  const response = await page.request.post(`${serverURL}/api/users/login`, { data: user })
  expect(response.ok()).toBeTruthy()
  await page.goto(`${serverURL}/admin`)
  await page.waitForURL(`${serverURL}/workspace/companies`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: '选择公司' })).toBeVisible()
}
