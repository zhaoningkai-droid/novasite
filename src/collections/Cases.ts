import type { CollectionConfig } from 'payload'

import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { contentEditors, siteAdmins } from '../access/roles'
import { populatePublishedAt } from '../hooks/populatePublishedAt'

export const Cases: CollectionConfig = {
  slug: 'cases',
  labels: { singular: '项目案例', plural: '案例' },
  access: { create: contentEditors, delete: siteAdmins, read: authenticatedOrPublished, update: contentEditors },
  admin: {
    group: '内容运营',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'country', 'industry', '_status', 'updatedAt'],
    listSearchableFields: ['title', 'slug', 'country'],
  },
  fields: [
    { name: 'title', label: '案例名称', type: 'text', localized: true, required: true },
    { name: 'slug', label: 'SEO Slug', type: 'text', required: true, unique: true, index: true },
    { name: 'category', label: '案例分类', type: 'relationship', relationTo: 'case-categories', required: true },
    { name: 'summary', label: '案例摘要', type: 'textarea', localized: true, required: true },
    { name: 'content', label: '案例详情', type: 'richText', localized: true, required: true },
    { name: 'country', label: '项目国家', type: 'text' },
    { name: 'industry', label: '应用行业', type: 'text', localized: true },
    { name: 'products', label: '相关产品', type: 'relationship', relationTo: 'products', hasMany: true },
    { name: 'cover', label: '案例封面', type: 'upload', relationTo: 'media' },
    { name: 'featured', label: '首页推荐', type: 'checkbox', defaultValue: false },
    { name: 'sortOrder', label: '案例排序', type: 'number', defaultValue: 0, index: true },
    { name: 'publishedAt', label: '发布时间', type: 'date', admin: { position: 'sidebar' } },
  ],
  hooks: { beforeChange: [populatePublishedAt] },
  versions: { drafts: { autosave: { interval: 800 }, schedulePublish: true }, maxPerDoc: 50 },
}
