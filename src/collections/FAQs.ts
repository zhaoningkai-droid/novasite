import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { contentEditors, siteAdmins } from '../access/roles'

export const FAQs: CollectionConfig = {
  slug: 'faqs',
  labels: { singular: '常见问题', plural: 'FAQ' },
  access: { create: contentEditors, delete: siteAdmins, read: anyone, update: contentEditors },
  admin: { group: '内容运营', useAsTitle: 'question', defaultColumns: ['question', 'category', 'sortOrder', 'enabled', 'updatedAt'] },
  fields: [
    { name: 'question', label: '问题', type: 'text', localized: true, required: true },
    { name: 'answer', label: '回答', type: 'richText', localized: true, required: true },
    { name: 'category', label: '分组', type: 'text', localized: true },
    { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0, required: true },
    { name: 'enabled', label: '前台显示', type: 'checkbox', defaultValue: true },
  ],
}
