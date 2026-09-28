import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })
const site = await payload.findByID({ collection: 'tenants', id: 2, locale: 'zh', depth: 0, overrideAccess: true })
await payload.update({
  collection: 'tenants', id: 2, locale: 'zh', depth: 0, overrideAccess: true,
  data: {
    fixedPages: {
      ...site.fixedPages,
      homepage: { ...site.fixedPages?.homepage, heroTitle: '华东紧固件：稳定连接，可靠交付' },
    },
  } as never,
})
console.log('已实际更新华东站中文首页主标题：华东紧固件：稳定连接，可靠交付')
