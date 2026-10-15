import type { CollectionConfig } from 'payload'

import { contentEditors, siteAdmins } from '../access/roles'
import { navigationPresentationFields, navigationURLField, prepareNavigationItems } from '../platform/navigation-fields'
import { localeOptions } from '../platform/site-locales'

export const SiteNavigation: CollectionConfig = {
  slug: 'site-navigation',
  labels: { singular: '网站导航', plural: '网站导航' },
  access: { create: contentEditors, delete: siteAdmins, read: contentEditors, update: contentEditors },
  admin: { group: '建站与发布', useAsTitle: 'title', defaultColumns: ['title', 'localeCode', 'updatedAt'] },
  hooks: { beforeChange: [prepareNavigationItems] },
  fields: [
    { name: 'title', label: '导航方案名称', type: 'text', required: true, defaultValue: '主导航' },
    { name: 'localeCode', label: '适用语言', type: 'select', required: true, options: localeOptions.map(({ code, label }) => ({ label, value: code })) },
    { name: 'footerIntro', label: '页脚公司简介', type: 'textarea' },
    { name: 'items', label: '顶部菜单', type: 'array', fields: [...navigationPresentationFields, { name: 'label', label: '菜单名称', type: 'text', required: true }, { name: 'href', label: '链接地址（选填）', ...navigationURLField }, { name: 'children', label: '二级菜单', type: 'array', fields: [{ name: 'label', label: '二级菜单名称', type: 'text', required: true }, { name: 'href', label: '二级菜单链接（选填）', ...navigationURLField }] }] },
    { name: 'quickLinks', label: '页脚快速导航', type: 'array', fields: [{ name: 'label', label: '链接名称', type: 'text', required: true }, { name: 'href', label: '链接地址（选填）', ...navigationURLField }] },
  ],
}
