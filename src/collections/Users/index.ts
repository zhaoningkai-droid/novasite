import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { selfOrSuperAdmin, superAdminField, superAdmins } from '../../access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: '用户', plural: '用户与权限' },
  access: {
    admin: authenticated,
    create: superAdmins,
    delete: superAdmins,
    read: selfOrSuperAdmin,
    unlock: superAdmins,
    update: selfOrSuperAdmin,
  },
  admin: {
    group: '系统设置',
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'roles',
      label: '角色',
      type: 'select',
      hasMany: true,
      // New accounts are safe by default. Elevated permissions are granted only
      // by a platform administrator after a company has been assigned.
      defaultValue: ['viewer'],
      saveToJWT: true,
      access: {
        create: superAdminField,
        update: superAdminField,
      },
      options: [
        { label: '平台管理员', value: 'super-admin' },
        { label: '站点管理员', value: 'site-admin' },
        { label: '内容编辑', value: 'editor' },
        { label: '销售人员', value: 'sales' },
        { label: '只读查看', value: 'viewer' },
      ],
    },
    {
      name: 'expiresAt',
      label: '账号失效时间',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description: '留空表示长期有效。到期后账号将无法继续登录或访问工作台。',
      },
      access: {
        create: superAdminField,
        update: superAdminField,
      },
    },
  ],
  timestamps: true,
}
