import type { CollectionConfig } from 'payload'

import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { contentEditors, siteAdmins } from '../access/roles'
import { populatePublishedAt } from '../hooks/populatePublishedAt'

export const requiredUnlessLegacyBaseEdit = (label: string) => (value: unknown, { req }: { req: { context?: { workspaceBaseEdit?: boolean } } }) => {
  if (req.context?.workspaceBaseEdit) return true
  return typeof value === 'string' && value.trim() ? true : `请输入${label}。`
}

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: '产品', plural: '产品管理' },
  access: { create: contentEditors, delete: siteAdmins, read: authenticatedOrPublished, update: contentEditors },
  admin: {
    group: '产品中心',
    useAsTitle: 'title',
    listSearchableFields: ['title', 'model', 'slug'],
    defaultColumns: ['title', 'model', 'category', '_status', 'updatedAt'],
  },
  defaultPopulate: { title: true, model: true, slug: true, gallery: true, summary: true },
  fields: [
    { name: 'title', label: '产品名称', type: 'text', localized: true, required: true },
    { name: 'model', label: '产品型号（旧版）', type: 'text', index: true, admin: { description: '历史字段保留；当前内容管理不再要求填写。' } },
    { name: 'slug', label: 'SEO Slug', type: 'text', required: true, index: true },
    { name: 'category', label: '产品分类', type: 'relationship', relationTo: 'product-categories', required: true },
    { name: 'summary', label: '列表摘要', type: 'textarea', localized: true },
    { name: 'description', label: '产品详情', type: 'richText', localized: true, required: true },
    { name: 'detailHTML', label: '产品详情排版内容', type: 'textarea', localized: true, admin: { hidden: true } },
    { name: 'keywords', label: 'SEO关键词', type: 'text', localized: true },
    {
      name: 'tags',
      label: '产品标签',
      type: 'array',
      admin: { description: '至少添加一个标签；标签可由编辑者直接新建。' },
      fields: [{ name: 'label', label: '标签名称', type: 'text', localized: true, required: true }],
    },
    { name: 'sortOrder', label: '产品排序', type: 'number', defaultValue: 0, index: true },
    { name: 'gallery', label: '产品图库', type: 'upload', relationTo: 'media', hasMany: true, maxRows: 5, admin: { description: '最多 5 张；建议使用 800×800、单张不超过 500KB 的图片。' } },
    {
      name: 'externalImages',
      label: '外部图片 URL',
      type: 'array',
      admin: { description: '支持 Unsplash 等公开 HTTPS 图片，用于种子数据和快速建站。' },
      fields: [
        { name: 'url', label: '图片 URL', type: 'text', required: true },
        { name: 'alt', label: '替代文本', type: 'text', localized: true, validate: requiredUnlessLegacyBaseEdit('替代文本') },
      ],
    },
    {
      name: 'specifications',
      label: '技术参数（旧版）',
      type: 'array',
      admin: {
        hidden: true,
        description: '历史数据保留。请使用“产品技术参数”维护各语言参数。',
      },
      fields: [
        { name: 'label', label: '参数名', type: 'text', localized: true, validate: requiredUnlessLegacyBaseEdit('参数名') },
        { name: 'value', label: '参数值', type: 'text', localized: true, validate: requiredUnlessLegacyBaseEdit('参数值') },
        { name: 'group', label: '参数分组', type: 'text', localized: true },
      ],
    },
    { name: 'datasheet', label: '规格书 PDF', type: 'upload', relationTo: 'media' },
    { name: 'featured', label: '首页推荐', type: 'checkbox', defaultValue: false },
    { name: 'publishedAt', label: '发布时间', type: 'date', admin: { position: 'sidebar' } },
  ],
  hooks: { beforeChange: [populatePublishedAt] },
  versions: { drafts: { autosave: { interval: 800 }, schedulePublish: true }, maxPerDoc: 100 },
}
