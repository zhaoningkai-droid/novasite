import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { revalidateHeader } from './hooks/revalidateHeader'
import { contentEditors } from '@/access/roles'

export const Header: GlobalConfig = {
  slug: 'header',
  label: '网站导航',
  admin: {
    group: '建站与发布',
    hidden: true,
    description: '旧版全局导航，历史数据保留；多站点导航请使用“网站导航”。',
  },
  access: {
    read: () => true,
    update: contentEditors,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@/Header/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateHeader],
  },
}
