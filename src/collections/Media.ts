import type { CollectionConfig } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { anyone } from '../access/anyone'
import { contentEditors, siteAdmins } from '../access/roles'
import { mediaAccessControlEnabled, privateMediaHeaders } from '../platform/storage/access-mode'
import { localMediaDirectory } from '../platform/storage/local-directory'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: '媒体文件', plural: '媒体资源' },
  admin: {
    group: '素材资源',
    defaultColumns: ['filename', 'alt', 'updatedAt'],
    useAsTitle: 'filename',
  },
  folders: true,
  access: {
    create: contentEditors,
    delete: siteAdmins,
    read: anyone,
    update: contentEditors,
  },
  fields: [
    {
      name: 'alt',
      label: '图片说明',
      type: 'text',
      //required: true,
    },
    {
      name: 'caption',
      label: '图片图注',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
  ],
  upload: {
    // The controlled mode needs a separately prepared private directory. This
    // selector never moves files or falls back to public after enabling it.
    staticDir: mediaAccessControlEnabled() ? localMediaDirectory() : path.resolve(dirname, '../../public/media'),
    modifyResponseHeaders: ({ headers }) => mediaAccessControlEnabled() ? privateMediaHeaders(headers) : headers,
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/mpeg', 'video/ogg', 'video/3gpp'],
    adminThumbnail: 'thumbnail',
    focalPoint: true,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 300,
      },
      {
        name: 'square',
        width: 500,
        height: 500,
      },
      {
        name: 'small',
        width: 600,
      },
      {
        name: 'medium',
        width: 900,
      },
      {
        name: 'large',
        width: 1400,
      },
      {
        name: 'xlarge',
        width: 1920,
      },
      {
        name: 'og',
        width: 1200,
        height: 630,
        crop: 'center',
      },
    ],
  },
}
