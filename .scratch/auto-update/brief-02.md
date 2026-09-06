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
- 模块级 snapshot：一次 `invoke("update:status")` + 一次 `onUpdateEvent` 订阅；hook 用 `useSyncExternalStore`。两个消费者读同一引用。组件卸载不拆订阅（切页 AppFrame 重挂时不闪、设置页不反复 Loading version…）。
- 导出 `resetUpdateStatusStore()` 给测试：清 snapshot、停订阅、允许下次重新 start。`app-shell.test.tsx` 与 `settings.test.tsx` 的 `beforeEach` 必须调用。
- **不要用 react-query**：`AppFrame` 被大量页面测试挂载且没有 `QueryClientProvider`。
- 「同一状态源」= Settings 的 `AboutUpdatesSection` 调这个 hook。check/install mutation 留在 section 里。
- 无 `window.pigui` 时走现有 `invoke` / `onUpdateEvent` 的 browser fallback（disabled）。

### 侧栏徽标

- 已跑 `bunx astryx build "sidebar nav item with notification dot badge"`：kit 指向 `SideNavItem.endContent`（`SideNavEndContent`），以及 Badge / StatusDot。
- **不要用 Badge**（AGENTS.md：Badge 只给计数）。**不要用 StatusDot**：issue 要求尺寸与 token 对齐现有 `SidebarSessionGlyph` 未读圆点（`size-2 rounded-full bg-primary`，`role="img"`）。
- **不要新建 `shared/ui/` 组件**，因此也不改 `/design` 或 `docs/self-built-ui.md`。可在 `app-shell.tsx` 抽本地 helper，让未读圆点与 Settings 徽标共用同一 markup。
- Settings 项 `endContent`：仅 `state === "ready"` 时渲染 `aria-label="Update ready"` 的圆点。点进 `/settings` 后仍显示，直到状态离开 `ready`。
- 不要改 `regions.ts`（没有改区域级组件名）。

### 菜单

- 可测缝：导出纯函数 `buildAppMenuTemplate`（不 import `electron`）。`installAppMenu` 把 `process.platform` 传进 `buildAppMenuTemplate`；template 长度为 0 则 return，不调用 `setApplicationMenu`。禁止再写 `platform: "darwin"`。
- darwin：保留 `appMenu`/`fileMenu`/`editMenu`/`viewMenu`/`windowMenu` 等 role；在应用菜单 About 之后插入 `Check for Updates…`（Unicode 省略号）。
- `enabled: updater.getStatus().state !== "disabled"`。点击：`updater.check()` 然后 `navigateToSettings()`。
- 关窗后菜单导航：抽出 `apps/desktop/electron/app-navigation.ts`。无窗口（`getWindow()` 为 null / destroyed）则 `createWindow()`，有窗口则 `show()` + `focus()`；再 `webContents.send(navigateRequestChannel, { to: "/settings" })`。主框架仍在加载则等到 `did-finish-load`。`main.ts` 的 `navigateToSettings` 只装配 helper；`activate` 仍按现有逻辑补窗。
- 通道常量 `pigui:navigate`（`navigateRequestChannel`，preload / main / runtime 共用，payload `{ to: string }`）。`PiGUIRendererApi.onNavigateRequest`；Electron 走 preload，非 Electron fallback 为 no-op unsubscribe。`main.tsx` 在 router 创建后订阅并 `router.navigate({ to })`。
