import { getPayload } from 'payload'
import config from '../src/payload.config'

// Local template installation only; does not change any tenant's selected template or content.
const payload = await getPayload({ config })
const key = 'atelier-industry-v1'
const existing = await payload.find({ collection: 'templates', where: { key: { equals: key } }, limit: 1 })
if (!existing.docs.length) {
  const doc = await payload.create({ collection: 'templates', data: {
    key, name: 'Atelier · 工业画册', version: '1.0.0', status: 'published',
    industry: 'general-b2b',
    description: '暖白画册风格：宽幅轮播、错落企业图文、横向分类目录、产品画廊与编辑式新闻。内容读取现有后台。',
    capabilities: ['products', 'blog', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
    visual: { cardStyle: 'elevated', heroStyle: 'industrial', navigationStyle: 'dark' },
  } })
  console.log(`Registered ${doc.name} (${doc.id})`)
} else console.log(`Already registered (${existing.docs[0].id})`)
await payload.destroy()
