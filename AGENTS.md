<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 当前资料入口（2026-10-15）

下面的后台改造/模板工作步骤是 2026-09 的历史协作约定。它们仍可用于理解当时的授权和验收过程，但不是当前进度表或本次任务授权。阅读 [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)、[docs/PROJECT_STATUS.md](./docs/PROJECT_STATUS.md) 和对应日期的发布记录，确认实际代码与状态；不要重复已完成的调查，也不要把历史“完成”当成当前 V1 整体验收。

## 当前项目执行入口（2026-09-07）

- 执行运营后台改造前，先完整阅读 `docs/admin-redesign/IMPLEMENTATION.md` 和 `docs/admin-redesign/EXECUTION.md`，再查看 `docs/admin-redesign/PROGRESS.md`。
- 用户提供的项目协作与证据规则已归档为 `docs/admin-redesign/COLLABORATION.md`，必须遵守。
- 完成一步后提交真实证据，状态只能标为“待用户验收”；必须获得用户对该步的明确确认，才能进入下一步。用户授权执行第1步，不等于授权连续执行30步。
- 当前工作基于 platform-v1；不得另行扩展上级目录的旧JSON后台。保留现有客户内容、媒体及四语种数据。数据库风险操作须提前说明并取得确认。
- 每步开始前核查进度，不重复已完成工作，不把历史截图当作本次证据。正式生产迁移仍受 `docs/SELF_HOSTING.md` 的上线清单约束。
