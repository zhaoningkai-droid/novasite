import { APIError, type CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { contentEditors, siteAdmins } from '../access/roles'
import { assertTenantFAQCapacity } from '../platform/faq-limits'

export const FAQs: CollectionConfig = {
  slug: 'faqs',
  labels: { singular: '常见问题', plural: 'FAQ' },
  access: { create: contentEditors, delete: siteAdmins, read: anyone, update: contentEditors },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data

        const relation = (data as Record<string, unknown> | undefined)?.tenant
        const tenantID =
          relation && typeof relation === 'object' && 'id' in relation
            ? (relation as { id?: unknown }).id
            : relation

        if ((typeof tenantID !== 'number' && typeof tenantID !== 'string') || !tenantID) {
          throw new APIError('常见问题必须关联到对应公司。', 422)
        }

        const existing = await req.payload.find({
          collection: 'faqs',
          depth: 0,
          limit: 1,
          overrideAccess: true,
          req,
          where: { tenant: { equals: tenantID } },
        })
        assertTenantFAQCapacity(existing.totalDocs)
        return data
      },
    ],
  },
  admin: {
    group: '内容运营',
    useAsTitle: 'question',
    defaultColumns: ['question', 'category', 'sortOrder', 'enabled', 'updatedAt'],
  },
  fields: [
    { name: 'question', label: '问题', type: 'text', localized: true, required: true },
    { name: 'answer', label: '回答', type: 'richText', localized: true, required: true },
    { name: 'category', label: '分组', type: 'text', localized: true },
    { name: 'sortOrder', label: '排序', type: 'number', defaultValue: 0, required: true },
    { name: 'enabled', label: '前台显示', type: 'checkbox', defaultValue: true },
  ],
}
