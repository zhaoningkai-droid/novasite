import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { loadIndustryTenantPage } from '../src/platform/industry-templates/tenant'

// Read actual customer records without changing their selected template or any content.
const payload = await getPayload({ config })
const tenants = await payload.find({
  collection: 'tenants',
  locale: 'zh',
  depth: 2,
  pagination: false,
  overrideAccess: true,
})
const results: Array<Record<string, unknown>> = []
try {
  for (const site of tenants.docs) {
    const snapshot = JSON.stringify(site)
    for (const key of ['power-705-v1', 'autoparts-571-v1']) {
      const base = `/s/${site.slug}/zh`
      for (const path of [
        [],
        ['products'],
        ['news'],
        ['cases'],
        ['about'],
        ['faqs'],
        ['contact'],
      ]) {
        const model = await loadIndustryTenantPage({
          site,
          locale: 'zh',
          base,
          path,
          template: { key },
        })
        assert.equal(model.company, site.branding.companyName)
        assert.ok(
          !JSON.stringify(model, (key, value) =>
            ['content', 'answer'].includes(key) ? undefined : value,
          ).includes('/template-demos/'),
        )
        results.push({
          tenantId: site.id,
          key,
          path: path.join('/') || 'home',
          kind: model.kind,
          cards: model.cards?.length,
          products: model.products?.length,
          faqs: model.faqs?.length,
        })
      }
    }
    assert.equal(JSON.stringify(site), snapshot)
  }
  await writeFile(
    'docs/evidence/v1-step-01-20260930/after/tenant-readonly-report.json',
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        mode: 'read-only adaptation; no real template switch, new customer creation, translations, inquiry submission or writes',
        tenants: tenants.docs.length,
        results,
      },
      null,
      2,
    ),
  )
  console.log(
    `${results.length} real-data page models; ${tenants.docs.length} companies; zero selected-template mutations`,
  )
} finally {
  await payload.destroy()
}

// UI packages may keep timers alive after database shutdown in a standalone Node check.
process.exit(0)
