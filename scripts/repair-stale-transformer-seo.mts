import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const locales = ['en', 'zh', 'ru', 'id'] as const
const collections = ['posts', 'news'] as const
let repaired = 0

for (const collection of collections) {
  for (const locale of locales) {
    const result = await payload.find({ collection, locale, depth: 0, limit: 100, overrideAccess: true })
    for (const doc of result.docs) {
      const title = doc.meta?.title
      if (!title || !/transformer|变压器|трансформатор/i.test(title)) continue
      await payload.update({
        collection,
        id: doc.id,
        locale,
        depth: 0,
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: { meta: { ...doc.meta, title: doc.title } } as never,
      })
      repaired += 1
    }
  }
}

console.log(`已修复 ${repaired} 条遗留变压器 SEO 标题。`)
