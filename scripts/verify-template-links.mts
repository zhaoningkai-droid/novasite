import assert from 'node:assert/strict'
import { templateHref } from '../src/platform/new-templates/links'
import { newTemplates, getNewTemplate } from '../src/platform/new-templates/registry'
// Scenarios: each template is independently selectable; public/preview navigation stays in company;
// reference template footer failures and unsafe external schemes must not be reproduced.
assert.equal(new Set(newTemplates.map((item) => item.key)).size, 5)
assert.equal(getNewTemplate('power-engineering-v1'), undefined)
assert.equal(getNewTemplate('unknown'), undefined)
for (const base of ['/s/qa/zh', '/template-preview/qa/interior-575-v1/zh']) {
  assert.equal(templateHref(base, '/products?category=a'), `${base}/products?category=a`)
  assert.equal(templateHref(base, '/faq'), `${base}/faqs`)
  assert.equal(templateHref(base, '/'), base)
  assert.equal(templateHref(base, '#product-inquiry'), '#product-inquiry')
  assert.equal(templateHref(base, 'https://example.com/support'), 'https://example.com/support')
  assert.equal(templateHref(base, 'mailto:info@example.com'), 'mailto:info@example.com')
  for (const invalid of ['javascript:alert(1)', 'data:text/html,test', '//example.com', '/\\example.com']) {
    assert.equal(templateHref(base, invalid), null)
  }
}
console.log('Independent keys, legacy fallback, company paths, FAQ normalization and URL safety passed.')
