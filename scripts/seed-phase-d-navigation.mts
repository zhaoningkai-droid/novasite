import { getPayload } from 'payload'
import config from '../src/payload.config'

const payload = await getPayload({ config })
const data = {
  en: { items: [['Home', '/'], ['Products', '/products', [['Standard Fasteners', '/products'], ['Custom Fasteners', '/products']]], ['News', '/news', [['Company News', '/news'], ['Quality & Delivery', '/news']]], ['Cases', '/cases'], ['Blog', '/blog'], ['About', '/about'], ['Contact', '/contact']], footer: 'Industrial fastener manufacturing, customization and export supply.', quick: [['Products', '/products'], ['News', '/news'], ['Contact', '/contact']] },
  zh: { items: [['首页', '/'], ['产品中心', '/products', [['标准紧固件', '/products'], ['非标定制', '/products']]], ['新闻资讯', '/news', [['企业动态', '/news'], ['质量与交付', '/news']]], ['案例中心', '/cases'], ['技术博客', '/blog'], ['关于我们', '/about'], ['联系我们', '/contact']], footer: '专注工业紧固件制造、定制与出口供货。', quick: [['产品中心', '/products'], ['新闻资讯', '/news'], ['联系我们', '/contact']] },
  ru: { items: [['Главная', '/'], ['Продукция', '/products'], ['Новости', '/news'], ['Проекты', '/cases'], ['Блог', '/blog'], ['О компании', '/about'], ['Контакты', '/contact']], footer: 'Производство, изготовление на заказ и экспортные поставки промышленного крепежа.', quick: [['Продукция', '/products'], ['Новости', '/news'], ['Контакты', '/contact']] },
  id: { items: [['Beranda', '/'], ['Produk', '/products'], ['Berita', '/news'], ['Studi Kasus', '/cases'], ['Blog', '/blog'], ['Tentang Kami', '/about'], ['Kontak', '/contact']], footer: 'Manufaktur, kustomisasi, dan pasokan ekspor fastener industri.', quick: [['Produk', '/products'], ['Berita', '/news'], ['Kontak', '/contact']] },
} as const

for (const tenant of [1, 2]) for (const [localeCode, value] of Object.entries(data)) {
  const found = await payload.find({ collection: 'site-navigation', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ tenant: { equals: tenant } }, { localeCode: { equals: localeCode } }] } })
  const doc = { title: `${localeCode.toUpperCase()} 主导航`, localeCode, footerIntro: value.footer, items: value.items.map(([label, href, children]) => ({ label, href, children: children?.map(([childLabel, childHref]) => ({ label: childLabel, href: childHref })) || [] })), quickLinks: value.quick.map(([label, href]) => ({ label, href })) }
  if (found.docs[0]) await payload.update({ collection: 'site-navigation', id: found.docs[0].id, depth: 0, overrideAccess: true, data: doc as never })
  else await payload.create({ collection: 'site-navigation', depth: 0, overrideAccess: true, data: { tenant, ...doc } as never })
}
console.log('阶段 D 四语言导航与页脚方案已写入。')
