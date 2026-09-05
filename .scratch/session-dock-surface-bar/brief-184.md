# 任务简报：SessionDock 表头改为 Surface 第一行（#184）

> 简报是派发视图，不是事实源。目标与验收标准以 GitHub Issue 为准。

## 关联 Spec
GitHub Issue #184（`gh issue view 184`）。决策依据：`docs/adr/0028-session-inspector-rail-surface-host.md`「表头改为 Surface 第一行（2026-09-05 修订）」。

## 背景
- 当前分支 `feat/session-dock-surface-bar`，ADR 修订已提交。工作在本分支上做，不要开新分支、不要 push。
- SessionDock 现状：`apps/desktop/src/shared/ui/session-dock/session-dock.tsx` 里 `<header>`（h-10：图标 + title + hint）+ 内容列 + 44px rail。`aside` 用 `aria-labelledby={headingId}`。
- 三个 surface 的内容由 `apps/desktop/src/pages/agent-workspace.tsx` 的 `SessionSurfaceContent` 作为 children 注入：Changes 是同文件的 `SessionChangesPanel`（当前顶部是 `Diff summary` h3 + totals + 刷新 IconButton）；Terminal 是 `pages/session-terminal-panel.tsx`（手写 tab 条，注释里说明为何不用 Astryx TabList：每个 tab 带自己的关闭按钮）；Browser 是 `pages/session-browser-panel.tsx` → `shared/ui/browser/browser-surface.tsx`（地址栏带 `py-1.5`，工具条只能用普通按钮，见文件内注释与 ADR-0029，不要在里面引入任何弹层组件）。
- Rail 徽标：Changes 文件数来自页面层 `useSessionChanges`，Terminal 实例数来自 `onInstancesChange` 上报。两处不要改数据来源。
- 排版基线：Chat 那一栏的标题带是 40px；Dock 第一行也是 40px，与它同基线。Terminal 现有注释里的尺寸推导（chip 行 28px + 6px 上下、px-2 让图标落在 16px 列）是对的，抽成共享组件时保留。
- 设计系统规则（`AGENTS.md`）：新原语先 `bunx astryx build "<idea>"` 看有没有等价物，再落 `shared/ui/`；加到 `/design` 页（`pages/design-components.tsx` 的 SessionDock gallery）同 PR；token 走 `styles.css` 语义桥，不写硬编码颜色；`docs/self-built-ui.md` 条目同步。
- 不要在 Bun 下跑 terminal pty driver 相关的一次性脚本（`AGENTS.md` Runtime gotchas）；vitest 正常跑即可。

## 涉及文件
- `apps/desktop/src/shared/ui/session-dock/session-dock.tsx` — 删表头、改 aria-label
- `apps/desktop/src/shared/ui/session-dock/session-dock.test.tsx` — 更新断言
- `apps/desktop/src/shared/ui/session-dock/surface-bar.tsx`（新）— `SessionSurfaceBar`、`SessionSurfaceTabs` + 测试
- `apps/desktop/src/shared/ui/session-dock/surface-registry.ts` — 注释更新
- `apps/desktop/src/pages/session-terminal-panel.tsx`（+ test）— 消费共享 tab 条
- `apps/desktop/src/pages/agent-workspace.tsx` `SessionChangesPanel`（+ `agent-workspace.test.tsx`）— 第一行改为 bar
- `apps/desktop/src/shared/ui/browser/browser-surface.tsx`（+ test）— 地址栏走 bar
- `apps/desktop/src/pages/design-components.tsx`（+ test）— gallery
- `docs/self-built-ui.md`、`apps/desktop/src/dev/ui-intent/regions.ts`（若组件改名）

## 约束
- TDD：先改/写失败的测试再实现。`SessionSurfaceTabs` 至少覆盖：切换、关闭、新建、exited 态、`role=tablist/tab` 与 `aria-selected`。
- 不新增持久化、不改 RPC、不改 Browser 主进程。
- 代码注释英文，写 why。
- 验证命令：`bun run --cwd apps/desktop test` 与 `bun run --cwd apps/desktop typecheck`（如脚本名不同以 `apps/desktop/package.json` 为准）。完成后附带输出。

## 范围外
- Browser 多实例（#185）。
- Changes 第一行右侧的新动作（commit / push 等），只留位置。
- 任何 rail 或宽度逻辑的改动。
