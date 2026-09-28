import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { contentEditors, siteAdmins } from '../access/roles'
import { slugField } from 'payload'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: '博客分类', plural: '博客分类' },
  access: {
    create: contentEditors,
    delete: siteAdmins,
    read: anyone,
    update: contentEditors,
  },
  admin: {
    group: '内容运营',
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
      required: true,
    },
    { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0, required: true },
    slugField({
      position: undefined,
    }),
  ],
}
