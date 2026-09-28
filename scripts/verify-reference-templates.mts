import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { newTemplates } from '../src/platform/new-templates/registry'
import { applyTemplateChange } from '../src/platform/new-templates/change-service'

// Acceptance scenarios come from the user's five-template / company isolation requirements.
// Only a temporary test company is modified. Never apply templates to existing customer sites.
if (process.env.NODE_ENV !== 'production')
  throw new Error('Disable schema push with NODE_ENV=production')
const payload = await getPayload({ config })
const results: Array<Record<string, unknown>> = []
const base = process.env.NOVASITE_TEST_URL || 'http://localhost:3100'
const rich = (text: string) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: null,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: null,
        children: [
          { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 },
        ],
      },
    ],
  },
})
const slug = `template-qa-${Date.now()}`
const products: number[] = []
const categories: number[] = []
const leads: number[] = []
let tenantID: number | undefined
let templateRevision = 0
const html = async (path: string) => {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(60000) })
  assert.equal(response.status, 200, `HTTP status for ${path}`)
  return response.text()
}
try {
  const users = await payload.find({ collection: 'users', depth: 0, limit: 100, overrideAccess: true })
  const actor = users.docs.find((user) => user.roles?.includes('super-admin'))
  assert.ok(actor, 'A super-admin is required for the temporary company verification')
  const tenant = await payload.create({
    collection: 'tenants',
    locale: 'zh',
    overrideAccess: true,
    data: {
      name: '临时模板验证（将清理）',
      slug,
      status: 'building',
      defaultLocale: 'zh',
      enabledLocales: ['zh', 'en', 'ru', 'id'],
      branding: { companyName: '模板验证公司', tagline: '仅用于自动化验收' },
      fixedPages: {
        homepage: {
          heroTitle: '模板验证首页',
          showFeaturedProducts: true,
          showNews: false,
          showCases: false,
          showVideo: false,
          showCompanyIntro: false,
          showInquiryForm: false,
          showStrength: false,
        },
      },
    },
  })
  tenantID = tenant.id
  for (const name of ['qa-category-a', 'qa-category-b']) {
    const category = await payload.create({
      collection: 'product-categories',
      locale: 'zh',
      overrideAccess: true,
      data: { tenant: tenantID, name, slug: name, sortOrder: categories.length },
    })
    categories.push(category.id)
  }
  for (const [index, title, status] of [
    [0, 'QA-A-PUBLISHED', 'published'],
    [1, 'QA-B-PUBLISHED', 'published'],
    [0, 'QA-HIDDEN-DRAFT', 'draft'],
  ] as const) {
    const product = await payload.create({
      collection: 'products',
      locale: 'zh',
      overrideAccess: true,
      data: {
        tenant: tenantID,
        title,
        slug: title.toLowerCase(),
        category: categories[index],
        summary: 'Temporary QA product',
        description: rich(title),
        featured: true,
        _status: status,
      },
    })
    products.push(product.id)
  }
  for (const definition of newTemplates) {
    const template = await payload.find({
      collection: 'templates',
      limit: 1,
      overrideAccess: true,
      where: { key: { equals: definition.key } },
    })
    assert.equal(template.totalDocs, 1)
    const applied = await applyTemplateChange({
      payload, tenantID, user: actor,
      input: { operation: 'apply', templateId: template.docs[0].id, expectedRevision: templateRevision, idempotencyKey: randomUUID() },
    })
    templateRevision = applied.tenantRevision
    const home = await html(`/s/${slug}/zh`)
    assert.ok(home.includes(`data-template="${definition.key}"`))
    assert.ok(home.includes('QA-A-PUBLISHED') && home.includes('QA-B-PUBLISHED'))
    assert.ok(!home.includes('QA-HIDDEN-DRAFT'))
    assert.ok(!home.includes('nt-inquiry-section') && !home.includes('nt-strength nt-wrap'))
    const filtered = await html(`/s/${slug}/zh/products?category=qa-category-a`)
    assert.ok(filtered.includes('<h3>QA-A-PUBLISHED</h3>'))
    assert.ok(!filtered.includes('<h3>QA-B-PUBLISHED</h3>'))
    const missing = await html(`/s/${slug}/zh/products?category=foreign-category`)
    assert.ok(missing.includes('暂无已发布内容') && !missing.includes('<h3>QA-A-PUBLISHED</h3>'))
    const detail = await html(`/s/${slug}/zh/products/qa-a-published`)
    assert.ok(detail.includes('产品介绍') && detail.includes('意向产品'))
    assert.ok(!detail.includes('Capacity (kVA)'))
    const draft = await fetch(`${base}/s/${slug}/zh/products/qa-hidden-draft`, {
      signal: AbortSignal.timeout(60000),
    })
    assert.equal(draft.status, 404)
    for (const locale of ['zh', 'en', 'ru', 'id']) {
      for (const section of ['', 'products', 'products/qa-a-published', 'news', 'cases', 'blog', 'about', 'faqs', 'contact']) {
        const page = await html(`/s/${slug}/${locale}${section ? `/${section}` : ''}`)
        assert.ok(page.includes(`lang="${locale}"`))
        assert.ok(page.includes(`data-template="${definition.key}"`))
        assert.ok(!page.includes('Capacity (kVA)'))
      }
    }
    results.push({
      key: definition.key,
      homepage: 'passed',
      categoryFilter: 'passed',
      unknownCategory: 'passed',
      draftExcluded: 'passed',
      moduleToggles: 'passed',
      productDetail: 'passed',
      fourLanguages: 'passed',
      interiorRoutes: 'passed',
    })
    console.log(`Verified ${definition.key}`)
  }
  const inquiryEmail = `${slug}@example.invalid`
  const inquiryResponse = await fetch(`${base}/api/submit-inquiry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      site: slug,
      name: 'QA Inquiry',
      email: inquiryEmail,
      phone: '+10000000000',
      product: 'QA-A-PUBLISHED',
      productId: String(products[0]),
      message: 'Please send the product specification and a quotation.',
      sourcePage: `${base}/s/${slug}/zh/products/qa-a-published`,
    }),
    signal: AbortSignal.timeout(60000),
  })
  assert.equal(inquiryResponse.status, 201, 'Product inquiry should be accepted')
  const inquiry = await payload.find({
    collection: 'leads',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { email: { equals: inquiryEmail } },
  })
  assert.equal(inquiry.totalDocs, 1)
  const savedLead = inquiry.docs[0]
  leads.push(savedLead.id)
  assert.equal(savedLead.tenant, tenantID)
  assert.equal(savedLead.product, products[0])
  results.push({ productInquiry: 'saved to the test tenant and linked to the published product' })
  const preview = await fetch(`${base}/template-preview/${slug}/interior-575-v1/zh`, {
    redirect: 'manual',
  })
  assert.ok([303, 307].includes(preview.status), 'Unauthenticated preview must redirect to login')
  results.push({ unauthenticatedPreview: 'redirected to login' })
} finally {
  for (const id of leads) await payload.delete({ collection: 'leads', id, overrideAccess: true })
  for (const id of products.reverse())
    await payload.delete({ collection: 'products', id, overrideAccess: true })
  for (const id of categories.reverse())
    await payload.delete({ collection: 'product-categories', id, overrideAccess: true })
  if (tenantID) {
    await payload.delete({ collection: 'site-template-changes', where: { tenant: { equals: tenantID } }, overrideAccess: true })
    await payload.delete({ collection: 'audit-logs', where: { documentId: { equals: String(tenantID) } }, overrideAccess: true })
    await payload.delete({ collection: 'tenants', id: tenantID, overrideAccess: true })
  }
  writeFileSync(
    'docs/evidence/template-upgrade/implementation-02/http-verification.json',
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        temporarySlug: slug,
        method: 'Actual local HTTP routes, temporary synthetic company, no browser interaction',
        results,
        limits:
          '180 page/locale/template combinations plus filters, drafts, product inquiry and unauthenticated preview. Does not verify mobile dimensions or seeded news/case/blog detail pages.',
      },
      null,
      2,
    ),
  )
  await payload.destroy()
  await Promise.race([payload.db.pool.end(), new Promise<void>((resolve) => setTimeout(resolve, 2000))])
}
process.exit(0)
