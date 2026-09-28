import type { CollectionConfig } from 'payload'
import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { contentEditors, siteAdmins } from '../access/roles'
import { populatePublishedAt } from '../hooks/populatePublishedAt'

export const News: CollectionConfig = {
  slug: 'news',
  labels: { singular: '新闻', plural: '新闻管理' },
  access: {
    create: contentEditors,
    delete: siteAdmins,
    read: authenticatedOrPublished,
    update: contentEditors,
  },
  admin: {
    group: '内容运营',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', '_status', 'publishedAt', 'updatedAt'],
    listSearchableFields: ['title', 'slug'],
  },
  defaultPopulate: { title: true, slug: true, summary: true, cover: true, category: true },
  fields: [
    { name: 'title', label: '新闻标题', type: 'text', localized: true, required: true },
    { name: 'slug', label: '新闻地址标识', type: 'text', required: true, index: true },
    {
      name: 'category',
      label: '新闻分类',
      type: 'relationship',
      relationTo: 'news-categories',
      required: true,
    },
    { name: 'summary', label: '新闻摘要', type: 'textarea', localized: true, required: true },
    {
      name: 'content',
      label: '新闻正文',
      type: 'richText',
      localized: true,
      required: true,
      editor: lexicalEditor({
        features: ({ rootFeatures }) => [
          ...rootFeatures,
          HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
    },
    { name: 'cover', label: '新闻封面', type: 'upload', relationTo: 'media' },
    { name: 'featured', label: '首页推荐', type: 'checkbox', defaultValue: false },
    { name: 'sortOrder', label: '新闻排序', type: 'number', defaultValue: 0, index: true },
    {
      name: 'meta',
      label: '搜索引擎优化',
      type: 'group',
      fields: [
        { name: 'title', label: 'SEO 标题', type: 'text', localized: true },
        { name: 'description', label: 'SEO 描述', type: 'textarea', localized: true },
      ],
    },
    { name: 'publishedAt', label: '发布时间', type: 'date', admin: { position: 'sidebar' } },
  ],
  hooks: { beforeChange: [populatePublishedAt] },
  versions: { drafts: { autosave: { interval: 800 }, schedulePublish: true }, maxPerDoc: 50 },
}
