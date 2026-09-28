import sharp from 'sharp'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { Categories } from './collections/Categories'
import { Cases } from './collections/Cases'
import { CaseCategories } from './collections/CaseCategories'
import { FAQs } from './collections/FAQs'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { AuditLogs } from './collections/AuditLogs'
import { Deployments } from './collections/Deployments'
import { Leads } from './collections/Leads'
import { News } from './collections/News'
import { NewsCategories } from './collections/NewsCategories'
import { ProductCategories } from './collections/ProductCategories'
import { Products } from './collections/Products'
import { ProductSpecifications } from './collections/ProductSpecifications'
import { Templates } from './collections/Templates'
import { Tenants } from './collections/Tenants'
import { SiteNavigation } from './collections/SiteNavigation'
import { SiteTemplateChanges } from './collections/SiteTemplateChanges'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'
import { applyTemplateEndpoint } from './endpoints/applyTemplate'
import { submitInquiryEndpoint } from './endpoints/submitInquiry'
import { createDatabaseAdapter } from './platform/adapters/database'
import { zh } from 'payload/i18n/zh'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    meta: {
      titleSuffix: ' · NovaSite 独立站运营平台',
    },
    components: {
      actions: ['@/components/Workspace/CurrentSiteIndicator#CurrentSiteIndicator'],
      beforeNav: ['@/components/NavDefaults#NavDefaults'],
      // The `BeforeLogin` component renders a message that you see while logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeLogin: ['@/components/BeforeLogin'],
      // The `BeforeDashboard` component renders the 'welcome' block that you see after logging into your admin panel.
      // Feel free to delete this at any time. Simply remove the line below.
      beforeDashboard: ['@/components/BeforeDashboard'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  endpoints: [applyTemplateEndpoint, submitInquiryEndpoint],
  db: createDatabaseAdapter(),
  collections: [
    Tenants,
    SiteNavigation,
    SiteTemplateChanges,
    Pages,
    Cases,
    CaseCategories,
    FAQs,
    Products,
    ProductSpecifications,
    ProductCategories,
    Posts,
    News,
    NewsCategories,
    Categories,
    Media,
    Leads,
    Templates,
    Deployments,
    AuditLogs,
    Users,
  ],
  cors: [getServerSideURL()].filter(Boolean),
  globals: [Header, Footer],
  localization: {
    locales: [
      { code: 'en', label: '英语' },
      { code: 'zh', label: '简体中文' },
      { code: 'ru', label: '俄语' },
      { code: 'id', label: '印尼语' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },
  i18n: {
    fallbackLanguage: 'zh',
    supportedLanguages: { zh },
  },
  plugins,
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged in users to execute this endpoint (default)
        if (req.user) return true

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
})
