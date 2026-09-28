import type { CollectionConfig } from 'payload'

import { contentEditors, siteAdmins } from '../access/roles'

export const ProductSpecifications: CollectionConfig = {
  slug: 'product-specifications',
  labels: { singular: '产品技术参数', plural: '产品技术参数' },
  access: {
    create: contentEditors,
    delete: siteAdmins,
    read: contentEditors,
    update: contentEditors,
  },
  admin: {
    group: '产品中心',
    useAsTitle: 'title',
    defaultColumns: ['title', 'product', 'localeCode', 'updatedAt'],
    listSearchableFields: ['title'],
  },
  fields: [
    { name: 'title', label: '参数方案名称', type: 'text', required: true },
    { name: 'product', label: '关联产品', type: 'relationship', relationTo: 'products', required: true, index: true },
    {
      name: 'localeCode',
      label: '适用语言',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: '英语', value: 'en' },
        { label: '简体中文', value: 'zh' },
        { label: '俄语', value: 'ru' },
        { label: '印尼语', value: 'id' },
      ],
    },
    {
      name: 'items',
      label: '参数明细',
      type: 'array',
      minRows: 1,
      fields: [
        { name: 'label', label: '参数名称', type: 'text', required: true },
        { name: 'value', label: '参数值', type: 'text', required: true },
        { name: 'group', label: '参数分组', type: 'text' },
      ],
    },
  ],
}
