# 测试服务器部署包

本目录用于第 7 步的单一测试站点部署：Docker 运行 Payload/Next.js，Caddy 负责 HTTPS 与反向代理，PostgreSQL 使用独立持久卷。应用不会直接暴露给公网。

## 部署前提

1. 一台已安装 Docker Compose 的 Linux 测试服务器。
2. 一个指向该服务器公网 IP 的测试域名。
3. 一个独立的 PostgreSQL 数据库、Redis 和 S3 兼容对象存储；不得使用本机开发库或本地 `public/media` 作为生产上传存储。
4. 将 `.env.production.example` 复制为 `.env.production`，填入真实且唯一的密码、密钥、域名、客户站点 slug 与对象存储连接信息。

## 在服务器执行

```bash
cd deploy
docker compose -f docker-compose.test.yml --env-file .env.production up -d --build
docker compose -f docker-compose.test.yml ps
curl -fsS https://YOUR_TEST_DOMAIN/health
```

首次启动时 `migrator` 容器会在空库执行所有正式迁移；只有成功后应用容器才会启动。再次部署时迁移命令只会检查并执行尚未应用的迁移。

## 验收范围

- `https://YOUR_TEST_DOMAIN/health` 返回数据库健康状态；
- 客户域名首页、产品详情、图片/视频媒体和询盘均可从公网访问；
- 重启应用容器后服务自动恢复；
- 更改前先做 PostgreSQL 导出和对象存储备份。

当前 Caddy 配置一次映射一个测试客户站点：使用 `SITE_SLUG` 和 `SITE_LOCALE` 决定域名首页对应的前台路径。多域名自动路由将在完成真实测试域名验证后再扩展，避免未经验证就把客户主域名暴露到公网。
