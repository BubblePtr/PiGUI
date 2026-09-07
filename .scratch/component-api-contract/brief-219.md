# 任务简报：shared/ui 复合件（#219）

## 关联 Spec
GitHub Issue #219（`gh issue view 219`）。目标与验收标准以该 issue 为准；原则在 `.scratch/component-api-contract/PRD.md` 决策 3。

## 背景
- 前两切片已在父分支落地：组件接 `className` + rest 透传（#217），prop 名已统一为 `activeTabId`/`onActiveTabChange`、`isDesignMode`、`onSelectedStepChange` 等（#218）。本切片用新名字。
- `BrowserSurface`（`shared/ui/browser/browser-surface.tsx`）现状：27 个 prop；内部已有私有 `BrowserSurfaceBody`，第一行复用 `SessionSurfaceBar` + `SessionSurfaceTabs`，第二行是地址栏 / 导航 / design mode 工具条，下面是 viewport（`viewportRef` 指向内层 div，主进程 `WebContentsView` 按它的 bounds 定位，见 `use-browser-view-bounds.ts`）。只有 `state.kind === "live"` 渲染 viewport；`narrow` / `unsupported` / `empty` / `error` 各有独立提示；`snapshot` 是弹层/动画期间的静态截图。这些行为全部保留，只改组合方式。
- 复合件用 React context 共享根的 `state` 与共享回调；子件在根外使用时应抛出清晰错误（现有仓库无复合件 context 先例，参照 Radix/Base UI 的 `useXxxContext` 写法即可）。
- `PiTrajectoryLedger`（`shared/ui/pi-trajectory-ledger.tsx`）：`runs` 快捷路径与 `children` 路径（页面用来做虚拟化）都存在；`Run` 目前从 `Omit<PiTrajectoryLedgerRunProps, "run">` 拿 7 个共享 prop。改为 context 后 `runs` 路径行为不变。
- `pages/design-components.tsx` 里 `BrowserSurface` 有 13 个状态用例（多 tab、单 tab、零 tab、初始化、创建中、创建失败、空白 tab、加载、标注、发送、快照、错误、不可用），全部改为复合写法并保持可见效果一致。

## 涉及文件
- `apps/desktop/src/shared/ui/browser/browser-surface.tsx` + `browser-surface.test.tsx`
- `apps/desktop/src/shared/ui/pi-trajectory-ledger.tsx` + `pi-trajectory-ledger.test.tsx`
- `apps/desktop/src/pages/session-browser-panel.tsx`、`pages/session-detail.tsx`、`pages/design-components.tsx`
- `docs/design/workspace.md`、`docs/self-built-ui.md`（browser-surface 与 pi-trajectory-ledger 两行）

## 约束
- TDD：先为"`Run` 只传 `run` 即可从 context 拿到选中态"与"`BrowserSurface.Viewport` 只在 live 态渲染"这类行为写失败测试。
- 子件 prop 只属于自己那块；根组件 prop ≤ 6。`isOpening` / `isInitializing` 并入 `state` 联合类型后删除。
- 不改视觉、不改 token、不改 IPC 协议（`shared/browser-protocol.ts`）。
- 验证：`bun run typecheck`、`bun run test`。
- 在当前分支 `refactor/ui-compound-surfaces` 上工作，Conventional Commits 提交，**不要 push、不要开 PR、不要碰 main**。

## 范围外
- `PiTrajectoryStrip`、`ComposerInsertMenu`、其它组件。
- 新增任何 `defaultX` 非受控入口。
