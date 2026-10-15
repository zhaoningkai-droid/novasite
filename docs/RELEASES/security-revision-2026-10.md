# 公开源码安全修订记录

记录日期：2026-10-15。本文记录生产 Web 源码基线之后、为公开同步所作的最小安全和演示资料修改。没有修改服务器、数据库、客户记录或生产发布包，也没有运行 seed。

## 生产基线与当前候选

- 生产 Web 原始源码基线：`v1-rc-20261005-1-cloud`，source SHA-256 `4dec0ef3cfb10eb788b4288c86df4acb0a5e339db4060baede17ec3b455c72fd`。
- 生产 Worker 原始版本：`v1-rc-20261004-7-cloud`，source SHA-256 `70d73712c5ac96b5c2d02fe0756edc015fddafc4763d2eb33f65412328d71e0b`。
- Web 基线的 638 个非生成文件在安全修订前逐项与发布清单匹配；`next-env.d.ts` 为构建生成文件，未纳入。
- 当前 GitHub 同步候选包含下列尚未部署修订。上述 source SHA 只标识原始生产源码，不能用于声称当前候选仍与生产源文件完全一致。

## Seed 执行边界

| 路径 | 修订 | 影响 |
| --- | --- | --- |
| `src/platform/seed-security.ts` | 新增集中门禁：生产环境拒绝；非生产环境须显式启用；只允许 `super-admin` | 仅控制破坏性演示 seed；正常登录、客户内容模型和数据库结构不变 |
| `src/app/(frontend)/next/seed/route.ts` | Payload 初始化前先检查环境，认证后再检查平台管理员角色 | 生产请求直接返回 404；已登录普通用户也无权执行 |
| `src/endpoints/seed/index.ts` | 在首个清理/写入动作前再次检查环境和角色；演示作者口令改为运行时随机生成 | 避免仅靠 HTTP 路由门禁；不再保留固定演示登录口令 |
| `scripts/seed-script-authorization.ts` | 新增本地 seed 脚本校验；环境显式启用并指定已有超级管理员用户 | 本地数据脚本在任何写入前完成校验 |
| `scripts/seed-phase-c-fasteners.mts`、`scripts/seed-phase-d-fixed-pages.mts`、`scripts/seed-phase-d-navigation.mts`、`scripts/seed-product-specifications.mts` | 连接数据库前检查非生产显式启用；写入前核对指定用户为超级管理员 | 不在生产或默认本地配置运行 |
| `scripts/seed-v1.mjs` | 要求显式非生产环境、`NOVASITE_ENABLE_SEED=true`、loopback 服务地址和环境提供的管理员凭据；登录后要求 `super-admin` | 不含可重用的固定管理员账号口令，不接受远程 seed URL |

## 演示资料和运维/测试脚本

- `src/platform/legacy-templates/executive-demo-data.ts`、`src/platform/legacy-templates/ExecutiveTemplatePages.tsx`、`public/template-demos/executive-industrial-pro-v1/assets-manifest.json`：演示页面的企业标识及联系信息改为 NovaSite 演示标识、保留域名、虚构号码和演示地址。
- `public/template-demos/executive-industrial-pro-v1/novasite-heritage-roof-demo.pdf`：由明确标记的模板演示版取代原产品资料；显示“演示资料/非真实技术规格”，文件元数据标注 NovaSite 演示用途。PDF 为扁平化页面图片，文字不可选取。
- `public/template-demos/industry/fastener-demo-guide.pdf`、`power-demo-guide.pdf` 和 `industry/assets-manifest.json`：说明文件明确为演示样例，图片来源/处理方式写入 manifest。Pexels 素材许可不因本项目 MIT 许可而改变，详见 `THIRD_PARTY_NOTICES.md`。
- `scripts/capture-*`、`scripts/verify-step-*`、`scripts/reproduce-admin-hmr.mjs` 与 `tests/e2e/*`：去除固定管理员测试口令和非示例邮箱默认值；账号由本地环境提供。临时权限核验账号使用运行时随机口令和 `.invalid` 邮箱。
- `tests/helpers/seedUser.ts`：测试账号口令改为运行时随机值，邮箱使用 `.invalid` 保留域名。
- `scripts/novasite-fallback-tunnel.sh`：删除固定 SSH 目标，改为本机 `NOVASITE_TUNNEL_TARGET`；保留 SSH 默认主机密钥校验。
- `scripts/contact-ui-fixture.mts`：加入与 seed 相同的显式启用及超级管理员门禁，只允许 loopback 数据库，并把临时文件放在系统临时目录。
- `scripts/install-library-contact.mts`、`scripts/install-template-catalog.mts`：移除本机固定备份路径，要求操作员提供仓库外的绝对 `NOVASITE_BACKUP_DIR`，新建目录限制为仅所有者可访问。

演示样例图片仍是公开素材，不能视为 NovaSite 或客户实际产品、工厂、资质或交付记录。Pexels 来源页、作者和下载记录见各 manifest；不按 MIT 再许可独立图片文件。

## 核对范围和限制

- `src/app/(frontend)/next/seed/route.ts`、内部 seed 函数及仓库内所有专用 seed 脚本都已定位；没有运行它们。
- 当前候选文件树不包含 `.private`、`.env`、密钥文件、数据库/媒体备份、客户上传媒体或生产运行日志。`test.env` 已从当前树移除，其中历史记录只含 Node 运行参数。
- `LICENSE`、`THIRD_PARTY_NOTICES.md`、`.gitleaks.toml` 保留。第三方图片条款独立于 MIT。
- 当前树中旧管理后台参考截图已移除；由于保留原 Git 历史，早先公开提交中的截图和历史测试说明仍可被查阅。本修订没有重写 Git 历史。
- `gitleaks` CLI 未安装。使用仅报告路径/类别的本地扫描和人工检查；这不是完整的第三方安全审计。
- 本次未运行 build/lint、测试、数据库操作、翻译服务或部署。离线依赖缓存不完整，完整构建状态仍需在隔离环境补验。

## 上线关系

本文件只说明公开源码候选的安全差异，不改变生产版本。生产 Web 和 Worker 仍运行 `production-baseline-2026-10.md` 所列版本。提交或推送此候选都不等于部署；以后若批准部署，需先在隔离数据库验证 seed 的拒绝与授权路径，再按独立的生产发布/迁移审批流程操作。
