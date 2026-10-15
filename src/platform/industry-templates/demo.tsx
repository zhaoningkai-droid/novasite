// Static demonstration data. Import only from /template-demo, never from a tenant adapter.
import { notFound } from 'next/navigation'
import { templateCopy } from '@/platform/new-templates/copy'
import type { SiteLocale } from '@/platform/site-locales'
import { IndustryPage } from './Page'
import { IndustryShell } from './Shell'
import { requestedPage, type IndustryKey, type IndustryPageModel } from './model'

export const industryDemoLocales = ['zh', 'en', 'es', 'ar', 'id', 'de'] as const
const asset = (name: string) => `/template-demos/industry/assets/${name}.webp`
const text = {
  zh: {
    powerTitle: '让每一次配电，\n都更有章法。',
    fastTitle: '连接细节，\n成就可靠工程。',
    powerIntro: '从柜体到系统，清晰呈现每一项能力',
    fastIntro: '从标准件到项目配套，一站展示',
    powerBody:
      '配电柜、控制柜与配电箱的专业展示空间。用清晰的产品目录、参数和应用介绍，让客户快速了解您的产品与服务。',
    fastBody:
      '面向螺栓、螺母、垫圈及工程连接件。通过产品规格、材料和应用说明，帮助采购客户高效查找所需紧固件。',
    tagline: '产品与工程应用 · 演示品牌',
    sample: '演示样例',
    powerNames: ['低压配电柜', '电机控制柜', '动力配电箱', '照明配电箱'],
    fastNames: ['六角螺栓', '六角螺母', '螺钉', '工程连接件'],
    steps: ['需求确认', '方案配套', '质量检查', '交付服务'],
    question: [
      '如何获取报价？',
      '询价需要提供哪些资料？',
      '可以提供产品图纸吗？',
      '是否支持不同规格？',
      '材料如何确认？',
      '交付周期如何确认？',
      '怎样选择合适的产品？',
      '可以提交项目需求吗？',
      '是否提供产品资料下载？',
      '如何联系技术团队？',
      '能否按项目配套供货？',
      '报价包含哪些信息？',
    ],
    answer:
      '请通过询盘表单提供产品名称、规格、数量与项目要求。正式型号、参数、交期和供货条件以供应商确认的资料为准；本页面仅演示模板效果。',
    news: [
      '选型资料如何准备',
      '从需求到交付的工作流程',
      '图纸与技术资料整理',
      '项目沟通中的规格确认',
      '质量检查记录的管理',
      '产品包装与运输说明',
    ],
    powerCases: ['工业车间配电应用', '公用设施控制应用', '楼宇配电应用', '设备控制配套'],
    fastCases: ['机械设备连接应用', '钢结构连接应用', '设备维护配套', '项目标准件配套'],
    detail:
      '此内容用于展示产品详情的排版、图集、技术资料和报价入口。客户选用模板后，此处只展示客户自己发布的产品资料。',
    parameter: '资料说明',
    value: '演示数据，正式规格以确认图纸为准',
    address: '演示办公地址，不对应实际公司',
  },
  en: {
    powerTitle: 'Power distribution.\nPrecisely presented.',
    fastTitle: 'Small details.\nStronger connections.',
    powerIntro: 'From enclosure to system. A clear view of your capabilities.',
    fastIntro: 'Standard fasteners. Project-ready presentation.',
    powerBody:
      'A focused showcase for distribution cabinets, control panels and electrical enclosures. A clear catalog connects products, specifications and applications.',
    fastBody:
      'A considered catalog for bolts, nuts, washers and connection hardware. Bring specifications, materials and applications into one clear purchasing journey.',
    tagline: 'Products & engineering applications · Demo brand',
    sample: 'Demo sample',
    powerNames: [
      'Distribution Cabinet',
      'Motor Control Panel',
      'Power Distribution Box',
      'Lighting Distribution Box',
    ],
    fastNames: ['Hex Head Bolt', 'Hex Nut', 'Screw', 'Connection Hardware'],
    steps: ['Requirements', 'Project Support', 'Quality Review', 'Delivery Service'],
    question: [
      'How can I request a quote?',
      'What information is needed for an inquiry?',
      'Are product drawings available?',
      'Can I request different sizes?',
      'How are materials confirmed?',
      'How is lead time confirmed?',
      'How do I choose a product?',
      'Can I submit project requirements?',
      'Can I download product information?',
      'How do I contact the technical team?',
      'Can supply be coordinated by project?',
      'What does a quotation include?',
    ],
    answer:
      'Use the inquiry form to share the product, specification, quantity and project requirements. Actual specifications, availability and delivery terms require supplier confirmation. This page demonstrates the template only.',
    news: [
      'Preparing selection information',
      'From requirements to delivery',
      'Organizing drawings and documents',
      'Confirming project specifications',
      'Managing quality review records',
      'Packaging and shipping information',
    ],
    powerCases: [
      'Workshop distribution application',
      'Utility control application',
      'Building distribution application',
      'Equipment control support',
    ],
    fastCases: [
      'Machinery connection application',
      'Steel structure connection',
      'Equipment maintenance support',
      'Project fastener coordination',
    ],
    detail:
      'This sample demonstrates the product gallery, specifications, downloadable information and quotation form. Customer websites display only the products and documents published by that customer.',
    parameter: 'Document note',
    value: 'Demo data. Confirm specifications against approved drawings.',
    address: 'Demonstration address. Not a real company location.',
  },
  es: {
    powerTitle: 'Distribución eléctrica.\nPresentación precisa.',
    fastTitle: 'Pequeños detalles.\nConexiones más fuertes.',
    powerIntro: 'Del gabinete al sistema: sus capacidades con claridad.',
    fastIntro: 'Elementos de fijación para cada proyecto.',
    powerBody:
      'Una presentación especializada en gabinetes de distribución, paneles de control y cajas eléctricas. Un catálogo claro conecta productos, especificaciones y aplicaciones.',
    fastBody:
      'Un catálogo de pernos, tuercas, arandelas y elementos de conexión. Consulte las especificaciones, los materiales y las aplicaciones en un solo lugar.',
    tagline: 'Productos y aplicaciones · Marca de demostración',
    sample: 'Muestra de demostración',
    powerNames: [
      'Gabinete de distribución',
      'Panel de control de motores',
      'Caja de distribución eléctrica',
      'Caja de distribución de iluminación',
    ],
    fastNames: ['Perno hexagonal', 'Tuerca hexagonal', 'Tornillo', 'Elementos de conexión'],
    steps: ['Requisitos', 'Apoyo al proyecto', 'Control de calidad', 'Entrega'],
    question: [
      '¿Cómo solicito una cotización?',
      '¿Qué datos requiere una consulta?',
      '¿Hay planos del producto?',
      '¿Puedo solicitar otras medidas?',
      '¿Cómo se confirman los materiales?',
      '¿Cómo se confirma el plazo de entrega?',
      '¿Cómo elijo un producto?',
      '¿Puedo enviar los requisitos del proyecto?',
      '¿Puedo descargar información?',
      '¿Cómo contacto al equipo técnico?',
      '¿Se puede coordinar el suministro por proyecto?',
      '¿Qué incluye la cotización?',
    ],
    answer:
      'Envíe el producto, las especificaciones, la cantidad y los requisitos mediante el formulario. El proveedor debe confirmar los datos técnicos y las condiciones de entrega. Esta página es una demostración.',
    news: [
      'Preparación de la información de selección',
      'De los requisitos a la entrega',
      'Organización de planos y documentos',
      'Confirmación de especificaciones',
      'Registros de control de calidad',
      'Embalaje y transporte',
    ],
    powerCases: [
      'Distribución en talleres',
      'Control de servicios públicos',
      'Distribución en edificios',
      'Control de equipos',
    ],
    fastCases: [
      'Conexiones para maquinaria',
      'Conexiones de estructuras',
      'Mantenimiento de equipos',
      'Suministro para proyectos',
    ],
    detail:
      'Esta muestra presenta la galería, los datos técnicos, la descarga de documentos y el formulario de cotización. El sitio del cliente muestra exclusivamente sus propios productos.',
    parameter: 'Nota del documento',
    value: 'Datos de demostración. Confirme las especificaciones con los planos aprobados.',
    address: 'Dirección de demostración, sin ubicación real.',
  },
  ar: {
    powerTitle: 'توزيع الطاقة.\nعرض بدقة.',
    fastTitle: 'تفاصيل صغيرة.\nوصلات أقوى.',
    powerIntro: 'من الخزانة إلى النظام: عرض واضح لقدراتكم.',
    fastIntro: 'عناصر تثبيت تدعم مشاريعكم.',
    powerBody:
      'عرض متخصص لخزائن التوزيع ولوحات التحكم والصناديق الكهربائية. كتالوج واضح يربط المنتجات بالمواصفات والتطبيقات.',
    fastBody:
      'كتالوج للمسامير والصواميل والحلقات وعناصر التوصيل. عرض للمواصفات والمواد والتطبيقات في مكان واحد.',
    tagline: 'المنتجات والتطبيقات · علامة تجريبية',
    sample: 'عينة تجريبية',
    powerNames: ['خزانة توزيع', 'لوحة تحكم بالمحركات', 'صندوق توزيع الطاقة', 'صندوق توزيع الإضاءة'],
    fastNames: ['مسمار سداسي الرأس', 'صامولة سداسية', 'برغي', 'عناصر توصيل'],
    steps: ['المتطلبات', 'دعم المشروع', 'مراجعة الجودة', 'التسليم'],
    question: [
      'كيف أطلب عرض سعر؟',
      'ما المعلومات المطلوبة للاستفسار؟',
      'هل تتوفر رسومات المنتج؟',
      'هل يمكن طلب مقاسات أخرى؟',
      'كيف يتم تأكيد المواد؟',
      'كيف يتم تأكيد موعد التسليم؟',
      'كيف أختار المنتج؟',
      'هل يمكن إرسال متطلبات المشروع؟',
      'هل يمكن تنزيل معلومات المنتج؟',
      'كيف أتواصل مع الفريق الفني؟',
      'هل يمكن تنسيق التوريد حسب المشروع؟',
      'ماذا يتضمن عرض السعر؟',
    ],
    answer:
      'أرسل المنتج والمواصفات والكمية ومتطلبات المشروع عبر النموذج. يجب أن يؤكد المورد المواصفات الفنية وشروط التسليم. هذه الصفحة لعرض القالب فقط.',
    news: [
      'إعداد معلومات الاختيار',
      'من المتطلبات إلى التسليم',
      'تنظيم الرسومات والوثائق',
      'تأكيد المواصفات',
      'إدارة سجلات الجودة',
      'التغليف والشحن',
    ],
    powerCases: [
      'توزيع الطاقة في الورش',
      'التحكم بالمرافق',
      'توزيع الطاقة في المباني',
      'التحكم بالمعدات',
    ],
    fastCases: ['وصلات الآلات', 'وصلات الهياكل', 'دعم صيانة المعدات', 'تنسيق توريد المشروع'],
    detail:
      'تعرض هذه العينة معرض الصور والمواصفات وتنزيل الوثائق ونموذج عرض السعر. يعرض موقع العميل فقط المنتجات والوثائق الخاصة به.',
    parameter: 'ملاحظة الوثيقة',
    value: 'بيانات تجريبية. يجب تأكيد المواصفات وفق الرسومات المعتمدة.',
    address: 'عنوان تجريبي، وليس موقع شركة حقيقية.',
  },
  id: {
    powerTitle: 'Distribusi daya.\nDisajikan dengan presisi.',
    fastTitle: 'Detail kecil.\nSambungan lebih kuat.',
    powerIntro: 'Dari kabinet hingga sistem: kemampuan Anda dengan jelas.',
    fastIntro: 'Pengikat standar untuk kebutuhan proyek.',
    powerBody:
      'Tampilan khusus kabinet distribusi, panel kontrol, dan kotak listrik. Katalog yang jelas menghubungkan produk, spesifikasi, dan aplikasi.',
    fastBody:
      'Katalog baut, mur, ring, dan perangkat sambungan. Tampilkan spesifikasi, bahan, dan aplikasi dalam satu alur pencarian yang jelas.',
    tagline: 'Produk dan aplikasi · Merek demonstrasi',
    sample: 'Contoh demonstrasi',
    powerNames: [
      'Kabinet Distribusi',
      'Panel Kontrol Motor',
      'Kotak Distribusi Daya',
      'Kotak Distribusi Penerangan',
    ],
    fastNames: ['Baut Kepala Segi Enam', 'Mur Segi Enam', 'Sekrup', 'Perangkat Sambungan'],
    steps: ['Kebutuhan', 'Dukungan Proyek', 'Pemeriksaan Mutu', 'Layanan Pengiriman'],
    question: [
      'Bagaimana meminta penawaran?',
      'Informasi apa yang diperlukan?',
      'Apakah gambar produk tersedia?',
      'Bisakah memesan ukuran lain?',
      'Bagaimana bahan dikonfirmasi?',
      'Bagaimana waktu pengiriman dikonfirmasi?',
      'Bagaimana memilih produk?',
      'Bisakah mengirim kebutuhan proyek?',
      'Bisakah mengunduh informasi produk?',
      'Bagaimana menghubungi tim teknis?',
      'Bisakah pasokan dikoordinasikan per proyek?',
      'Apa yang termasuk dalam penawaran?',
    ],
    answer:
      'Kirim nama produk, spesifikasi, jumlah, dan kebutuhan proyek melalui formulir. Spesifikasi dan syarat pengiriman harus dikonfirmasi pemasok. Halaman ini hanya demonstrasi templat.',
    news: [
      'Menyiapkan informasi pemilihan',
      'Dari kebutuhan hingga pengiriman',
      'Mengelola gambar dan dokumen',
      'Mengonfirmasi spesifikasi',
      'Mengelola catatan pemeriksaan mutu',
      'Informasi kemasan dan pengiriman',
    ],
    powerCases: [
      'Distribusi daya bengkel',
      'Kontrol fasilitas umum',
      'Distribusi daya bangunan',
      'Kontrol peralatan',
    ],
    fastCases: [
      'Sambungan mesin',
      'Sambungan struktur',
      'Dukungan pemeliharaan',
      'Koordinasi pengikat proyek',
    ],
    detail:
      'Contoh ini menunjukkan galeri, spesifikasi, dokumen unduhan, dan formulir penawaran. Situs pelanggan hanya menampilkan produk dan dokumen milik pelanggan.',
    parameter: 'Catatan dokumen',
    value: 'Data demonstrasi. Konfirmasikan spesifikasi dengan gambar yang disetujui.',
    address: 'Alamat demonstrasi, bukan lokasi perusahaan nyata.',
  },
  de: {
    powerTitle: 'Energieverteilung.\nPräzise präsentiert.',
    fastTitle: 'Kleine Details.\nStarke Verbindungen.',
    powerIntro: 'Vom Gehäuse zum System: Ihre Kompetenzen im Überblick.',
    fastIntro: 'Verbindungselemente für Ihre Projekte.',
    powerBody:
      'Eine klare Präsentation für Verteilerschränke, Steuerungspaneele und Elektrogehäuse. Ein übersichtlicher Katalog verbindet Produkte, technische Daten und Anwendungen.',
    fastBody:
      'Ein Katalog für Schrauben, Muttern, Unterlegscheiben und Verbindungselemente. Spezifikationen, Materialien und Anwendungen in einer klaren Übersicht.',
    tagline: 'Produkte und Anwendungen · Demomarke',
    sample: 'Demobeispiel',
    powerNames: [
      'Verteilerschrank',
      'Motorsteuerung',
      'Stromverteilerkasten',
      'Beleuchtungsverteiler',
    ],
    fastNames: ['Sechskantschraube', 'Sechskantmutter', 'Schraube', 'Verbindungselemente'],
    steps: ['Anforderungen', 'Projektunterstützung', 'Qualitätsprüfung', 'Lieferservice'],
    question: [
      'Wie fordere ich ein Angebot an?',
      'Welche Angaben sind erforderlich?',
      'Sind Produktzeichnungen verfügbar?',
      'Kann ich andere Größen anfragen?',
      'Wie werden Materialien bestätigt?',
      'Wie wird die Lieferzeit bestätigt?',
      'Wie wähle ich ein Produkt aus?',
      'Kann ich Projektanforderungen senden?',
      'Kann ich Produktinformationen herunterladen?',
      'Wie erreiche ich das technische Team?',
      'Ist eine projektbezogene Lieferung möglich?',
      'Was enthält ein Angebot?',
    ],
    answer:
      'Senden Sie Produkt, Spezifikation, Menge und Projektanforderungen über das Formular. Technische Daten und Lieferbedingungen müssen vom Anbieter bestätigt werden. Diese Seite dient nur zur Vorführung der Vorlage.',
    news: [
      'Auswahlinformationen vorbereiten',
      'Von der Anforderung zur Lieferung',
      'Zeichnungen und Dokumente organisieren',
      'Spezifikationen bestätigen',
      'Qualitätsaufzeichnungen verwalten',
      'Verpackung und Versand',
    ],
    powerCases: [
      'Werkstattverteilung',
      'Steuerung öffentlicher Anlagen',
      'Gebäudeverteilung',
      'Anlagensteuerung',
    ],
    fastCases: [
      'Maschinenverbindungen',
      'Strukturverbindungen',
      'Wartungsunterstützung',
      'Projektbezogene Versorgung',
    ],
    detail:
      'Dieses Beispiel zeigt Bildergalerie, technische Daten, Dokumente und Angebotsformular. Kundenseiten zeigen ausschließlich die eigenen Produkte und Dokumente des Kunden.',
    parameter: 'Dokumenthinweis',
    value: 'Demodaten. Spezifikationen anhand freigegebener Zeichnungen bestätigen.',
    address: 'Demonstrationsadresse, kein realer Firmenstandort.',
  },
}

export function IndustryDemo({
  templateKey,
  locale,
  path = [],
  search = {},
}: {
  templateKey: IndustryKey
  locale: Exclude<SiteLocale, 'ru'>
  path?: string[]
  search?: { category?: string | string[]; page?: string | string[] }
}) {
  const copy = text[locale]
  const t = templateCopy(locale)
  const power = templateKey === 'power-705-v1'
  const base = `/template-demo/${templateKey}/${locale}`
  const company = power
    ? locale === 'zh'
      ? '启衡电气 · 演示'
      : 'QIHENG ELECTRIC · DEMO'
    : locale === 'zh'
      ? '恒序紧固件 · 演示'
      : 'HENGXU FASTENERS · DEMO'
  const hero = asset(power ? 'power-hero' : 'fastener-hero')
  const photos = power
    ? ['power-cabinet', 'power-wiring', 'power-panel', 'power-cabinet']
    : ['fastener-bolts', 'fastener-nuts', 'fastener-hardware', 'fastener-thread']
  const names = power ? copy.powerNames : copy.fastNames
  const categories = names.map((label, i) => ({
    label,
    href: `${base}/products?category=family-${i + 1}`,
  }))
  const body = power ? copy.powerBody : copy.fastBody
  const products = Array.from({ length: 14 }, (_, i) => ({
    id: `product-${i + 1}`,
    title: `${names[i % 4]} · ${String(i + 1).padStart(2, '0')}`,
    summary: copy.sample,
    image: asset(photos[i % 4]),
    href: `${base}/products/sample-${i + 1}`,
    category: `family-${(i % 4) + 1}`,
  }))
  const cases = Array.from({ length: 8 }, (_, i) => ({
    id: `case-${i + 1}`,
    title: `${(power ? copy.powerCases : copy.fastCases)[i % 4]} · ${copy.sample}`,
    summary: body,
    image: asset(
      power
        ? ['power-technician', 'power-wiring', 'power-panel'][i % 3]
        : ['fastener-hardware', 'fastener-nuts', 'fastener-thread'][i % 3],
    ),
    date: `2026-09-${String(20 - i).padStart(2, '0')}`,
    href: `${base}/cases/sample-${i + 1}`,
    category: `case-group-${(i % 2) + 1}`,
  }))
  const news = Array.from({ length: 12 }, (_, i) => ({
    id: `news-${i + 1}`,
    title: `${copy.news[i % copy.news.length]} · ${copy.sample}`,
    summary: body,
    image: asset(photos[i % 4]),
    date: `2026-09-${String(28 - i).padStart(2, '0')}`,
    href: `${base}/news/sample-${i + 1}`,
    category: `news-group-${(i % 2) + 1}`,
  }))
  const faqs = copy.question.map((question, i) => ({
    id: i + 1,
    question,
    answer: <p>{copy.answer}</p>,
    answerText: copy.answer,
  }))
  const articleCategories = {
    news: copy.news.slice(0, 2).map((label, i) => ({
      label,
      href: `${base}/news?category=news-group-${i + 1}`,
    })),
    cases: (power ? copy.powerCases : copy.fastCases).slice(0, 2).map((label, i) => ({
      label,
      href: `${base}/cases?category=case-group-${i + 1}`,
    })),
  }
  const core = {
    locale,
    base,
    company,
    site: 'demonstration-only',
    title: company,
    catalogFirst: !power,
    demo: true,
    preview: true,
    contact: {
      phone: '+86 000 0000 0000',
      whatsapp: '+86 000 0000 0000',
      email: power ? 'demo@example.invalid' : 'demo@example.invalid',
      address: copy.address,
    },
    inquiryDescription: body,
  }
  let model: IndustryPageModel
  if (!path.length)
    model = {
      ...core,
      kind: 'home',
      banners: [
        { desktopImage: hero, title: power ? copy.powerTitle : copy.fastTitle, description: body },
        {
          desktopImage: asset(power ? 'power-wiring' : 'fastener-thread'),
          title: power ? copy.powerIntro : copy.fastIntro,
          description: body,
        },
      ],
      intro: {
        title: power ? copy.powerIntro : copy.fastIntro,
        text: body,
        image: asset(power ? 'power-technician' : 'fastener-hardware'),
      },
      stats: copy.steps.map((label, i) => ({ label, value: String(i + 1).padStart(2, '0') })),
      products: products.slice(0, 8),
      cases: cases.slice(0, 3),
      news: news.slice(0, 3),
      faqs: faqs.slice(0, 5),
    }
  else {
    const section = path[0]
    if (
      path.length > 2 ||
      !['products', 'news', 'cases', 'about', 'faqs', 'contact'].includes(section) ||
      (['about', 'faqs', 'contact'].includes(section) && path.length !== 1)
    )
      notFound()
    const page = requestedPage(search.page)
    const category = Array.isArray(search.category) ? search.category[0] : search.category
    if (section === 'about')
      model = {
        ...core,
        kind: 'about',
        title: t.about,
        image: hero,
        intro: { title: power ? copy.powerIntro : copy.fastIntro, text: body },
        modules: [
          {
            title: copy.steps[1],
            text: body,
            image: asset(power ? 'power-technician' : 'fastener-hardware'),
          },
          {
            title: copy.steps[2],
            text: copy.detail,
            image: asset(power ? 'power-panel' : 'fastener-nuts'),
          },
        ],
      }
    else if (section === 'contact')
      model = { ...core, kind: 'contact', title: t.contact, summary: body }
    else if (section === 'faqs') {
      if (page > Math.ceil(faqs.length / 10)) notFound()
      model = {
        ...core,
        kind: 'faqs',
        title: t.faqs,
        summary: body,
        faqs: faqs.slice((page - 1) * 10, page * 10),
        pagination: { page, totalDocs: faqs.length, totalPages: Math.ceil(faqs.length / 10) },
      }
    } else {
      const list = section === 'products' ? products : section === 'news' ? news : cases
      if (path[1]) {
        const item = list.find((item) => item.href.endsWith(`/${path[1]}`))
        if (!item) notFound()
        model =
          section === 'products'
            ? {
                ...core,
                kind: 'product',
                section,
                title: item.title,
                summary: body,
                images: [item.image, asset(photos[1])],
                model: `DEMO-${item.id.toUpperCase()}`,
                content: (
                  <>
                    <p>{body}</p>
                    <h3>{t.description}</h3>
                    <p>{copy.detail}</p>
                    <h3>{t.quote}</h3>
                    <p>{copy.answer}</p>
                  </>
                ),
                parameters: [{ label: copy.parameter, value: copy.value }],
                datasheet: `/template-demos/industry/${power ? 'power' : 'fastener'}-demo-guide.pdf`,
                products: products.filter((product) => product.id !== item.id).slice(0, 4),
              }
            : {
                ...core,
                kind: 'article',
                section: section as 'news' | 'cases',
                title: item.title,
                summary: body,
                images: [item.image],
                model: 'date' in item ? (item.date as string) : undefined,
                content: (
                  <>
                    <h2>{item.title}</h2>
                    <p>{body}</p>
                    <p>{copy.detail}</p>
                    <p>{copy.answer}</p>
                  </>
                ),
                cards: list.filter((entry) => entry.id !== item.id).slice(0, 3),
              }
      } else {
        const categoryPattern =
          section === 'products'
            ? /^family-[1-4]$/
            : section === 'news'
              ? /^news-group-[1-2]$/
              : /^case-group-[1-2]$/
        if (category && !categoryPattern.test(category)) notFound()
        const filtered = category ? list.filter((item) => item.category === category) : list
        const limit = section === 'products' ? 12 : section === 'news' ? 9 : 6
        const totalPages = Math.max(1, Math.ceil(filtered.length / limit))
        if (page > totalPages) notFound()
        model = {
          ...core,
          kind: 'catalog',
          section: section as 'products' | 'news' | 'cases',
          title: t[section as 'products'],
          summary: body,
          categories:
            section === 'products' ? categories : articleCategories[section as 'news' | 'cases'],
          activeCategory: category,
          cards: filtered.slice((page - 1) * limit, page * limit),
          pagination: { page, totalPages, totalDocs: filtered.length },
        }
      }
    }
  }
  const links = ['home', 'products', 'news', 'cases', 'about', 'faqs', 'contact'].map(
    (section) => ({
      label: t[section as 'home'],
      href: section === 'home' ? base : `${base}/${section}`,
      children:
        section === 'products'
          ? categories
          : section === 'news' || section === 'cases'
            ? articleCategories[section]
            : undefined,
    }),
  )
  return (
    <IndustryShell
      templateKey={templateKey}
      locale={locale}
      base={base}
      company={company}
      tagline={copy.tagline}
      links={links}
      languages={[...industryDemoLocales]}
      footerIntro={body}
      model={model}
    >
      <IndustryPage model={model} />
    </IndustryShell>
  )
}
