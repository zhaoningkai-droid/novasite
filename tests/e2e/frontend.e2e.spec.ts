import { expect, test } from '@playwright/test'

test.describe('多站点前台', () => {
  test('renders the published homepage page blocks from Payload', async ({ page }) => {
    await page.goto('/s/volttrans/en')
    await expect(page.locator('main')).toHaveAttribute('data-site-page', 'home')
    await expect(page.getByText('Reliable Fasteners for Every Connection')).toBeVisible()
    await expect(page.getByText('20+ years')).toBeVisible()
    await expect(page.locator('[data-site-faqs]')).toBeVisible()
    await expect(page.locator('[data-site-rfq]')).toBeVisible()
  })

  test('keeps the selected visual configuration isolated by site', async ({ page }) => {
    await page.goto('/s/volttrans/en')
    await expect(page.locator('.site-shell')).toHaveAttribute('data-template', 'power-engineering-v1')

    await page.goto('/s/huadong-fasteners/zh')
    await expect(page.locator('.site-shell')).toHaveAttribute('data-template', 'precision-light-v1')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('华东紧固件：稳定连接，可靠交付')
  })

  test('renders the Google-ready homepage and published products', async ({ page }) => {
    await page.goto('/s/volttrans/en')
    await expect(page).toHaveTitle(/VoltTrans Industrial Fasteners/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Reliable Fasteners')
    await expect(page.getByText('DIN 933 Hex Head Bolt')).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/s\/volttrans\/en$/)
    await expect(page.locator('link[hreflang="zh"]')).toHaveAttribute('href', /\/s\/volttrans\/zh$/)
  })

  test('renders product specifications and Product JSON-LD', async ({ page }) => {
    await page.goto('/s/volttrans/en/products/voltfast-din-933-hex-bolt')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('DIN 933 Hex Head Bolt')
    await expect(page.getByText('Product standard', { exact: true })).toBeVisible()
    await expect(page.getByText('DIN / ISO / drawing', { exact: true })).toBeVisible()
    const structuredData = await page.locator('script[type="application/ld+json"]').first().textContent()
    expect(structuredData).toContain('Product')
  })

  test('keeps preview sites out of Google until publishing is enabled', async ({ request }) => {
    const robots = await request.get('/s/volttrans/robots.txt')
    expect(robots.ok()).toBeTruthy()
    expect(await robots.text()).toContain('Disallow: /')
  })

  test('opens a published article and exposes Article JSON-LD', async ({ page }) => {
    await page.goto('/s/volttrans/en/blog/voltfast-hex-bolt-selection-1')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('How to Select a Hex Bolt')
    const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(structuredData.join('\n')).toContain('Article')
  })

  test('accepts a validated RFQ and rejects incomplete submissions', async ({ request }) => {
    const invalid = await request.post('/api/submit-inquiry', { data: { site: 'volttrans' } })
    expect(invalid.status()).toBe(400)

    const honeypot = await request.post('/api/submit-inquiry', {
      data: { site: 'volttrans', website: 'spam.example' },
    })
    expect(honeypot.ok()).toBeTruthy()
  })
})
