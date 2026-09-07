# 任务简报：Trace → Trajectory 代码标识符改名

## 目标
按 ADR-0032 第 3 节，把 apps/desktop 内所有指"Session Trajectory / Trajectory Cockpit"的代码标识符、文件名、路由、DOM 钩子、可见文案从 Trace 改为 Trajectory；`surface: "trace"` 事件戳保持不动。

## 验收标准
- [ ] `rg -in 'trace' apps/desktop/src --type ts --type tsx` 只剩下"范围外"一节允许保留的命中（逐条核对）。
- [ ] `rg -n 'Trace' CONTEXT.md README.zh-CN.md docs/self-built-ui.md apps/desktop/src/dev/ui-intent/regions.ts` 只剩 CONTEXT.md 的 `_Avoid_` 反例和 surface 说明。
- [ ] `/trace` 旧路径 302 到 `/trajectory`（TanStack `redirect`，参照 `main.tsx` 里 settings 旧书签的做法）；`app-landing.ts` 落地路由改为 `/trajectory`。
- [ ] `bun run typecheck` 通过。
- [ ] `bunx vitest run apps/desktop packages` 全绿（含 `dev/ui-intent/regions.test.ts`）。
- [ ] `git status` 显示文件改名是 `git mv`（保留 history）。

## 背景
ADR：`docs/adr/0032-session-dock-and-trajectory-vocabulary.md`。产品词汇（CONTEXT.md、README 英文、regions term）已经是 Trajectory；本次补代码标识符。上一轮同类改名的 brief 可参考 `.scratch/session-dock-rename/brief.md`。

盘点结论（已核实）：
- 跨包契约只有 `packages/core/src/agent-runtime-event.ts:13` 的 `AgentSurface` 联合值 `"trace"`，backend normalizer 写入，落盘 JSONL。README.md:68 明确它是 wire contract，**不改**。
- 没有任何 localStorage / 落盘 key 含 trace，改名不碰已存数据。
- Cockpit 的 DOM 钩子主要是 `data-slot`，不是 testid；`regions.ts:43` 用 `[data-slot="trace-tally"]` 绑 **Tally** 术语，改 slot 必须同 PR 改 regions.ts。

## 涉及文件
文件改名（`git mv`，含同名测试）：
- `entities/session/trace-model.ts` → `trajectory-model.ts`
- `pages/trace.tsx` → `pages/trajectory.tsx`
- `shared/ui/pi-trace-inspector.tsx` / `pi-trace-ledger.tsx` / `pi-trace-strip.tsx` → `pi-trajectory-*.tsx`

导出标识符（全部 Trace→Trajectory，保持驼峰/命名风格）：
- trajectory-model.ts：`TraceRole/TraceStep/TraceTurn/TraceRun/buildTraceTurns/buildTraceRuns/TraceFilter/emptyTraceFilter/isTraceFilterActive/traceStepMatches`
- pi-trajectory-ledger.tsx：`TraceStepType/traceStepType/traceStepStatus/TraceStepBadge/PiTraceLedgerRunProps/PiTraceLedger`
- pi-trajectory-inspector.tsx：`traceInspectorTabs/TraceInspectorTab/TraceToolSchema/PiTraceInspector`
- pi-trajectory-strip.tsx：`PiTraceStrip`
- pages/trajectory.tsx：`TraceWorkspace/TraceIndexPage/TraceSessionPage/TraceEmptyState`
- app-shell.tsx：`TraceUsageNavigation/traceUsageNavigationItems`；agent-workspace.tsx：`AssistantRunTrace` → `AssistantRunTrajectory`
- 引用点：`pages/session-detail.tsx`、`pages/design-components.tsx`、`app/main.tsx`、`dev/ui-intent/regions.ts`（components 列表按 displayName 绑定，必须同步）及各测试。

路由：`main.tsx` `traceIndexRoute` path `/trace` → `/trajectory`，新增 `/trace` redirect；`app-landing.ts`、`pages/app-landing.tsx`、`app-shell.tsx:227/230/292`、测试 `app-shell.test.tsx`、`app-landing.test.ts`。

data-testid（pages/trajectory.tsx）：`trace-workspace/trace-split-view/trace-list-pane/trace-detail-pane/trace-no-providers-empty-state` → `trajectory-*`；`pages/trajectory.test.tsx` 同步。

data-slot（11 个）：`trace-tally/trace-filter-bar/trace-inspector-handle/trace-inspector/trace-ledger/trace-ledger-run/trace-ledger-row/trace-turn-boundary/trace-step-badge/trace-strip/trace-strip-selection/trace-strip-cursor` → `trajectory-*`；引用测试：`session-detail.test.tsx`、`pi-trace-ledger.test.tsx`、`design-components.test.tsx`、`regions.test.ts`、`regions.ts:43`。

可见文案：
- `app-shell.tsx:226` 侧栏 `"Trace"`→`"Trajectory"`、`:293` 页标题、`:744` aria `"Trajectory and usage navigation"`
- `pages/trajectory.tsx:19/21`：`"Trajectory"` / `"Select a Pi session trajectory"`
- `session-list.tsx:223-224`：`"Trajectory"` / `"Historical Pi session trajectories"`
- `design-components.tsx:2267-2273` 分类 `"Workspace & trajectory"`（同步 `design-component-browser.tsx:15/27` 类型与 `design-catalog.test.tsx:13`）、`:2271/2272` 描述、`:890` `"No trajectory entries."`、`:1130`
- `README.zh-CN.md:7/13/68/96`：trace → trajectory（对齐英文 README 的表述；`:68` 的 `trace` 事件戳值保留并加同样的说明）
- `docs/self-built-ui.md:27-29`：Trace Cockpit → Trajectory Cockpit

## 约束
- 只做机械改名，不改行为、不重构、不动样式。
- 提交信息 Conventional Commits，如 `chore(desktop): rename Trace identifiers to Trajectory (ADR-0032)`；可拆多个 commit（文件 mv / 标识符 / 路由 / 文案）。不加署名行。
- 代码注释英文。

## 范围外（不要改）
- `AgentSurface` 的 `"trace"` 值及所有 `surface: "trace"` 的测试断言（core、backend、desktop 共 71 处）。
- `e2e/playwright.config.ts` 的 `trace:` 配置和 `e2e/README.md` 对应说明。
- `"Trace boundary pass"` fixture 标题（`app-shell.tsx:212`、`e2e/fixtures/electron-app.ts:365`、`agent-workspace.test.tsx:1336/1343`）——e2e 靠它断言生产构建无 fixture 数据。
- `pages/agent-workspace.tsx:181` 的 `kind?: "trace" | "thinking" | "tool"` timeline 枚举。
- `chat.css`、`chat-tool.tsx`、`chat-chain-of-thought.tsx`、`session-projection.test.ts` 里作为普通英文名词的 "settled trace / reasoning trace"。
- `shared/runtime.ts` fixture 假数据里的 `"src/trace.tsx"` 假路径。
- CONTEXT.md 的 `_Avoid_` 反例与 surface 说明；`docs/adr/0027-*` 等历史 ADR 文件名与内容；`.scratch/` 归档。
- 任何 UI 视觉改动（下一轮单独做）。
