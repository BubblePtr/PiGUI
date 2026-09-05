# 任务简报：SessionInspector → SessionDock 机械改名

## 目标
右侧 surface 宿主从 `SessionInspector` 改名为 `SessionDock`，代码、测试、testid、可见文案、UI intent 区域表和自建组件账本全部跟上；Trace Cockpit 里的 `PiTraceInspector` 保持不变。

## 验收标准
- [ ] `grep -rn "SessionInspector\|session-inspector\|sessionInspector" apps/desktop/src docs/self-built-ui.md` 为空（`.scratch/` 归档不动）。
- [ ] `PiTraceInspector`、`pi-trace-inspector`、`TraceInspectorTab`、`trace-inspector-handle` 等 Trace 侧标识符零改动。
- [ ] `bun run typecheck` 通过。
- [ ] `bunx vitest run apps/desktop` 全绿（含 `apps/desktop/src/dev/ui-intent` 的 regions 测试）。

## 背景
ADR-0032（`docs/adr/0032-session-dock-and-trajectory-vocabulary.md`，我正在同一分支上写，coder 不用等它）决定：右侧宿主叫 **Dock**（整体 = 内容区 + Rail），里面每个面板叫 **Surface**，Changes / Terminal / Browser 是 **Built-in Surface**。"Inspector" 从此只指 Trace Cockpit 的步骤详情栏（`PiTraceInspector`）。

本分支叠在 `fix/inspector-handle-gutter` 上（PR #180），`agent-workspace.tsx` 那边已经改过 resize handle，直接在当前工作树上改即可。

## 涉及文件
- `apps/desktop/src/shared/ui/session-inspector/` → `git mv` 成 `apps/desktop/src/shared/ui/session-dock/`；文件 `session-inspector.tsx` / `.test.tsx` → `session-dock.tsx` / `.test.tsx`；`surface-registry.ts` 文件名不变，注释里的 inspector 改 dock。
- 导出改名：`SessionInspector`→`SessionDock`，`SessionInspectorTrigger`→`SessionDockTrigger`，`sessionInspectorDefaultWidthPx`→`sessionDockDefaultWidthPx`，`sessionInspectorChatMinWidthPx`→`sessionDockChatMinWidthPx`，`sessionInspectorResizableBounds`→`sessionDockResizableBounds`。
- testid：`session-inspector`→`session-dock`，`session-inspector-heading`→`session-dock-heading`，`session-inspector-trigger-rail-slot`→`session-dock-trigger-rail-slot`。
- 可见文案 / aria：`label="Session inspector"`（工具栏开关）→ `"Session dock"`；`label="Resize Session inspector"`（agent-workspace.tsx）→ `"Resize Session dock"`。测试里的 `getByRole(..., { name: "Session inspector" })` 等同步。
- `apps/desktop/src/pages/agent-workspace.tsx` / `.test.tsx`：import、变量（`inspectorOpen`、`setInspectorOpen`、`onInspectorOpenChange`、`renderInspector` 等凡是指右侧宿主的）改成 dock 命名；测试 helper `setDockedSessionInspectorLayout` → `setDockedSessionDockLayout` 或更顺的名字。注释里“inspector”指右侧宿主的改 dock。
- `apps/desktop/src/pages/session-terminal-panel.tsx`、`session-browser-panel.tsx`、`shared/ui/browser/*`、`shared/ui/terminal/terminal-view.tsx`、`entities/session/use-session-changes.ts`：只有注释 / 文案提到 inspector（指宿主）的地方改 dock。
- `apps/desktop/src/pages/design-components.tsx` / `design.test.tsx` / `design-components.test.tsx`：`SessionInspectorGallery`→`SessionDockGallery`，目录条目的名称与说明同步。
- `apps/desktop/src/dev/ui-intent/regions.ts`：
  - `term: "Inspector"` 只保留 `components: ["PiTraceInspector"]`，去掉 testIds。
  - 新增 `term: "Dock"`，`components: ["SessionDock"]`，`testIds: ["session-dock"]`。
  - `term: "Trace Cockpit"` 改为 `"Trajectory Cockpit"`。
  - `term: "Structured Action Surface"` 改为 `"Surface"`，components 列表不变。
  - 这些 term 我会同步写进 CONTEXT.md；regions 测试断言 term 必须在 CONTEXT.md 里有 `**Term**:` 标题，若跑测试时 CONTEXT.md 还没更新，等我提交后重跑即可，不要自己改 CONTEXT.md。
- `docs/self-built-ui.md`：`session-inspector` 行改为 `session-dock`，路径与描述中的 inspector（指宿主）改 dock；`terminal-view` / `browser-surface` 行里提到 `SessionInspector` 的改 `SessionDock`。
- `apps/desktop/src/pages/session-detail.tsx` / `.test.tsx`、`shared/ui/pi-trace-*`：**不动**，它们的 inspector 是 Trace 侧的。

## 约束
- 纯机械改名，不改行为、不改样式、不重排代码。
- 用 `git mv` 保留历史。
- 不提交、不推送；改完跑验收命令并把输出贴回。
- 注释语言英文，遵循现有风格。

## 范围外
- 不改 `PiTrace*` 任何标识符（Trajectory 的代码改名按 ADR-0032 延后）。
- 不改 README / CONTEXT.md / ADR（我负责）。
- 不改 `.scratch/` 下的归档文档。
- 不改 localStorage / 持久化 key（现查无相关 key，若发现则保留原值并在回报中指出）。
