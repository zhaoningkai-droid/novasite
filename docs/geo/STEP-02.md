# 第2步：优化词真实保存与多客户隔离

更新：2026-10-17。用户于第1步交付后要求“继续”，本次据此实施第2步。当前状态：用户明确确认本地建表后，已完成代码、独立库检查及3100本地数据库安装；待用户页面验收。

## 1. 已接入的代码

- 优化词列表从服务端读取，支持按品牌/核心词搜索和真实分页。
- 添加弹窗继续只填品牌与核心词，详情保留比对标识、十个细分词、官网、Blog；不展示逐词引用URL表。
- 点击“保存配置”调用服务端；不再把页面内暂存冒充保存。刷新读取与编辑依赖本步GEO表安装完成。
- 已保存记录有稳定详情地址：`/workspace/[company]/geo/keywords/[id]`。
- 新增请求携带固定UUID，重复提交相同内容返回已有结果，不重复创建；同客户品牌/核心词规范化后唯一，不同客户不互相占用词。
- 更新提交版本号。SQL在同一语句中比较并更新版本；其他人先保存时返回409，保留当前输入，由操作人选择是否读取最新版本。
- 配置与版本快照通过同一条SQL原子写入，快照写入失败时主记录不保存。
- 服务器校验品牌/核心词长度、一个核心词、十个不重复且不等于核心词的细分词、比对标识和HTTP(S)链接；禁止URL账号密码。
- 比对标识按明确别名保存，匹配规则处理大小写/全半角和英文词边界；当前不接平台查询，也不把名称匹配当作推荐。
- 读取失败显示失败原因，不显示假0条或假成功；保存失败保留输入；切换/卸载取消旧请求，保存中复用已有离开保护。

## 2. 多客户权限

复用`workspaceSettingsScope`：验证登录、内容编辑角色、可访问公司和当前选中公司。客户端不能提交tenant/company归属字段；归属只取服务端已授权公司。

GEO读写服务每条SQL包含tenant条件，详情ID和更新ID不能越过当前客户。更新同时匹配tenant、ID与版本；外部API不暴露版本表、SQL堆栈或数据库连接信息。JSON写请求校验来源和Content-Type；响应为private/no-store。

接口：

| 方法与路径 | 行为 |
| --- | --- |
| GET /api/workspace/[company]/geo/keywords?q=&page= | 当前客户列表，每页20条 |
| POST 同上 | 当前客户新建，请求UUID防重复 |
| GET /api/workspace/[company]/geo/keywords/[id] | 当前客户单条详情 |
| PATCH 同上 | 当前客户按version比较后更新 |

错误包括401登录失效、403无权/非法来源、404当前客户记录不存在、409重复/版本冲突/工作公司切换、422字段错误、503存储未安装/不可用。不提供永久删除功能，本步不需要删除客户记录。

## 3. 本地增量数据库变更（已按确认执行）

沿用项目已有`platform_jobs`独立schema模式，在同一PostgreSQL内增加`platform_geo`，不把新GEO业务塞入既有客户内容集合，也不触发Payload自动schema push。

只新增：

1. `platform_geo.optimizations`：UUID、tenant_id、品牌及规范化键、别名JSON、核心词及规范化键、十词JSON、官网/Blog、整数版本、操作人ID、创建/更新时间。
2. `platform_geo.optimization_revisions`：tenant_id、配置ID、版本、完整快照、操作人ID、时间。

约束/索引：

- 配置ID主键；客户+配置ID联合唯一；客户+规范化品牌+规范化核心词联合唯一。
- tenant_id引用已有`public.tenants(id)`；删除客户时按现有客户归属语义级联清理该客户GEO记录，本安装不执行客户删除。
- 版本表通过客户+配置ID联合外键关联配置，防止版本归属错位。
- 十词JSON数组长度检查、版本大于0、客户/更新时间索引。

**不修改、删除、清空或重写现有客户表；不写入任何示例品牌、词包或客户业务记录。** 新表安装后也为空，用户自行保存配置。

审阅入口：

- [具体建表SQL](../../src/platform/geo/schema.ts)
- [正式迁移文件](../../src/migrations/20261016_020000_geo_optimizations.ts)
- [只安装本步的本地脚本](../../scripts/install-geo-keywords.mts)

脚本要求：明确apply、确认目标数据库名、24小时内的私有PostgreSQL备份；只允许本地回环数据库且拒绝production环境；验证连接身份、事务、超时和迁移锁。默认不执行任何安装。它不运行其他尚未应用的迁移，也不初始化Payload。

收到用户确认后已执行以下命令（在platform-v1目录；私有备份不在项目/public内）：

```sh
node --env-file=.env --import tsx scripts/install-geo-keywords.mts \
  --apply --expected-database=novasite \
  --backup-file=/Users/yunduo/.codex/private-backups/geo-step02/novasite-confirmed-20261017.dump
```

本地专用安装与项目现有内部任务安装方式一致，不伪造Payload迁移日志。后续正式迁移重复执行采用IF NOT EXISTS；正式发布必须按部署流程验证，不擅自运行整批迁移。

回退应用保留GEO数据，不自动DROP表。若确实要删除新表或恢复整库，属于另一个需要确认的数据操作。

## 4. 真实准备与检查结果

### 当前应用数据库

只读确认3100使用本地回环5433端口、数据库novasite。两张GEO表已在收到明确确认后安装完成；安装后均为0条，没有给客户预填示例配置。当前公司作用域的真实SQL读取检查通过。

13张既有业务表的数量和内容摘要已作为只读基线记录，见[application-before.json](./evidence/step-02/application-before.json)。确认后又采集了即时安装前基线，再完成安装后对比；13张既有业务表数量及内容摘要全部一致，见[安装对比](./evidence/step-02/installation-comparison.json)。

已生成PostgreSQL custom-format备份，保存在项目外私有目录，权限0600。文档仅保留格式、大小和摘要，见[backup-summary.json](./evidence/step-02/backup-summary.json)，不包含备份正文或连接凭据。

### 独立测试库

创建了本次独占的空测试数据库，建立两家虚构客户与GEO表，运行真实PostgreSQL SQL后清理该测试库。未向当前应用库插入测试客户或配置。

通过场景：脚本重复安装；创建/读取/列表；新增重试幂等；同客户重复拒绝/跨客户同词合法；跨客户读取及更新拒绝；同版本并发更新只有一个成功；版本快照原子写入；快照失败时主记录创建/更新回滚；并发重复创建被唯一约束拦截；参数化搜索和分页。见[真实SQL检查记录](./evidence/step-02/postgres-verification.json)。

### 自动检查

- 12个验证/API边界测试通过。场景来自方案第2步的一核心十词、当前客户隔离、并发和失败规则；不是页面验收。
- API边界测试以mock的既有认证作用域检查拒绝后不访问SQL。它不能替代真实登录和双客户API端到端验收；SQL隔离由上述独立PostgreSQL检查覆盖。
- 定向ESLint无错误/警告；GEO样式Sass编译成功。
- 全库类型检查仍有248条诊断，来自未改动的历史源码副本与询盘通知文件；本次GEO源文件没有诊断。见[typecheck-summary.json](./evidence/step-02/typecheck-summary.json)。没有宣称全库类型检查通过。
- 未运行浏览器流程、真实AI、真实发布、正式部署或服务重启；未进入第3步。

## 5. 授权及执行结果

用户明确确认：“执行本地建表，不要影响已有客户数据，继续完成第二步”。本次只执行已审阅两表的本地安装，未执行整批迁移、生产部署或客户记录写入。

- 使用执行前重新生成的私有备份，见[备份摘要](./evidence/step-02/confirmed-backup-summary.json)。
- 即时安装前与安装后的13张业务表数量/摘要一致。
- 两张GEO表已存在且为空，当前公司作用域列表读取通过，见[安装后读取](./evidence/step-02/installed-read-check.json)。
- 用户随后明确授权继续第3步，来源/素材组工作记录在[第3步](./STEP-03.md)。

没有浏览器页面验收或真实客户写入测试；配置保存与冲突流程由同一SQL服务的隔离库检查覆盖，不将其说成用户验收。
