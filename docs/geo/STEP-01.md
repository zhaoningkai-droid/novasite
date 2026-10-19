# 第1步：3100多客户后台的GEO入口与优化词界面

日期：2026-10-16。状态：代码接入，待用户验收；未自行进入第2步。

## 对应用户要求

- 最终技术文档按8步组织，当前只实施第1步界面。
- GEO加入现有3100管理后台，继续由一个后台管理多个客户。
- “独立站”旁增加GEO入口，保留原NovaSite外框。
- 不展示“发文引用子链接”表；引用仍属于后续内部服务的强制流程。
- 不再展示3200Demo、制作页面展示或开展功能验收。

## 代码接入

1. WorkspaceTopNavigation增加“独立站 / GEO优化”同级入口及当前模块高亮。GEO入口复用现有内容编辑角色；原翻译助手仅保留在独立站模块，退出与公司选择复用原实现。
2. WorkspaceSideNavigation按当前路径切换功能菜单。GEO目前只开放优化词，其他功能入口禁用并注明计划步骤，不声称已实现。
3. WorkspaceFrame按模块更新标题和移动端导航名称；不嵌套3200的独立后台壳。
4. WorkspaceCompanySwitcher在GEO内切换客户后跳转新客户GEO优化词页；独立站原切换目标保持网站数据页。仍使用已有未保存提醒及切换事件。
5. 新增`/workspace/[company]/geo`入口及`/geo/keywords`页面。页面复用已有登录检查、可访问公司解析和父工作台选中公司检查；GEO页面同时限制super-admin/site-admin/editor角色。
6. GeoKeywords完成列表、搜索、空态、添加弹窗、配置详情和当前页面内暂存。比对标识说明、1核心词、10个不重复细分词、官网/Blog字段保留；没有逐词URL表。
7. 每份内存配置含当前tenant ID，组件以company ID重新挂载，列表和暂存均检查tenant归属。复用未保存保护；暂存仍不等于入库，离开/刷新/切换会提醒并清空。
8. 不给真实客户灌入澄川电气或示例网址。品牌由运营填写；官网默认值仅使用当前客户已有primaryDomain。输入“配电柜”可带入负责人指定的十词到当前页面草稿。

## 文件清单

修改现有文件：

- `src/platform/components/WorkspaceShell/WorkspaceTopNavigation.tsx`
- `src/platform/components/WorkspaceShell/WorkspaceSideNavigation.tsx`
- `src/platform/components/WorkspaceShell/WorkspaceFrame.tsx`
- `src/platform/components/WorkspaceShell/WorkspaceCompanySwitcher.tsx`
- `src/platform/components/WorkspaceShell/workspace-shell.scss`

新增：

- `src/platform/geo/navigation.ts`
- `src/platform/components/GeoWorkspace/GeoKeywords.tsx`
- `src/platform/components/GeoWorkspace/geo-workspace.scss`
- `src/app/(workspace)/workspace/[company]/geo/page.tsx`
- `src/app/(workspace)/workspace/[company]/geo/keywords/page.tsx`

改前保存了上述5个既有文件的真实源码副本和SHA-256，见[evidence/step-01/before](./evidence/step-01/before/manifest.json)。副本使用`.txt`扩展名，避免被项目TypeScript当作新的业务源码编译。本次没有事前浏览器截图，不把源码记录称为截图。

## 检查边界

- 修改和新增的8个TS/TSX文件通过定向ESLint，0错误、0警告。
- 类型检查的实际结果见本文件下方补充；不把仓库原有错误说成新增文件已通过全库类型检查。
- 按用户要求不执行浏览器功能验收、双客户写入验收、真实AI调用或发布测试；没有打开新的界面展示。
- 没有运行数据库迁移、seed、客户内容写入、媒体上传、正式部署或服务重启。
- 没有修改Payload集合/schema及原有客户站渲染代码。现有客户内容未由本次工具操作写入；没有进行数据库前后数量核对，因此不宣称已证明数据指纹完全一致。

## 第2步前必须处理的边界

当前“暂存配置”仅在本页面内存生效。正式CRUD、刷新持久化、稳定详情路由、并发控制、服务端品牌/词校验和跨客户拒绝检查都属于第2步；来源发现、真实AI、文章与发布、检测结果均没有接入。

本次源码隔离方式不代替正式API权限测试。第2步开始迁移前，需先提交增量表/字段、索引和回退安排。


## 本次静态检查结果

8个本次修改/新增TS/TSX文件的定向ESLint为0错误、0警告。两个修改/新增SCSS文件均通过Sass编译。

全库执行`tsc --noEmit --incremental false`，退出码2，248条诊断分布在41个文件：40个为docs/evidence下未改动的历史源码副本，另1个为未改动的`src/platform/inquiry/notifications.ts`。本次修改或新增的源文件没有类型诊断。没有把全库检查记为通过，也没有为此清理历史档案或改动询盘业务。见[类型检查摘要](./evidence/step-01/typecheck-summary.json)。

未运行完整生产构建、浏览器流程或真实客户数据测试。当前结论仅为源码接入与上述静态检查结果，不代表运行界面已经由负责人验收。
