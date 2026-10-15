# NovaSite 系统架构与目录说明

本文按当前生产源码快照中的实际结构描述系统，不代表所有后续规划已经实现。版本证据和限制见 [生产基线记录](./RELEASES/production-baseline-2026-10.md)。

## 运行结构

NovaSite 使用一个 Next.js 应用承载 Payload 管理界面、平台工作台 API 和客户网站渲染。它连接 PostgreSQL；媒体可走本地存储或 S3 兼容适配器；产品翻译队列由独立 Node Worker 消费。观察到的生产拓扑还包含 Caddy 入口容器。生产部署编排和凭据不在公开仓库中。

```text
浏览器
  ├─ /admin、/workspace/... ─ Next.js + Payload CMS
  └─ /s/{站点}/{语言}/... ─ 租户网站渲染
                   │
                   ├─ PostgreSQL：租户、内容、权限和询盘
                   ├─ S3 兼容媒体适配器（配置开启时）
                   └─ 产品翻译任务表 ← 独立翻译 Worker

Caddy ─ HTTPS/入口路由 ─ Web 服务
```

生产中的数据库、文件系统、域名路由以及 Worker 均属于正式运行环境。仓库没有生产 `.env`、客户数据、备份或完整生产部署配置。

## 请求和数据流

1. 用户登录 Payload 管理端后进入 `src/app/(workspace)` 工作台。公司选择和当前站点上下文在平台页面及 API 中传递。
2. `src/payload.config.ts` 注册 Payload collections、globals、端点、插件、数据库适配器和内容翻译 hooks。`src/plugins/index.ts` 配置 Payload Multi-Tenant 插件，并指定参与租户隔离的集合；业务访问规则也分布在 collection access、hooks 和自定义 API，不能只凭插件配置推断每条路径都安全。
3. 租户和用户定义在 `src/collections/Tenants`、`src/collections/Users`；产品、产品分类、规格、新闻、案例、常见问题、媒体、导航、询盘等数据模型在 `src/collections`。集合之间通过 Payload 关系字段关联租户与媒体。
4. 工作台页面调用 `src/app/(workspace)/api` 下的服务器路由；模板、翻译和询盘的领域处理集中在 `src/platform` 和 `src/endpoints`。浏览器不应直接拥有绕过访问控制的数据库访问方式。
5. 租户公开/预览页面通过 `src/app/(sites)/s/[site]/[lang]` 路由读取对应站点与语言的数据，再由 `src/platform/legacy-templates`、`industry-templates`、`new-templates` 等模板组件渲染。这里同时存在不同年代的模板实现，不能把它们等同于同一模板系统。
6. Payload 管理后台和常规 Payload REST/GraphQL 入口位于 `src/app/(payload)`。额外的健康检查和媒体文件路由在 `src/app/health`、`src/app/api/media`。

## 关键目录

| 路径 | 职责 | 典型调用关系 |
| --- | --- | --- |
| `src/app/(workspace)` | 登录、公司选择、统一工作台、页面和平台 API | 调用 Payload Local API 与 `src/platform` 领域服务 |
| `src/app/(sites)` | 客户站点、语言路由、模板预览和公开前台 | 解析租户/语言，读取发布或授权预览内容，调用模板 renderer |
| `src/app/(payload)` | Payload Admin、REST、GraphQL 路由组 | 由 `src/payload.config.ts` 配置驱动 |
| `src/collections` | Payload 内容集合、租户关系与字段访问 | 配置中注册，hooks/access 控制读写 |
| `src/platform/components` | 工作台编辑器与客户站点 UI | 工作台页面组合组件，调用 workspace API |
| `src/platform/legacy-templates`、`industry-templates`、`new-templates` | 不同代际的模板设计和 renderer | 由站点/模板解析与页面组件引用 |
| `src/platform/content-translation` | 多内容类型的翻译共享逻辑与 hook | 由集合 hooks、后台翻译组件及服务调用 |
| `src/platform/product-translation` | 产品批量翻译任务、状态和 Worker 服务 | 后台发起任务，`scripts/run-product-translations.mts` 消费任务 |
| `src/platform/inquiry`、`src/endpoints/submitInquiry.ts` | 询盘输入验证、限流、去重和入库 | 模板表单 POST 到 Payload 的 `/submit-inquiry` endpoint |
| `src/platform/adapters` | PostgreSQL 连接池及媒体存储选择 | 被 Payload config 和插件引用 |
| `src/migrations` | 版本化数据库迁移 | 需要经过批准的部署迁移流程执行 |
| `scripts` | 本地运行、翻译 Worker、迁移/核验及演示脚本 | 按 package scripts 或操作手册调用；并非所有脚本适用于生产 |
| `public/template-demos` | 模板演示专属示例图片、资料和来源台账 | 演示组件读取静态资源；它们不应复制进租户媒体记录 |
| `tests/int`、`tests/e2e` | 集成和浏览器测试 | Vitest / Playwright 配置分别在仓库根目录 |
| `docs` | 架构、开发、部署、历史计划与版本证据说明 | 新的当前状态以 `PROJECT_STATUS.md` 和 release 记录为准 |

## 主要模块关系

### 多租户与权限

`Tenants` 表示一个客户公司的站点；Multi-Tenant 插件在多个集合上加入租户关系和后台过滤。`Users` 保存账号和角色。`src/access`、集合 access/hooks、自定义 workspace route 共同决定访问边界。平台超级管理员可跨租户，普通操作员应受授权租户约束。面向客户开放独立权限后台是后续目标，当前 V1 以内部运营工作台为主。

系统保留单独的演示 seed route：`src/app/(frontend)/next/seed/route.ts`。当前候选只允许非生产环境在显式启用后调用，并要求平台超级管理员；`src/endpoints/seed/index.ts` 在清理数据前再次检查环境和权限。公开安全修订尚未部署，不要在生产调用 seed。

### 内容、模板与预览

后台输入的租户内容和模板 demo 数据使用不同代码路径。演示静态资源只用于模板展示，不应落入客户记录。模板选择/应用与模板渲染是不同操作：应用模板可改变站点内容/设置，模板 renderer 控制样式。当前候选只整理源码，未改变模板逻辑。

部署要求包括客户自有正式域名，但当前接入尚不完整。后台管理域预览应能查看草稿；对公众的未发布内容必须受控。当前“可记录并标记为测试的真实预览询盘”尚未实现。

### 多语言与 AI 翻译

Payload localization 与集合级翻译 hooks 负责多语言字段；用户已启用的语言站点决定目标语言。后台翻译组件提交翻译请求，产品还支持批量任务；Worker 使用单独 Node 进程从任务表领取、处理并记录状态。其他需要文字录入的模块复用内容翻译能力，但翻译准确性仍需人工复核。AI 服务密钥只能保存在私有运行环境。

### 询盘

模板中的联系/报价表单向 `/submit-inquiry` 发送请求。`src/endpoints/submitInquiry.ts` 校验字段、租户归属、产品发布状态和限流，再交给 `src/platform/inquiry` 持久化至 `leads` 集合。管理域预览的受控测试询盘和标记规则仍待实现。

### 媒体

Payload Media collection 承担客户上传与授权。`src/platform/adapters/storage.ts` 在 `S3_ENABLED` 配置启用时建立 S3 兼容存储插件；服务器端上传应经过 Payload 权限。演示模板资源存于 `public/template-demos`，与客户媒体隔离。

## 数据库与 API

- `src/payload.config.ts` 汇总 collections、globals、endpoints、plugins、localization 和数据库适配器。
- 业务自定义端点包括 `applyTemplateEndpoint` 与 `submitInquiryEndpoint`；更广泛的工作台 CRUD 路由位于 `src/app/(workspace)/api/workspace`。
- Payload REST/GraphQL API 由 Payload Next adapter 提供。集合访问权限仍需以各 collection/access 文件为准。
- `src/migrations` 中迁移按文件版本化；生产数据库只允许在单独审批、备份与迁移状态核对后变更。
- `docker-compose.yml` 是本地开发 Compose，不能视作生产配置。

## 当前边界和待确认事项

- 生产源码快照的 638/639 个非生成输入与 Web 快照 hash 一致；这是源文件对应证据，不是生产镜像可复现性证明。
- Web/Worker 使用不同发布时间；四条跨版本差异在 release 对照文档中逐路径列出。
- 用户自有正式域名流程尚未完整实现；生产客户域名不能根据当前 demo 代码推断为可直接开通。
- 管理域草稿预览的真实测试询盘尚未实现。
- 迁移运行、第三方图片来源与许可、seed endpoint 权限仍应由独立负责人审阅。
