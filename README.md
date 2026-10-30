# NovaSite

面向外贸企业的多租户网站管理平台。通过一个后台维护多家公司的网站、产品、文章、语言版本、媒体和询盘；客户内容按公司隔离。

## 快速开始

需要 Node.js 22、npm 和 Docker。

```bash
cp .env.example .env
# 配置本地数据库和随机 PAYLOAD_SECRET
npm ci
npm run local:start
```

- 工作台：<http://localhost:3100/workspace/companies>
- 登录：<http://localhost:3100/login>
- 健康检查：<http://localhost:3100/health>

启动流程不会自动导入演示数据。完整操作见[本地运行](docs/LOCAL_RUNBOOK.md)。

## 功能

- 多公司内容管理、角色权限与多语言编辑。
- 产品、分类、新闻、案例、博客、关于、FAQ、联系与首页设置。
- 独立模板演示、客户模板选择与历史恢复；切换模板保留客户内容。
- 询盘、媒体和资料上传、翻译任务、网站统计。
- GEO 素材、知识库、文章创作与发布；检测模块目前包含存储和本地证据流程。

## 模板

演示页面使用示例内容；客户站读取当前公司的内容，两者共用对应模板组件。新增模板包括 K607、K712 和 AllyNav；已有行业模板继续保留。

| 模板 | 演示路径 | 实现目录 |
| --- | --- | --- |
| K607 | `/template-demo/plush-607-v1/zh` | `src/platform/reference-templates` |
| K712 | `/template-demo/plush-712-v1/zh` | `src/platform/reference-templates` |
| AllyNav | `/template-demo/allynav-v1/zh` | `src/platform/allynav-template` |

完整注册与接入说明见[模板目录](docs/TEMPLATE_CATALOG.md)。

## 项目结构

```text
src/app/             页面、工作台与 API
src/collections/     CMS 集合定义
src/platform/        模板、内容管理、租户与业务模块
src/migrations/      版本化数据库迁移
public/              公共资源与独立演示素材
scripts/             开发、任务处理及受控维护脚本
tests/               集成与浏览器测试
docs/                开发、架构、部署及版本说明
```

## 开发与发布

```bash
npm run dev
npm run build
npm run lint
npm run test:int
```

数据库测试应使用隔离数据库。生产发布不使用本地 Compose，不自动执行 seed，不覆盖生产数据库或客户上传。运行密钥、客户资料、备份、缓存和历史截图不进入仓库。

- [文档导航](docs/README.md)
- [系统架构](docs/ARCHITECTURE.md)
- [部署与回退](docs/DEPLOYMENT_AND_ROLLBACK.md)
- [维护说明](docs/MAINTENANCE.md)
- [发布记录](docs/RELEASES/v1.3.0.md)
- [变更记录](CHANGELOG.md)

当前功能和页面待负责人验收，不以构建通过代替业务验收。

## 许可与素材

项目代码采用 [MIT License](LICENSE)。第三方代码、图片、字体及参考站点素材保留各自权利；见[第三方声明](THIRD_PARTY_NOTICES.md)。演示素材不代表客户实拍、认证或工程成果。
