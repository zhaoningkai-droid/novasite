import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { Plugin } from 'payload'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'

import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'
import { createStoragePlugin } from '@/platform/adapters/storage'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Website Template` : 'Payload Website Template'
}

const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()

  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  createStoragePlugin(),
  multiTenantPlugin({
    tenantsSlug: 'tenants',
    tenantSelectorLabel: '切换当前工作站点',
    useTenantsListFilter: true,
    collections: {
      pages: {},
      cases: {},
      'case-categories': {},
      faqs: {},
      products: {},
      'product-specifications': {},
      'product-categories': {},
      posts: {},
      news: {},
      'news-categories': {},
      categories: {},
      media: {},
      leads: {},
      deployments: {},
      'site-navigation': {},
      'site-template-changes': {},
    },
    tenantsArrayField: {
      includeDefaultField: true,
    },
    userHasAccessToAllTenants: (user) =>
      Array.isArray(user?.roles) && user.roles.includes('super-admin'),
  }),
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      labels: { singular: '重定向规则', plural: '重定向' },
      admin: { group: '系统设置', useAsTitle: 'from' },
      // @ts-expect-error - This is a valid override, mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description: 'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
    generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  searchPlugin({
    collections: ['posts'],
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      labels: { singular: '搜索索引', plural: '搜索结果' },
      admin: { group: '系统设置', useAsTitle: 'title' },
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
    },
  }),
]
