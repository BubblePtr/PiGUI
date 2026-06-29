# PiGUI

PiGUI 是面向 Pi Agent 的桌面工作台。它把 Pi 的运行记录、用量、配置和工作空间状态组织成可理解、可操作的 GUI。

## Language

**Agent Workspace**:
一组围绕同一目标、代码库或长期事务组织的 agent 工作环境，包含会话、任务、运行状态、配置与可操作控制。它不是单次会话，也不是单纯的项目目录。
_Avoid_: Session, project, dashboard

**Project**:
PiGUI UI 中围绕一个用户选择的工作根目录建立的顶层组织单元，通常是一个 Git repo 或 repo 内的 package/app 子目录。Project 拥有多个 Session，并提供 Analyze、配置、用量和 checkout 管理等视角。Project 可以小于 Git repo；在 monorepo 中，Pi Runtime 的工作目录应保持在 Project 对应子目录，而 Git 操作仍以 repo/worktree 根为边界。
_Avoid_: Workspace, single session, Git branch

**Session Trace**:
一次 Pi 交互的事后运行记录，展示消息、thinking、工具调用、token 和成本。它属于 Analyze 视角的分析材料，不是 Project 下的交互入口本身。
_Avoid_: Session, workspace, chat

**Session**:
Project 下的一条 Pi Chat，代表一个已提交、可运行、可恢复、可归档的交互工作单元。实现上，一个 Session 对应一个 Agent Run 及其 Execution Checkout，并持续沉淀 Session Trace。Session 的运行真相属于 Pi Runtime；PiGUI 保存的是用于 UI、索引和生命周期管理的 Session Projection。
_Avoid_: Task, workspace, trace-only session, draft prompt

**Session Draft**:
用户在 Project 中点击 New Session 或加号后进入的未提交输入状态。每个 Project 最多保留一个 Session Draft，并跨 app 重启轻量持久化。它保存用户正在编辑的 initial prompt 和少量高级覆盖项，但尚未创建 PiGUI Session、Pi Session State、Agent Run 或 Execution Checkout，也不显示在 Session 列表中。Session Draft 只在 New Session / 加号入口上显示轻量提示。提交 draft 后才进入 Session 创建流程；只有 Pi Runtime 接受 initial prompt 或发出首个 runtime event 后，draft 才清空。
_Avoid_: Session, Pi session, run, trace

**Session Creation**:
Session Draft 提交后的创建状态机。PiGUI 先创建 `creating` 状态的 Session Projection，再选择或创建 Execution Checkout，然后启动或 attach Pi Runtime / 创建 Pi Session State，最后发送 initial prompt。每个阶段都要能记录错误和恢复点。
_Avoid_: Draft editing, single-step create, invisible side effect

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

**Model**:
由 Pi Runtime 使用的底层 LLM 选择，可以跨 provider 切换并影响 reasoning、成本和上下文能力。它不是 Agent Runtime；PiGUI 支持多模型不等于支持多 agent。
_Avoid_: Runtime, agent, workspace

**Agent Run**:
Agent Workspace 中一次可运行、可停止、可观察的 Pi Runtime 实例。一个 workspace 可以同时拥有多个 Agent Run；每个 Agent Run 对应独立进程、session 状态和 Session Trace。
_Avoid_: Workspace, model, task label

**Execution Checkout**:
Agent Run 操作文件系统时所属的 checkout，可以是前台本地 checkout，也可以是 PiGUI 管理的 Git worktree。它是并发运行的文件隔离边界。对 monorepo 子目录 Project，Execution Checkout 的根通常是 Git repo/worktree 根，而 Pi Runtime 的 `cwd` 是该 checkout 内的 Project 相对路径。
_Avoid_: Branch, session, workspace

**Pi Session State**:
由 Pi Runtime 拥有的 session 真相，包括消息、运行状态、模型配置、队列、fork/follow-up/abort 等 Pi 原生语义。PiGUI 通过 RPC/SDK 观察和驱动它，但不重新定义一套独立 chat 协议。
_Avoid_: PiGUI database record, trace, UI cache

**Runtime Event Stream**:
Pi Runtime 在 Session 运行期间向 PiGUI 暴露的 live 事件流，包括消息增量、工具调用、状态变更、错误、队列变化和 token/cost 增量。它驱动 Live Session View，并同步更新 Session Projection。
_Avoid_: Historical trace, file log tail, polling-only UI

**Structured Action Surface**:
PiGUI 首版替代 terminal/file-tree 的结构化操作面，通常位于 Session 页右侧，承载 diff 摘要、checkout 信息、模型/成本摘要、打开外部编辑器、运行预设命令、handoff、commit、push、PR、archive 等明确动作。它不提供任意 shell 交互，也不承担通用文件浏览器职责。
_Avoid_: Terminal emulator, file explorer, IDE panel

**Session Projection**:
PiGUI 自己保存的查询模型，用来支撑 Session 列表、Analyze、状态索引、成本聚合、checkout 生命周期、恢复入口和 UI 快速渲染。它是从 Pi Session State、Session Trace 和 PiGUI checkout 管理事件同步出来的投影，不是 Pi 会话内容的权威来源。
_Avoid_: Runtime truth, independent chat state, source of record

**Task**:
未来用于描述定时任务、自动化任务或队列化任务的术语。普通用户发起的一次 Pi 工作在 UI 中叫 Session，不叫 Task。
_Avoid_: Session, run, trace
