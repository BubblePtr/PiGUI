# Component API Contract：shared/ui 组件契约收口

> 立项依据：2026-09-08 对 `apps/desktop/src/shared/ui/` 全部约 38 个导出组件的 API 审计（对照 emil component-design 清单）。
> 决策来源：用户拍板"修"；工作由外部 worker（Codex，`codex exec`）在 worktree 中执行，主循环只做 spec、review 与验收。
> 落地：三个切片开成 GitHub Issues，本文"切片"段回链。

## 问题

审计结论（结论已存 Nowledge Mem）：

1. **DOM 透传缺席。** 全部组件零 `ref` 转发；除 `DotMatrix` 与 `icons.tsx` 外没有任何组件把剩余 props 透传到根元素。`data-testid` / `aria-*` 全靠组件内部硬编码，页面层无法附加。`PiTrajectoryLedger` 更危险：未识别的 prop 不是丢弃而是转给 `Run`，拼错的 prop 静默落到子组件。
2. **`className` 逃生口缺席**，约 16 个组件不接 `className`（`ChatQueuedMessage`、`ChatRunFailure`、`ChatThoughtMarkdown`、`ChatToolDetail`、`SessionDock`、`SessionDockTrigger`、`SessionSurfaceBar`、`SessionSurfaceTabs`、`BrowserSurface`、`ContextUsageMeter`、`PiTrajectoryInspector`、`PiTrajectoryStrip`、`ModelSelectorControl`、`ComposerAttachmentDrawer`、`ComposerInsertMenu`、`TrajectoryStepBadge`）；`PiKpi` 只有 `valueClassName`。
3. **命名不统一。** 同一概念 2 到 3 种拼法：开合 `open` vs `isOpen`、`defaultExpanded` vs Base UI 的 `defaultOpen`；当前项 `activeSurfaceId/onActiveSurfaceChange`、`activeId/onActivate`、`activeTabId/onActivateTab` 三套；台账 `selectedStepId/onSelectStep` vs 概览带 `activeStepId/onSelect`；`isLocked` 进组件后立刻改名 `isDisabled` 传给 Astryx。
4. **`BrowserSurface` 27 个 prop** 是唯一真正的 prop 爆炸：7 个布尔与 `state` 联合类型重叠，`isOpening` / `isInitializing` 只在 empty 态用到；内部已分成 tabs 条、工具条、viewport 三块，却没有暴露为复合件。
5. **`PiTrajectoryLedger.Run` 是没有 context 的复合件**：作为 children 使用时要手工传 8 个 prop。

不算缺陷、不改：全部受控-only（状态在页面与 projection，正确）；`tools[]` / `items[]` / `series[]` 等来自读模型的数据数组；`ModelSelectorControl.query`、`ComposerInsertMenu.catalog`、`ChatRunFailure.detailsOpen` 这类纯内部瞬态。

## 决策

### 1. 命名以 Astryx（React Aria 惯例）为平台

仓库是 Astryx 之上的薄壳，"像平台一样命名"在这里指 Astryx 的惯例（实测 dist：`isOpen` 139 处 / `isDisabled` 344 / `onOpenChange` 57 / `isSelected` 28），不是原生 HTML 的裸布尔：

- 布尔：`isX` / `hasX` / `canX`（`isOpen`、`isStreaming`、`hasSteps`、`canGoBack`）。禁止裸 `open`、`designMode` 这种名词布尔。
- 受控状态对：`x` + `onXChange`（`isOpen`/`onOpenChange`、`activeId`/`onActiveChange`、`selectedStepId`/`onSelectedStepChange`）。
- 命令回调：`onVerb`（`onRetry`、`onAdd`、`onClose`、`onSteer`）。点击用 `onPress`（Astryx/React Aria 用法），不用 `onClick`。
- 非受控初值：`defaultX`，与 Base UI / Astryx 同名（`defaultOpen`）。
- 直接透传给 Astryx 的 prop 保持 Astryx 原名（`isDisabled`，不再叫 `isLocked`）。

### 2. 每个 shared/ui 组件的最低契约

- 接 `className`，合并到根元素。
- 剩余 props 透传到根 DOM 元素（`...rest`），类型用 `ComponentProps<"div">` 之类派生；React 19 下 `ref` 随之作为普通 prop 到达根元素，不需要 `forwardRef`。根是 Astryx 组件时透传到该组件。
- 指向内部元素的 ref 用具名 prop（`inputRef`、`viewportRef`），不冒充根 ref。
- 已有的内部 `data-testid` 保留（现有测试依赖），但页面层传入的 `data-testid` 必须能覆盖或到达根元素。
- 不识别的 prop 不得转发给子组件（`PiTrajectoryLedger` → `Run` 的泄漏要堵上）。
- 这条写进 `docs/design/README.md` 硬规则，并由一个表驱动测试守住（渲染每个组件最小 props，断言 `data-testid` 与 `className` 落在根元素）。

### 3. 复合件必须有 context

`PiTrajectoryLedger.Run` 通过 context 读取 `selectedStepId` 等共享 props；`BrowserSurface` 拆成 `BrowserSurface`（根，持 `state` 与共享回调）+ `.Tabs` + `.Toolbar` + `.Viewport`，`isOpening` / `isInitializing` 并入 `state` 联合类型。只做样式包装、无共享状态的静态子件（`ChatChainOfThought.Steps`、`ChatMessage.*`）不加 context。

## 范围外

- 不改任何组件的受控-only 模型，不加 `defaultX` 给页面持有的状态。
- 不把来自 projection 的数据数组改成 children。
- 不动 `PiTrajectoryStrip` 内置的 Steps/Time 切换与 `onBrush` 缺省即禁用拖拽的语义。
- 不动 `ComposerInsertMenu` 的 `commands/skills/plugins` 配置数组、`useFilePicker` 返回 JSX 的形态。
- 不改视觉，不动 token。

## 切片

按顺序做，后一片依赖前一片（`gh stack`）：

1. #217 契约层：`className` + `...rest` 透传 + 堵住 Ledger 泄漏 + 文档硬规则 + 守护测试 + Inspector 中文文案改英文。
2. #218 命名统一：按决策 1 的规则改名并更新全部调用点、`/design` 页、`docs/design/*.md`。
3. #219 复合件：`BrowserSurface` 拆复合件并收 `state`；`PiTrajectoryLedger` 加 context。
