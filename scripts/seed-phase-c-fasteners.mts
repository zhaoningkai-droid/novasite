import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const locales = ['en', 'zh', 'ru', 'id'] as const
type Locale = (typeof locales)[number]
type Texts = Record<Locale, string>
type Localized = { en: Record<string, unknown>; zh: Record<string, unknown>; ru: Record<string, unknown>; id: Record<string, unknown> }
type LocalizedValue = Texts | ((locale: Locale) => unknown)

const text = (en: string, zh: string, ru: string, id: string): Texts => ({ en, zh, ru, id })
const richText = (value: string) => ({ root: { type: 'root', format: '', indent: 0, version: 1, children: value.split('\n').filter(Boolean).map((line) => ({ type: 'paragraph', format: '', indent: 0, version: 1, children: [{ type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: line, type: 'text', version: 1 }] })) } })
const productSpecifications = (locale: Locale, item: { model: string; category: string }) => {
  const labels = {
    en: ['Product standard', 'Material', 'Strength grade', 'Thread range', 'Surface finish', 'Supply option'],
    zh: ['执行标准', '材质', '强度等级', '螺纹范围', '表面处理', '供货方式'],
    ru: ['Стандарт', 'Материал', 'Класс прочности', 'Диапазон резьбы', 'Покрытие', 'Вариант поставки'],
    id: ['Standar produk', 'Material', 'Kelas kekuatan', 'Rentang ulir', 'Lapisan', 'Opsi pasokan'],
  }[locale]
  const values = item.category === 'stainless-fasteners'
    ? ['DIN / ISO', 'Stainless steel A2 / A4', 'A2-70 / A4-80', 'M3–M20', 'Plain / passivated', 'Bulk / small box / kit']
    : item.category === 'high-strength-fasteners'
      ? ['DIN / ISO', 'Alloy steel', '8.8 / 10.9 / 12.9', 'M8–M30', 'Zinc / zinc flake / black oxide', 'Matched bolt, nut and washer']
      : ['DIN / ISO / drawing', 'Carbon steel / alloy steel', '4.8–12.9', 'M3–M36', 'Zinc / zinc flake / black oxide', 'Bulk / box / project kit']
  return labels.map((label, index) => ({ label, value: values[index] }))
}
const localized = (fields: Record<string, LocalizedValue>): Localized => {
  const result = {} as Localized
  for (const locale of locales) {
    result[locale] = Object.fromEntries(Object.entries(fields).map(([key, value]) => {
      const content = typeof value === 'function' ? value(locale) : value[locale]
      return [key, content]
    }))
  }
  return result
}

async function writeLocales(collection: 'tenants' | 'product-categories' | 'categories' | 'news-categories' | 'case-categories' | 'products' | 'posts' | 'news' | 'cases' | 'pages', id: number, common: Record<string, unknown>, values: Localized) {
  for (const locale of locales) {
    await payload.update({ collection, id, locale, depth: 0, overrideAccess: true, context: { disableRevalidate: true }, data: { ...common, ...values[locale] } as never })
  }
}

async function upsertCategory(collection: 'product-categories' | 'categories' | 'news-categories' | 'case-categories', tenant: number, slug: string, name: Texts, description: Texts, sortOrder: number, parent?: number) {
  const found = await payload.find({ collection, depth: 0, limit: 1, overrideAccess: true, where: { and: [{ tenant: { equals: tenant } }, { slug: { equals: slug } }] } })
  const isBlogCategory = collection === 'categories'
  const common = isBlogCategory ? { tenant, slug } : { tenant, slug, sortOrder, ...(parent ? { parent } : {}) }
  const doc = found.docs[0] || await payload.create({ collection, locale: 'en', depth: 0, overrideAccess: true, context: { disableRevalidate: true }, data: { ...common, ...(isBlogCategory ? { title: name.en } : { name: name.en, description: description.en }) } as never })
  await writeLocales(collection, doc.id, common, localized(isBlogCategory ? { title: name } : { name, description }))
  return doc.id
}

const productCategoryDefinitions = [
  ['standard-fasteners', text('Standard Fasteners', '标准紧固件', 'Стандартный крепёж', 'Fastener Standar'), text('Bolts, nuts, washers and screws supplied to common international standards.', '螺栓、螺母、垫圈与螺钉等常用标准件。', 'Болты, гайки, шайбы и винты по распространённым международным стандартам.', 'Baut, mur, ring, dan sekrup sesuai standar internasional umum.')],
  ['non-standard-custom', text('Non-standard Custom', '非标定制', 'Нестандартное изготовление', 'Kustom Non-standar'), text('Made-to-drawing fasteners for special dimensions and assemblies.', '按图纸或样品定制特殊尺寸和结构紧固件。', 'Крепёж по чертежу или образцу для специальных размеров и узлов.', 'Fastener sesuai gambar atau sampel untuk ukuran dan rakitan khusus.')],
  ['stainless-fasteners', text('Stainless Steel Fasteners', '不锈钢紧固件', 'Нержавеющий крепёж', 'Fastener Stainless'), text('Corrosion-resistant A2 and A4 fastening products.', 'A2、A4 等耐腐蚀不锈钢紧固件。', 'Коррозионностойкий крепёж A2 и A4.', 'Produk pengikat tahan korosi A2 dan A4.')],
  ['high-strength-fasteners', text('High-strength Fasteners', '高强度紧固件', 'Высокопрочный крепёж', 'Fastener Kekuatan Tinggi'), text('Grade 8.8, 10.9 and 12.9 solutions for demanding assemblies.', '适用于高载荷装配的 8.8、10.9、12.9 级产品。', 'Решения классов 8.8, 10.9 и 12.9 для ответственных соединений.', 'Solusi kelas 8.8, 10.9, dan 12.9 untuk sambungan berat.')],
  ['surface-treatment', text('Surface Treatment & Coating', '表面处理与涂层', 'Покрытия и обработка поверхности', 'Pelapisan & Perawatan Permukaan'), text('Zinc, zinc flake, black oxide and other protective finishes.', '镀锌、达克罗、发黑等防护表面处理。', 'Цинкование, цинк-ламельные покрытия, оксидирование и другие покрытия.', 'Seng, zinc flake, black oxide, dan pelapisan pelindung lainnya.')],
  ['hardware-accessories', text('Hardware Accessories', '五金配件', 'Метизы и комплектующие', 'Aksesori Hardware'), text('Complementary hardware for installation and assembly.', '用于安装与装配的配套五金件。', 'Комплектующие метизы для монтажа и сборки.', 'Komponen hardware pelengkap untuk pemasangan dan perakitan.')],
] as const

const blogCategoryDefinitions = [
  ['selection-guide', text('Selection Guide', '选型指南', 'Руководство по выбору', 'Panduan Pemilihan'), text('Practical purchasing and specification knowledge.', '面向采购与工程人员的实用选型知识。', 'Практические знания для закупщиков и инженеров.', 'Pengetahuan praktis untuk pembeli dan engineer.')],
  ['materials-process', text('Materials & Process', '材料与工艺', 'Материалы и процессы', 'Material & Proses'), text('Material grades, production and inspection topics.', '材料牌号、生产与检验相关内容。', 'Темы марок материалов, производства и контроля.', 'Topik kelas material, produksi, dan inspeksi.')],
  ['industry-insights', text('Industry Insights', '行业洞察', 'Отраслевые обзоры', 'Wawasan Industri'), text('Application and market observations for fastening products.', '紧固件应用与市场观察。', 'Применение и рыночные наблюдения по крепежу.', 'Aplikasi dan wawasan pasar untuk fastener.')],
] as const

const newsCategoryDefinitions = [
  ['company-news', text('Company News', '企业动态', 'Новости компании', 'Berita Perusahaan'), text('Factory, team and service updates.', '工厂、团队与服务动态。', 'Новости производства, команды и сервиса.', 'Pembaruan pabrik, tim, dan layanan.')],
  ['quality-delivery', text('Quality & Delivery', '质量与交付', 'Качество и поставки', 'Mutu & Pengiriman'), text('Quality systems, inspections and delivery information.', '质量体系、检验与交付相关信息。', 'Информация о системе качества, контроле и поставках.', 'Informasi sistem mutu, inspeksi, dan pengiriman.')],
  ['market-events', text('Market & Events', '市场与展会', 'Рынок и выставки', 'Pasar & Pameran'), text('Market activity and event participation.', '市场活动与展会信息。', 'Рыночные мероприятия и участие в выставках.', 'Aktivitas pasar dan partisipasi pameran.')],
] as const

const caseCategoryDefinitions = [
  ['construction', text('Construction & Infrastructure', '建筑与基础设施', 'Строительство и инфраструктура', 'Konstruksi & Infrastruktur'), text('Fastening solutions for structural and infrastructure projects.', '面向结构安装与基础设施项目的紧固解决方案。', 'Крепёжные решения для конструкций и инфраструктуры.', 'Solusi pengikat untuk struktur dan infrastruktur.')],
  ['industrial-equipment', text('Industrial Equipment', '工业设备', 'Промышленное оборудование', 'Peralatan Industri'), text('Reliable components for machinery and production equipment.', '用于机械与生产设备的可靠连接件。', 'Надёжные компоненты для машин и производственного оборудования.', 'Komponen andal untuk mesin dan peralatan produksi.')],
  ['energy-mobility', text('Energy & Mobility', '能源与交通', 'Энергетика и транспорт', 'Energi & Mobilitas'), text('High-performance fastening for energy and transport applications.', '适用于能源与交通应用的高性能紧固件。', 'Высокопроизводительный крепёж для энергетики и транспорта.', 'Fastener berperforma tinggi untuk energi dan transportasi.')],
] as const

const products = [
  { key: 'din-933-hex-bolt', model: 'DIN933-M8x30', category: 'standard-fasteners', image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=1200&q=82', title: text('DIN 933 Hex Head Bolt', 'DIN 933 六角头螺栓', 'Болт с шестигранной головкой DIN 933', 'Baut Kepala Segi Enam DIN 933'), summary: text('Full-thread carbon steel hex bolt for general industrial assembly.', '适用于通用工业装配的全牙碳钢六角头螺栓。', 'Полнорезьбовой стальной болт для промышленной сборки.', 'Baut baja berulir penuh untuk perakitan industri umum.'), description: text('Available in common metric sizes with zinc-plated or plain finish. Material and strength grade can be selected for your application.', '提供常用公制规格，可选镀锌或本色表面。材料与强度等级可按应用需求选择。', 'Поставляется в распространённых метрических размерах, с оцинкованной или без покрытия поверхностью. Материал и класс прочности выбираются по задаче.', 'Tersedia dalam ukuran metrik umum dengan lapisan seng atau polos. Material dan kelas kekuatan dapat dipilih sesuai aplikasi.') },
  { key: 'custom-threaded-stud', model: 'CUSTOM-STUD-M12', category: 'non-standard-custom', image: 'https://images.unsplash.com/photo-1581093458791-9f3c3900dfc6?auto=format&fit=crop&w=1200&q=82', title: text('Custom Double-End Threaded Stud', '双头螺柱非标定制', 'Нестандартная двухсторонняя шпилька', 'Stud Ulir Dua Ujung Kustom'), summary: text('Made-to-drawing stud with custom thread lengths, material and finish.', '按图纸定制螺纹长度、材质与表面处理的双头螺柱。', 'Шпилька по чертежу с заданной длиной резьбы, материалом и покрытием.', 'Stud sesuai gambar dengan panjang ulir, material, dan lapisan khusus.'), description: text('Submit your drawing or sample for a manufacturability review and quotation. Batch identification and dimensional inspection are available.', '提交图纸或样品即可进行工艺评估与报价，可提供批次标识和尺寸检验。', 'Отправьте чертёж или образец для технологической оценки и расчёта. Доступны идентификация партий и контроль размеров.', 'Kirim gambar atau sampel untuk evaluasi manufaktur dan penawaran. Identifikasi batch dan inspeksi dimensi tersedia.') },
  { key: 'a2-70-stainless-screw', model: 'A2-70-M6x20', category: 'stainless-fasteners', image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=1200&q=82', title: text('A2-70 Stainless Steel Socket Screw', 'A2-70 不锈钢内六角螺钉', 'Нержавеющий винт с внутренним шестигранником A2-70', 'Sekrup Soket Stainless A2-70'), summary: text('Corrosion-resistant stainless socket screw for outdoor and equipment use.', '适用于户外及设备安装的耐腐蚀不锈钢内六角螺钉。', 'Коррозионностойкий нержавеющий винт для наружного и приборного применения.', 'Sekrup soket stainless tahan korosi untuk penggunaan luar ruang dan peralatan.'), description: text('A2-70 stainless steel provides a dependable balance of corrosion resistance and mechanical performance for many assemblies.', 'A2-70 不锈钢兼顾耐腐蚀性与机械性能，适用于多种装配场景。', 'Нержавеющая сталь A2-70 сочетает коррозионную стойкость и механические свойства для многих соединений.', 'Stainless A2-70 memberi keseimbangan ketahanan korosi dan kinerja mekanis untuk banyak perakitan.') },
  { key: 'grade-10-9-bolt', model: '10.9-M16x80', category: 'high-strength-fasteners', image: 'https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=1200&q=82', title: text('Grade 10.9 High-strength Hex Bolt', '10.9 级高强度六角头螺栓', 'Высокопрочный болт класса 10.9', 'Baut Kekuatan Tinggi Kelas 10.9'), summary: text('High-strength bolt for heavy-load machinery and structural connections.', '用于重载机械与结构连接的高强度螺栓。', 'Высокопрочный болт для тяжёлого оборудования и конструкций.', 'Baut berkekuatan tinggi untuk mesin beban berat dan sambungan struktur.'), description: text('Designed for demanding joint performance. Available with matching nuts and washers plus inspection documentation.', '适用于对连接性能要求较高的场景，可配套螺母、垫圈及检验文件。', 'Предназначен для ответственных соединений. Доступны соответствующие гайки, шайбы и документы контроля.', 'Dirancang untuk sambungan berat. Tersedia mur, ring, dan dokumen inspeksi yang sesuai.') },
  { key: 'zinc-flake-bolt', model: 'ZF-M10x45', category: 'surface-treatment', image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=82', title: text('Zinc Flake Coated Flange Bolt', '锌铝涂层法兰面螺栓', 'Фланцевый болт с цинк-ламельным покрытием', 'Baut Flens Berlapis Zinc Flake'), summary: text('Enhanced corrosion protection for automotive, outdoor and humid environments.', '适用于汽车、户外及潮湿环境的增强防腐法兰面螺栓。', 'Фланцевый болт с повышенной защитой от коррозии для автомобилей и наружных условий.', 'Baut flens dengan perlindungan korosi lebih tinggi untuk otomotif dan lingkungan luar.'), description: text('Zinc flake coating offers reliable corrosion protection with controlled friction properties for assembly.', '锌铝涂层提供可靠防腐能力，并具备适合装配的摩擦系数控制。', 'Цинк-ламельное покрытие обеспечивает защиту от коррозии и контролируемое трение при сборке.', 'Lapisan zinc flake menawarkan perlindungan korosi andal dengan karakteristik gesek terkontrol.') },
  { key: 'hardware-accessory-kit', model: 'HW-KIT-01', category: 'hardware-accessories', image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1200&q=82', title: text('Installation Hardware Accessory Kit', '安装五金配件组合', 'Комплект монтажных метизов', 'Kit Aksesori Hardware Pemasangan'), summary: text('Matched nuts, washers, threaded rods and accessories for efficient assembly.', '为高效装配配套提供螺母、垫圈、牙条及相关五金件。', 'Подобранные гайки, шайбы, шпильки и комплектующие для эффективной сборки.', 'Mur, ring, batang ulir, dan aksesori yang cocok untuk perakitan efisien.'), description: text('Kits can be packed by project, BOM or installation area to simplify receiving and on-site preparation.', '可按项目、BOM 或安装区域配套包装，简化收货与现场准备。', 'Комплекты упаковываются по проекту, спецификации или зоне монтажа для упрощения приёмки.', 'Kit dapat dikemas berdasarkan proyek, BOM, atau area pemasangan untuk mempermudah penerimaan.') },
]

const blogItems = [
  { key: 'hex-bolt-selection', category: 'selection-guide', title: text('How to Select a Hex Bolt for Industrial Assembly', '工业装配中如何选择六角头螺栓', 'Как выбрать шестигранный болт для промышленной сборки', 'Cara Memilih Baut Segi Enam untuk Perakitan Industri'), summary: text('A practical guide to diameter, thread, grade and coating selection.', '从直径、螺纹、等级和涂层入手的实用选型指南。', 'Практическое руководство по диаметру, резьбе, классу и покрытию.', 'Panduan praktis memilih diameter, ulir, kelas, dan lapisan.'), content: text('Start with the joint design and load requirement.\nConfirm the thread series, strength grade and corrosion environment before choosing the finish.\nA complete specification reduces purchasing risk and helps factories quote accurately.', '先确认连接设计与载荷要求。\n再确认螺纹系列、强度等级及腐蚀环境，最后选择表面处理。\n完整的规格可以降低采购风险，也能让工厂更准确报价。', 'Начните с конструкции соединения и нагрузки.\nЗатем определите резьбу, класс прочности и среду коррозии, после чего выберите покрытие.\nПолная спецификация снижает риск закупки и повышает точность расчёта.', 'Mulailah dari desain sambungan dan kebutuhan beban.\nPastikan seri ulir, kelas kekuatan, dan lingkungan korosi sebelum memilih lapisan.\nSpesifikasi lengkap mengurangi risiko pembelian dan membantu pabrik memberi penawaran akurat.') },
  { key: 'stainless-steel-grade-guide', category: 'materials-process', title: text('A2 and A4 Stainless Fasteners: What Is the Difference?', 'A2 与 A4 不锈钢紧固件有什么区别？', 'Чем отличаются нержавеющие крепежи A2 и A4?', 'Apa Perbedaan Fastener Stainless A2 dan A4?'), summary: text('Understand corrosion resistance and common application choices.', '了解耐腐蚀差异及常见应用选择。', 'Разберитесь в коррозионной стойкости и выборе применения.', 'Pahami ketahanan korosi dan pilihan aplikasi umum.'), content: text('A2 stainless fasteners are widely used for general corrosion resistance.\nA4 material offers stronger resistance in more aggressive environments.\nChoose based on the actual service condition rather than price alone.', 'A2 不锈钢适用于大多数一般耐腐蚀场景。\nA4 材质在更严苛环境中具有更强的耐腐蚀能力。\n应根据真实使用环境选择，而不是只看价格。', 'Крепёж A2 широко применяется при обычной коррозионной нагрузке.\nМатериал A4 лучше подходит для более агрессивных сред.\nВыбирайте по условиям эксплуатации, а не только по цене.', 'Fastener A2 banyak digunakan untuk ketahanan korosi umum.\nMaterial A4 lebih cocok untuk lingkungan yang lebih agresif.\nPilih berdasarkan kondisi penggunaan, bukan hanya harga.') },
  { key: 'coating-comparison', category: 'industry-insights', title: text('Comparing Zinc, Zinc Flake and Black Oxide Finishes', '镀锌、锌铝涂层与发黑处理如何选择', 'Сравнение цинка, цинк-ламельного покрытия и оксидирования', 'Membandingkan Seng, Zinc Flake, dan Black Oxide'), summary: text('Match surface protection with corrosion conditions and assembly needs.', '根据腐蚀条件与装配需求匹配表面防护方案。', 'Подберите защиту поверхности под коррозионные условия и сборку.', 'Cocokkan perlindungan permukaan dengan kondisi korosi dan kebutuhan perakitan.'), content: text('Surface finish affects corrosion resistance, appearance and assembly friction.\nZinc is common for general use, zinc flake is suited to higher corrosion demand, and black oxide is often selected for controlled indoor applications.', '表面处理会影响耐腐蚀性、外观和装配摩擦。\n普通镀锌适合一般用途，锌铝涂层适合更高防腐需求，发黑常用于受控的室内应用。', 'Покрытие влияет на коррозионную стойкость, внешний вид и трение при сборке.\nЦинк подходит для общего применения, цинк-ламельное покрытие — для повышенной защиты, оксидирование — для контролируемых внутренних условий.', 'Lapisan permukaan memengaruhi ketahanan korosi, tampilan, dan gesekan perakitan.\nSeng cocok untuk penggunaan umum, zinc flake untuk kebutuhan korosi lebih tinggi, dan black oxide untuk kondisi dalam ruang yang terkendali.') },
]

const newsItems = [
  { key: 'quality-lab-upgrade', category: 'quality-delivery', title: text('Fastener Inspection Capability Expanded', '紧固件检测能力升级', 'Расширение возможностей контроля крепежа', 'Kemampuan Inspeksi Fastener Ditingkatkan'), summary: text('New inspection workflow improves dimensional and material traceability.', '新的检验流程提升了尺寸与材料可追溯能力。', 'Новый процесс контроля улучшает прослеживаемость размеров и материалов.', 'Alur inspeksi baru meningkatkan ketertelusuran dimensi dan material.'), content: text('The updated inspection workflow adds clearer batch identification and final dimensional review.\nCustomers can request inspection records with their order before shipment.', '升级后的检验流程增加了更清晰的批次标识与最终尺寸复核。\n客户可在出货前申请随货检验记录。', 'Обновлённый процесс контроля добавляет понятную идентификацию партий и итоговую проверку размеров.\nКлиенты могут запросить записи контроля до отгрузки.', 'Alur inspeksi yang diperbarui menambah identifikasi batch yang lebih jelas dan pemeriksaan dimensi akhir.\nPelanggan dapat meminta catatan inspeksi sebelum pengiriman.') },
  { key: 'export-packing-update', category: 'quality-delivery', title: text('Export Packing Options Updated for Mixed Hardware Orders', '混装五金订单出口包装方案更新', 'Обновление экспортной упаковки для смешанных заказов', 'Pembaruan Kemasan Ekspor untuk Pesanan Hardware Campuran'), summary: text('Project packing can now be organized by BOM and installation area.', '项目包装可按 BOM 与安装区域进行整理。', 'Упаковка проекта может быть организована по спецификации и зоне монтажа.', 'Kemasan proyek kini dapat diatur berdasarkan BOM dan area pemasangan.'), content: text('Mixed fastener orders can be labelled and packed by project reference.\nThis reduces receiving time and helps site teams identify the correct hardware quickly.', '混装紧固件可按项目编号进行标签与包装。\n这样可缩短收货时间，帮助现场团队快速找到正确的五金件。', 'Смешанные заказы на крепёж маркируются и упаковываются по проекту.\nЭто сокращает время приёмки и помогает монтажной группе быстро найти нужные метизы.', 'Pesanan fastener campuran dapat diberi label dan dikemas menurut referensi proyek.\nIni mengurangi waktu penerimaan dan membantu tim lokasi menemukan hardware yang tepat.') },
  { key: 'industrial-supply-event', category: 'market-events', title: text('Industrial Fastener Supply Program Opens for New Export Partners', '工业紧固件出口合作计划启动', 'Программа сотрудничества с экспортными партнёрами', 'Program Kemitraan Ekspor Fastener Industri Dibuka'), summary: text('The program supports sampling, technical clarification and consolidated supply.', '该计划支持样品、技术澄清与集拼供货。', 'Программа поддерживает образцы, техническое уточнение и консолидированные поставки.', 'Program mendukung sampel, klarifikasi teknis, dan pasokan terkonsolidasi.'), content: text('Export partners can begin with a sample list or a bill of materials.\nOur team supports product matching, documentation preparation and shipment planning.', '出口合作伙伴可从样品清单或 BOM 开始。\n团队可协助产品匹配、文件准备与发运规划。', 'Экспортные партнёры могут начать с перечня образцов или спецификации.\nКоманда помогает с подбором продукции, документами и планированием отгрузки.', 'Mitra ekspor dapat memulai dengan daftar sampel atau BOM.\nTim kami mendukung pencocokan produk, persiapan dokumen, dan perencanaan pengiriman.') },
]

const caseItems = [
  { key: 'wind-energy-bolt-kit', category: 'energy-mobility', country: 'Germany', title: text('Wind Equipment Bolt Kit Delivery', '风电设备高强度螺栓配套交付', 'Поставка комплекта болтов для ветроэнергетического оборудования', 'Pengiriman Kit Baut Peralatan Energi Angin'), summary: text('Matched high-strength bolts, nuts and washers for equipment assembly.', '为设备装配配套供应高强度螺栓、螺母与垫圈。', 'Комплект высокопрочных болтов, гаек и шайб для сборки оборудования.', 'Baut, mur, dan ring berkekuatan tinggi yang cocok untuk perakitan peralatan.'), content: text('The customer needed coordinated fastener sets with inspection records.\nProducts were packed by assembly group to improve receiving and installation efficiency.', '客户需要带检验记录的成套紧固件。\n产品按装配组配套包装，提高了收货与安装效率。', 'Заказчику требовались согласованные комплекты крепежа с записями контроля.\nПродукция была упакована по узлам сборки для повышения эффективности монтажа.', 'Pelanggan membutuhkan set fastener yang terkoordinasi dengan catatan inspeksi.\nProduk dikemas berdasarkan kelompok perakitan untuk meningkatkan efisiensi pemasangan.') },
  { key: 'machine-builder-custom-studs', category: 'industrial-equipment', country: 'Türkiye', title: text('Custom Stud Solution for Machine Builder', '机械制造商非标双头螺柱项目', 'Нестандартные шпильки для машиностроителя', 'Solusi Stud Kustom untuk Pembuat Mesin'), summary: text('Custom thread length and material specification for a compact machine assembly.', '为紧凑型机械装配定制螺纹长度与材料规格。', 'Заданная длина резьбы и материал для компактного машинного узла.', 'Panjang ulir dan material khusus untuk perakitan mesin kompak.'), content: text('The project began with a customer drawing and sample.\nAfter specification review, the final parts were produced with dimensional inspection and lot identification.', '项目从客户图纸与样品开始。\n经过规格确认后，最终产品完成了尺寸检验与批次标识。', 'Проект начался с чертежа и образца заказчика.\nПосле проверки спецификации детали были изготовлены с контролем размеров и идентификацией партии.', 'Proyek dimulai dari gambar dan sampel pelanggan.\nSetelah tinjauan spesifikasi, suku cadang diproduksi dengan inspeksi dimensi dan identifikasi lot.') },
  { key: 'infrastructure-corrosion-protection', category: 'construction', country: 'Indonesia', title: text('Corrosion-protected Fasteners for Infrastructure Installation', '基础设施安装项目防腐紧固件供货', 'Антикоррозионный крепёж для инфраструктурного монтажа', 'Fastener Tahan Korosi untuk Pemasangan Infrastruktur'), summary: text('Zinc flake coated fasteners selected for humid installation conditions.', '针对潮湿安装环境选择锌铝涂层紧固件。', 'Крепёж с цинк-ламельным покрытием для влажных условий монтажа.', 'Fastener berlapis zinc flake untuk kondisi pemasangan lembap.'), content: text('The customer required corrosion protection and controlled assembly performance.\nThe supplied fasteners were documented by batch and packed for site delivery.', '客户需要兼顾防腐能力与装配性能。\n供货产品按批次提供文件，并按现场交付要求包装。', 'Заказчику требовались защита от коррозии и стабильная сборка.\nКрепёж сопровождался документами по партиям и был упакован для доставки на объект.', 'Pelanggan membutuhkan perlindungan korosi dan kinerja perakitan yang terkendali.\nFastener didokumentasikan per batch dan dikemas untuk pengiriman ke lokasi.') },
]

async function upsertContent(collection: 'products' | 'posts' | 'news' | 'cases', tenant: number, existingID: number | undefined, slug: string, common: Record<string, unknown>, values: Localized) {
  const doc = existingID
    ? await payload.update({ collection, id: existingID, locale: 'en', depth: 0, overrideAccess: true, context: { disableRevalidate: true }, data: { tenant, slug, ...common, ...values.en } as never })
    : await payload.create({ collection, locale: 'en', depth: 0, overrideAccess: true, context: { disableRevalidate: true }, data: { tenant, slug, ...common, ...values.en } as never })
  await writeLocales(collection, doc.id, { tenant, slug, ...common }, values)
  return doc.id
}

async function seedTenant(tenant: number, prefix: string) {
  const productCategories = new Map<string, number>()
  for (const [index, [key, name, description]] of productCategoryDefinitions.entries()) productCategories.set(key, await upsertCategory('product-categories', tenant, `${prefix}-${key}`, name, description, index + 1))
  const standardID = productCategories.get('standard-fasteners')!
  for (const [index, [key, name]] of [
    ['bolts', text('Bolts', '螺栓', 'Болты', 'Baut')], ['nuts', text('Nuts', '螺母', 'Гайки', 'Mur')], ['washers', text('Washers', '垫圈', 'Шайбы', 'Ring')], ['screws', text('Screws', '螺钉', 'Винты', 'Sekrup')],
  ].entries()) await upsertCategory('product-categories', tenant, `${prefix}-standard-${key}`, name, text('Standard fastening product group.', '标准紧固件产品分组。', 'Группа стандартного крепежа.', 'Kelompok produk fastener standar.'), index + 10, standardID)

  const blogCategories = new Map<string, number>()
  for (const [index, [key, name, description]] of blogCategoryDefinitions.entries()) blogCategories.set(key, await upsertCategory('categories', tenant, `${prefix}-${key}`, name, description, index + 1))
  const newsCategories = new Map<string, number>()
  for (const [index, [key, name, description]] of newsCategoryDefinitions.entries()) newsCategories.set(key, await upsertCategory('news-categories', tenant, `${prefix}-${key}`, name, description, index + 1))
  const caseCategories = new Map<string, number>()
  for (const [index, [key, name, description]] of caseCategoryDefinitions.entries()) caseCategories.set(key, await upsertCategory('case-categories', tenant, `${prefix}-${key}`, name, description, index + 1))

  const existingProducts = await payload.find({ collection: 'products', depth: 0, limit: 100, sort: 'id', overrideAccess: true, where: tenant === 1 ? { or: [{ tenant: { equals: 1 } }, { tenant: { exists: false } }] } : { tenant: { equals: tenant } } })
  for (const [index, item] of products.entries()) await upsertContent('products', tenant, existingProducts.docs[index]?.id, `${prefix}-${item.key}`, { model: item.model, category: productCategories.get(item.category), featured: index < 3, publishedAt: new Date().toISOString(), _status: 'published' }, localized({ title: item.title, summary: item.summary, description: (locale) => richText(item.description[locale]), externalImages: (locale) => [{ url: item.image, alt: item.title[locale] }], specifications: (locale) => productSpecifications(locale, item) }))

  const existingPosts = await payload.find({ collection: 'posts', depth: 0, limit: 100, sort: 'id', overrideAccess: true, where: { tenant: { equals: tenant } } })
  for (const [index, item] of [...blogItems, ...(tenant === 1 ? [blogItems[0]] : [])].entries()) await upsertContent('posts', tenant, existingPosts.docs[index]?.id, `${prefix}-${item.key}-${index + 1}`, { categories: [blogCategories.get(item.category)!], publishedAt: new Date().toISOString(), _status: 'published' }, localized({ title: item.title, content: (locale) => richText(item.content[locale]), meta: (locale) => ({ description: item.summary[locale] }) }))

  const existingNews = await payload.find({ collection: 'news', depth: 0, limit: 100, sort: 'id', overrideAccess: true, where: { tenant: { equals: tenant } } })
  for (const item of newsItems) {
    const slug = `${prefix}-${item.key}`
    const matches = existingNews.docs.filter((doc) => doc.slug === slug)
    await upsertContent('news', tenant, matches[0]?.id, slug, { category: newsCategories.get(item.category), publishedAt: new Date().toISOString(), _status: 'published' }, localized({ title: item.title, summary: item.summary, content: (locale) => richText(item.content[locale]), meta: (locale) => ({ description: item.summary[locale] }) }))
    for (const duplicate of matches.slice(1)) await payload.delete({ collection: 'news', id: duplicate.id, overrideAccess: true, context: { disableRevalidate: true } })
  }

  const existingCases = await payload.find({ collection: 'cases', depth: 0, limit: 100, sort: 'id', overrideAccess: true, where: { tenant: { equals: tenant } } })
  for (const [index, item] of caseItems.entries()) await upsertContent('cases', tenant, existingCases.docs[index]?.id, `${prefix}-${item.key}`, { category: caseCategories.get(item.category), country: item.country, industry: item.category, publishedAt: new Date().toISOString(), _status: 'published' }, localized({ title: item.title, summary: item.summary, content: (locale) => richText(item.content[locale]) }))

  const legacyCategorySlugs = tenant === 1
    ? ['volt-fastener-category', 'oil-immersed-transformers', 'dry-type-transformers', 'compact-Compact test']
    : ['huadong-fastener-category']
  for (const slug of legacyCategorySlugs) {
    const result = await payload.find({ collection: 'product-categories', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ tenant: { equals: tenant } }, { slug: { equals: slug } }] } })
    if (result.docs[0]) await payload.delete({ collection: 'product-categories', id: result.docs[0].id, overrideAccess: true, context: { disableRevalidate: true } })
  }
}

await seedTenant(1, 'voltfast')
await seedTenant(2, 'huadong')

const tenantBranding: Array<{ id: number; company: Texts; tagline: Texts }> = [
  { id: 1, company: text('VoltTrans Industrial Fasteners', '沃特工业紧固件', 'VoltTrans Промышленный Крепёж', 'VoltTrans Fastener Industri'), tagline: text('Reliable fasteners for global industry', '服务全球工业客户的可靠紧固件', 'Надёжный крепёж для мировой промышленности', 'Fastener andal untuk industri global') },
  { id: 2, company: text('Huadong Fastener Manufacturing Co., Ltd.', '华东紧固件制造有限公司', 'Huadong Производство Крепежа', 'Huadong Manufaktur Fastener'), tagline: text('Fastening solutions made for your assembly', '为您的装配需求提供紧固件解决方案', 'Крепёжные решения для вашей сборки', 'Solusi fastener untuk perakitan Anda') },
]
for (const brand of tenantBranding) await writeLocales('tenants', brand.id, { branding: { heroImageURL: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=2000&q=85' } }, localized({ branding: (locale) => ({ companyName: brand.company[locale], tagline: brand.tagline[locale] }) }))

const pages = await payload.find({ collection: 'pages', depth: 0, limit: 100, sort: 'id', overrideAccess: true })
for (const tenant of [1, 2]) {
  const page = pages.docs.find((item) => item.tenant === tenant && (tenant === 1 ? item.slug === 'home' : true))
  if (!page) continue
  const title = tenant === 1 ? text('VoltTrans Fastener Homepage', '沃特紧固件首页', 'Главная VoltTrans Крепёж', 'Beranda Fastener VoltTrans') : text('Huadong Fastener Homepage', '华东紧固件首页', 'Главная Huadong Крепёж', 'Beranda Fastener Huadong')
  await writeLocales('pages', page.id, { tenant, hero: { type: 'lowImpact' }, _status: 'published' }, localized({
    title,
    hero: (locale) => ({ type: 'lowImpact', richText: richText(`${title[locale]}\nReliable fastening products for global industrial assembly.`) }),
    layout: (locale) => [{
      blockType: 'content',
      columns: [{
        size: 'full',
        richText: richText(locale === 'zh' ? '从标准紧固件到按图定制，我们为工业装配提供可追溯的产品与服务。' : 'From standard fasteners to made-to-drawing parts, we provide traceable products and service for industrial assembly.'),
        enableLink: false,
      }],
    }],
  }))
}

console.log(JSON.stringify({ seeded: true, tenants: 2, productCategoriesPerTenant: 10, productsPerTenant: 6, newsPerTenant: 3, casesPerTenant: 3 }, null, 2))
