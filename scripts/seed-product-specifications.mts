import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const locales = ['en', 'zh', 'ru', 'id'] as const

const labels = {
  en: ['Product standard', 'Material', 'Strength grade', 'Thread range', 'Surface finish', 'Supply option'],
  zh: ['执行标准', '材质', '强度等级', '螺纹范围', '表面处理', '供货方式'],
  ru: ['Стандарт', 'Материал', 'Класс прочности', 'Диапазон резьбы', 'Покрытие', 'Вариант поставки'],
  id: ['Standar produk', 'Material', 'Kelas kekuatan', 'Rentang ulir', 'Lapisan', 'Opsi pasokan'],
} as const

const valuesFor = (locale: (typeof locales)[number], model: string) => {
  const generic = {
    en: ['DIN / ISO / drawing', 'Carbon steel / alloy steel', '4.8–12.9', 'M3–M36', 'Zinc / zinc flake / black oxide', 'Bulk / box / project kit'],
    zh: ['DIN / ISO / 图纸要求', '碳钢 / 合金钢', '4.8–12.9 级', 'M3–M36', '镀锌 / 锌铝涂层 / 发黑', '散装 / 盒装 / 项目套装'],
    ru: ['DIN / ISO / чертёж', 'Углеродистая / легированная сталь', '4.8–12.9', 'M3–M36', 'Цинк / цинк-ламель / оксидирование', 'Навалом / коробка / комплект'],
    id: ['DIN / ISO / gambar', 'Baja karbon / baja paduan', '4.8–12.9', 'M3–M36', 'Seng / zinc flake / black oxide', 'Curah / kotak / kit proyek'],
  } as const
  const stainless = {
    en: ['DIN / ISO', 'Stainless steel A2 / A4', 'A2-70 / A4-80', 'M3–M20', 'Plain / passivated', 'Bulk / small box / kit'],
    zh: ['DIN / ISO', '不锈钢 A2 / A4', 'A2-70 / A4-80', 'M3–M20', '本色 / 钝化', '散装 / 小盒 / 套装'],
    ru: ['DIN / ISO', 'Нержавеющая сталь A2 / A4', 'A2-70 / A4-80', 'M3–M20', 'Без покрытия / пассивация', 'Навалом / малая коробка / комплект'],
    id: ['DIN / ISO', 'Stainless steel A2 / A4', 'A2-70 / A4-80', 'M3–M20', 'Polos / pasivasi', 'Curah / kotak kecil / kit'],
  } as const
  const highStrength = {
    en: ['DIN / ISO', 'Alloy steel', '8.8 / 10.9 / 12.9', 'M8–M30', 'Zinc / zinc flake / black oxide', 'Matched bolt, nut and washer'],
    zh: ['DIN / ISO', '合金钢', '8.8 / 10.9 / 12.9 级', 'M8–M30', '镀锌 / 锌铝涂层 / 发黑', '配套螺栓、螺母与垫圈'],
    ru: ['DIN / ISO', 'Легированная сталь', '8.8 / 10.9 / 12.9', 'M8–M30', 'Цинк / цинк-ламель / оксидирование', 'Болт, гайка и шайба комплектом'],
    id: ['DIN / ISO', 'Baja paduan', '8.8 / 10.9 / 12.9', 'M8–M30', 'Seng / zinc flake / black oxide', 'Baut, mur, dan ring yang sesuai'],
  } as const
  if (model.startsWith('A2-70')) return stainless[locale]
  if (model.startsWith('10.9')) return highStrength[locale]
  return generic[locale]
}

for (const tenant of [1, 2]) {
  const products = await payload.find({ collection: 'products', depth: 0, limit: 100, overrideAccess: true, where: { tenant: { equals: tenant } } })
  for (const product of products.docs) {
    for (const localeCode of locales) {
      const found = await payload.find({
        collection: 'product-specifications',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: { and: [{ tenant: { equals: tenant } }, { product: { equals: product.id } }, { localeCode: { equals: localeCode } }] },
      })
      const data = {
        tenant,
        product: product.id,
        localeCode,
        title: `${product.model} · ${localeCode.toUpperCase()} 技术参数`,
        items: labels[localeCode].map((label, index) => ({ label, value: valuesFor(localeCode, product.model)[index] })),
      }
      if (found.docs[0]) await payload.update({ collection: 'product-specifications', id: found.docs[0].id, depth: 0, overrideAccess: true, data: data as never })
      else await payload.create({ collection: 'product-specifications', depth: 0, overrideAccess: true, data: data as never })
    }
  }
}

console.log('已为两个客户站的全部产品写入四语言技术参数。')
