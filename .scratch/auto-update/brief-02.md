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
