import type { CollectionConfig } from 'payload'

import { contentEditors, siteAdmins } from '../access/roles'
import { localeOptions } from '../platform/site-locales'
import { guardSpecificationTranslationChange, guardSpecificationTranslationDelete } from '../platform/product-translation/jobs'

export const ProductSpecifications: CollectionConfig = {
  slug: 'product-specifications',
  labels: { singular: '产品技术参数', plural: '产品技术参数' },
  access: {
    create: contentEditors,
    delete: siteAdmins,
    read: contentEditors,
    update: contentEditors,
  },
  hooks: { beforeChange: [guardSpecificationTranslationChange], beforeDelete: [guardSpecificationTranslationDelete] },
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
      options: localeOptions.map(({ code, label }) => ({ label, value: code })),
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
