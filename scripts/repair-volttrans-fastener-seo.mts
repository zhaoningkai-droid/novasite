import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const seoByLocale = {
  en: {
    titleSuffix: 'VoltTrans Industrial Fasteners',
    defaultDescription: 'Standard and custom bolts, nuts, washers and industrial hardware with traceable materials and export-ready service.',
  },
  zh: {
    titleSuffix: '沃特工业紧固件',
    defaultDescription: '提供标准件、非标定制、螺栓、螺母、垫圈及工业五金配件，具备材料可追溯和出口交付能力。',
  },
  ru: {
    titleSuffix: 'VoltTrans Промышленный крепёж',
    defaultDescription: 'Стандартные и заказные болты, гайки, шайбы и промышленные метизы с прослеживаемостью материалов и экспортной поддержкой.',
  },
  id: {
    titleSuffix: 'VoltTrans Fastener Industri',
    defaultDescription: 'Baut, mur, ring, dan perangkat keras industri standar maupun khusus dengan ketertelusuran material dan layanan ekspor.',
  },
} as const

for (const [locale, seo] of Object.entries(seoByLocale)) {
  const tenant = await payload.findByID({ collection: 'tenants', id: 1, locale: locale as keyof typeof seoByLocale, depth: 0, overrideAccess: true })
  await payload.update({
    collection: 'tenants',
    id: 1,
    locale: locale as keyof typeof seoByLocale,
    depth: 0,
    overrideAccess: true,
    data: { seo: { ...tenant.seo, ...seo } } as never,
  })
}

console.log('已修复 VoltTrans 四语言紧固件 SEO 标题后缀与默认描述。')
