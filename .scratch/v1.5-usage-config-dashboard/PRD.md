# PRD: Pig V1.5 — 三 Tab 应用壳 + 用量 Dashboard + 配置清单

Status: done
Feature: v1.5-usage-config-dashboard
Created: 2026-06-24

> 🗄️ 历史归档（更新于 2026-06-29）：本 PRD 写于 Tauri 外壳时期，记录的是**当时**的决策。外壳此后迁至 Electron（见 [ADR-0013](../../docs/adr/0013-electron-shell-and-relocatable-backend.md)）：后端从 Rust 改为 Node（utilityProcess），原"Tauri 命令"现为统一 RPC 协议方法，fixture 现位于仓库根 `fixtures/pi-agent`。当前架构真相以 [CONTEXT.md](../../CONTEXT.md) 与 `docs/adr/` 为准；下文 Tauri/Rust 分工描述按历史阅读。

> 定位：V1 让我**看清单次会话**（这步花了多少、它在想什么）。V1.5 把 Pig 从"单会话浏览器"升级成一个**左右分栏的 SaaS 形态应用**，新增两个俯瞰视角——**用量**（跨会话的成本/用量趋势，回答"我怎么在用 Pi、钱往哪走"）和**配置**（我的 Pi 装成什么样了）。原 PRD 里 V1.5 的「成本瀑布图 + 上下文增长曲线」经复盘**作废**（见 Further Notes）。

---

## Problem Statement

我（Pi 的日常使用者）现在用 Pig 只能**一次看一个会话**。但我心里其实有两类、用 V1 答不了的问题：

1. **跨会话的俯瞰**：这周/这个月我用 Pi 一共烧了多少钱？哪个项目最吞钱？我哪几天在重度使用、哪几天没碰？这些只有把**所有会话聚合起来**才看得出来，而 V1 的列表是"一行一个会话"，没有任何汇总与趋势。
2. **我的 Pi 现状**：我装了哪些包、开了哪些 extensions、有哪些 skills、默认用哪个模型和思考力度——这些散落在 `~/.pi/agent` 的配置文件和目录里，我没有一个地方能一眼看全。

同时，V1 的会话浏览本身（列表→详情）也还停在一个孤立的全屏页面里，没有一个统一的应用外壳把"复盘单次会话""看跨会话趋势""看配置"这三件事组织到一起。

## Solution

把 Pig 重做成一个**左右分栏的桌面应用**（左侧列表/导航，右侧内容，和常见 SaaS 应用一致），顶层三个 Tab：

1. **Trace**：就是 V1 已有的会话浏览（左：会话列表，右：单会话标注式时间线）。V1.5 只把它**原样搬进新外壳**，内容不重做。
2. **用量（Usage）**：一块**纵向滚动的图表画布**，把所有会话聚合成趋势——
   - **成本趋势**：按天的堆叠柱，每根柱按**项目**分层，让我一眼看出"这周烧了多少、哪个项目最贵"；
   - **token 日历热力图**：GitHub 贡献图那种按天的格子，让我看出"哪几天在重度用 Pi"。
3. **配置（Setup）**：一个左类目、右详情的清单，把 Pi 的安装/设置摊开——默认模型、provider、思考力度、theme、已装的包、extensions、skills、prompt templates。

这三个视角合起来：Trace 看**一次会话的内部**，用量看**整片会话的形状**，配置看**工具本身的状态**。

## User Stories

1. As a Pi user, I want Pig 以左右分栏（左列表/导航、右内容）的形式组织，so that 它像一个正常的 SaaS 应用、三类视图有统一的归处。
2. As a Pi user, I want 顶层有「Trace / 用量 / 配置」三个 Tab，so that 我能按"看一次会话 / 看整片趋势 / 看工具配置"的心情切换。
3. As a Pi user, I want 切换 Tab 时左侧列表/导航与右侧内容随之联动，so that 每个 Tab 都遵循一致的"左选、右看"心智模型。
4. As a Pi user, I want 「Trace」Tab 保留 V1 已有的会话列表与单会话时间线（含成本/token 徽章、thinking、工具 I/O、按项目过滤），so that 升级外壳不损失我已经在用的复盘能力。
5. As a Pi user, I want 从「Trace」的会话列表点开某个会话仍进入它的详情时间线，so that V1 的导航路径在新外壳里继续可用。
6. As a Pi user, I want 「用量」Tab 把我所有会话的花费按天聚合成一条趋势，so that 我能看出最近的开销走向，而不必逐个会话心算。
7. As a Pi user, I want 成本趋势的每根日柱按**项目**分层堆叠，so that 我能一眼看出哪个项目最吞钱。
8. As a Pi user, I want 把鼠标悬到某天的成本柱上看到当天总额与各项目明细，so that 我能下钻到具体一天。
9. As a Pi user, I want 一张按天的 **token 用量日历热力图**，so that 我能看出自己哪几天在重度使用 Pi、哪几天空闲。
10. As a Pi user, I want 热力图与成本趋势共用同一条时间轴语义（按天、全量范围），so that 两张图能互相印证（如"这天又贵又重度"）。
11. As a Pi user, I want 没有会话的日子在热力图里显示为最浅格、在成本柱里为 0，so that 稀疏的使用分布也能如实呈现，不被误读为缺数据。
12. As a Pi user, I want 「用量」页在我会话很少时也能正常显示（不崩、不空白报错），so that 早期数据量小也能用。
13. As a Pi user, I want 「用量」页的成本明确标注为 "API list price"（名义价），so that 我理解它和 V1 详情页一样是按 list 定价算的、不是我的真实账单。
14. As a Pi user, I want 「配置」Tab 用左类目、右详情的方式组织（模型、包、Extensions、Skills、Prompt Templates 等类目），so that 我能分门别类地查看 Pi 的安装与设置。
15. As a Pi user, I want 在配置里看到默认模型、默认 provider、默认思考力度、theme，so that 我一眼确认 Pi 当前的核心默认值。
16. As a Pi user, I want 看到我已安装的所有 Pi 包列表，so that 我清楚自己装了哪些扩展能力。
17. As a Pi user, I want 看到已启用的 extensions，so that 我知道有哪些扩展脚本在生效。
18. As a Pi user, I want 看到本地可用的 skills 列表，so that 我清楚 Pi 手上有哪些技能。
19. As a Pi user, I want 看到 prompt templates 这个类目，且当我一个都没安装时显示"未安装"而非空白或报错，so that 这个类目即便为空也表达清楚。
20. As a Pi user, I want Pig 读取 `PI_CODING_AGENT_DIR`（回退 `~/.pi/agent`）来定位配置，so that 与 V1 一致、非默认目录也能用。
21. As a Pi user, I want 配置页只读、绝不写回任何配置文件，so that 看配置这件事永远不会改坏我的 Pi 设置。
22. As a Pi user, I want 配置页永远不读取或展示 `auth.json` 的内容，so that 我的密钥不会被这个工具碰到或泄露。
23. As a Pi user, I want 用量与配置的数据在我切回 Pig（窗口聚焦）或手动刷新时更新，so that 跑完新会话/改了配置后能看到最新状态，与 V1 的刷新心智一致。
24. As a Pi user, I want 这三个 Tab 的视觉延续 V1 的设计 token（颜色不硬编码、暗色模式可用），so that 整个应用观感统一。

## Implementation Decisions

### 架构总览
- **沿用 V1 的被动观察者架构**：Pig 仍只读 `~/.pi/agent`（及配置文件），不启动/不接管 Pi，不引入任何 LLM 调用、不做实时监听。V1.5 不改变这一根本姿态。
- **Tauri 分工不变**：Rust 后端做文件读取/解析/聚合（纯函数为主），React 前端做渲染与前端聚合。

### 前端：应用外壳与三 Tab
- 引入**左右分栏的应用外壳**，顶层三个 Tab：`Trace` / `用量` / `配置`。沿用现有 TanStack Router；把当前的 `/`（列表）与 `/sessions/$sessionId`（详情）归入 `Trace` Tab，新增 `用量`、`配置` 两个顶层路由。
- **Trace Tab = V1 存量**：复用现有 `SessionListPage` 与会话详情时间线，仅做"塞进外壳/左右分栏"所需的布局调整，**不重做内容**。
- **用量 Tab = 纯前端聚合，零新增后端命令**：直接消费现有 `list_sessions()` 返回的 `SessionSummary[]`（已含 `timestamp / project / totalCostUsd / totalTokens`），在前端按天聚合：
  - 成本趋势：按天分桶 → 每天按 `project` 分组求和 → 堆叠柱。
  - token 热力图：按天分桶 → 每天 `totalTokens` 求和 → 日历格子。
  - 范围**全量**、粒度**按天**。把聚合逻辑抽成**纯函数**（如 `aggregateDailyCostByProject(sessions)`、`aggregateDailyTokens(sessions)`），与渲染分离，便于单测——沿用 V1.5 项目过滤里 `distinctProjects`/`filterByProject` 那种"纯函数 + 薄接线"的做法。
  - 图表库选型由实现者决定（与 V1 既有依赖保持一致优先）。
- **配置 Tab = 新后端命令 + 前端清单**：左类目（模型 / 包 / Extensions / Skills / Prompt Templates）、右详情，master-detail。

### 后端：唯一的新接缝 `get_config_inventory`
- 新增 Tauri 命令 `get_config_inventory() -> ConfigInventory`，包一层纯函数 `build_config_inventory(agent_dir) -> ConfigInventory`（与 `build_index` 同形：接受目录、返回结构体、可对 fixture 目录单测）。
- 数据来源（全部只读）：
  - `settings.json`：`defaultModel`、`defaultProvider`、`defaultThinkingLevel`、`theme`、`packages[]`、`extensions[]`。
  - `skills/` 目录：列出本地 skills（按目录项）。
  - `extensions/` 目录：补充 extensions 信息。
  - prompt templates：作为一个类目存在；其磁盘位置当前未确认（用户尚未安装任一模板），实现时若解析不到则该类目返回**空**，前端显示"未安装"。
- **绝不读取 `auth.json`**；命令绝不写任何文件。
- 路径解析复用 V1 的 `resolve_agent_dir()`（`PI_CODING_AGENT_DIR` → `~/.pi/agent`）。

### 领域类型（新增）
- `ConfigInventory`：`{ default_model, default_provider, default_thinking_level, theme, packages: Vec<String>, extensions: Vec<ExtensionInfo>, skills: Vec<SkillInfo>, prompt_templates: Vec<TemplateInfo> }`（字段命名/粒度由实现细化；`prompt_templates` 允许为空）。
- 用量页的聚合结构存在于**前端**（按天的成本/项目分组、按天的 token 和），不进 Rust 后端、不污染索引。

### 刷新
- 用量与配置沿用 V1 的 **rescan-on-window-focus + 手动刷新** 心智。用量数据随 `list_sessions` 一并刷新；配置在聚焦/手动刷新时重读。

### 成本语义
- 用量页成本与 V1 一致，取自会话里已算好的 `cost`，标注为 **"API list price"（名义价）**，不另建定价表、不与真实账单对账。

## Testing Decisions

- **什么是好测试**：断言纯核心的**外部行为**——给定输入（fixture 目录 / `SessionSummary[]`），断言输出结构（聚合后的每日成本/项目分组、每日 token、解析出的配置清单）。不测内部步骤、不测私有助手、不跨 IPC 边界测。
- **首选最高接缝（沿用 V1 习惯）**：
  - 后端新接缝 `build_config_inventory(dir) -> ConfigInventory`——纯函数，对一个 fixture `.pi/agent` 目录（含 `settings.json` + `skills/` + `extensions/`，以及一个**无 prompt templates** 的情形）断言解析结果。**镜像** V1 `build_index`/`parse_session` 的 fixture 测法。新建一个最小 fixture agent 目录用于配置解析（可复用 `fixtures/pi-agent`（迁移前位于 `src-tauri/fixtures/pi-agent`）并补 `settings.json` 等）。
  - 前端用量聚合的**纯函数**（`aggregateDailyCostByProject`、`aggregateDailyTokens`）——给定一组 `SessionSummary` 断言按天/按项目的聚合输出，含**空数组**与**稀疏日期**两个边界。**镜像** `src/session-list.test.tsx` 里 `distinctProjects`/`filterByProject` 的纯函数单测风格。
- **前端组件轻测**：给定 fixture 聚合数据，断言成本堆叠柱与热力图的关键渲染（如有数据时渲染对应天数的柱/格、空数据时的占位），与 V1 `session-detail.test.tsx` 的轻量组件测一致。配置页轻测：给定 fixture `ConfigInventory` 断言各类目渲染、prompt templates 为空时显示"未安装"。
- **测试命令**：Rust 用 `cargo test`；前端用 `bun run test`（vitest，**非** `bun test`）。
- **不为可视化的像素级外观写断言**——图表的数值正确性在纯聚合函数处覆盖，视觉用 dev-server 截图人工确认。

## Out of Scope

- **Trace 增强 → V2**：动作中心化的 trace 视图、`isError` 工具结果标红、循环/重试/回退检测、误导性工具结果的因果高亮、"它从哪一步想歪"的失败溯源——全部留给 V2，且需各自的 grilling 与 ADR。
- **任何机械启发式或 LLM 语义分析**：V1.5 不做任何"推理对错/目标漂移"判断，不调用任何 LLM。
- **用量页的第二层拆分**：按**模型**拆成本、**工具调用** top/趋势、模型分布饼图——这些需要扩充后端索引（V1 索引把 per-model 明细与工具调用聚合掉丢弃了）或重解析 detail，**留作下一刀**，不进 V1.5 首版。
- **成本瀑布图、上下文增长曲线**：原 PRD 的 V1.5 设想，经复盘作废，不做。
- **时间范围筛选器**：首版用量页全量、按天，无 range selector；待数据量变大再加。
- **配置可写**：配置页只读，不提供任何编辑/安装/卸载（写操作是 V2 的不同肌肉，会污染纯观察者架构）。
- **真实账单对账、live 实时监听、eval/打分、replay 改 prompt 重跑、多用户协作**：延续 V1 的范围之外。
- **读取或展示 `auth.json`**：永久排除。

## Further Notes

- **为什么推翻原 V1.5（两张图）**：经一轮 grilling，确认 Pig 的价值尺子是 **"复盘建立直觉、改进下一次会话的开法"**（而非"修当下"——被动事后工具天然做不到修当下）。据此，原定的成本瀑布图（用户无法据此改变行为，钱已花、且多数步骤非用户所选）与上下文增长曲线被判定行动性不足而作废；功能重心转向"跨会话俯瞰（用量）"与"工具现状（配置）"两个**用户真会反复看**的视角。
- **竞品调研结论（支撑 V2 而非 V1.5）**：LLM/Agent trace 工具（LangSmith、Langfuse、Phoenix 等）在"忠实展示 agent 做了什么"上已成熟，但在"它为什么错、从哪错"上集体留白——这是 Pig 未来（V2 的 Trace 增强）可独占的差异化空间。V1.5 暂不触碰，先把外壳与两个俯瞰视图立住。
- **数据可行性已验证**：`settings.json` 含 model/provider/thinking/theme/packages/extensions；`skills/`、`extensions/` 目录可列；`auth.json` 含密钥、永不读取；prompt templates 路径待用户安装后再确认（设计上按"可能为空"处理）。
- **工程量天平**：用量页 = 纯前端聚合现有 `list_sessions()`，零新增后端命令；配置页 = 一个可单测的纯函数后端命令 + 前端清单。两者都不重，外壳重构是一次性结构投资、三 Tab 共同受益。
- **build-in-public 立场延续 V1**：自用工具优先，做到日用顺手即可，不为分发做额外工程。
