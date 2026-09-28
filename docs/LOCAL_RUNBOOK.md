# NovaSite 本地运行说明

在 macOS 终端执行：

```bash
cd "/Users/yunduo/Documents/ChatGPT/网站类/platform-v1"
npm run local:start
```

脚本会打开 Docker、只启动数据库 PostgreSQL、检查数据库健康状态并启动 NovaSite。**终端必须保持打开**；它会显示 `Ready`，随后自动打开后台。关闭该终端或按 `Control + C` 会停止本地后台。

- 后台：`http://localhost:3100/admin`
- 公司选择：`http://localhost:3100/workspace/companies`
- 本地前台：`http://localhost:3100/s/t/zh`

日常检查和处理：

```bash
npm run local:status
npm run local:logs
npm run local:stop
```

`local:start` 不会关闭其他项目占用的 3100 端口。如果端口被占用，它会显示进程号并停止；先关闭那个程序后再试。脚本只启动 PostgreSQL，不依赖 MinIO、Redis 或 Mailpit，因此这些附属镜像无法下载时不影响本地后台。
