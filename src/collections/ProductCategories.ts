import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { contentEditors, siteAdmins } from '../access/roles'

export const ProductCategories: CollectionConfig = {
  slug: 'product-categories',
  labels: { singular: '产品分类', plural: '产品分类' },
  access: { create: contentEditors, delete: siteAdmins, read: anyone, update: contentEditors },
  admin: { group: '产品中心', useAsTitle: 'name', defaultColumns: ['name', 'slug', 'sortOrder'] },
  fields: [
    { name: 'name', label: '分类名称', type: 'text', localized: true, required: true },
    { name: 'slug', label: 'SEO Slug', type: 'text', required: true, index: true },
    { name: 'description', label: '分类描述', type: 'textarea', localized: true },
    { name: 'parent', label: '上级分类', type: 'relationship', relationTo: 'product-categories' },
    { name: 'cover', label: '分类封面', type: 'upload', relationTo: 'media' },
    { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0 },
  ],
}
