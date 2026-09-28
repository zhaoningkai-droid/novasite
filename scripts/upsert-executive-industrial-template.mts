import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })

const template = {
  capabilities: ['products', 'blog', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
  description:
    '高级外贸 B2B 工业官网模板：强首屏、资质背书、产品分类、案例信任、新闻内容和询盘转化完整串联。',
  industry: 'general-b2b' as const,
  key: 'executive-industrial-pro-v1',
  name: 'Executive Industrial Pro',
  status: 'published' as const,
  version: '1.0.0',
  visual: { cardStyle: 'elevated' as const, heroStyle: 'industrial' as const, navigationStyle: 'dark' as const },
}

const existing = await payload.find({
  collection: 'templates',
  depth: 0,
  limit: 1,
  overrideAccess: true,
  where: { key: { equals: template.key } },
})

if (existing.docs[0]) {
  await payload.update({
    collection: 'templates',
    data: template,
    id: existing.docs[0].id,
    overrideAccess: true,
  })
  console.log(`已更新模板：${template.name}`)
} else {
  await payload.create({
    collection: 'templates',
    data: template,
    overrideAccess: true,
  })
  console.log(`已创建模板：${template.name}`)
}
