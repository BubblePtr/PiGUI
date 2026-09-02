# 任务简报：将 context 占用指示器从 composer 移至顶部 toolbar

## 关联 Spec
GitHub Issue #128（`gh issue view 128`）。目标与验收标准以该 issue 为准。

## 背景
- 现状：`agent-workspace.tsx:797-805` 把 `ContextUsageMeter` 塞进 `ChatPromptInput` 的 `headerContext` 槽位（Astryx `ChatComposer` 的 header 区，输入框右上角）。
- 目标落点：`agent-workspace.tsx:2730` 的 `SessionToolbarActions`，它经 `AppFrame` 的 `toolbarActions` 渲染进 `app-shell.tsx:794` 的 header chrome 动作区（`h-full` 行内、现有成员是 `size-4` IconButton，高度紧）。
- 外层 `AgentWorkspacePage`（`agent-workspace.tsx:3884`）构造 `SessionToolbarActions` 时手上就有 `selectedSessionProjection`，`contextUsage` / `runtimeModel` / `piSessionId` 都在 projection 上，无需新数据管道。
- `ContextUsageMeter` 本体在 `shared/ui/context-usage-meter.tsx`，阈值语义（70/90、`?` 非假零、compacting indeterminate）是对齐 Pi CLI footer 的既有决策，不得改动。

## 涉及文件
- `apps/desktop/src/pages/agent-workspace.tsx` — 移除 composer 的 headerContext；SessionToolbarActions 增加紧凑指示器
- `apps/desktop/src/shared/ui/context-usage-meter.tsx` — 新增紧凑形态
- `apps/desktop/src/shared/ui/chat/chat-prompt-input.tsx` — headerContext prop 视调用方存留决定去留
- `apps/desktop/src/pages/design-components.tsx` — Gallery 更新
- `docs/self-built-ui.md` — 条目对账
- 对应测试文件（TDD：先写失败测试）

## 约束
- Astryx first：动 UI 前先 `bunx astryx build "compact context usage gauge for toolbar"` 探索可复用件；styling 规则见 `apps/desktop/AGENTS.md`。
- 颜色/间距走语义 token 或 Astryx 一级 token，禁止硬编码。
- tooltip 用仓库/Astryx 现有 tooltip 机制，不引新依赖。
- TDD：无失败测试不写生产代码。
- Conventional Commits;在 feature 分支上工作(如 `feat/context-meter-toolbar`),不动 main。

## 范围外
- 不改 context_usage 事件管道、projection 结构、阈值数值。
- 不重构 SessionToolbarActions 其他成员或 header chrome 布局。
- 不动 Session actions sheet 内容。
