import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'

import type { Tenant } from '@/payload-types'
import { isSiteLocale, locales, type SiteLocale } from './site-locales'
import { classifyPlatformHost, platformDomainsEnabled, temporarySiteOrigin } from './platform-hosts'
import { userHasRole } from '@/access/roles'
import { optionalSiteOrigin } from './site-url'

export { isSiteLocale, locales }
export type { SiteLocale }
export { siteHref } from './site-url'

export const copy = {
  en: { products: 'Products', news: 'News', cases: 'Case Studies', about: 'About', blog: 'Blog', contact: 'Contact', quote: 'Get a Quote', eyebrow: 'Fastening solutions for global industry', headline: 'Reliable Fasteners for Every Connection', intro: 'Standard and custom bolts, nuts, washers and hardware components with material traceability and export-ready service.', brochure: 'Download Catalog', explore: 'Explore Products', advantages: 'Why global partners choose us', latest: 'Latest industry insights', allProducts: 'View all products', capacity: 'Manufacturing experience', standards: 'DIN / ISO / ASTM compliant', testing: 'Material traceability', markets: 'Export-ready delivery', years: '20+ years', countries: '60+ markets', knowledge: 'Knowledge center', insightsIntro: 'Practical selection guides, factory knowledge and market updates.', rfq: 'Request for quotation', rfqTitle: 'Send your fastening requirement', send: 'Send inquiry', sending: 'Sending…', sent: 'Thank you. Our export team will contact you shortly.', error: 'The inquiry could not be sent. Please try again.' },
  zh: { products: '产品中心', news: '新闻资讯', cases: '案例中心', about: '关于我们', blog: '技术博客', contact: '联系我们', quote: '获取报价', eyebrow: '', headline: '让每一处连接都更可靠', intro: '提供标准件、非标定制、不锈钢与高强度紧固件，具备材料可追溯和出口交付能力。', brochure: '下载产品目录', explore: '查看产品', advantages: '全球客户选择我们的理由', latest: '最新行业动态', allProducts: '查看全部产品', capacity: '制造经验', standards: '符合 DIN / ISO / ASTM', testing: '材料可追溯', markets: '出口交付能力', years: '20+ 年', countries: '60+ 市场', knowledge: '知识中心', insightsIntro: '选型指南、工厂知识与市场动态。', rfq: '项目询价', rfqTitle: '提交您的紧固件需求', send: '提交询盘', sending: '提交中…', sent: '提交成功，我们的外贸团队将尽快联系您。', error: '询盘提交失败，请稍后重试。' },
  ru: { products: 'Продукция', news: 'Новости', cases: 'Проекты', about: 'О компании', blog: 'Блог', contact: 'Контакты', quote: 'Запросить цену', eyebrow: 'Крепёжные решения для мировой промышленности', headline: 'Надёжный крепёж для каждого соединения', intro: 'Стандартные и заказные болты, гайки, шайбы и метизы с прослеживаемостью материалов и экспортной поддержкой.', brochure: 'Скачать каталог', explore: 'Смотреть продукцию', advantages: 'Почему нас выбирают', latest: 'Последние отраслевые материалы', allProducts: 'Вся продукция', capacity: 'Опыт производства', standards: 'DIN / ISO / ASTM', testing: 'Прослеживаемость материалов', markets: 'Экспортные поставки', years: '20+ лет', countries: '60+ рынков', knowledge: 'База знаний', insightsIntro: 'Практические руководства, знания производства и новости рынка.', rfq: 'Запрос предложения', rfqTitle: 'Отправьте требования к крепежу', send: 'Отправить запрос', sending: 'Отправка…', sent: 'Спасибо. Наша экспортная команда скоро свяжется с вами.', error: 'Не удалось отправить запрос. Повторите попытку.' },
  id: { products: 'Produk', news: 'Berita', cases: 'Studi Kasus', about: 'Tentang Kami', blog: 'Blog', contact: 'Kontak', quote: 'Minta Penawaran', eyebrow: 'Solusi pengikat untuk industri global', headline: 'Fastener Andal untuk Setiap Sambungan', intro: 'Baut, mur, ring, dan komponen hardware standar maupun khusus dengan ketertelusuran material dan layanan ekspor.', brochure: 'Unduh Katalog', explore: 'Lihat Produk', advantages: 'Mengapa mitra memilih kami', latest: 'Wawasan industri terbaru', allProducts: 'Lihat semua produk', capacity: 'Pengalaman manufaktur', standards: 'Sesuai DIN / ISO / ASTM', testing: 'Ketertelusuran material', markets: 'Pengiriman ekspor', years: '20+ tahun', countries: '60+ pasar', knowledge: 'Pusat pengetahuan', insightsIntro: 'Panduan pemilihan, pengetahuan pabrik, dan pembaruan pasar.', rfq: 'Permintaan penawaran', rfqTitle: 'Kirim kebutuhan fastener Anda', send: 'Kirim pertanyaan', sending: 'Mengirim…', sent: 'Terima kasih. Tim ekspor kami akan segera menghubungi Anda.', error: 'Pertanyaan tidak dapat dikirim. Silakan coba lagi.' },
  es: { products: 'Productos', news: 'Noticias', cases: 'Casos de éxito', about: 'Sobre nosotros', blog: 'Blog técnico', contact: 'Contacto', quote: 'Solicitar cotización', eyebrow: 'Soluciones de fijación para la industria global', headline: 'Fijaciones fiables para cada unión', intro: 'Pernos, tuercas, arandelas y componentes estándar o personalizados con trazabilidad de materiales y servicio de exportación.', brochure: 'Descargar catálogo', explore: 'Ver productos', advantages: 'Por qué nos eligen nuestros socios', latest: 'Últimas noticias del sector', allProducts: 'Ver todos los productos', capacity: 'Experiencia de fabricación', standards: 'Conforme a DIN / ISO / ASTM', testing: 'Trazabilidad de materiales', markets: 'Entrega para exportación', years: 'Más de 20 años', countries: 'Más de 60 mercados', knowledge: 'Centro de conocimiento', insightsIntro: 'Guías de selección, conocimientos de fábrica y novedades del mercado.', rfq: 'Solicitud de cotización', rfqTitle: 'Envíe sus requisitos de fijación', send: 'Enviar consulta', sending: 'Enviando…', sent: 'Gracias. Nuestro equipo de exportación se pondrá en contacto pronto.', error: 'No se pudo enviar la consulta. Inténtelo de nuevo.' },
  ar: { products: 'المنتجات', news: 'الأخبار', cases: 'دراسات الحالة', about: 'من نحن', blog: 'المدونة التقنية', contact: 'اتصل بنا', quote: 'اطلب عرض سعر', eyebrow: 'حلول تثبيت للصناعة العالمية', headline: 'مثبتات موثوقة لكل وصلة', intro: 'مسامير وصواميل وغسالات ومكونات قياسية ومخصصة مع إمكانية تتبع المواد وخدمات التصدير.', brochure: 'تنزيل الكتالوج', explore: 'استكشف المنتجات', advantages: 'لماذا يختارنا شركاؤنا', latest: 'أحدث أخبار القطاع', allProducts: 'عرض جميع المنتجات', capacity: 'خبرة التصنيع', standards: 'متوافق مع DIN / ISO / ASTM', testing: 'إمكانية تتبع المواد', markets: 'تسليم جاهز للتصدير', years: 'أكثر من 20 عامًا', countries: 'أكثر من 60 سوقًا', knowledge: 'مركز المعرفة', insightsIntro: 'أدلة اختيار عملية ومعرفة المصنع وتحديثات السوق.', rfq: 'طلب عرض سعر', rfqTitle: 'أرسل متطلبات المثبتات الخاصة بك', send: 'إرسال الاستفسار', sending: 'جارٍ الإرسال…', sent: 'شكرًا لك. سيتواصل معك فريق التصدير قريبًا.', error: 'تعذر إرسال الاستفسار. يرجى المحاولة مرة أخرى.' },
  de: { products: 'Produkte', news: 'Nachrichten', cases: 'Referenzen', about: 'Über uns', blog: 'Technischer Blog', contact: 'Kontakt', quote: 'Angebot anfordern', eyebrow: 'Befestigungslösungen für die globale Industrie', headline: 'Zuverlässige Verbindungselemente für jede Verbindung', intro: 'Normteile und kundenspezifische Schrauben, Muttern, Scheiben und Bauteile mit Materialrückverfolgbarkeit und exportgerechtem Service.', brochure: 'Katalog herunterladen', explore: 'Produkte ansehen', advantages: 'Warum globale Partner uns wählen', latest: 'Aktuelle Brancheninformationen', allProducts: 'Alle Produkte ansehen', capacity: 'Fertigungserfahrung', standards: 'Konform mit DIN / ISO / ASTM', testing: 'Materialrückverfolgbarkeit', markets: 'Exportgerechte Lieferung', years: 'Über 20 Jahre', countries: 'Über 60 Märkte', knowledge: 'Wissenszentrum', insightsIntro: 'Praktische Auswahlhilfen, Fertigungswissen und Marktneuigkeiten.', rfq: 'Angebotsanfrage', rfqTitle: 'Senden Sie Ihre Anforderungen', send: 'Anfrage senden', sending: 'Wird gesendet…', sent: 'Vielen Dank. Unser Exportteam meldet sich in Kürze.', error: 'Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.' },
} as const

export const getSite = async (slug: string, locale: SiteLocale): Promise<Tenant | null> => {
  const payload = await getPayload({ config: configPromise })
  const requestHeaders = platformDomainsEnabled() ? await headers() : null
  const entry = requestHeaders ? classifyPlatformHost(requestHeaders.get('host')) : null
  if (entry && entry.kind !== 'admin' && (entry.kind !== 'tenant' || entry.slug !== slug)) return null
  const result = await payload.find({
    collection: 'tenants',
    depth: 1,
    limit: 1,
    locale,
    overrideAccess: true,
    // A paused customer site must not remain publicly reachable through its preview URL.
    where: { and: [{ slug: { equals: slug } }, entry?.kind === 'tenant' ? { status: { equals: 'published' } } : { status: { not_equals: 'suspended' } }] },
  })
  const site = result.docs[0] ?? null
  if (site && entry?.kind === 'admin' && site.status !== 'published' && requestHeaders) {
    const { user } = await payload.auth({ headers: requestHeaders })
    const assigned = user?.tenants?.some((row) => (typeof row.tenant === 'number' ? row.tenant : row.tenant?.id) === site.id)
    if (!user || (!userHasRole(user, ['super-admin']) && !assigned) || (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now())) return null
  }
  return site
}

export const getBaseURL = (site: Tenant, slug: string): string => {
  const temporary = temporarySiteOrigin(slug)
  if (temporary) return temporary
  const primary = optionalSiteOrigin(site.primaryDomain)
  if (primary) return primary
  return `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3100'}/s/${slug}`
}

export const jsonLD = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
