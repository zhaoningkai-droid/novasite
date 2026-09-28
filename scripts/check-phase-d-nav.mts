import { getPayload } from 'payload'
import config from '../src/payload.config'
const payload = await getPayload({ config })
for (const locale of ['en', 'zh', 'ru', 'id'] as const) {
  const tenant = await payload.findByID({ collection: 'tenants', id: 2, locale, depth: 0, overrideAccess: true })
  console.log(locale, tenant.siteNavigation?.map((item) => item.label), tenant.fixedPages?.footer?.quickLinks?.map((item) => item.label))
}
