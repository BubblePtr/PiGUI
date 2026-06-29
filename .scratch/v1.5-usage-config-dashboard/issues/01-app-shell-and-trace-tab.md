# Slice 01 — 三 Tab 应用壳 + Trace 搬运（行走骨架）

Status: done
Feature: v1.5-usage-config-dashboard
Covers user stories: 1, 2, 3, 4, 5, 24

## Parent

PRD: `.scratch/v1.5-usage-config-dashboard/PRD.md`

## What to build

把 Pig 从"单个全屏页面"重构成一个**左右分栏的应用外壳**，顶层三个 Tab：`Trace` / `用量` / `配置`。这是行走骨架——一次性的结构投资，三 Tab 共同受益。

- 外壳：左侧导航/列表区 + 右侧内容区，顶层 Tab 切换（沿用现有 TanStack Router；新增 `用量`、`配置` 两个顶层路由，并把现有 `/`、`/sessions/$sessionId` 归入 `Trace`）。
- `Trace` Tab：**复用 V1 既有的会话列表与单会话时间线**（含成本/token 徽章、thinking、工具 I/O、按项目过滤）。仅做塞进左右分栏所需的布局调整，**内容不重做**。
- `用量`、`配置` Tab：先放**空占位页**（后续切片填充），但 Tab 可切换、路由可达。
- 视觉延续 V1 的设计 token（颜色不硬编码、暗色模式可用）。

## Acceptance criteria

- [ ] 应用以左右分栏呈现，顶层有 `Trace` / `用量` / `配置` 三个可切换的 Tab
- [ ] 切到 `Trace` 能看到 V1 的会话列表；点击某会话进入其详情时间线，原有能力（徽章/thinking/工具 I/O/按项目过滤）不丢失
- [ ] 切到 `用量`、`配置` 显示占位页（不报错、不空白崩溃）
- [ ] Tab/路由切换状态正确，刷新或直接访问对应路由可达
- [ ] 暗色模式下三 Tab 外壳与 Trace 内容显示正常
- [ ] `bun run test` 全绿（既有测试不被外壳重构破坏）

## Blocked by

None - can start immediately
