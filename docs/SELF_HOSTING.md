# Self-hosting and adapter boundaries

NovaSite does not use or require Payload Cloud. Payload runs inside the Next.js process and connects directly to infrastructure owned by the deployment account.

## 首次生产上线：完整数据迁移（阻塞项）

> **未完成本节前，不能将当前本地开发数据库当作可上线的生产基线。**
> 本地开发环境由 Payload 的开发期 schema 同步支撑，已经验证的 A–E 功能是真实可用的；但阶段 B、C、D、E 的正式迁移尚未在一套全新、可复现的生产 PostgreSQL 环境中完整演练并登记。因此，正式上线前必须完成以下清单。

- [ ] 为生产环境准备独立 PostgreSQL 数据库；若已有业务数据，先备份，并在备份副本上演练。不得对本机开发数据库强制执行生产迁移。
- [ ] 配置生产环境变量和数据库连接后执行 `npm run payload -- migrate`，使 `src/migrations` 中的全部迁移进入生产数据库。
- [ ] 执行 `npm run payload -- migrate:status`，确认阶段 B、C、D、E 对应迁移均显示为已执行（`Yes`）。
- [ ] 通过后台或受控导入写入真实客户站点、内容和媒体。演示数据脚本仅用于演示/测试环境；正式客户数据不得以演示种子数据覆盖。
- [ ] 对每个生产站点验证产品技术参数：每个有参数的产品均应有 4 条语言记录（en、zh、ru、id），并在四种前台语言下实际打开产品详情页核验。
- [ ] 运行多站点隔离、前台路由、询盘写入和媒体读取的上线前验收；验收通过后才构建并发布应用。

这是一项**生产上线前必须关闭的待办**，不是当前本地 A–E 功能验收的否定。迁移完成后，应在本节逐项勾选，并保留迁移状态和验收记录。

### 本地独立演练记录（不等同于生产上线）

2026-09-22 已在两个独立演练数据库完成空库迁移、备份恢复、受控数据导入和应用启动验证；16 个迁移均为 `Yes`。详细记录见 `docs/evidence/v1-step-06/README.md`。生产环境仍必须逐项完成上方清单，尤其是独立基础设施、对象存储、四语言产品参数核验和外网验收。

## Adapter boundaries

- Database: `src/platform/adapters/database.ts` creates the PostgreSQL adapter from `DATABASE_URL`.
- Media: `src/platform/adapters/storage.ts` selects local disk in development or an S3-compatible service when `S3_ENABLED=true`.
- S3 compatibility covers AWS S3, Cloudflare R2 and self-hosted MinIO. Set the endpoint and path-style options for the selected provider.
- Schema changes are versioned in `src/migrations` and are applied with `npm run payload migrate` before starting a production release.

## Hosting targets

| Runtime | Database | Media storage |
| --- | --- | --- |
| Vercel | Managed PostgreSQL | S3 or R2 with `S3_CLIENT_UPLOADS=true` |
| Cloudflare container/runtime | Managed PostgreSQL | R2 |
| AWS ECS/App Runner | RDS PostgreSQL | S3 |
| Ubuntu VPS / Docker | PostgreSQL container or managed PostgreSQL | MinIO, S3 or persistent local volume |

Do not deploy production uploads to an ephemeral server filesystem. Payload Cloud credentials, plugins and APIs are deliberately absent from this project.
