# 任务简报：升级主动入口（侧栏徽标与 macOS 菜单）

## 关联 Spec

GitHub Issue #199（`gh issue view 199`）——目标、要做的事与验收标准以它为准。决策依据：`docs/adr/0033-in-app-update-via-electron-updater.md`；PRD：`.scratch/auto-update/PRD.md`。

## 背景

仓库：`/Users/void/code/opensource/PiGUI`（Bun monorepo，Electron 42 桌面端在 `apps/desktop`）。先读 `README.md` 的 Architecture 与 `AGENTS.md`。

#196 已合并（PR #198）。现有升级实现：主进程 `apps/desktop/electron/updater.ts` 是状态机，`main.ts` 装配并截获 `update:status` / `update:check` / `update:install`，状态通过 `pigui:update-event` 推送；渲染层 `shared/runtime.ts` 暴露 `onUpdateEvent`，`shared/update-protocol.ts` 是状态类型；设置页 `pages/settings.tsx` 的 `AboutUpdatesSection` 用 react-query 拉状态并订阅推送。本任务要把这个状态源抽成共用 hook，再加两个入口。

侧栏导航在 `apps/desktop/src/app/app-shell.tsx`：`systemNavigationItems` 定义 Settings 项，`SidebarSessionGlyph` 是现有未读圆点的样板。`main.ts` 目前没有 `Menu`，Electron 用默认菜单；`browser-host.ts` 及其测试是主进程模块如何被测试的参考。

## 涉及文件

- `apps/desktop/src/app/app-shell.tsx`、`app-shell.test.tsx` — 侧栏徽标
- `apps/desktop/src/pages/settings.tsx`、`settings.test.tsx` — 改用共用 hook
- 新建 `apps/desktop/src/entities/update/use-update-status.ts`（或等价位置）
- 新建 `apps/desktop/electron/app-menu.ts`、`app-menu.test.ts`；`main.ts` 只加装配调用
- `apps/desktop/src/dev/ui-intent/regions.ts` — 若改动区域级组件名，同步绑定表
- `docs/self-built-ui.md`、`docs/release/macos.md` — 文档

## 约束

- 你在独立 worktree 上工作；首次 push 前 `git branch -m feat/update-entry-points`，不要切到 `main`。
- TDD：先写失败测试再实现；验证命令见 issue 验收标准。
- 主进程保持薄：菜单构建全部在 `app-menu.ts`。
- UI 先 `bunx astryx build "sidebar nav item with notification dot badge"` 找 kit；自建组件必须放 `shared/ui/` 并同 PR 登记 `/design` 页。token 走 `app/styles.css` 语义桥，不写死颜色。
- 代码注释英文；文档中文；Conventional Commits；完成后推分支并开 PR（正文写 `Closes #199`），不要自己合并。

## 范围外

见 issue"范围外"。另：不改 updater 状态机本身；不改发布脚本。

## 派发增量（实现时按此裁决，勿再猜）

工作目录是 worktree `/Users/void/orca/workspaces/PiGUI/update-entry-points`，当前分支 `BubblePtr/update-entry-points`。实现与测试即可，**不要 commit / push / 开 PR / 改分支名**（编排层收尾）。

### Hook

- 路径：`apps/desktop/src/entities/update/use-update-status.ts`。
- 用 `useState` + `useEffect` 调 `invoke("update:status")` 并 `onUpdateEvent` 订阅，对齐 `use-provider-auth-status.ts`。**不要用 react-query**：`AppFrame` 被大量页面测试挂载且没有 `QueryClientProvider`，`useQuery` 会把它们全部打爆。
- 「同一状态源」= Settings 的 `AboutUpdatesSection` 删掉本地 `useQuery`/`setQueryData` 订阅，改为调这个 hook。check/install mutation 留在 section 里。
- 无 `window.pigui` 时走现有 `invoke` / `onUpdateEvent` 的 browser fallback（disabled），现有 `app-shell` 测试才不会因缺 mock 而挂。

### 侧栏徽标

- 已跑 `bunx astryx build "sidebar nav item with notification dot badge"`：kit 指向 `SideNavItem.endContent`（`SideNavEndContent`），以及 Badge / StatusDot。
- **不要用 Badge**（AGENTS.md：Badge 只给计数）。**不要用 StatusDot**：issue 要求尺寸与 token 对齐现有 `SidebarSessionGlyph` 未读圆点（`size-2 rounded-full bg-primary`，`role="img"`）。
- **不要新建 `shared/ui/` 组件**，因此也不改 `/design` 或 `docs/self-built-ui.md`。可在 `app-shell.tsx` 抽本地 helper，让未读圆点与 Settings 徽标共用同一 markup。
- Settings 项 `endContent`：仅 `state === "ready"` 时渲染 `aria-label="Update ready"` 的圆点。点进 `/settings` 后仍显示，直到状态离开 `ready`。
- 不要改 `regions.ts`（没有改区域级组件名）。

### 菜单

- 可测缝：导出纯函数 `buildAppMenuTemplate`（不 import `electron`），测试只打它。`installAppMenu({ updater, navigateToSettings })` 才 `Menu.buildFromTemplate` / `setApplicationMenu`。
- 非 darwin：`installAppMenu` 直接 return，不碰默认菜单。darwin：保留 `appMenu`/`fileMenu`/`editMenu`/`viewMenu`/`windowMenu` 等 role；在应用菜单 About 之后插入 `Check for Updates…`（Unicode 省略号）。
- `enabled: updater.getStatus().state !== "disabled"`。点击：`updater.check()` 然后 `navigateToSettings()`。
- `main.ts`：`appUpdater` 创建后 `installAppMenu({ updater: appUpdater, navigateToSettings })`。导航用 hash router（Electron 下是 `createHashHistory`）：对主窗口 `webContents.executeJavaScript` 设 `location.hash = "#/settings"`。不要新 IPC，不要改 preload。

### 测试

- `app-shell.test.tsx`：`ready` 有徽标；`idle` / `available` / `disabled` 没有；`onUpdateEvent` 推送后切换；在 `/settings` 且 `ready` 时徽标仍在。mock `window.pigui` 的 `invoke("update:status")` + `onUpdateEvent`。`renderAppFrame` 不必包 QueryClient。
- `app-menu.test.ts`：darwin 模板含该项且 click 调 `check`；disabled 时 `enabled: false`；非 darwin 不含该项。
- `settings.test.tsx` 不回归。
- 验证：`bun run test` 与 `bun run typecheck`（仓库根）。不要跑 e2e / packaging。

### 文档

- `docs/release/macos.md` About & Updates 那句补「侧栏徽标与应用菜单」。中文。
