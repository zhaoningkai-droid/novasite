import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { contentEditors, siteAdmins } from '../access/roles'

export const NewsCategories: CollectionConfig = {
  slug: 'news-categories',
  labels: { singular: '新闻分类', plural: '新闻分类' },
  access: { create: contentEditors, delete: siteAdmins, read: anyone, update: contentEditors },
  admin: {
    group: '内容运营',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'sortOrder', 'updatedAt'],
    listSearchableFields: ['name', 'slug'],
  },
  fields: [
    { name: 'name', label: '分类名称', type: 'text', localized: true, required: true },
    { name: 'slug', label: '分类地址标识', type: 'text', required: true, index: true },
    { name: 'description', label: '分类说明', type: 'textarea', localized: true },
    { name: 'parent', label: '上级分类', type: 'relationship', relationTo: 'news-categories' },
    { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0, required: true },
  ],
}
