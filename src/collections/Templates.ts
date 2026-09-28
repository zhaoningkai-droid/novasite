import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { superAdmins } from '../access/roles'

export const Templates: CollectionConfig = {
  slug: 'templates',
  labels: { singular: '网站模板', plural: '模板中心' },
  access: { create: superAdmins, delete: superAdmins, read: authenticated, update: superAdmins },
  admin: { group: '建站与发布', useAsTitle: 'name', defaultColumns: ['name', 'industry', 'version', 'status'] },
  fields: [
    { name: 'name', label: '模板名称', type: 'text', required: true },
    { name: 'key', label: '模板标识', type: 'text', required: true, unique: true },
    { name: 'version', label: '版本', type: 'text', defaultValue: '1.0.0', required: true },
    { name: 'schemaVersion', label: '设置结构版本', type: 'number', defaultValue: 1, required: true },
    { name: 'referenceCode', label: '参考编号', type: 'text', index: true },
    { name: 'referenceURL', label: '参考地址', type: 'text' },
    {
      name: 'industry', label: '行业', type: 'select', required: true,
      options: [
        { label: '室内家居', value: 'home-interior' },
        { label: '电力设备', value: 'power-equipment' },
        { label: '汽配五金', value: 'auto-parts' },
        { label: '机械设备', value: 'machinery' },
        { label: '新能源', value: 'renewable-energy' },
        { label: '通用 B2B', value: 'general-b2b' },
      ],
    },
    { name: 'thumbnail', label: '模板封面', type: 'upload', relationTo: 'media' },
    { name: 'description', label: '模板说明', type: 'textarea' },
    {
      name: 'visual',
      label: '视觉方案',
      type: 'group',
      fields: [
        { name: 'heroStyle', label: 'Hero 风格', type: 'select', defaultValue: 'industrial', options: ['industrial', 'technical', 'minimal'] },
        { name: 'cardStyle', label: '卡片风格', type: 'select', defaultValue: 'bordered', options: ['bordered', 'elevated', 'flat'] },
        { name: 'navigationStyle', label: '导航风格', type: 'select', defaultValue: 'dark', options: ['dark', 'light', 'transparent'] },
      ],
    },
    { name: 'status', label: '状态', type: 'select', defaultValue: 'published', options: ['draft', 'published', 'deprecated'] },
    {
      name: 'capabilities', label: '包含能力', type: 'select', hasMany: true,
      defaultValue: ['products', 'blog', 'news', 'rfq', 'seo'],
      options: ['products', 'blog', 'news', 'cases', 'rfq', 'seo', 'multilingual'],
    },
  ],
}
