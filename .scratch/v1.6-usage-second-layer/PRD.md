# PRD: Pig V1.6 — 用量 Dashboard 第二层（按模型 / 工具调用 / skill 使用）

Status: done
Feature: v1.6-usage-second-layer
Created: 2026-06-24

> 🗄️ 历史归档（更新于 2026-06-29）：本 PRD 写于 Tauri 外壳时期，记录的是**当时**的决策。外壳此后迁至 Electron（见 [ADR-0013](../../docs/adr/0013-electron-shell-and-relocatable-backend.md)）：原"Tauri 命令 `list_sessions()`"现为统一 RPC 协议方法，契约形状不变。当前架构真相以 [CONTEXT.md](../../CONTEXT.md) 与 `docs/adr/` 为准。

> 定位：V1.5 的「用量」页已经能看**跨会话的成本趋势（按项目）+ token 热力图**。V1.6 在同一页加上**第二层拆分**——把花费**按模型**拆开、看**模型分布**、看**工具调用**与 **skill 使用**的频次。仍然是同一份会话数据的"再切一刀"，不引入新数据源、不引入 LLM。

---

## Problem Statement

我（Pi 的日常使用者）现在能在「用量」页看到"每天花了多少、哪个项目最贵、哪天在重度使用"。但还有几个我反复会问、当前答不了的问题：

1. **钱花在哪个模型上？** 我会在不同任务里切不同模型（便宜的干杂活、贵的啃硬骨头），但现在只看得到每个会话的"主模型"，看不到**整片会话里各模型各烧了多少**。
2. **我的模型使用结构是什么样？** 我到底主要在用哪个模型，便宜模型和贵模型的占比如何——这决定我下次"该不该把某类任务换个模型"。
3. **哪些工具被调得最多？** 我想知道 Pi 在我的会话里**最频繁调用哪些工具**，借此感知"我的用法里什么动作最重"。
4. **我哪些 skill 用得最多？** 我装了一堆 skill，但实际反复用的是哪几个、哪些几乎没碰——这帮我判断哪些 skill 真正进入了我的工作流。

这些都只有把**所有会话聚合、并按模型/工具/skill 维度拆开**才看得出来，而 V1 的索引为了精简，把这些维度的明细聚合掉丢弃了。

## Solution

在「用量」页的成本趋势与 token 热力图下面，**再叠四块视图**（均为同一份会话数据的聚合，纵向滚动）：

1. **按模型拆成本**：把花费按模型拆开呈现（哪个模型烧得多）。
2. **模型分布**：各模型的成本/token 占比（我的模型使用结构）。
3. **工具调用 top**：跨会话最常被调用的工具排行。
4. **skill 使用频次**：跨会话各 skill 被调用的次数排行。

这四块让我从"花了多少、在哪个项目"进一步看清"**花在哪个模型、用了哪些工具与 skill**"——同样服务于"改进下一次会话怎么开"的复盘直觉。

## User Stories

1. As a Pi user, I want 在「用量」页看到跨所有会话**按模型拆分的成本**，so that 我知道钱主要烧在哪个模型上。
2. As a Pi user, I want 按模型的成本能和现有的按天/按项目趋势处在同一页，so that 我能在一个地方把成本从多个维度看清。
3. As a Pi user, I want 一个会话中途切换过模型时，它的花费**按模型段正确归属**，so that 多模型会话的拆分不被算到单一"主模型"名下。
4. As a Pi user, I want 看到各模型的**成本占比/分布**（如环形或条形），so that 我一眼理解自己的模型使用结构（便宜 vs 贵的比重）。
5. As a Pi user, I want 模型分布能按成本或 token 表达，so that 我既能看"钱的结构"也能看"用量的结构"。
6. As a Pi user, I want 看到跨会话**最常被调用的工具排行**，so that 我感知自己用法里哪些动作最重、最频繁。
7. As a Pi user, I want 工具调用统计是**全部会话的累计频次**，so that 它反映我的整体用法，而非单次会话。
8. As a Pi user, I want 看到各 **skill 的使用频次排行**，so that 我知道哪些 skill 真正进入了我的工作流、哪些几乎没用。
9. As a Pi user, I want skill 使用统计计入会话中**任意位置**的 skill 调用（不只是开场那一个），so that 它反映真实的使用频次而非仅"会话由哪个 skill 起头"。
10. As a Pi user, I want 这些统计在我装的 skill 很少被用到时显示为稀疏/空，而不是报错或误导，so that 数据量小的早期阶段也能正常使用。
11. As a Pi user, I want 这四块视图的成本继续标注为 "API list price"（名义价），so that 我理解它与全站一致、按 list 定价计算。
12. As a Pi user, I want 这些第二层视图随窗口聚焦 / 手动刷新更新，so that 跑完新会话后能看到最新聚合，与现有用量页一致。
13. As a Pi user, I want 第二层视图复用「用量」页既有的全量、按天/跨会话语义，so that 我不必再学一套新的时间/范围心智。
14. As a Pi user, I want 这些视图延续设计 token（颜色不硬编码、暗色模式可用），so that 观感与全站统一。
15. As a Pi user, I want 工具与 skill 排行在条目过多时聚焦"top N"，so that 我先看到最重要的几项而非被长尾淹没。

## Implementation Decisions

### 架构与接缝（关键）
- **沿用唯一的 Rust↔React 契约 `list_sessions() -> Vec<SessionSummary>`**：第二层所需数据全部**挂到 `SessionSummary` 上**，前端继续只消费 `list_sessions()`，**不新增任何 Tauri 命令**、不引入新数据源、不调用 LLM。这保持 V1 以来"单接缝"的设计。
- 既有的 mtime 索引缓存对新增字段**自动适用**：每个会话的聚合随其文件 mtime 失效与重算，新增字段随之缓存，无需改缓存机制。

### 后端：给 `SessionSummary` 富化三个字段
- **`model_breakdown`（近乎免费）**：累加器 `SessionMetrics` 内部**已经在算** `model_totals`（每模型的成本+token），目前仅用于推导 `primary_model` 后即丢弃。本特性把它**暴露**为 `SessionSummary` 上的一个有序明细（每项含 `model`、`cost_usd`、`tokens`）。保留 `primary_model` 不变以兼容现有 UI。
- **`tool_counts`（新增累加）**：在现有解析 pass 中，按 `toolCall` 内容部分的**工具名**累加每个会话的调用次数，产出 `Vec<{ name, count }>`。
- **`skill_counts`（新增累加，Tier 2 = 全部调用）**：在现有解析 pass 中扫描消息内容里的 skill 调用标记（`<skill name="…">`，并兼容观察到的 `<skill-name>` 变体），**计入会话任意位置的调用**，按 skill 名累加 `Vec<{ name, count }>`。复用既有 `parse_skill_name` 的属性解析逻辑。
- 三个新字段都遵循现有序列化约定（camelCase；空集合可省略或为空数组，由实现统一）。

### 前端：用量页新增四块视图
- 在既有「用量」页（`usage.tsx` 区域）下叠加四块视图：按模型拆成本、模型分布、工具调用 top、skill 使用频次。
- 全部通过**纯函数聚合**富化后的 `SessionSummary[]` 得到（如 `aggregateCostByModel`、`aggregateModelDistribution`、`aggregateToolCounts`、`aggregateSkillCounts`），与渲染分离、可单测——沿用 `usage-aggregation.ts` / `usage-aggregation.test.ts` 的"纯函数 + 薄接线"范式。
- 排行类视图聚焦 top N，长尾收起或截断。

### 领域类型（新增/修改）
- `SessionSummary` 增加：`model_breakdown: Vec<ModelUsage>`、`tool_counts: Vec<NamedCount>`、`skill_counts: Vec<NamedCount>`。
- 新结构（命名与粒度由实现细化）：`ModelUsage { model, cost_usd, tokens }`、`NamedCount { name, count }`。

### 刷新与成本语义
- 第二层视图随 `list_sessions` 一并在窗口聚焦 / 手动刷新时更新。
- 成本继续取自会话内已算好的 `cost`，标注 **"API list price"（名义价）**，不另建定价表。

### 切片建议（供后续 /to-issues）
- **Slice A（近乎免费）**：暴露 `model_breakdown` → 前端「按模型拆成本」+「模型分布」。
- **Slice B（扫内容累加）**：新增 `tool_counts` + `skill_counts` → 前端「工具调用 top」+「skill 使用频次」。

## Testing Decisions

- **什么是好测试**：断言纯核心的**外部行为**——给定 fixture JSONL / `SessionSummary[]`，断言聚合输出（每模型成本/token、工具与 skill 的计数）。不测内部累加步骤、不跨 IPC 边界、不对图表像素做断言。
- **首选最高接缝（沿用 V1）**：`parse_session(jsonl)` / `build_index(dir)` 纯核心。对 fixture 会话断言新字段：
  - `model_breakdown`：复用既有的**多模型（mid-way `model_change`）** fixture，断言花费按模型段正确拆分、且与 `total_cost_usd` 自洽。
  - `tool_counts`：用含若干 `toolCall` 的 fixture，断言按工具名的计数。
  - `skill_counts`：用含**会话中途** `<skill name="…">`（及 `<skill-name>` 变体）的 fixture，断言全部调用被计入、按 skill 名累加。
- **前端聚合纯函数**：`aggregateCostByModel` / `aggregateModelDistribution` / `aggregateToolCounts` / `aggregateSkillCounts`——给定一组富化的 `SessionSummary` 断言聚合输出，含**空**与**稀疏**边界。镜像 `src/usage-aggregation.test.ts`。
- **前端组件轻测**：给定 fixture 聚合数据，断言四块视图的关键渲染（top N、空数据占位）。镜像 V1.5 的用量/配置组件测。
- **命令**：Rust `cargo test`；前端 `bun run test`（vitest，**非** `bun test`）。

## Out of Scope

- **按工具/按 skill 的成本归属**：日志不把成本归到单个工具或 skill，故第二层只做**频次/次数**，不做"每个工具花了多少钱"。
- **Trace 增强（V2）**：动作中心化 trace、`isError` 标红、失败溯源/"从哪想歪"——不在本特性。
- **任何启发式或 LLM 语义分析**：本特性纯结构聚合，不做判断、不调 LLM。
- **时间范围筛选器**：延续 V1.5，用量页仍全量、按天/跨会话，无 range selector。
- **新增 Tauri 命令或新数据源**：本特性不引入；一切挂在现有 `list_sessions()` 契约上。
- **配置可写、真实账单对账、live 实时**：延续既有范围之外。

## Further Notes

- **为什么大部分"看着要动后端"的活其实很轻**：经查证，`SessionMetrics.model_totals` 早已逐会话算出每模型成本/token，只是推导完 `primary_model` 就被丢弃——所以"按模型拆成本"与"模型分布"基本是**把已算的数据捡回来暴露**，近乎免费。真正新增的只有工具调用与 skill 调用的计数，且都在现有解析 pass 内完成。
- **数据稀疏的诚实预期**：当前约 35 个会话中**仅 3 个用到 skill**，故 skill 使用频次首期会很稀疏；工具/模型维度数据更密。这些都是**随使用增长**的指标，不应以"第一天好不好看"评判。
- **skill 标记的形态**：实证日志里为 `<skill name="kami">`（部分带 `location=`）以及 `<skill-name>` 变体；解析需兼容，并复用既有 `parse_skill_name`。
- **延续 V1.5 的价值尺子**：第二层视图服务"复盘建立直觉、改进下一次会话怎么开"，不承诺"修当下"。
- 父级背景见 `.scratch/v1.5-usage-config-dashboard/PRD.md`（用量/配置 Dashboard）。
