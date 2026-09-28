import type { CollectionConfig } from 'payload'

import { siteAdmins } from '../access/roles'

export const Deployments: CollectionConfig = {
  slug: 'deployments',
  labels: { singular: '发布记录', plural: '发布中心' },
  access: { create: siteAdmins, delete: siteAdmins, read: siteAdmins, update: siteAdmins },
  admin: { group: '建站与发布', useAsTitle: 'releaseName', defaultColumns: ['releaseName', 'environment', 'status', 'createdAt'] },
  fields: [
    { name: 'releaseName', label: '发布名称', type: 'text', required: true },
    { name: 'environment', label: '环境', type: 'select', defaultValue: 'preview', options: ['preview', 'production'] },
    { name: 'status', label: '状态', type: 'select', defaultValue: 'queued', options: ['queued', 'building', 'success', 'failed', 'rolled-back'] },
    { name: 'url', label: '访问地址', type: 'text' },
    { name: 'commitSha', label: '版本标识', type: 'text' },
    { name: 'startedAt', label: '开始时间', type: 'date' },
    { name: 'finishedAt', label: '完成时间', type: 'date' },
    { name: 'log', label: '构建日志', type: 'textarea' },
  ],
}
