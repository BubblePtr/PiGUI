# Slice 02 — 用量 Dashboard（成本趋势堆叠柱 + token 日历热力图）

Status: done
Feature: v1.5-usage-config-dashboard
Covers user stories: 6, 7, 8, 9, 10, 11, 12, 13, 23

## Parent

PRD: `.scratch/v1.5-usage-config-dashboard/PRD.md`

## What to build

填充 `用量` Tab：一块**纵向滚动的图表画布**，把所有会话**在前端聚合**成两张共用同一时间轴（全量范围、按天）的图。**零新增后端命令**——直接消费现有 `list_sessions()` 返回的 `SessionSummary[]`（已含 `timestamp / project / totalCostUsd / totalTokens`）。

- **成本趋势堆叠柱**：按天分桶，每根日柱按 `project` 分层堆叠；悬停某天显示当天总额与各项目明细；成本标注为 **"API list price"（名义价）**。
- **token 日历热力图**：按天分桶求和 `totalTokens`，GitHub 贡献图式日历；无会话的天显示为最浅格、成本柱为 0。
- 聚合逻辑抽成**纯函数**（如 `aggregateDailyCostByProject(sessions)`、`aggregateDailyTokens(sessions)`），与渲染分离，便于单测——沿用 `src/session-list.test.tsx` 里 `distinctProjects`/`filterByProject` 那种"纯函数 + 薄接线"的做法。
- 数据随窗口聚焦 / 手动刷新更新（与 V1 刷新心智一致，跟随 `list_sessions`）。

## Acceptance criteria

- [ ] `用量` Tab 显示按天的成本堆叠柱，每柱按项目分层；悬停可见当天总额与各项目明细
- [ ] 成本明确标注为 "API list price"（名义价）
- [ ] 显示按天的 token 日历热力图，与成本图共用同一时间轴语义（全量、按天）
- [ ] 无会话的日期：热力图为最浅格、成本柱为 0（不被误读为缺数据）
- [ ] 会话很少时页面正常显示，不崩溃、不空白报错
- [ ] 聚合纯函数有单测，覆盖**空数组**与**稀疏日期**两个边界（`bun run test`，vitest）
- [ ] 暗色模式显示正常、颜色走设计 token

## Blocked by

- Slice 01（三 Tab 应用壳）—— 需要 `用量` Tab 与外壳就位
