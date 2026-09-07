# 任务简报：list_sessions 关联 Session Projection，输出 presence

## 目标
Trajectory 列表（`list_sessions`）的每条 `SessionSummary` 带上它在 PiGUI 里的存在状态 `presence`，让渲染层能标出"已归档"和"不在 PiGUI 里的外部 CLI session"。

## 验收标准
- [ ] `packages/core` 的 `SessionSummary` 新增 `presence: SessionPresence`，`export type SessionPresence = "active" | "archived" | "external"`。
- [ ] `list_sessions` 返回值：summary.id 命中某个 projection 的 `piSessionId` 且该 projection 已归档（`status === "archived"` 或 `archivedAt` 非空）→ `archived`；命中但未归档 → `active`；未命中 → `external`。
- [ ] 同一个 piSessionId 对应多个 projection 时（理论上不应有），任一未归档即 `active`。
- [ ] 新增单元测试覆盖三种 presence 和"多 projection 取未归档"这一条，跑 `bunx vitest run packages/backend` 全绿。
- [ ] `bun run typecheck` 通过；`bunx vitest run apps/desktop packages` 全绿（desktop 侧测试 fixture 若因新必填字段报类型错，给 `makeSummary` 类 helper 补 `presence: "external"` 默认值即可，不要改 desktop 的 UI 代码）。

## 背景
用户问"归档的 Session 还要不要出现在 Trajectory 里"。CONTEXT.md **Archived Session** 词条：归档只是可见性变化，"仍可通过 Analyze 或历史入口找回"，不删除 Session Trajectory。所以 Trajectory 保留归档项，但要能标出来并可筛选。本切片只做后端关联；UI 筛选与标记由主循环另做。

数据事实（已核实）：
- `list_sessions` → `packages/backend/src/service.ts:254` → `buildSessionIndexWithCache(agentDir, cache)`（`packages/backend/src/workspace/sessions.ts:76`），扫 `~/.pi/agent/sessions/**/*.jsonl`，`summary.id` 取自 JSONL 首条 session record 的 `id`，是 Pi session uuid。
- Projection 存 `~/.pigui/projections/*.json`，类型 `PersistedSessionProjection`（`packages/backend/src/persistence/session-projection-store.ts:8`），`piSessionId` 就是同一个 uuid；归档判定见 `archivedAt` / `status: "archived"`。真实样本：`{'piSessionId': '01a043ac-…', 'status': 'archived', 'archivedAt': '2026-08-27T…'}`。
- `service.ts` 的 request handler 已持有 `input.sessionProjectionStore`（`SessionProjectionStore.list()` 返回全部 projection，含归档）。

## 涉及文件
- `packages/core/src/session.ts:80` — `SessionSummary` 加字段，导出 `SessionPresence`（确认 `packages/core/src/index.ts` 导出）。
- `packages/backend/src/workspace/sessions.ts` — 建议新增纯函数 `annotateSessionPresence(summaries, projections): SessionSummary[]`，便于单测；`buildSessionIndexWithCache` 本身不必知道 projection。
- `packages/backend/src/service.ts:254` — `list_sessions` 分支：取 `await input.sessionProjectionStore.list()` 后调用上面的函数。
- `packages/backend/src/workspace/sessions.test.ts`（或同目录新测试）。
- 其余构造 `SessionSummary` 字面量的地方（backend fixture、`apps/desktop/src/fixtures/browser-session-summaries.json`、desktop 测试 helper）补 `presence`。浏览器 fixture JSON 里给几条不同值（至少一条 archived、一条 external）以便 UI 预览。

## 约束
- 索引缓存（`SessionIndexCache`）缓存的是文件解析结果；presence 依赖 projection 状态会变，**不要**把 presence 写进缓存，每次请求重新标注。
- TDD：先写失败测试再实现。
- 提交信息 Conventional Commits，如 `feat(backend): annotate list_sessions with projection presence`；不加署名行。不要 push。当前分支 `feat/trajectory-presence`（gh stack，叠在 feat/trajectory-list-sort 上）。

## 范围外
- 任何 desktop UI 改动（筛选控件、行标记、侧栏菜单入口）。
- 修改 `get_session_detail` 或 projection 本身。
