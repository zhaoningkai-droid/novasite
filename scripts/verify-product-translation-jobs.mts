import { randomBytes } from 'node:crypto'
import { readFile, writeFile, chmod } from 'node:fs/promises'

const privateDB = JSON.parse(
  await readFile('.codex-runtime/product-translation-review-db.json', 'utf8'),
)
await chmod('.codex-runtime/product-translation-review-db.json', 0o600)
process.env.DATABASE_URL = privateDB.connectionString
process.env.PRODUCT_TRANSLATION_QUEUE_ENABLED = 'true'
process.env.DEEPSEEK_API_KEY = 'isolated-fixture-key'
const [
  { getPayload },
  { default: config },
  jobs,
  { up },
  { productTranslationFingerprint },
  { sourceFrom },
] = await Promise.all([
  import('payload'),
  import('../src/payload.config'),
  import('../src/platform/product-translation/jobs'),
  import('../src/migrations/20260930_030000_product_translation_jobs'),
  import('../src/platform/product-translation'),
  import('../src/platform/product-translation/content'),
])
const payload = await getPayload({ config })
const pool = (payload.db as any).pool
await up({ db: (payload.db as any).drizzle } as never)
const report: Array<{ scenario: string; passed: boolean; details?: unknown }> = []
function check(condition: unknown, scenario: string, details?: unknown) {
  if (!condition) throw new Error(`FAILED: ${scenario}`)
  report.push({ scenario, passed: true, details })
}
const password = randomBytes(20).toString('base64url')
const user = await payload.create({
  collection: 'users',
  data: {
    email: `translation-review-${Date.now()}@example.test`,
    password,
    roles: ['super-admin'],
  },
  overrideAccess: true,
})
const company = await payload.create({
  collection: 'tenants',
  data: {
    name: '产品翻译隔离测试',
    slug: `translation-review-${Date.now()}`,
    defaultLocale: 'zh',
    enabledLocales: ['zh', 'en', 'es'],
    branding: { companyName: '翻译测试' },
  },
  locale: 'zh',
  overrideAccess: false,
  user,
})
const category = await payload.create({
  collection: 'product-categories',
  data: { name: '配电设备测试', slug: 'translation-review-category', tenant: company.id },
  locale: 'zh',
  overrideAccess: false,
  user,
})
const description = {
  root: {
    type: 'root' as const,
    version: 1,
    format: '' as const,
    indent: 0,
    direction: null,
    children: [
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [
          {
            type: 'text',
            version: 1,
            text: '额定电压 380 V，频率 50 Hz。',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
          },
        ],
      },
    ],
  },
}
const products = []
for (let index = 0; index < 6; index++)
  products.push(
    await payload.create({
      collection: 'products',
      data: {
        tenant: company.id,
        title: index === 0 ? '故障测试 GGD-380 配电柜' : `批量测试 ${index} 配电柜`,
        slug: `translation-review-${index}`,
        category: category.id,
        description,
        detailHTML:
          '<h2>技术参数</h2><p>额定电压 380 V，频率 50 Hz。</p><table><tbody><tr><td>宽度</td><td>800 mm</td></tr></tbody></table>',
        summary: '用于工厂低压配电。',
        keywords: '配电柜',
        tags: [{ label: '电力设备' }],
        externalImages: [{ url: 'https://example.test/cabinet.webp', alt: '配电柜正面' }],
        _status: index === 1 ? 'draft' : 'published',
      },
      locale: 'zh',
      draft: index === 1,
      overrideAccess: false,
      user,
    }),
  )
const specification = await payload.create({
  collection: 'product-specifications',
  data: {
    tenant: company.id,
    product: products[0].id,
    localeCode: 'zh',
    title: '技术参数',
    items: [{ group: '电气', label: '电压', value: '380 V' }],
  },
  overrideAccess: false,
  user,
})
const sourceBefore = (await jobs.readTranslationSource(payload, company, user, products[0].id))
  .fingerprint
const selected = products.slice(0, 5).map((product) => product.id)
const response = await jobs.queueProductTranslations({
  company,
  payload,
  user,
  productIDs: selected,
})
const body = await response.json()
check(response.status === 202 && body.accepted.length === 5, '勾选5件产品后一次提交5个独立任务')
const before = await jobs.productTranslationViews(
  payload,
  company,
  user,
  products.map((product) => product.id),
)
check(
  before.views.filter((view) => view.locked).length === 5 && !before.views[5].locked,
  '只锁定所选5件，其他产品不锁定',
)
check(
  before.views.every((view) => view.total === 2),
  '按当前公司启用的英语和西班牙语翻译，排除中文',
)
const duplicate = await jobs.queueProductTranslations({
  company,
  payload,
  user,
  productIDs: selected,
})
check(
  (await duplicate.json()).accepted[0].jobID === body.accepted[0].jobID,
  '重复提交恢复已有任务，不创建重复任务',
)
let rejected = false
try {
  await payload.update({
    collection: 'products',
    id: products[0].id,
    data: { title: '不应该保存' },
    locale: 'zh',
    overrideAccess: false,
    user,
  })
} catch (error) {
  rejected = Number((error as any)?.status) === 409
}
check(rejected, '服务端拒绝翻译中产品的编辑')
rejected = false
try {
  await payload.delete({ collection: 'products', id: products[0].id, overrideAccess: false, user })
} catch (error) {
  rejected = Number((error as any)?.status) === 409
}
check(rejected, '服务端拒绝翻译中产品的删除')
rejected = false
try {
  await payload.update({
    collection: 'product-specifications',
    id: specification.id,
    data: { title: '不应该保存' },
    overrideAccess: false,
    user,
  })
} catch (error) {
  rejected = Number((error as any)?.status) === 409
}
check(rejected, '技术参数单独编辑也受到同一产品锁定保护')
await payload.update({
  collection: 'products',
  id: products[5].id,
  data: { summary: '其他产品照常编辑。' },
  locale: 'zh',
  overrideAccess: false,
  user,
})
check(true, '翻译期间其他产品仍可正常保存')
let failSpanish = true
const calls: Array<{ language: string; title: string }> = []
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  if (!String(input).includes('api.deepseek.com')) return originalFetch(input, init)
  const body = JSON.parse(init!.body as string),
    request = JSON.parse(body.messages[1].content)
  calls.push({ language: request.targetLanguage, title: request.productContext })
  if (
    failSpanish &&
    request.targetLanguage === 'Spanish' &&
    request.productContext.includes('故障测试')
  )
    return Response.json({}, { status: 401 })
  return Response.json({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            translations: Object.fromEntries(
              Object.entries(request.fields).map(([key, value]) => [
                key,
                `${request.targetLanguage}: ${value}`,
              ]),
            ),
          }),
        },
      },
    ],
  })
}
for (let index = 0; index < 5; index++)
  check(await jobs.runOneProductTranslation(payload), `后台执行第${index + 1}件产品`)
const partial = await jobs.productTranslationViews(payload, company, user, selected)
check(
  partial.views[0].status === 'partial' &&
    partial.views[0].completed === 1 &&
    !partial.views[0].locked,
  '一种语言失败时保留成功译文，准确显示部分失败并解除锁定',
)
check(
  partial.views.slice(1).every((view) => view.status === 'completed' && !view.locked),
  '一件产品失败不阻止其余四件完成',
)
const sourceAfter = (await jobs.readTranslationSource(payload, company, user, products[0].id))
  .fingerprint
check(sourceAfter === sourceBefore, '翻译保存不改变源语言正文、标签及技术参数')
const english = await payload.findByID({
  collection: 'products',
  id: products[0].id,
  locale: 'en',
  fallbackLocale: false,
  overrideAccess: false,
  user,
})
check(
  english.title.includes('English') &&
    english.detailHTML?.includes('<table>') &&
    english.detailHTML.includes('380 V'),
  '目标语言产品名称、正文、参数值与HTML表格实际保存',
)
const published = await payload.findByID({
  collection: 'products',
  id: products[0].id,
  locale: 'en',
  draft: false,
  overrideAccess: true,
})
const draft = await payload.findByID({
  collection: 'products',
  id: products[1].id,
  locale: 'en',
  draft: true,
  overrideAccess: false,
  user,
})
check(
  published._status === 'published' && draft._status === 'draft',
  '已发布产品译文保持发布，草稿译文保持草稿',
)
failSpanish = false
const callsBeforeRetry = calls.length
const retry = await jobs.queueProductTranslations({
  company,
  payload,
  user,
  productIDs: [products[0].id],
})
check(retry.status === 202, '允许重试失败语言')
await jobs.runOneProductTranslation(payload)
check(
  calls.slice(callsBeforeRetry).every((call) => call.language === 'Spanish'),
  '重试只请求失败语言，不重复翻译已成功的英语',
)
const same = await jobs.queueProductTranslations({
  company,
  payload,
  user,
  productIDs: [products[0].id],
})
check(
  same.status === 200 && !(await same.json()).accepted.length,
  '源内容未修改且所有目标语言成功时拒绝重复翻译',
)
await payload.update({
  collection: 'products',
  id: products[0].id,
  data: { summary: '产品完成后恢复编辑。' },
  locale: 'zh',
  overrideAccess: false,
  user,
})
const changed = await jobs.queueProductTranslations({
  company,
  payload,
  user,
  productIDs: [products[0].id],
})
check(changed.status === 202, '完成后允许编辑，修改源内容后允许重新翻译')
await jobs.runOneProductTranslation(payload)
const expanded = await payload.update({
  collection: 'tenants',
  id: company.id,
  data: { enabledLocales: ['zh', 'en', 'es', 'ar'] },
  locale: 'zh',
  overrideAccess: false,
  user,
})
const newLanguage = await jobs.queueProductTranslations({
  company: expanded,
  payload,
  user,
  productIDs: [products[0].id],
})
const newBody = await newLanguage.json()
const stored = (
  await pool.query('SELECT targets FROM platform_jobs.product_translation WHERE id=$1', [
    newBody.accepted[0].jobID,
  ])
).rows[0]
check(stored.targets.length === 1 && stored.targets[0] === 'ar', '增加阿拉伯语站点后，只补翻新语言')
await jobs.runOneProductTranslation(payload)
const auditBefore = Number(
  (
    await pool.query('SELECT count(*) FROM audit_logs WHERE document_id=$1', [
      String(products[0].id),
    ])
  ).rows[0].count,
)
await pool.query(
  "UPDATE platform_jobs.product_translation SET status='running',lease_owner=$2,lease_until=now()-interval '1 minute' WHERE id=$1",
  [newBody.accepted[0].jobID, body.accepted[0].jobID],
)
check(
  await jobs.runOneProductTranslation(payload),
  '后台接管已过期的运行任务，模拟进程中断后的恢复',
)
const auditAfter = Number(
  (
    await pool.query('SELECT count(*) FROM audit_logs WHERE document_id=$1', [
      String(products[0].id),
    ])
  ).rows[0].count,
)
check(auditBefore === auditAfter, '恢复任务不重复保存已成功的语言')
const otherCompany = await payload.create({
  collection: 'tenants',
  data: {
    name: '第二家公司隔离测试',
    slug: `translation-other-${Date.now()}`,
    defaultLocale: 'zh',
    enabledLocales: ['zh', 'en'],
    branding: { companyName: '第二家公司' },
  },
  overrideAccess: false,
  user,
})
const cross = await jobs.queueProductTranslations({
  company: otherCompany,
  payload,
  user,
  productIDs: [products[0].id],
})
check(cross.status === 404, '其他公司不能提交当前公司的产品翻译')
await writeFile(
  '.codex-runtime/product-translation-review-fixtures.json',
  JSON.stringify({
    database: privateDB.database,
    connectionString: privateDB.connectionString,
    companyID: company.id,
    slug: company.slug,
    userID: user.id,
    email: user.email,
    password,
    products: products.map((product) => product.id),
  }),
  { mode: 0o600 },
)
await writeFile(
  'docs/evidence/admin-redesign/product-background-translation-20260930/database-tests.json',
  JSON.stringify(
    {
      isolatedDatabase: privateDB.database,
      provider: '模拟供应商响应，仅用于流程测试；真实翻译另有证据',
      customerDatabaseChanged: false,
      scenarios: report,
    },
    null,
    2,
  ) + '\n',
)
process.stdout.write(
  JSON.stringify({
    scenariosPassed: report.length,
    isolatedDatabase: privateDB.database,
    sourceDatabaseChanged: false,
  }) + '\n',
)
globalThis.fetch = originalFetch
await payload.destroy()
process.exit(0)
