import type { CollectionConfig } from 'payload'

import { salesUsers, siteAdmins } from '../access/roles'

export const Leads: CollectionConfig = {
  slug: 'leads',
  labels: { singular: '询盘', plural: '询盘收件箱' },
  access: { create: salesUsers, delete: siteAdmins, read: salesUsers, update: salesUsers },
  admin: {
    group: '客户与询盘',
    useAsTitle: 'email',
    defaultColumns: ['createdAt', 'name', 'company', 'country', 'status'],
    listSearchableFields: ['name', 'company', 'email', 'country'],
  },
  fields: [
    { name: 'name', label: '姓名', type: 'text', required: true },
    { name: 'company', label: '公司', type: 'text' },
    { name: 'email', label: '企业邮箱', type: 'email', required: true },
    { name: 'phone', label: 'WhatsApp / 电话', type: 'text' },
    { name: 'country', label: '国家', type: 'text' },
    { name: 'product', label: '意向产品', type: 'relationship', relationTo: 'products' },
    { name: 'capacity', label: '容量 kVA', type: 'text' },
    { name: 'message', label: '询盘内容', type: 'textarea', required: true },
    { name: 'sourcePage', label: '来源页面', type: 'text' },
    { name: 'utmSource', label: 'UTM Source', type: 'text' },
    { name: 'utmCampaign', label: 'UTM Campaign', type: 'text' },
    {
      name: 'status', label: '跟进状态', type: 'select', defaultValue: 'new', required: true,
      options: [
        { label: '新询盘', value: 'new' }, { label: '跟进中', value: 'contacted' },
        { label: '已报价', value: 'quoted' }, { label: '已成交', value: 'won' }, { label: '无效', value: 'invalid' },
      ],
    },
    {
      name: 'internalNotes',
      label: '内部备注',
      type: 'textarea',
      access: {
        create: ({ req }) => Boolean(req.user),
        read: ({ req }) => Boolean(req.user),
        update: ({ req }) => Boolean(req.user),
      },
    },
  ],
}
