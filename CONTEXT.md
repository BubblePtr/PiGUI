# PiGUI

PiGUI 是面向 Pi Agent 的桌面工作台。它把 Pi 的运行记录、用量、配置和工作空间状态组织成可理解、可操作的 GUI。

## Language

**Agent Workspace**:
一组围绕同一目标、代码库或长期事务组织的 agent 工作环境，包含会话、任务、运行状态、配置与可操作控制。它不是单次会话，也不是单纯的项目目录。
_Avoid_: Session, project, dashboard

**Project**:
PiGUI UI 中围绕一个用户手动选择的本地工作目录建立的顶层组织单元，不要求该目录是 Git repo。Project 拥有多个 Session，并提供 Analyze、配置、用量和 checkout 管理等视角。
_Avoid_: Workspace, single session, Git branch, Git-only project

**Project Selector**:
PiGUI 中用于选择 Project 的入口，只呈现用户手动添加或选择过的 Project。空 Workspace 的首次 Project 添加、sidebar 下拉选择和新建 Session 时的 Session Draft composer 选择都消费同一个 Project 来源；用户可见文案使用 Project，而不是 Workspace。选择的是用户工作的根目录语义，而不是临时覆盖某个 Session 的 cwd。首次添加 Project 后，该 Project 立即成为 Current Project，并进入全局唯一的 Session Draft。Session Draft composer 默认使用 Current Project 作为提交目标，但允许切换；切换 Project 不清空 draft 文本。Project Selector 只负责选择和添加 Project，不承载 Project Removal。
_Avoid_: Workspace selector, cwd switcher, session picker, auto-discovered project, composer-only project list

**Project Sidebar**:
PiGUI 左侧按添加时间倒序展示 Project Registry 中所有 Project 的导航面。每个 Project 行可以独立展开或收起自己的 Session 列表；Project 行点击只切换展开状态，不切换主内容。新添加的 Project 默认展开，展开状态作为 PiGUI 本地 UI state 跨 app 重启保留，但不等同于 Current Project。从外部入口打开某个 Session 时，Project Sidebar 自动展开该 Session 所属的 Project。Project 行上的 New Session 入口会把该 Project 设为 Current Project，并打开全局唯一的 Session Draft；Project Removal 只放在 Project 行的更多菜单里；折叠的 Project 如果是当前 draft 目标，或包含有 Follow-up Draft 的 Session，需要在 Project 行显示轻量 draft indicator；draft 没有目标 Project 时，不在任何 Project 行显示 indicator；Session 有 Follow-up Draft 时，需要在对应 Session 行显示轻量 draft indicator。
_Avoid_: Single-current-project-only sidebar, global session list, project tree auto-discovery, current-project state, session ownership, project detail navigation

**Project Registry**:
PiGUI 持久保存的用户手动添加 Project 列表，是 Project Selector 的唯一来源。它属于 PiGUI 本地 app state，不属于项目 repo、Pi Runtime truth 或 Pi session logs；它跨 app 重启保留，并用规范化后的本地绝对路径作为首版 Project identity，按添加时间倒序呈现，默认显示名取目录 basename，但不从 session logs、历史 cwd 或文件系统扫描自动创建 Project。用户添加已存在路径时，PiGUI 不创建重复 Project，而是选中已有 Project 并进入全局唯一的 Session Draft。用户可以从 registry/sidebar 移除 Project；该动作不删除本地目录，也不删除已有 Session Projection 或 Session Trace。
_Avoid_: Session-derived project list, recent cwd list, auto-discovery cache, display-name identity, project delete, repo config, Pi runtime config, Git-only registry, duplicate project, last-used sorting, project rename

**Project Removal**:
用户从 Project Registry 移除一个 Project 的危险动作，需要二次确认；确认内容应说明 Project 会从 PiGUI 中移除、本地文件和历史 Session 不会删除。如果该 Project 是全局 Session Draft 的提交目标，PiGUI 保留 draft 文本但清空目标 Project，用户需要重新选择 Project 后才能提交。如果当前界面正在打开该 Project 下的 Session，PiGUI 跳到 new session 的空状态；如果当前界面不在该 Project 的 Session 中，移除动作不改变当前界面。
_Avoid_: Delete directory, delete sessions, global navigation reset

**Empty Workspace State**:
PiGUI 中 Project Registry 为空、没有 Current Project 的状态。此时用户只能先添加 Project；PiGUI 不提供无 Project 归属的 prompt 输入或 Session Draft。
_Avoid_: Default project, prompt-before-project

**Current Project**:
PiGUI 当前正在操作的 Project，决定新建 Session 的默认目标。用户从 composer 入口选择另一个 Project 时，该 Project 也成为 Current Project；全局 Session Draft 的文本保留，Project Sidebar 中的展开状态不改变 Current Project。
_Avoid_: Composer-only project, selected session project, cwd override, expanded project

**Session Trace**:
一次 Pi 交互的事后运行记录，展示消息、thinking、工具调用、token 和成本。它属于 Analyze 视角的分析材料，不是 Project 下的交互入口本身。
_Avoid_: Session, workspace, chat

**Session**:
Project 下的一条 Pi Chat，代表一个已提交、可运行、可恢复、可归档的交互工作单元。实现上，一个 Session 对应一个 Agent Run 及其 Execution Checkout，并持续沉淀 Session Trace。Session 的运行真相属于 Pi Runtime；PiGUI 保存的是用于 UI、索引和生命周期管理的 Session Projection。
_Avoid_: Task, workspace, trace-only session, draft prompt

**Session Draft**:
用户点击 New Session 或加号后进入的全局唯一未提交输入状态。它跨 app 重启保留一份 initial prompt、可选的当前提交目标 Project 和少量高级覆盖项，但尚未创建 PiGUI Session、Pi Session State、Agent Run 或 Execution Checkout，也不显示在 Session 列表中。切换 Project 不清空 Session Draft 文本；如果目标 Project 被移除，draft 文本保留但目标清空，并由 composer 显示必选 Project 状态；app 启动恢复 draft 时，如果保存的目标 Project 已不在 Project Registry 中，PiGUI 保留 draft 文本但清空目标；提交 draft 后才进入 Session 创建流程；只有 Pi Runtime 接受 initial prompt 或发出首个 runtime event 后，draft 才清空。
_Avoid_: Per-project draft, Project-scoped draft, follow-up input, Session, Pi session, run, trace

**Follow-up Draft**:
用户在已有 Session 的 composer 中尚未提交的 follow-up 输入。它按 Session 归属并跨 app 重启保留，一条 Session 最多保留一份 Follow-up Draft；它用于继续该 Session，不允许切换 Project，也不是全局 Session Draft。提交、Queue 或 Steer 成功后，PiGUI 清空对应 Session 的 Follow-up Draft；失败时保留文本并显示错误。
_Avoid_: Session Draft, Project draft, new-session draft, queued message

**Session Creation**:
Session Draft 提交后的创建状态机。PiGUI 先创建 `creating` 状态的 Session Projection，再选择或创建 Execution Checkout，然后启动或 attach Pi Runtime / 创建 Pi Session State，最后发送 initial prompt。每个阶段都要能记录错误和恢复点。
_Avoid_: Draft editing, single-step create, invisible side effect

**Resume**:
打开一个当前没有存活 runtime 的 Session 并让它重新可继续对话的能力。它是 Gateway 能力而不是用户动词：用户只有"打开 Session"一个动作，底层走热 attach（runtime 仍存活）还是冷恢复（进程重启后从 Pi 会话记录重新打开）对用户透明。冷恢复时对话上下文永远由 Pi Runtime 从 Pi Session State 的持久记录自行重建，PiGUI 不自行拼装 LLM 上下文；UI 时间线来自 Session Event Journal 的回放，两者分工不可互换。
_Avoid_: Resume button, reattach-only recovery, PiGUI-rebuilt LLM context, plain session switch

**Fork**:
从已有 Session 的某条 user message 边界分叉出新 Session 的动作。Fork 只复制对话上下文（root 到 fork 点的线性路径），永远产生一个带独立 identity、独立 Execution Checkout、出现在 Session 列表中的新 Session，并保留指回源 Session 的谱系；被选中的 user message 原文预填进新 Session 的 composer 供改写。Fork 不承诺磁盘状态回到 fork 点：Git Project 下新 Session 强制使用新的 managed worktree，非 Git Project 复用前台目录并提示可能存在源 Session 的文件改动。树内分支（同一 Session 内移动 leaf 形成非线性历史）不在产品边界内。
_Avoid_: In-session branch, tree navigation, disk snapshot, filesystem time travel, checkout copy

**Session Creation Boundary**:
PiGUI 的 Session 列表只包含从 PiGUI 中创建的 Session。PiGUI 不自动扫描 Pi 的 session 目录，也不支持把 PiGUI 之外产生的 Pi CLI/TUI session 手动导入或补建 Session Projection。需要在 PiGUI 继续外部工作时，用户在目标 Project 内新建 PiGUI Session；这与 Codex 的本地 thread 边界一致，避免把缺少 journal/checkout/status 的外部记录伪装成 PiGUI 原生 Session。
_Avoid_: Session Import, auto-discovery, session directory scan, background sync, projection backfill for external sessions

**Session Status**:
Session Projection 使用的内部收敛状态集合：`creating`、`running`、`waiting`、`failed`、`completed`、`archived`。Draft 不属于 Session Status。UI 不直接暴露完整内部集合；Session 列表首版只用 spinner/shimmer 这类动态图标表达 active run。失败和完成都作为 Live Chat 中的新结果/消息呈现，不在列表里做状态区分。
_Avoid_: Draft, full UI status taxonomy, arbitrary runtime string

**Archived Session**:
用户从默认工作视图中隐藏的 Session。Archived Session 默认不显示在左侧 Session 列表中，但仍可通过 Analyze 或历史入口找回。归档是 visibility 变化，不删除 Session Projection、Session Trace、checkout snapshot 或审计材料。正在运行的 Session 不能直接归档；必须先 stop/abort 到没有 active run。
_Avoid_: Delete, completed, cleanup

**Unread Result Indicator**:
Session 列表中的轻量消息提示，表示该 Session 有用户尚未看过的新消息、run 结果或失败说明。它不是 Session Status，也不区分失败和完成。只有用户打开该 Session，且 Live Chat 渲染到最新消息位置后才清除；hover 列表项或切换 Project 不清除。
_Avoid_: Error badge, completed badge, runtime status

**Session List Ordering**:
Project 下 Session 列表的默认排序：active run 在前，其次是有 Unread Result Indicator 的 Session，其余按最近更新时间倒序。多个 active run 同时存在时，active run 组内按最近 runtime event 时间倒序。
_Avoid_: Status taxonomy ordering, alphabetical default, draft ordering

**Live Session View**:
PiGUI 中正在运行或可继续交互的 Session 界面。它以 Pi RPC/event stream 和当前 Pi Session State 为主数据源；Session Trace 只用于 backfill、恢复、审计和 Analyze。首版采用左侧 Project/Session 列表、中间 Live Chat + run timeline、右侧 Structured Action Surface 的三栏结构，不包含完整 terminal emulator 或文件树。
_Avoid_: Trace replay, analyze page, log viewer, IDE

**Steer**:
active run 期间用户给当前 Pi 运行追加的方向修正。Pi 会在当前工具调用结束后、下一次模型调用前处理它。它只在输入会进入 Queue 的 active run 场景中作为显式替代动作出现，让用户选择排队下一步还是插入方向修正。Steer 提交后应立即出现在 Live Chat 屏里，作为当前 active run 下的 steer 消息/控制事件展示；它不是 Queued Message。UI 入口文案直接使用 `Steer`。
_Avoid_: Stop, abort, follow-up

**Queue**:
active run 期间用户排队的下一条 follow-up prompt。它不改变当前正在执行的 turn，而是在当前 run 停下来后继续处理。有 active run 时，Live Session 输入区默认提交行为和 Enter 键提交都走 Queue；主提交按钮仍使用发送图标，但 tooltip/状态说明为 `Queue`。没有 active run 时不显示 Queue。
_Avoid_: Immediate steer, task queue, scheduler

**Queued Message**:
用户在 active run 期间通过 Queue 提交、但 Pi 尚未开始处理的 pending follow-up。它应立即在 Live Session View 中以独立 pending 区域或样式显示，不直接混入正式 Live Chat 消息流；Pi 开始处理后才转为正式消息。处理开始前支持撤回；处理开始后不可撤回，只能用 Queue/Steer 修正。首版不支持重排，多个 Queued Message 按提交顺序执行。
_Avoid_: Sent message, Live Chat final message, task

**Analyze**:
Project 中用于复盘和比较历史 Session Trace、用量、成本、工具调用和模型行为的分析视角。它回答“过去发生了什么、贵在哪里、模式是什么”，不负责发起新的 Pi Chat。
_Avoid_: Session list, chat, control plane

**Control Plane**:
PiGUI 中负责创建、启动、切换、管理和观察 Agent Workspace 的产品层。它可以触发 agent 行为，因此不同于只读的飞行记录仪。
_Avoid_: Flight recorder, passive observer

**Pi Runtime**:
PiGUI 唯一支持的 agent runtime，负责模型调用、工具执行、session 状态、配置加载和 Pi 原生扩展能力。PiGUI 不把其他 agent runtime 纳入产品边界。
_Avoid_: Generic agent runtime, ACP agent, provider

**Runtime Gateway**:
PiGUI 在客户端/后端与 Pi 接入实现之间固定的产品语义边界。它稳定表达 Session、Prompt、Queue、Steer、Stop、Snapshot 和 Runtime Event，不等同于 Pi SDK API 或 Pi RPC 原始协议。
_Avoid_: AI Gateway, Pi SDK API, Pi RPC protocol, renderer bridge

**Model**:
由 Pi Runtime 使用的底层 LLM 选择，可以跨 provider 切换并影响 reasoning、成本和上下文能力。它不是 Agent Runtime；PiGUI 支持多模型不等于支持多 agent。
_Avoid_: Runtime, agent, workspace

**Agent Run**:
Agent Workspace 中一次可运行、可停止、可观察的 Pi Runtime 实例。一个 workspace 可以同时拥有多个 Agent Run；每个 Agent Run 对应独立进程、session 状态和 Session Trace。它是 runtime 实例语义，不是一次 agent loop 执行；后者叫 Active Run。
_Avoid_: Workspace, model, task label, active run, agent loop run

**Active Run**:
Session 中一次由 prompt 提交、steer 恢复或 queued follow-up 触发的 agent loop 执行，边界来自 agent-core 的 run 生命周期。它是 Live Chat 消息归属、Steer/Queue 可用性和 Session 运行状态的权威边界；协议中的 runId 指 Active Run。一个 Session 先后可以有多个 Active Run，但同一时刻最多一个；retry 和 steer 发生在当前 Active Run 内部，不产生新的 Active Run。
_Avoid_: Agent Run, runtime instance, turn, prompt cycle, session

**Turn**:
Active Run 内一次 model response 加 tool execution 循环的边界。一个 Active Run 包含一个或多个 Turn；同一 Turn 产生的 thinking、回答文本和 tool call 都归属该 Turn。
_Avoid_: Active Run, message, round trip

**Execution Checkout**:
Agent Run 操作文件系统时所属的 checkout，可以是前台本地目录，也可以在 Git Project 中是 PiGUI 管理的 Git worktree。它是并发运行的文件隔离边界。非 Git Project 可以使用 foreground local directory 运行 Session，但 Git-only 的 diff、managed worktree、commit、push 和 PR 能力不可用。
_Avoid_: Branch, session, workspace, Git requirement

**Pi Session State**:
由 Pi Runtime 拥有的 session 真相，包括消息、运行状态、模型配置、队列、fork/follow-up/abort 等 Pi 原生语义。PiGUI 通过 RPC/SDK 观察和驱动它，但不重新定义一套独立 chat 协议。
_Avoid_: PiGUI database record, trace, UI cache

**Runtime Event Stream**:
Pi Runtime 在 Session 运行期间向 PiGUI 暴露的 live 事件流，包括消息增量、工具调用、状态变更、错误、队列变化和 token/cost 增量。它驱动 Live Session View，并同步更新 Session Projection。
_Avoid_: Historical trace, file log tail, polling-only UI

**Session Event Journal**:
Runtime Gateway 为每个 Pi session 保存的边界事件日志，只收录归一化事件流中的生命周期边界，不收录流式增量。它是 Session 重放与快照恢复的事件来源：加载它得到完整静态时间线，永远不会重放 streaming。它不是 Pi Session State（Pi 自己的会话真相），也不是 Session Projection（renderer 的查询模型）。
_Avoid_: Pi session file, projection cache, event replay stream, chat history

**Structured Action Surface**:
PiGUI 首版替代 terminal/file-tree 的结构化操作面，通常位于 Session 页右侧，承载 diff 摘要、checkout 信息、模型/成本摘要、打开外部编辑器、运行预设命令、handoff、commit、push、PR、archive 等明确动作。它不提供任意 shell 交互，也不承担通用文件浏览器职责。
_Avoid_: Terminal emulator, file explorer, IDE panel

**Session Projection**:
PiGUI 自己保存的查询模型，用来支撑 Session 列表、Analyze、状态索引、成本聚合、checkout 生命周期、恢复入口和 UI 快速渲染。它是从 Pi Session State、Session Trace 和 PiGUI checkout 管理事件同步出来的投影，不是 Pi 会话内容的权威来源。
_Avoid_: Runtime truth, independent chat state, source of record

**Task**:
未来用于描述定时任务、自动化任务或队列化任务的术语。普通用户发起的一次 Pi 工作在 UI 中叫 Session，不叫 Task。
_Avoid_: Session, run, trace
