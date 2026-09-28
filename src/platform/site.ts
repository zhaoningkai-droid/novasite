import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Tenant } from '@/payload-types'

export const locales = ['en', 'zh', 'ru', 'id'] as const
export type SiteLocale = (typeof locales)[number]

export const isSiteLocale = (value: string): value is SiteLocale =>
  locales.includes(value as SiteLocale)

export const copy = {
  en: { products: 'Products', news: 'News', cases: 'Case Studies', about: 'About', blog: 'Blog', contact: 'Contact', quote: 'Get a Quote', eyebrow: 'Fastening solutions for global industry', headline: 'Reliable Fasteners for Every Connection', intro: 'Standard and custom bolts, nuts, washers and hardware components with material traceability and export-ready service.', brochure: 'Download Catalog', explore: 'Explore Products', advantages: 'Why global partners choose us', latest: 'Latest industry insights', allProducts: 'View all products', capacity: 'Manufacturing experience', standards: 'DIN / ISO / ASTM compliant', testing: 'Material traceability', markets: 'Export-ready delivery', years: '20+ years', countries: '60+ markets', knowledge: 'Knowledge center', insightsIntro: 'Practical selection guides, factory knowledge and market updates.', rfq: 'Request for quotation', rfqTitle: 'Send your fastening requirement', send: 'Send inquiry', sending: 'Sending…', sent: 'Thank you. Our export team will contact you shortly.', error: 'The inquiry could not be sent. Please try again.' },
  zh: { products: '产品中心', news: '新闻资讯', cases: '案例中心', about: '关于我们', blog: '技术博客', contact: '联系我们', quote: '获取报价', eyebrow: '', headline: '让每一处连接都更可靠', intro: '提供标准件、非标定制、不锈钢与高强度紧固件，具备材料可追溯和出口交付能力。', brochure: '下载产品目录', explore: '查看产品', advantages: '全球客户选择我们的理由', latest: '最新行业动态', allProducts: '查看全部产品', capacity: '制造经验', standards: '符合 DIN / ISO / ASTM', testing: '材料可追溯', markets: '出口交付能力', years: '20+ 年', countries: '60+ 市场', knowledge: '知识中心', insightsIntro: '选型指南、工厂知识与市场动态。', rfq: '项目询价', rfqTitle: '提交您的紧固件需求', send: '提交询盘', sending: '提交中…', sent: '提交成功，我们的外贸团队将尽快联系您。', error: '询盘提交失败，请稍后重试。' },
  ru: { products: 'Продукция', news: 'Новости', cases: 'Проекты', about: 'О компании', blog: 'Блог', contact: 'Контакты', quote: 'Запросить цену', eyebrow: 'Крепёжные решения для мировой промышленности', headline: 'Надёжный крепёж для каждого соединения', intro: 'Стандартные и заказные болты, гайки, шайбы и метизы с прослеживаемостью материалов и экспортной поддержкой.', brochure: 'Скачать каталог', explore: 'Смотреть продукцию', advantages: 'Почему нас выбирают', latest: 'Последние отраслевые материалы', allProducts: 'Вся продукция', capacity: 'Опыт производства', standards: 'DIN / ISO / ASTM', testing: 'Прослеживаемость материалов', markets: 'Экспортные поставки', years: '20+ лет', countries: '60+ рынков', knowledge: 'База знаний', insightsIntro: 'Практические руководства, знания производства и новости рынка.', rfq: 'Запрос предложения', rfqTitle: 'Отправьте требования к крепежу', send: 'Отправить запрос', sending: 'Отправка…', sent: 'Спасибо. Наша экспортная команда скоро свяжется с вами.', error: 'Не удалось отправить запрос. Повторите попытку.' },
  id: { products: 'Produk', news: 'Berita', cases: 'Studi Kasus', about: 'Tentang Kami', blog: 'Blog', contact: 'Kontak', quote: 'Minta Penawaran', eyebrow: 'Solusi pengikat untuk industri global', headline: 'Fastener Andal untuk Setiap Sambungan', intro: 'Baut, mur, ring, dan komponen hardware standar maupun khusus dengan ketertelusuran material dan layanan ekspor.', brochure: 'Unduh Katalog', explore: 'Lihat Produk', advantages: 'Mengapa mitra memilih kami', latest: 'Wawasan industri terbaru', allProducts: 'Lihat semua produk', capacity: 'Pengalaman manufaktur', standards: 'Sesuai DIN / ISO / ASTM', testing: 'Ketertelusuran material', markets: 'Pengiriman ekspor', years: '20+ tahun', countries: '60+ pasar', knowledge: 'Pusat pengetahuan', insightsIntro: 'Panduan pemilihan, pengetahuan pabrik, dan pembaruan pasar.', rfq: 'Permintaan penawaran', rfqTitle: 'Kirim kebutuhan fastener Anda', send: 'Kirim pertanyaan', sending: 'Mengirim…', sent: 'Terima kasih. Tim ekspor kami akan segera menghubungi Anda.', error: 'Pertanyaan tidak dapat dikirim. Silakan coba lagi.' },
} as const

export const getSite = async (slug: string, locale: SiteLocale): Promise<Tenant | null> => {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'tenants',
    depth: 1,
    limit: 1,
    locale,
    overrideAccess: true,
    // A paused customer site must not remain publicly reachable through its preview URL.
    where: { and: [{ slug: { equals: slug } }, { status: { not_equals: 'suspended' } }] },
  })
  return result.docs[0] ?? null
}

export const getBaseURL = (site: Tenant, slug: string): string => {
  if (site.primaryDomain) return `https://${site.primaryDomain}`
  return `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3100'}/s/${slug}`
}

export const siteHref = (site: string, locale: SiteLocale, path = '') =>
  `/s/${site}/${locale}${path}`

export const jsonLD = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
