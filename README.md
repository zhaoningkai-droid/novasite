# NovaSite

NovaSite 是面向外贸企业的多租户独立站管理平台。运营团队通过一个统一后台管理多家公司的网站内容、语言版本和询盘；每家公司拥有隔离的网站数据。V1 先服务内部运营团队，客户独立权限后台属于后续阶段。

仓库采用 MIT License，版权范围和第三方素材说明见 [LICENSE](./LICENSE) 与 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。本仓库不是 Payload 官方模板的原样发行包，必要的上游归属仍予保留。

## 当前状态

本仓库的源码同步候选以 2026-10-05 Web 发布源码快照为原始基线，Web 对照版本为 `v1-rc-20261005-1-cloud`，Worker 对照版本为 `v1-rc-20261004-7-cloud`。快照中的 639 个构建输入有 638 个非生成文件在基线整理时按 SHA-256 逐项匹配；随后对 seed 安全、演示资料和测试脚本做了最小公开安全修订，因此当前候选与线上原始源码存在明确差异，且尚未部署。生产镜像没有可核对的源码修订标签，因此不能声称已对运行二进制完成密码学级源码证明。详见[生产版本对照](./docs/RELEASES/production-baseline-2026-10.md)和[公开安全修订记录](./docs/RELEASES/security-revision-2026-10.md)。

源码已经包含统一运营工作台、多租户内容管理、行业模板演示、已启用语言站点的内容翻译流程和询盘收件箱。代码存在不代表每项能力都完成用户验收。V1 仍未完整验收为正式产品；客户自有正式域名接入尚未完整实现，管理域预览中的受控测试询盘（写入并标记为测试）仍待开发。当前已确定的三套重点模板是古建、配电柜和紧固件；模板注册表还保留其他历史或演示选项，不能据此认为仓库中仅有三套模板。

## 技术架构

- Next.js App Router、React、TypeScript 与 Payload CMS 3。
- PostgreSQL 作为 Payload 数据库；生产部署通过 Docker Compose 管理 Web、Worker、数据库和 Caddy 服务。
- Payload Multi-Tenant 插件与租户字段共同管理站点隔离；权限规则位于 `src/access`、`src/collections` 和平台 API 路由中。
- Payload 的租户、产品、分类、新闻、案例、常见问题、媒体、询盘等集合定义在 `src/collections`。
- 运营工作台 API 与页面位于 `src/app/(workspace)`；租户站点渲染位于 `src/app/(sites)/s/[site]/[lang]`；Payload 管理和 API 由 `src/app/(payload)`、`src/payload.config.ts` 提供。
- 模板、租户解析、翻译、询盘、媒体访问和基础设施适配器位于 `src/platform`。
- `scripts/run-product-translations.mts` 是独立产品翻译 Worker 入口；Web 与 Worker 使用分别标记的发布版本。

更多模块关系见 [系统架构与目录说明](./docs/ARCHITECTURE.md)。
三套重点模板的实现入口及 demo/租户数据边界见 [模板目录](./docs/TEMPLATE_CATALOG.md)。

## 本地开发

需要 Node.js（建议使用项目容器采用的 Node 22 系列）、npm 和 Docker。首次启动前：

```bash
cp .env.example .env
# 打开 .env，按本机开发需要设置随机的 PAYLOAD_SECRET 等本地配置
npm ci
npm run local:start
```

本地脚本启动仓库 `docker-compose.yml` 中的 PostgreSQL，再运行开发服务器；终端保持打开。默认后台地址为 `http://localhost:3100/admin`，工作台公司入口为 `http://localhost:3100/workspace/companies`。本地 Docker Compose 中的数据库和对象存储设置仅供本地开发，不能用于正式服务器。

```bash
npm run local:status
npm run local:logs
npm run local:stop
```

脚本不会自动运行 seed。仓库仍包含受认证保护的演示 seed 入口；它会批量重置演示集合，只能在一次性本地数据库中由授权人员评估后使用。不要在生产或存有客户数据的环境调用。完整步骤见 [本地开发说明](./docs/LOCAL_RUNBOOK.md)。

## 部署与维护

截至上述生产对照日期，管理后台部署在阿里云香港 ECS，Web 与翻译 Worker 使用独立镜像版本，PostgreSQL 与 Caddy 由容器运行，域名入口为 `admin.o669.com`。此信息是当前观察到的拓扑，不是可直接复制的生产 Compose 配置；仓库中的 `docker-compose.yml` 只用于本地开发。正式域名接入、客户站点域名绑定及生产发布仍需按授权运维流程完成。

- [生产部署、版本对应与回退原则](./docs/DEPLOYMENT_AND_ROLLBACK.md)
- [日常维护说明](./docs/MAINTENANCE.md)
- [当前项目进度与未完成事项](./docs/PROJECT_STATUS.md)
- [本次源码候选与生产版本对照](./docs/RELEASES/production-baseline-2026-10.md)
- [变更记录](./CHANGELOG.md)

部署需要服务器访问权限、生产密钥、数据库备份和运行时配置。本仓库有意不包含这些资料。未经负责人批准，不得以本地源码直接更新生产。

## 贡献与版本

开发应从最新 `main` 建立短期功能分支，经代码审阅、静态检查和隔离环境验证后合并。已发布标签不可移动；部署镜像应记录对应源码提交、构建信息和 Web/Worker 版本。公开仓库中的本次同步候选包含尚未部署的安全修订；GitHub 同步不代表生产部署。

提交前请检查凭据、客户资料、数据库文件、运行日志、媒体和截图。具体安全边界和分支发布建议见 [维护说明](./docs/MAINTENANCE.md)。

## 许可

项目自有代码和文档按 MIT License 发布。依赖项、Payload 上游模板、Pexels 图片及其他第三方材料各自遵守其许可和权利范围，详见 [第三方声明](./THIRD_PARTY_NOTICES.md)。

## v1.2.0 — GEO optimization

Multi-customer GEO creation, materials, publishing plans and publication records. See [release notes](docs/RELEASES/v1.2.0.md). Database installation and worker startup are explicit operator steps; uploading this source does not migrate or deploy a running site.
