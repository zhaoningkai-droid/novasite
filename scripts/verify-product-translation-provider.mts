import { writeFile } from 'node:fs/promises'
import { translateProductContent } from '../src/platform/product-translation/provider'
import type { TranslationContent } from '../src/platform/product-translation/content'
import type { SiteLocale } from '../src/platform/site-locales'

const sample: TranslationContent = {
  title: 'GGD-380 低压配电柜',
  summary: '用于工厂低压配电系统。额定电压 380 V，频率 50 Hz，防护等级 IP54。',
  detailSegments: [
    '柜体宽度 800 mm，深度 600 mm，高度 2200 mm。请由具备资质的人员安装，并按项目图纸确认接线方式。',
    '本资料用于软件翻译测试，不代表实际产品承诺。',
  ],
  imageAlts: ['GGD-380 低压配电柜正面'],
  keywords: '低压配电柜，配电设备',
  tags: ['配电柜'],
  legacySpecifications: [],
  specificationSet: {
    title: '技术参数',
    items: [
      { group: '电气参数', label: '额定电压', value: '380 V' },
      { group: '电气参数', label: '频率', value: '50 Hz' },
    ],
  },
}
const results: Array<unknown> = []
for (const locale of ['en', 'es', 'ar', 'id', 'de'] as SiteLocale[]) {
  const start = Date.now()
  try {
    const translated = await translateProductContent(
      sample,
      'zh',
      locale,
      process.env.DEEPSEEK_API_KEY || '',
      process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    )
    results.push({ locale, status: 'succeeded', elapsedMs: Date.now() - start, translated })
    process.stdout.write(
      JSON.stringify({ locale, status: 'succeeded', elapsedMs: Date.now() - start }) + '\n',
    )
  } catch (error) {
    results.push({
      locale,
      status: 'failed',
      elapsedMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown failure',
    })
    process.stdout.write(
      JSON.stringify({
        locale,
        status: 'failed',
        errorType: error instanceof Error ? error.name : 'Unknown',
      }) + '\n',
    )
  }
  await writeFile(
    'docs/evidence/admin-redesign/product-background-translation-20260930/live-provider.json',
    JSON.stringify(
      { syntheticOnly: true, customerDataSent: false, source: sample, results },
      null,
      2,
    ) + '\n',
  )
}
process.exit(results.some((item) => (item as { status: string }).status !== 'succeeded') ? 1 : 0)
