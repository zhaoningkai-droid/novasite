import type { CollectionConfig } from 'payload'

import { siteAdmins } from '../access/roles'

export const SiteTemplateChanges: CollectionConfig = {
  slug: 'site-template-changes',
  labels: { singular: '模板变更记录', plural: '模板变更记录' },
  access: { create: () => false, delete: () => false, read: siteAdmins, update: () => false },
  admin: {
    group: '建站与发布',
    useAsTitle: 'idempotencyKey',
    defaultColumns: ['tenant', 'operation', 'fromRevision', 'toRevision', 'actorEmail', 'createdAt'],
  },
  fields: [
    { name: 'operation', label: '操作', type: 'select', required: true, options: ['apply', 'rollback'] },
    { name: 'fromTemplate', label: '切换前模板', type: 'relationship', relationTo: 'templates' },
    { name: 'toTemplate', label: '切换后模板', type: 'relationship', relationTo: 'templates' },
    { name: 'fromVersion', label: '切换前版本', type: 'text' },
    { name: 'toVersion', label: '切换后版本', type: 'text' },
    { name: 'fromRevision', label: '原修订号', type: 'number', required: true },
    { name: 'toRevision', label: '新修订号', type: 'number', required: true },
    { name: 'beforeSettings', label: '切换前展示设置', type: 'json', required: true },
    { name: 'afterSettings', label: '切换后展示设置', type: 'json', required: true },
    { name: 'revertsChange', label: '恢复自记录', type: 'relationship', relationTo: 'site-template-changes' },
    { name: 'actor', label: '操作人', type: 'relationship', relationTo: 'users', required: true },
    { name: 'actorEmail', label: '操作人邮箱', type: 'email' },
    { name: 'idempotencyKey', label: '请求编号', type: 'text', required: true, unique: true },
    { name: 'requestHash', label: '请求校验值', type: 'text', required: true },
  ],
}
