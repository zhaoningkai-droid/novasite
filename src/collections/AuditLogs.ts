import type { CollectionConfig } from 'payload'

import { superAdmins } from '../access/roles'

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: '审计记录', plural: '操作审计' },
  access: { create: () => false, delete: () => false, read: superAdmins, update: () => false },
  admin: { group: '系统设置', defaultColumns: ['createdAt', 'action', 'collection', 'documentId', 'actorEmail'] },
  fields: [
    { name: 'action', label: '动作', type: 'select', required: true, options: ['create', 'update', 'delete', 'publish', 'rollback', 'login'] },
    { name: 'collection', label: '数据类型', type: 'text', required: true },
    { name: 'documentId', label: '数据 ID', type: 'text' },
    { name: 'actorEmail', label: '操作人', type: 'email' },
    { name: 'summary', label: '操作摘要', type: 'textarea' },
    { name: 'metadata', label: '上下文', type: 'json' },
  ],
}
