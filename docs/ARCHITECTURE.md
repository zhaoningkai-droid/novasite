# NovaSite V1 架构边界

V1 的目标不是做一个单站后台，而是完成可复制、可运营、可审计、可发布的 Google 外贸独立站工厂。

## 核心边界

- `tenants` 是站点主实体：域名、语言、品牌、联系方式、全局 SEO 都归属于站点。
- 页面、产品、文章、媒体、询盘和发布记录都通过官方 Multi-Tenant 插件隔离。
- `templates` 保存受版本控制的模板能力；应用模板只产生站点内容，不修改模板母版。
- Pages、Products、Posts 使用 Draft/Version；生产环境只读取 published 数据。
- `deployments` 是发布状态机，不允许“保存内容”等价于“发布上线”。
- `audit-logs` 为不可修改、不可删除的操作留痕集合。

## Google 收录门槛

生产发布流程必须依次通过：主域名可解析、站点允许索引、每个 URL 只有一个 canonical、语言页互相输出 hreflang、草稿与预览页 noindex、sitemap 只包含已发布内容、页面包含 title/description、结构化数据可解析、404/重定向无环路。

## 后续扩展位置

- 新业务实体放在 `src/collections`，不要把数据逻辑塞进页面组件。
- 新页面模块放在 `src/blocks`，模块 schema 与前台 renderer 成对增加。
- 发布适配器放在 `src/services/deployments`，Vercel/Cloudflare/VPS 共用状态机。
- Google Search Console、GA4、GEO 和广告数据接入放在 `src/integrations`。
- 邮件、翻译、图片处理等异步任务放在 Payload Jobs，并可由 Redis worker 执行。
