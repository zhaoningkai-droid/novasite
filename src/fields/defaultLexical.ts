import type { TextFieldSingleValidation } from 'payload'
import {
  AlignFeature,
  BoldFeature,
  EXPERIMENTAL_TableFeature,
  FixedToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  TextStateFeature,
  UnderlineFeature,
  UnorderedListFeature,
  UploadFeature,
  lexicalEditor,
  type LinkFields,
} from '@payloadcms/richtext-lexical'

export const defaultLexical = lexicalEditor({
  features: [
    ParagraphFeature(),
    FixedToolbarFeature(),
    UnderlineFeature(),
    BoldFeature(),
    ItalicFeature(),
    StrikethroughFeature(),
    AlignFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    EXPERIMENTAL_TableFeature(),
    UploadFeature({ collections: { media: { fields: [] } } }),
    TextStateFeature({
      state: {
        color: {
          blue: { css: { color: '#2563eb' }, label: '蓝色' },
          green: { css: { color: '#059669' }, label: '绿色' },
          orange: { css: { color: '#ea580c' }, label: '橙色' },
          red: { css: { color: '#dc2626' }, label: '红色' },
        },
        fontSize: {
          small: { css: { 'font-size': '14px' }, label: '小号' },
          normal: { css: { 'font-size': '16px' }, label: '正文' },
          large: { css: { 'font-size': '20px' }, label: '大号' },
        },
      },
    }),
    LinkFeature({
      enabledCollections: ['pages', 'posts'],
      fields: ({ defaultFields }) => {
        const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
          if ('name' in field && field.name === 'url') return false
          return true
        })

        return [
          ...defaultFieldsWithoutUrl,
          {
            name: 'url',
            type: 'text',
            admin: {
              condition: (_data, siblingData) => siblingData?.linkType !== 'internal',
            },
            label: ({ t }) => t('fields:enterURL'),
            required: true,
            validate: ((value, options) => {
              if ((options?.siblingData as LinkFields)?.linkType === 'internal') {
                return true // no validation needed, as no url should exist for internal links
              }
              return value ? true : 'URL is required'
            }) as TextFieldSingleValidation,
          },
        ]
      },
    }),
  ],
})
