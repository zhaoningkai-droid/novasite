import assert from 'node:assert/strict'
import { isAllyDemoPath, allyCustomerSourcePath } from '../src/platform/allynav-template/routing'
import { sample } from '../src/platform/allynav-template/data'

const valid = [
  [],
  ...[
    'products',
    'solutions',
    'about',
    'about-us',
    'news',
    'blog',
    'contact',
    'faqs',
    'downloads',
    'search',
    'videos',
    'events',
    'support',
    'get-technical-support',
    'privacy-policy',
    'terms-of-use',
    'site-map',
  ].map((section) => [section]),
  ...sample.products.map((item) => ['products', item.slug]),
  ...['news', 'blog', 'events'].flatMap((section) =>
    sample.news.map((item) => [section, item.slug]),
  ),
]
for (const path of valid)
  assert.equal(isAllyDemoPath(path), true, `Expected supported demo route ${path.join('/')}`)
for (const path of [
  ['unknown'],
  ['products', 'missing'],
  ['news', 'missing'],
  ['blog', 'missing'],
  ['events', 'missing'],
  ['products', sample.products[0].slug, 'extra'],
  ['contact', 'extra'],
  ['solutions', 'extra'],
  ['support', 'extra'],
  ['videos', 'extra'],
])
  assert.equal(isAllyDemoPath(path), false, `Expected rejected demo route ${path.join('/')}`)
assert.deepEqual(allyCustomerSourcePath(['solutions']), ['cases'])
assert.deepEqual(allyCustomerSourcePath(['events']), ['news'])
assert.deepEqual(allyCustomerSourcePath(['support']), ['faqs'])
assert.deepEqual(allyCustomerSourcePath(['get-technical-support']), ['contact'])
assert.deepEqual(allyCustomerSourcePath(['about-us']), ['about'])
assert.deepEqual(allyCustomerSourcePath(['videos']), [])
assert.deepEqual(allyCustomerSourcePath(['downloads']), ['products'])
assert.deepEqual(allyCustomerSourcePath(['products', 'customer-product']), [
  'products',
  'customer-product',
])
console.log(
  `AllyNav routing: ${valid.length} supported sample routes, unknown detail IDs rejected; customer CMS mappings preserved.`,
)
