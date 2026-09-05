# ADR-0032：右侧宿主改称 Dock，Session Trace 改称 Session Trajectory

- 状态：Accepted
- 日期：2026-09-05

## 背景

ADR-0028 在只有 Changes 一个 surface 时把 Live Session 页右侧的宿主命名为 `SessionInspector`。之后 Terminal（ADR-0028）和 Browser（ADR-0029）相继停靠进去，这个宿主已经不"检视"任何东西：它是一块承载 Session 级工作面板的停靠区。与此同时 Trace Cockpit 里有一个真正的 Inspector——步骤详情栏 `PiTraceInspector`，CONTEXT.md 的 **Inspector** 词条定义的正是它。两个 Inspector 在 `dev/ui-intent/regions.ts` 里被绑到同一个术语下，UI intent picker 报出的区域名因此失真。

产品愿景（README "Plugin surfaces"）是让 Pi 扩展向这块区域注册自己的可视化面板，PiGUI 内置的 Changes / Terminal / Browser 只是第一批。命名必须为这个方向留位置，同时不能与 Pi 自身的扩展层级（Package → Extension / Skill / Prompt / Theme）打架。

另外，"Trace" 一词用于描述 Session 的事后运行记录，而这条记录的本质是可回放的状态与动作序列。agent 研究领域的通用名是 trajectory，比 trace 更贴合 Playhead、Strip 所暗示的"时间序列可回放"语义。

## 决策

### 1. 右侧宿主叫 Dock，面板叫 Surface

| 术语 | 含义 | 代码 |
| --- | --- | --- |
| **Dock** | Live Session 页右侧宿主的整体：内容区加贴在右缘的图标 Rail。可开合、可拖宽，关闭时整体消失（ADR-0028 的 rail 形态不变）。 | `SessionDock`（`shared/ui/session-dock/`） |
| **Rail** | Dock 右缘的 44px 图标列，每格对应一个 Surface。沿用 ADR-0028 已有的叫法。 | Dock 内部 |
| **Surface** | Dock 里的一个面板，绑定当前 Session（它的 checkout、shell、预览页）。 | `SessionSurfaceId` / `surface-registry.ts` |
| **Built-in Surface** | PiGUI 自带的 Surface：Changes、Terminal、Browser。 | provider 为 `builtin` |

"Dock" 在 ADR-0028 里曾指一个被否掉的**形态原型**（Cursor 式 tab 条加 launcher 网格）。本 ADR 用它命名的是**角色**——一块停靠区——形态仍是 ADR-0028 选定的 Rail。两处不冲突：前者是"长什么样"，后者是"是什么"。

"Inspector" 从此只指 Trajectory Cockpit 的步骤详情栏。

ADR-0008 的 **Structured Action Surface** 描述的是这块区域首版的职责边界（结构化动作，不是 terminal / file tree）。Terminal 与 Browser 解冻后，那条边界已经被 ADR-0028 / 0029 逐项放开；词条保留作历史定义，区域本身由 Dock + Surface 承载。

### 2. 只命名贡献物，不命名贡献方

PiGUI 不为"谁贡献了 Surface"另造名词。Pi 的层级原样沿用：Package 是分发单位，Extension 是运行时加载并注册 tool / command / event handler 的代码模块。将来一个 Surface 由"某个 Package 里的某个 Extension 注册"，句式与 VS Code "extension contributes a view" 相同。

PiGUI 自己需要的只有一个数据字段：Surface 的来源，称 **provider**，取值 `builtin` 或 Pi 的 extension id。它是字段名，不是产品术语。

产品文案统一用 Pi 的词：README 中的 "plugin ecosystem / plugin panels / plugin-declared" 全部改为 extension 表述。CONTEXT.md 不为 Package / Extension 单独立条，只在 **Pi Runtime** 词条里声明词义以 Pi 为准，避免 Pi 调整定义时 PiGUI 的词汇表跟着漂。

### 3. Session Trace 改称 Session Trajectory

- **Session Trace** → **Session Trajectory**：一次 Pi 交互的事后运行记录。
- **Trace Cockpit** → **Trajectory Cockpit**：它的仪表盘式呈现。Strip、Tally、Ledger、Inspector、Playhead 五个子术语不变。

本 ADR 只改产品词汇与文档（CONTEXT.md、README、regions 术语表）。以下**代码标识符暂不改**，留待单独决定：

- 事件 `surface` 戳的 `trace` 取值（Runtime Event 契约，见 ADR-0020）；
- backend 与 core 里的 `session-trace` / `trace` 模块与类型名；
- 渲染层 `PiTrace*` 组件族与 `trace-inspector-*` testid；
- 路由名与持久化 key。

这些都是跨包契约或已持久化的标识，一次性改动会撕开整条管线；产品词汇先行，标识符待 Trajectory 一词在文档与 UI 中稳定后再评估是否值得迁移。

## 后果

- `SessionInspector` 及其导出、testid、可见文案整体改名为 `SessionDock`；`PiTraceInspector` 不动。`regions.ts` 拆成 **Inspector**（Trace 侧）与 **Dock**（宿主）两个术语，**Structured Action Surface** 区域改绑到 **Surface**。
- CONTEXT.md 新增 Dock、Rail、Surface、Built-in Surface 四条，Session Trace / Trace Cockpit 及其引用改为 Trajectory。
- README 的 plugin 表述改为 extension，traces 改为 trajectories；`surface: trace` 事件戳的描述保持原值。
- ADR-0028 标题中的 SessionInspector 不追改，历史文档按当时命名阅读。
