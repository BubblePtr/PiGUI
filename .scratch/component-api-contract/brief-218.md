# 任务简报：shared/ui 命名统一（#218）

## 关联 Spec
GitHub Issue #218（`gh issue view 218`）。改名清单与验收标准以该 issue 为准；命名规则在 `.scratch/component-api-contract/PRD.md` 决策 1。

## 背景
- 前一切片 #217 已在本分支的父分支 `fix/ui-api-contract` 落地：每个组件现在接 `className` + rest 透传。本切片只改名，不改行为、不改视觉。
- 命名基准是 Astryx（React Aria 惯例），不是原生 HTML：`isOpen`/`onOpenChange`、`isDisabled`、`defaultOpen`。实测 Astryx dist 里 `isOpen` 139 处、`isDisabled` 344 处、`onOpenChange` 57 处。
- `shared/browser-protocol.ts` 里的 `designMode`、`activeTabId` 是主进程 IPC 契约字段，**不改**；只改 `BrowserSurface` 组件 prop 及其调用点的映射。
- `pages/design-components.tsx`（2341 行）是 `/design` 页注册表，每个组件的所有变体在那里，改名后必须全部同步。
- `docs/design/workspace.md:22` 有 `SessionSurfaceTabs` 的用法示例（`onActivate`），`docs/design/chat.md:55` 有 `ModelSelectorControl` 的 `isLocked`，同步改。

## 涉及文件
- `apps/desktop/src/shared/ui/session-dock/session-dock.tsx`、`surface-bar.tsx`
- `apps/desktop/src/shared/ui/chat/chat-chain-of-thought.tsx`、`chat-chain-of-thought-rail.tsx`
- `apps/desktop/src/shared/ui/browser/browser-surface.tsx`
- `apps/desktop/src/shared/ui/pi-trajectory-ledger.tsx`、`pi-trajectory-strip.tsx`
- `apps/desktop/src/shared/ui/model-selector/model-selector-control.tsx`
- 调用点：`pages/agent-workspace.tsx`、`pages/session-browser-panel.tsx`、`pages/session-terminal-panel.tsx`、`pages/session-detail.tsx`、`pages/design-components.tsx`
- 对应 `*.test.tsx`
- `docs/design/README.md`（硬规则 7 补命名段）、`docs/design/workspace.md`、`docs/design/chat.md`

## 约束
- 纯改名：`git diff` 里不应出现逻辑改动。改名用 TypeScript 类型驱动（先改类型，`bun run typecheck` 报出全部调用点）。
- 本切片不需要新测试（改名没有可保护的新行为）；现有测试改名后必须全绿。在报告里声明这条豁免。
- 验证：`bun run typecheck`、`bun run test`，以及 issue 里的 `grep -rnw` 旧名为 0 处。
- 在当前分支 `refactor/ui-prop-naming` 上工作，Conventional Commits 提交，**不要 push、不要开 PR、不要碰 main**。

## 范围外
- 复合件拆分与 context（#219）。
- issue 里"不改"清单中的名字。
- 任何行为或样式改动。
