# 生产基线与 Web/Worker 源码对照

记录日期：2026-10-15。本文只记版本关系和不含客户数据的哈希，不包含生产运行配置。核查结论来自本地受控发布记录/源码快照及服务器只读运行记录；原始 `.private` 快照不得复制到公开仓库。

## 当前服务版本

| 服务 | 当前运行标签 | 本地 release 记录中的 source SHA-256 | 运行时镜像信息 |
| --- | --- | --- | --- |
| Web | `v1-rc-20261005-1-cloud` | `4dec0ef3cfb10eb788b4288c86df4acb0a5e339db4060baede17ec3b455c72fd` | Docker image ID `sha256:ec923fb4e5ac068f3add7c880bc163f792d8c6d01b0fda08d7a5246ae42dcc4b` |
| Translation Worker | `v1-rc-20261004-7-cloud` | `70d73712c5ac96b5c2d02fe0756edc015fddafc4763d2eb33f65412328d71e0b` | Docker image ID `sha256:015e78aeebf79015fac34945bff27d5b6fe7338bcae9a6b034326307a339b90f` |
| PostgreSQL | `17.11-bookworm` | N/A | Docker image tag observed in the running stack |
| Caddy | `2.11.2-alpine` | N/A | Docker image tag observed in the running stack |

镜像 ID 是主机本地 Docker image ID，不是可跨 registry 校验的 OCI manifest digest。服务器镜像没有可用的源码 revision 标签；因此发布快照和部署记录能追踪来源，但无法仅凭运行镜像二进制独立重建/证明其源码完全一致。

## Web 发布链

| 发布记录 | 状态 | source SHA-256 | manifest 条目 | 说明 |
| --- | --- | --- | ---: | --- |
| `v1-rc-20261004-8-cloud` | deployed（历史 Web 发布） | `2ce315eed04fd93e501d31b0b7fb72b0ce74e82cbee205a2cc0cc475c94fea84` | 639 | 临时预览地址变化；只改两个 Web 文件，Worker unchanged |
| `v1-rc-20261005-1-cloud` | deployed（当前 Web） | `4dec0ef3cfb10eb788b4288c86df4acb0a5e339db4060baede17ec3b455c72fd` | 639 | 登录名/邮箱登录变化；只改两个 Web 文件，Worker unchanged |

Web 发布记录的 `sourceSHA256` 与对应 639 条 source manifest 文件摘要一致。同步候选复制了其中 638 个非生成输入，均逐项 SHA-256 相等；唯一排除的是 Next.js 生成文件 `next-env.d.ts`。该文件在构建/开发时由 Next.js 重新生成。没有从服务器容器提取运行文件来冒充完整开发源码。

当前 GitHub `main` 和原 Mac 工作区基线提交均为 `2bcefda0aaf097056b0e6b3e9eabc6db6fc1c8c1`；本次候选是从原有 GitHub `main` 建立的新本地分支，旧的 `v1.0.0` 标签继续指向 `a947893` 历史提交。

## 当前 Web 与 Worker 的四项差异

以下按 Worker v07 与当前 Web v05 的同路径 SHA-256 比较。它们不是一个“把 Web 和 Worker 随意混合”的新版本，而是由 v08 和 v05 两次 Web-only 发布顺序形成：预览代码先在 v08 更新，登录代码在 v05 更新；Worker 当时均未变。

| 路径 | Worker v07 SHA-256 | Web v05 SHA-256 | 实际作用 |
| --- | --- | --- | --- |
| `src/app/(workspace)/api/login/route.ts` | `511c6a32ce03bd95a27f60c7d32a757d83d300788fdf50d0256ee3623b3d60cc` | `e624fa2e2116638e543fc62472affe5a825aa7f9a97dfa97425f7997eca71756` | Web 支持用户名或邮箱登录；用户名先按唯一名称精确查询，再交 Payload 密码认证。v07 没有这项登录改动。 |
| `src/app/(workspace)/login/LoginForm.tsx` | `df4521d54c64239d1b701e9566bda7abb6275cbda608e4b1ae4c7ba3bcd1cc92` | `523a8ae94b4852cbf5d6e24597ae5a92510e2143ba9093442624979b3f7daebd` | Web 登录页改为账号/邮箱提示，并配合用户名自动填充。 |
| `src/app/(workspace)/workspace/[company]/website/sites/page.tsx` | `d83ca3f38cf135d92e5f64920e396b9ccff34c66ce095040264f67eda20086da` | `518347677e27629c89f712a16886ccc1dc99c3ebca57e062b9c5c22f2a9caeb0` | Web 根据配置的管理域或本地地址生成 `/s/{slug}/{defaultLocale}` 预览路径；v07 使用临时站点域或旧预览域字段。 |
| `src/platform/components/SiteManager/SiteManager.tsx` | `1940775c22d9af6e73d8a753809653c9cad744a9239aefce1ed5021b18b937e1` | `a0239cc8827597aaa8418f4459020b95ecd08be3ad6532ab546eda4ca4a1b338` | Web 显示站点预览生成的管理域 `/s/...` 链接，替换旧的临时域/兼容预览链接展示。 |

顺序证据：v08 的 `changedFiles` 正好是上表两个预览文件；v05 的 `changedFiles` 正好是两个登录文件。v05 release 记录 Worker unchanged。因此 v07 与 v05 的四条差异已有发布链解释，不是将两个不同快照强行合并造成的矛盾。

## 原 Mac 工作区的未发布差异

此前本地 `platform-v1` 相对于生产 Web 快照有三个实质差异文件：

- `.dockerignore`
- `scripts/bootstrap-single-ecs.mts`
- `scripts/verify-v1-node-style-hook.mjs`

它们在候选中采用 Web 生产快照版本，而不是本地未部署版本。此外 `src/payload-types.ts` 仅有生成注释差异；候选也采用生产快照的文件。原始 Mac 工作区未被改写，未发布版本仍留在那里，不混入本候选。

## 核对步骤和范围

1. release 目录内 639 项 manifest 的源路径和 SHA-256 逐条校验。
2. 排除 `next-env.d.ts`，其余 638 项逐条复制到候选，并校验零缺失、零 hash mismatch。
3. 未复制 `.private` 发布归档、数据库备份、生产配置、服务日志或 ECS 上运行数据。
4. Web/Worker 四个路径按上表对照；release `changedFiles` 解释 v08、v05 的服务发布次序。

初始同步候选在安全修订前与生产 Web 发布源快照的 638 个非生成文件逐项匹配（唯一排除 `next-env.d.ts`）。当前候选随后做了单独记录的公开安全修订，因此当前候选已不等于线上原始源码；线上仍是原 Web/Worker 发布版本，安全修订尚未部署。此源快照对照也不证明生产 image ID 可由快照确定性重建。未来构建应写入不可变源码 commit 和 OCI digest 元数据来补上这个证据缺口。安全差异见[公开安全修订记录](./security-revision-2026-10.md)。
