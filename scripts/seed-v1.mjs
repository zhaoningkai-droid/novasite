const baseURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3100'
const email = process.env.SEED_ADMIN_EMAIL || 'admin@novasite.local'
const password = process.env.SEED_ADMIN_PASSWORD || ''

const request = async (path, options = {}) => {
  const response = await fetch(`${baseURL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const body = await response.json()
  if (!response.ok) throw new Error(`${response.status} ${path}: ${JSON.stringify(body)}`)
  return body
}

const login = await request('/api/users/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
})
const auth = { Authorization: `JWT ${login.token}` }

const findOne = async (collection, field, value) => {
  const query = new URLSearchParams({ [`where[${field}][equals]`]: value, limit: '1' })
  const result = await request(`/api/${collection}?${query}`, { headers: auth })
  return result.docs[0]
}

const createIfMissing = async (collection, field, value, data) => {
  const existing = await findOne(collection, field, value)
  if (existing) return existing
  const result = await request(`/api/${collection}`, { method: 'POST', headers: auth, body: JSON.stringify(data) })
  return result.doc
}

const richText = (paragraphs) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }],
      direction: 'ltr', format: '', indent: 0, textFormat: 0, textStyle: '',
    })),
    direction: 'ltr', format: '', indent: 0, version: 1,
  },
})

const richTextWithHeading = (heading, paragraphs) => ({
  root: {
    type: 'root',
    children: [
      { type: 'heading', tag: 'h1', children: [{ type: 'text', version: 1, text: heading, format: 0, detail: 0, mode: 'normal', style: '' }], direction: 'ltr', format: '', indent: 0, version: 1 },
      ...richText(paragraphs).root.children,
    ],
    direction: 'ltr', format: '', indent: 0, version: 1,
  },
})

const tenant = await createIfMissing('tenants', 'slug', 'volttrans', {
  name: 'VoltTrans Power Equipment', slug: 'volttrans', status: 'building', previewDomain: 'volttrans.localhost:3100',
  defaultLocale: 'en', enabledLocales: ['en', 'zh', 'ru', 'id'],
  branding: { companyName: 'VoltTrans Power Equipment', tagline: 'Engineered Power. Delivered Worldwide.', primaryColor: '#0B3B60', accentColor: '#F97316', heroImageURL: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=2000&q=85' },
  contact: { email: 'sales@volttrans.com' },
  seo: { titleSuffix: 'VoltTrans Power Equipment', defaultDescription: 'Industrial transformers engineered to IEC and IEEE standards for global power projects.', indexingEnabled: false },
})

await request(`/api/tenants/${tenant.id}`, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({
    status: 'building',
    previewDomain: 'volttrans.localhost:3100',
    defaultLocale: 'en',
    enabledLocales: ['en', 'zh', 'ru', 'id'],
    branding: { companyName: 'VoltTrans Power Equipment', tagline: 'Engineered Power. Delivered Worldwide.', primaryColor: '#0B3B60', accentColor: '#F97316', heroImageURL: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=2000&q=85' },
    contact: { email: 'sales@volttrans.com', whatsapp: '+1 307 555 0186', address: 'Global export sales and project engineering office' },
    seo: { titleSuffix: 'VoltTrans Power Equipment', defaultDescription: 'Industrial transformers engineered to IEC and IEEE standards for global power projects.', indexingEnabled: false },
  }),
})

for (const locale of ['en', 'zh', 'ru', 'id']) {
  await request(`/api/tenants/${tenant.id}?locale=${locale}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({
      branding: {
        companyName: 'VoltTrans Power Equipment',
        tagline: 'Engineered Power. Delivered Worldwide.',
        primaryColor: '#0B3B60',
        accentColor: '#F97316',
        heroImageURL: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=2000&q=85',
      },
    }),
  })
}

const template = await createIfMissing('templates', 'key', 'power-engineering-v1', {
  name: 'Power Engineering', key: 'power-engineering-v1', version: '1.0.0', industry: 'power-equipment', status: 'published',
  description: 'Google-first industrial B2B template for transformers and power equipment.',
  capabilities: ['products', 'blog', 'news', 'rfq', 'seo', 'multilingual'],
  visual: { heroStyle: 'industrial', cardStyle: 'bordered', navigationStyle: 'dark' },
})

await createIfMissing('templates', 'key', 'precision-light-v1', {
  name: 'Precision Light', key: 'precision-light-v1', version: '1.0.0', industry: 'power-equipment', status: 'published',
  description: 'Bright technical presentation for engineering-led B2B manufacturers and specification-driven buyers.',
  capabilities: ['products', 'blog', 'news', 'rfq', 'seo', 'multilingual'],
  visual: { heroStyle: 'technical', cardStyle: 'elevated', navigationStyle: 'light' },
})

await createIfMissing('templates', 'key', 'executive-industrial-pro-v1', {
  name: 'Executive Industrial Pro', key: 'executive-industrial-pro-v1', version: '1.0.0', industry: 'general-b2b', status: 'published',
  description: 'Premium B2B industrial template with stronger hero, tighter trust signals, product taxonomy and RFQ conversion rhythm.',
  capabilities: ['products', 'blog', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
  visual: { heroStyle: 'industrial', cardStyle: 'elevated', navigationStyle: 'dark' },
})

await request('/api/apply-template', { method: 'POST', headers: auth, body: JSON.stringify({ tenantId: tenant.id, templateId: template.id }) })

await createIfMissing('pages', 'slug', 'home', {
  tenant: tenant.id,
  title: 'VoltTrans Homepage',
  slug: 'home',
  hero: {
    type: 'lowImpact',
    richText: richTextWithHeading('Reliable Power, Engineered for Your Grid', [
      'IEC and IEEE compliant transformers with responsive engineering, documented quality and worldwide delivery.',
    ]),
    links: [
      { link: { type: 'custom', label: 'Explore Products', url: '/s/volttrans/en/products', appearance: 'default' } },
      { link: { type: 'custom', label: 'Get a Quote', url: '#contact', appearance: 'outline' } },
    ],
  },
  layout: [
    {
      blockType: 'cta',
      richText: richText(['Engineering support for export projects', 'Configure ratings, voltage, cooling, accessories and documentation with our technical team.']),
      links: [{ link: { type: 'custom', label: 'Request a quotation', url: '#contact', appearance: 'default' } }],
    },
    {
      blockType: 'content',
      columns: [
        { size: 'oneThird', richText: richText(['IEC / IEEE compliance', 'Project documentation and factory testing aligned with the applicable standard.']), enableLink: false },
        { size: 'oneThird', richText: richText(['30+ years of manufacturing', 'Engineering experience for utility, industrial and renewable-energy projects.']), enableLink: false },
        { size: 'oneThird', richText: richText(['Global delivery', 'Export packaging, technical communication and project coordination for 80+ markets.']), enableLink: false },
      ],
    },
    { blockType: 'archive', introContent: richText(['Technical insights', 'Latest transformer specification guidance and project documentation notes.']), populateBy: 'collection', relationTo: 'posts', limit: 3 },
  ],
  meta: { title: 'VoltTrans Power Equipment', description: 'Industrial transformers engineered to IEC and IEEE standards for global power projects.' },
  _status: 'published',
  publishedAt: new Date().toISOString(),
})

const oil = await createIfMissing('product-categories', 'slug', 'oil-immersed-transformers', { tenant: tenant.id, name: 'Oil-Immersed Transformers', slug: 'oil-immersed-transformers', description: 'Liquid-filled distribution and power transformers for utility and industrial applications.', sortOrder: 10 })
const dry = await createIfMissing('product-categories', 'slug', 'dry-type-transformers', { tenant: tenant.id, name: 'Dry-Type Transformers', slug: 'dry-type-transformers', description: 'Cast-resin transformers for buildings, infrastructure and industrial facilities.', sortOrder: 20 })
const compact = await createIfMissing('product-categories', 'slug', 'compact-substations', { tenant: tenant.id, name: 'Compact Substations', slug: 'compact-substations', description: 'Factory-assembled MV/LV substations for rapid site installation.', sortOrder: 30 })

const products = [
  { title: 'S13 1000 kVA Oil-Immersed Distribution Transformer', model: 'S13-M-1000/10', slug: 's13-1000-kva-oil-immersed-transformer', category: oil.id, summary: 'Three-phase hermetically sealed distribution transformer for 10 kV networks, designed to IEC 60076.', description: ['A low-loss oil-immersed distribution transformer for utility, industrial and renewable-energy projects.', 'Final ratings, tolerances and accessories are confirmed against the approved project datasheet.'], image: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1400&q=85', specs: [['Rated power', '1000 kVA'], ['HV / LV', '10 kV / 0.4 kV'], ['Impedance', '4.5%'], ['Cooling', 'ONAN'], ['Vector group', 'Dyn11'], ['Reference standard', 'IEC 60076']] },
  { title: 'SCB14 1250 kVA Cast-Resin Dry-Type Transformer', model: 'SCB14-1250/10', slug: 'scb14-1250-kva-cast-resin-transformer', category: dry.id, summary: 'Indoor cast-resin transformer for commercial buildings, data infrastructure and industrial plants.', description: ['Cast-resin windings provide a low-maintenance solution for indoor applications where fire performance and cleanliness are important.', 'Enclosure, temperature monitoring and forced-air cooling options are configured to the installation environment.'], image: 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=1400&q=85', specs: [['Rated power', '1250 kVA'], ['HV / LV', '10 kV / 0.4 kV'], ['Impedance', '6%'], ['Cooling', 'AN / AF'], ['Vector group', 'Dyn11'], ['Reference standard', 'IEC 60076-11']] },
  { title: '1600 kVA Prefabricated Compact Substation', model: 'YB-12/0.4-1600', slug: 'yb-1600-kva-compact-substation', category: compact.id, summary: 'Integrated medium-voltage, transformer and low-voltage package for industrial and renewable projects.', description: ['A factory-assembled compact substation that reduces civil work and shortens commissioning time.', 'MV switchgear, transformer, LV distribution, metering and protection are engineered as one coordinated package.'], image: 'https://images.unsplash.com/photo-1497440001374-f26997328c1b?auto=format&fit=crop&w=1400&q=85', specs: [['Transformer rating', '1600 kVA'], ['System voltage', '12 kV / 0.4 kV'], ['Frequency', '50 / 60 Hz'], ['Configuration', 'MV + Transformer + LV'], ['Enclosure', 'Outdoor prefabricated'], ['Reference standards', 'IEC 62271 / IEC 60076']] },
]

for (const product of products) {
  await createIfMissing('products', 'slug', product.slug, {
    tenant: tenant.id, title: product.title, model: product.model, slug: product.slug, category: product.category,
    summary: product.summary, description: richText(product.description), featured: true, _status: 'published',
    externalImages: [{ url: product.image, alt: product.title }],
    specifications: product.specs.map(([label, value]) => ({ label, value, group: 'Electrical data' })),
  })
}

const posts = [
  { title: 'How to Specify a Distribution Transformer for an Export Project', slug: 'how-to-specify-a-distribution-transformer', description: 'A practical checklist covering rating, voltage, impedance, vector group, losses, cooling and project documentation.' },
  { title: 'IEC 60076 Documentation Buyers Should Request', slug: 'iec-60076-transformer-documentation', description: 'Key drawings, datasheets, routine test reports and quality records for transformer procurement.' },
  { title: 'Dry-Type or Oil-Immersed: Choosing for the Installation', slug: 'dry-type-vs-oil-immersed-transformer', description: 'Compare installation environment, fire strategy, maintenance, enclosure and lifecycle considerations.' },
]

for (const post of posts) {
  await createIfMissing('posts', 'slug', post.slug, { tenant: tenant.id, title: post.title, slug: post.slug, content: richText([post.description, 'Project requirements vary. Confirm final selections against the applicable standard, site conditions and approved technical schedule.']), meta: { title: post.title, description: post.description }, _status: 'published', publishedAt: new Date().toISOString() })
}

const localizedArticle = await findOne('posts', 'slug', 'iec-60076-transformer-documentation')
const articleTranslations = {
  en: {
    title: 'IEC 60076 Documentation Buyers Should Request',
    description: 'Key drawings, datasheets, routine test reports and quality records for transformer procurement.',
    body: 'A complete procurement package should identify ratings, tolerances, accessories, drawings and the applicable IEC 60076 clauses.',
  },
  zh: {
    title: 'IEC 60076：采购方应索取的技术文件',
    description: '变压器采购应核验的图纸、数据表、例行试验报告与质量记录。',
    body: '完整的采购文件包应明确额定参数、允许偏差、附件、图纸以及适用的 IEC 60076 条款。',
  },
  ru: {
    title: 'Документы IEC 60076, которые следует запросить покупателю',
    description: 'Чертежи, технические данные, протоколы испытаний и записи качества для закупки трансформатора.',
    body: 'Комплект закупочной документации должен содержать номинальные параметры, допуски, принадлежности, чертежи и применимые положения IEC 60076.',
  },
  id: {
    title: 'Dokumen IEC 60076 yang Perlu Diminta Pembeli',
    description: 'Gambar, lembar data, laporan pengujian rutin, dan catatan mutu untuk pengadaan transformator.',
    body: 'Paket dokumen pengadaan harus mencantumkan rating, toleransi, aksesori, gambar, dan klausul IEC 60076 yang berlaku.',
  },
}

for (const [locale, translation] of Object.entries(articleTranslations)) {
  await request(`/api/posts/${localizedArticle.id}?locale=${locale}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({
      title: translation.title,
      content: richText([translation.body, translation.description]),
      meta: { title: translation.title, description: translation.description },
      _status: 'published',
    }),
  })
}

console.log(`Seed complete: ${tenant.name}, ${products.length} products, ${posts.length} insights, 4 localized article variants.`)
