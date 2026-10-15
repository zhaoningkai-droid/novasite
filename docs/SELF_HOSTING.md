# 自托管与部署边界

本文记录代码支持的适配边界及当前生产拓扑。它不是一份可直接复制粘贴的生产安装脚本。生产服务器配置、环境变量、证书材料、数据库备份和客户媒体不在本仓库。

## 当前观察到的生产架构

截至 2026-10-05 发布记录和服务器核对：阿里云香港 ECS 运行 Docker Compose 管理的 NovaSite Web、产品翻译 Worker、PostgreSQL 和 Caddy。Web 与 Worker 版本独立发布；管理入口域为 `admin.o669.com`。具体镜像和版本证据见 [生产版本对照](./RELEASES/production-baseline-2026-10.md)。

仓库中的根目录 `docker-compose.yml` 是本地开发环境，包含本地 PostgreSQL 和可选开发服务，不是生产 Compose。旧 `deploy/` 文件来源较早，不能在没有逐项核对的情况下用作当前正式配置。生产环境实际 Compose、Caddyfile、系统服务、密钥和数据目录必须从受控运维记录单独核验，不应复制到公开仓库。

## 配置适配器

- 数据库：`src/platform/adapters/database.ts` 用 `DATABASE_URL` 构建 Payload PostgreSQL adapter。生产运行时禁用 schema push；schema 变化走 `src/migrations` 的正式迁移流程。
- 媒体：`src/platform/adapters/storage.ts` 在 `S3_ENABLED=true` 时启用 S3 兼容存储；密钥由环境注入。生产媒体不应依赖容易丢失的容器本地文件系统。
- Web/Worker：Web 是 Next.js + Payload 进程；`scripts/run-product-translations.mts` 是独立 Worker 入口。部署时必须成对登记各自的源码提交和镜像摘要，不可因 Worker 版本号更旧就覆盖或猜测。
- HTTPS/路由：当前生产拓扑使用 Caddy，管理域通过 DNS 指向服务入口。自定义客户正式域名的自动接入、证书与租户路由流程尚未完整实现。

## 新环境上线前需要完成

1. 由负责人确认云厂商、网络入口、磁盘、操作系统维护与访问控制策略。
2. 准备单独的生产数据库、备份策略和恢复演练；不得从本地开发数据库直接复制来代替设计。
3. 准备生产对象存储、私有密钥、邮箱/AI provider 配置与轮换流程。
4. 审查 `src/migrations`，在可恢复的隔离环境演练迁移；正式执行前备份并记录迁移状态。
5. 完成正式域名接入、HTTPS、租户隔离、媒体访问和询盘持久化验收。
6. 记录 Web、Worker、数据库和反向代理各自的版本、镜像摘要、源码提交和部署时间。
7. 准备故障回退方案，并确认回退镜像与数据库 schema 兼容。

当前站点的客户自有域名支持仍未完整交付；“需要支持正式域名”是产品要求，不应被误读为目前已具备通用自助接入能力。管理域预览的测试询盘持久化与标记机制也尚未实现。

## 不适合公开仓库的内容

生产环境变量、数据库 URL、管理员凭据、TLS 私钥、云厂商 API key、Cloudflare token、服务器 IP/SSH 资料、数据库备份、客户上传媒体及运行日志必须保存在私有密钥管理和备份系统。请不要将它们粘贴进 issue、README、部署记录或 Git 历史。

具体上线和回退流程见 [部署与回退说明](./DEPLOYMENT_AND_ROLLBACK.md)。在负责人批准前，不能把当前候选直接部署。
