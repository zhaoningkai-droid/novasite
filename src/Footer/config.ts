import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { revalidateFooter } from './hooks/revalidateFooter'
import { contentEditors } from '@/access/roles'

export const Footer: GlobalConfig = {
  slug: 'footer',
  label: '网站页脚',
  admin: {
    group: '建站与发布',
    hidden: true,
    description: '旧版全局页脚，历史数据保留；多站点页脚请使用“网站导航”。',
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
          RowLabel: '@/Footer/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateFooter],
  },
}
