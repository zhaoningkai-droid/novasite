# 本地开发说明

此流程用于本机隔离开发。它不会连接生产数据库；请确认 `.env` 指向本地服务后再启动。仓库中不存在可供开发使用的客户数据。

## 环境

- Node.js 20.9 或更新版本，建议与当前容器基线一致使用 Node 22 LTS。
- npm（仓库包含 `package-lock.json`，本地安装以它为准）。
- Docker Desktop / Docker Engine 与 Compose。
- macOS 的启动辅助脚本还使用 `curl`、`lsof`；Linux 上可手动启动 Compose 和 Next.js。

## 首次启动

```bash
cp .env.example .env
```

编辑本地 `.env`：数据库连接应指向本仓库 Compose 暴露的本机 PostgreSQL；生成仅供本地使用的随机 Payload secret。不要粘贴生产密钥、客户域名凭据或服务器配置。

```bash
npm ci
npm run local:start
```

`local:start` 会启动 `docker-compose.yml` 的 `postgres` 服务、等待健康检查，再以前台方式启动 Next 开发服务，默认端口 3100。请保持该终端窗口打开；出现 Next.js `Ready` 后可访问：

- Payload 管理端：`http://localhost:3100/admin`
- 公司工作台入口：`http://localhost:3100/workspace/companies`
- 健康检查：`http://localhost:3100/health`

启动脚本只会在环境显式启用产品翻译队列时尝试启动本地翻译 Worker。翻译 Worker 需要本机配置的 AI provider；没有配置时不要提交真实翻译任务。

## 日常操作

```bash
npm run local:status
npm run local:logs
npm run local:stop
```

`local:stop` 停止该仓库的开发进程和翻译 Worker，不删除 PostgreSQL volume。不要为“重置”而对有价值的数据运行 `docker compose down -v`。

若 3100 端口被其他应用占用，启动脚本会报出占用进程并退出，不会关闭其他项目。可在启动时设置 `NOVASITE_PORT` 使用其他端口；还需检查 `.env` 中的前端回调地址是否与本机端口一致。

## 可选服务与脚本

`npm run infra:up` 会另外启动 Compose 文件声明的 Redis、MinIO、Mailpit；不是默认启动 NovaSite 所必需。配置和容器账号只用于本地演示，不能复用到生产环境。

`npm run build` 执行 Next.js build 并运行 `postbuild` 生成 sitemap；`npm run lint` 运行 ESLint；`npm run test:int` 运行 Vitest 集成测试；`npm run test:e2e` 运行 Playwright。`generate:types`、`generate:importmap` 会改写生成文件，只有明确需要时才运行并检查 diff。

仓库还包含若干 `seed-*`、安装和核验脚本。有些会写入或删除数据库数据；执行前必须读脚本内容，使用可丢弃的本地库。`src/app/(frontend)/next/seed/route.ts` 不是本地启动流程的必要步骤，禁止对生产环境调用。

## 停止和故障定位

- 后台打不开：先运行 `npm run local:status`，再读 `npm run local:logs` 和 PostgreSQL 容器日志。
- 数据库无法连接：核对 `.env` 的 host/port/db 名称、`docker compose ps` 与本地 Compose 健康检查。
- 缺少依赖：确认 Node/npm 版本，再运行 `npm ci`；不要删锁文件或换包管理器以“修复”安装。
- 构建失败：保留完整错误摘要，确认生成文件是否被意外改动；不要改动数据库迁移来绕过构建错误。

本地数据库属于开发数据，不是生产备份，也不能用于恢复正式站点。
