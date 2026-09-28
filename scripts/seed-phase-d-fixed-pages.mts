import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
// Payload stores this nested array once; write Chinese last so the Chinese admin workspace
// always retains complete editable labels while field-level page copy remains multilingual.
const locales = ['en', 'ru', 'id', 'zh'] as const
type Locale = (typeof locales)[number]
type Text = Record<Locale, string>
const text = (en: string, zh: string, ru: string, id: string): Text => ({ en, zh, ru, id })

const brands = [
  { id: 1, company: text('VoltTrans Industrial Fasteners', '沃特工业紧固件', 'VoltTrans Промышленный Крепёж', 'VoltTrans Fastener Industri') },
  { id: 2, company: text('Huadong Fastener Manufacturing Co., Ltd.', '华东紧固件制造有限公司', 'Huadong Производство Крепежа', 'Huadong Manufaktur Fastener') },
]

for (const brand of brands) {
  const values = {
    eyebrow: text('Export-ready fastening solutions', '面向出口的紧固件解决方案', 'Крепёжные решения для экспорта', 'Solusi fastener siap ekspor'),
    title: text('Reliable Fasteners for Every Connection', '让每一处连接都更可靠', 'Надёжный крепёж для каждого соединения', 'Fastener Andal untuk Setiap Sambungan'),
    description: text('Standard and custom bolts, nuts, washers and hardware components with traceable materials and responsive export service.', '提供标准件、非标定制、不锈钢与高强度紧固件，具备材料可追溯和出口交付能力。', 'Стандартные и заказные болты, гайки, шайбы и метизы с прослеживаемостью материалов и экспортной поддержкой.', 'Baut, mur, ring, dan komponen hardware standar maupun khusus dengan ketertelusuran material dan layanan ekspor.'),
    introTitle: text('A dependable fastener partner', '值得信赖的紧固件合作伙伴', 'Надёжный партнёр по крепежу', 'Mitra fastener yang andal'),
    intro: text('We support industrial buyers with standard fasteners, made-to-drawing parts, quality records and export packing.', '我们为工业采购客户提供标准紧固件、按图定制、质量文件与出口包装服务。', 'Мы поддерживаем промышленных закупщиков стандартным крепежом, деталями по чертежу, документами качества и экспортной упаковкой.', 'Kami mendukung pembeli industri dengan fastener standar, komponen sesuai gambar, dokumen mutu, dan kemasan ekspor.'),
    aboutTitle: text('About our manufacturing', '关于我们的制造能力', 'О нашем производстве', 'Tentang kemampuan manufaktur kami'),
    about: text('From raw material selection through dimensional inspection and export packing, our team keeps every fastening order traceable and organized.', '从原材料选择、尺寸检验到出口包装，团队让每一批紧固件订单都具备清晰的可追溯性与交付安排。', 'От выбора сырья до контроля размеров и экспортной упаковки мы обеспечиваем прослеживаемость и порядок в каждом заказе.', 'Dari pemilihan material hingga inspeksi dimensi dan kemasan ekspor, setiap pesanan fastener dikelola secara tertelusur.'),
    certificates: text('Quality documents can include material certificates, dimensional inspection records and packing lists.', '可按项目提供材质证明、尺寸检验记录与装箱清单等质量文件。', 'Могут быть предоставлены сертификаты материалов, записи контроля размеров и упаковочные листы.', 'Dokumen mutu dapat mencakup sertifikat material, catatan inspeksi dimensi, dan daftar kemasan.'),
    contactTitle: text('Contact our export team', '联系外贸团队', 'Свяжитесь с экспортной командой', 'Hubungi tim ekspor kami'),
    contactIntro: text('Send your drawing, bill of materials or product requirement. We will respond with suitable options and a quotation.', '发送图纸、BOM 或产品需求，团队将提供合适的产品方案与报价。', 'Отправьте чертёж, спецификацию или требования к продукции. Мы предложим подходящий вариант и расчёт.', 'Kirim gambar, BOM, atau kebutuhan produk Anda. Kami akan memberikan pilihan yang sesuai dan penawaran.'),
    footerIntro: text('Industrial fastener manufacturing, customization and export supply.', '专注工业紧固件制造、定制与出口供货。', 'Производство, изготовление на заказ и экспортные поставки промышленного крепежа.', 'Manufaktur, kustomisasi, dan pasokan ekspor fastener industri.'),
  }
  for (const locale of locales) {
    await payload.update({
      collection: 'tenants', id: brand.id, locale, depth: 0, overrideAccess: true,
      data: {
        siteNavigation: [
          { label: locale === 'zh' ? '首页' : 'Home', href: '/' },
          { label: locale === 'zh' ? '产品中心' : 'Products', href: '/products', children: [
            { label: locale === 'zh' ? '标准紧固件' : 'Standard Fasteners', href: '/products' },
            { label: locale === 'zh' ? '非标定制' : 'Custom Fasteners', href: '/products' },
            { label: locale === 'zh' ? '表面处理与涂层' : 'Surface Treatment', href: '/products' },
          ] },
          { label: locale === 'zh' ? '新闻资讯' : 'News', href: '/news', children: [{ label: locale === 'zh' ? '企业动态' : 'Company News', href: '/news' }, { label: locale === 'zh' ? '质量与交付' : 'Quality & Delivery', href: '/news' }] },
          { label: locale === 'zh' ? '案例中心' : 'Cases', href: '/cases' },
          { label: locale === 'zh' ? '技术博客' : 'Blog', href: '/blog' },
          { label: locale === 'zh' ? '关于我们' : 'About', href: '/about' },
          { label: locale === 'zh' ? '联系我们' : 'Contact', href: '/contact' },
        ],
        fixedPages: {
          homepage: { heroEyebrow: values.eyebrow[locale], heroTitle: values.title[locale], heroDescription: values.description[locale], showCompanyIntro: true, companyIntroTitle: values.introTitle[locale], companyIntro: values.intro[locale], showStrength: true, showFeaturedProducts: true, showVideo: false, showNews: true, showCases: true },
          about: { title: values.aboutTitle[locale], intro: values.about[locale], certificates: values.certificates[locale], showStrength: true },
          contactPage: { title: values.contactTitle[locale], intro: values.contactIntro[locale], showInquiryForm: true },
          footer: { intro: values.footerIntro[locale], quickLinks: [{ label: locale === 'zh' ? '产品中心' : 'Products', href: '/products' }, { label: locale === 'zh' ? '新闻资讯' : 'News', href: '/news' }, { label: locale === 'zh' ? '联系我们' : 'Contact', href: '/contact' }] },
        },
      } as never,
    })
  }
}

console.log('阶段 D 固定页面默认内容已写入两位客户站。')
