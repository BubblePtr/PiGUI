# Agent Workspace Control Plane Issues

Status: local-only
Source PRD: `.scratch/agent-workspace-control-plane/PRD.md`
Created: 2026-06-25

> 这些 issue 是给后续子 Agent 使用的本地实现 brief。它们尚未发布到 Multica 或其他外部 issue tracker。每个 issue 都应当作为一个独立实现上下文处理：只携带 PRD、相关 ADR/CONTEXT 术语和当前 issue body。

## Issue 1: 建立 Agent Workspace Session 壳与 Analyze 边界

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

1, 5, 27, 31, 32, 33, 34, 35, 67, 68

## What to build

建立 Pig 的 Agent Workspace 入口形态：Project 下有 Sessions 工作视图，Live Session View 使用三栏壳，Trace / Usage 的历史复盘能力被明确放入 Analyze 语义下。这个 issue 先使用 fixture/projection 数据，不接 Pi Runtime。

重点是让后续 issue 有稳定的 UI 和领域词汇落点：左侧 Project / Session list，中间 Live Chat + run timeline，右侧 Structured Action Surface。首版明确不放 terminal emulator 和 file tree。

## Acceptance criteria

- [ ] 用户可以进入 Project-scoped Sessions 视图，并看到三栏 Live Session View 壳。
- [ ] 左侧区域表达 Project / Session list，中心区域表达 Live Chat + run timeline，右侧区域表达 Structured Action Surface。
- [ ] Trace / Usage 或既有历史复盘入口在 UI 文案和结构上归入 Analyze 语义，不与 live Session 控制混淆。
- [ ] UI 中不出现 terminal emulator 或 file tree 的占位承诺。
- [ ] 现有 Trace / Usage 的核心路径没有回归。
- [ ] 有组件测试覆盖新入口、三栏壳、Analyze 边界和无 terminal/file-tree 承诺。

## Blocked by

None - can start immediately.

## Required verification

- [ ] 先写 failing UI/component test。
- [ ] 运行 repo-native test 命令。
- [ ] 如改 CSS/布局，启动 dev server 并截图验证桌面视口。

## Out of scope

- 不接真实 Pi Runtime。
- 不实现 Session Draft。
- 不实现 Queue、Steer、Stop。
- 不实现 managed worktree。

---

## Issue 2: New Session 进入 Project-scoped Session Draft

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

15, 16, 17, 18, 19, 23, 45, 46

## What to build

让 New Session / Project 右侧加号进入 Project-scoped Session Draft，而不是立刻创建 Session。每个 Project 最多一个 draft；重复点击 New Session 回到同一个 draft。Draft 需要轻量持久化，不能出现在 Session list 中，只在 New Session / 加号入口显示轻提示。

提交按钮使用图标。没有 active run 时，输入行为是普通 initial prompt submit，但这个 issue 不需要接 Pi Runtime，只需要把 draft 提交事件交给后续 creation seam。

## Acceptance criteria

- [ ] 点击 New Session / 加号后进入 draft 输入状态，但 Session list 不新增空 Session。
- [ ] 同一个 Project 重复点击 New Session 会恢复已有 draft 内容。
- [ ] Draft 在 app 重载或 runtime fallback 场景中保持轻量持久化。
- [ ] 每个 Project 最多一个 draft，不同 Project 的 draft 互不覆盖。
- [ ] New Session / 加号入口能显示轻量 draft indicator。
- [ ] Draft submit 暴露清晰事件给 Session Creation，但不会在本 issue 中启动 Pi。
- [ ] 有测试覆盖单 draft、持久化、列表不展示、indicator、submit event。

## Blocked by

- Issue 1

## Required verification

- [ ] 先写 failing draft behavior tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改输入区布局，截图验证按钮、长文本和移动/桌面宽度不溢出。

## Out of scope

- 不创建真实 Session Projection。
- 不接 Pi RPC。
- 不处理 Queue / Steer active-run 输入模式。

---

## Issue 3: 提交 Draft 创建一条可恢复的 Live Session

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

20, 21, 22, 24, 28, 29, 30

## What to build

实现 Draft submit 到 Live Session 的最小端到端创建链路：Session Creation 状态机创建 Session Projection，选择当前本地 checkout 作为临时 Execution Checkout，启动 fakeable Pi Runtime Bridge，创建/绑定 Pi Session State，并发送 initial prompt。

这个 issue 使用 fake bridge 作为主测试对象，不要求真实 Pi 进程。核心是把 creation stages、成功清 draft、失败保 draft、projection resync/stale 这些语义落稳。

## Acceptance criteria

- [ ] Draft submit 后创建 `creating` Projection，并显示可理解的创建阶段。
- [ ] 创建流程至少区分 preparing checkout、starting runtime、sending prompt、accepted/failed。
- [ ] fake bridge 接受 initial prompt 后，draft 被清空，Live Session 出现首条 runtime event。
- [ ] fake bridge 在任一阶段失败时，draft 内容保留，failure stage 和 error detail 可见。
- [ ] Pi Session State 被视为 runtime truth；Pig 只保存 Session Projection。
- [ ] Projection 可以标记 stale，并在 fake runtime 状态恢复后 resync。
- [ ] 有 bridge contract tests 和 projection state tests 覆盖成功、失败、恢复。

## Blocked by

- Issue 2

## Required verification

- [ ] 先写 failing bridge/projection tests。
- [ ] 运行 repo-native test 命令。

## Out of scope

- 不启动真实 `pi --mode rpc`。
- 不实现后台 worktree。
- 不实现 Queue、Steer、Stop。

---

## Issue 4: 单个前台 Session 接入真实 Pi RPC 事件流

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

24, 25, 26, 28, 65, 66, 69

## What to build

把 fakeable Pi Runtime Bridge 接到真实 Pi RPC 前台运行路径。Pig 应通过 Pi RPC 语义发送 initial prompt，消费 Runtime Event Stream，并把消息、工具调用、错误、model/provider、token/cost 增量同步进 Live Session View 和 Session Projection。

测试仍应使用 fake process/transport，不做真实模型或网络调用。真实 Pi 路径只作为本地 smoke/manual verification。

## Acceptance criteria

- [ ] Pig 可以为单个前台 Session 启动或 attach `pi --mode rpc`。
- [ ] Initial prompt 经 Pi RPC 发送，并能处理 accepted/error 两类返回。
- [ ] Runtime Event Stream 能更新 Live Chat、run timeline 和 Projection。
- [ ] model/provider 和 token/cost 摘要能出现在 Structured Action Surface。
- [ ] runtime unavailable 或 ended Session 时，UI 能 fallback 到 trace/projection read-only 数据。
- [ ] 所有 automated tests 使用 fake process/transport，不调用真实模型或网络。

## Blocked by

- Issue 3

## Required verification

- [ ] 先写 failing fake-process RPC tests。
- [ ] 运行 repo-native test 命令。
- [ ] 做一次本地 Pi RPC smoke，记录命令和结果；如果环境不可用，说明阻塞原因。

## Out of scope

- 不支持非 Pi Runtime。
- 不实现 SDK 集成。
- 不实现 managed worktree 并发。
- 不实现 Queue、Steer、Stop。

---

## Issue 5: Session 列表使用 active / unread / archive 投影

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

12, 13, 14, 36, 37, 38, 39, 40, 41, 42, 43, 44

## What to build

让 Session list 完全由 Session Projection 的 active-run、unread、archive visibility 和 updated-at ordering 驱动。UI 只显示 active spinner/shimmer 和 Unread Result Indicator，不展示 Running / Completed / Failed 这类状态标签。失败和完成作为 Live Chat 结果出现。

## Acceptance criteria

- [ ] Active run Session 排在最前，多个 active run 按最近 runtime event 时间倒序。
- [ ] 有 unread result 的 Session 排在非 active Session 前。
- [ ] 其余 Session 按最近更新时间倒序。
- [ ] Active run 只显示 spinner/shimmer，不显示 `Running` 文案。
- [ ] 非运行 Session 不显示 Completed / Failed / Waiting 标签。
- [ ] completion/failure 事件在 Live Chat 中呈现，并设置 unread indicator。
- [ ] 打开 Session 且最新消息渲染后，unread indicator 清除。
- [ ] Archived Session 默认不显示，但可通过 Analyze/history 找回。
- [ ] Active run 禁止 archive。
- [ ] 有 projection reducer/query tests 和 UI tests 覆盖排序、indicator、archive eligibility。

## Blocked by

- Issue 3

## Required verification

- [ ] 先写 failing projection ordering tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改列表视觉，截图验证 active/unread/normal 三类行。

## Out of scope

- 不实现 Stop 行为，只禁止 active archive。
- 不实现复杂 read receipts 或 scroll-bottom 检测。
- 不删除 Projection、Trace 或 checkout snapshot。

---

## Issue 6: Active run 默认 Queue 并管理 Queued Message

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

47, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59

## What to build

在 active run 场景中，Live Session 输入区的默认提交行为变为 Queue。主提交按钮仍是发送图标，但 tooltip/status 说明当前会 Queue。Queued Message 立即进入独立 pending 区，不混入正式 Live Chat；Pi 开始处理后才转为正式消息。

处理开始前允许 withdraw，处理开始后不可 withdraw。多个 Queued Message 按提交顺序执行，首版不支持重排。

## Acceptance criteria

- [ ] 没有 active run 时，输入行为仍是普通 prompt submit。
- [ ] 有 active run 时，Enter/default submit 和主发送图标都执行 Queue。
- [ ] 主按钮仍为发送图标，tooltip/status 能说明 Queue 行为。
- [ ] Queued Message 提交后立即出现在独立 pending 区。
- [ ] Pending Queued Message 不进入正式 Live Chat 消息流。
- [ ] Runtime event 表示开始处理后，Queued Message 转为正式 Live Chat 消息。
- [ ] 处理开始前可以 withdraw，处理开始后不可 withdraw。
- [ ] 多个 Queued Message 按提交顺序展示和执行。
- [ ] UI 不提供 reorder。
- [ ] 有 bridge/projection/UI tests 覆盖 queue、withdraw、processing transition。

## Blocked by

- Issue 4

## Required verification

- [ ] 先写 failing queue behavior tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改输入区交互，截图验证 active run 下 pending queue 区域。

## Out of scope

- 不实现 Steer。
- 不实现 Stop。
- 不支持 queue reorder。

---

## Issue 7: Steer 当前 active run

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

48, 49, 60, 61

## What to build

在 active run 且默认输入会 Queue 的场景中，提供 `Steer` 作为明确替代动作。Steer 发送给当前 Pi run，用于在当前工具调用结束后、下一次模型调用前修正方向。提交后应立即显示在 Live Chat 屏里，作为当前 active run 下的 steer/control event，而不是 pending Queued Message。

## Acceptance criteria

- [ ] 无 active run 时，不显示 Queue/Steer 控制。
- [ ] 有 active run 时，Steer 作为 Queue 的替代动作出现。
- [ ] UI 文案使用 `Steer`。
- [ ] Steer 调用 Pi Runtime Bridge 的 steer 语义，不进入 follow-up queue。
- [ ] Steer 提交后立即显示在 Live Chat 屏里。
- [ ] Steer 展示为当前 active run 下的 steer/control event，不混入 pending Queued Message 区。
- [ ] Steer 失败时在 Live Chat 或输入区显示可恢复错误，不丢失用户文本。
- [ ] 有 bridge/projection/UI tests 覆盖可见性、提交、显示位置、失败保留。

## Blocked by

- Issue 4

## Required verification

- [ ] 先写 failing steer behavior tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改输入区交互，截图验证 Queue 和 Steer 的关系。

## Out of scope

- 不实现 Queue withdraw。
- 不实现 Stop。
- 不改 Pi steer 语义。

---

## Issue 8: Stop active run 并保护 archive 行为

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

14, 38, 62, 63, 64

## What to build

提供 active run 的次级安全动作 `Stop`，内部映射 Pi Runtime 的 `abort`。UI 不暴露 `Abort` 文案，也不同时出现 Stop 和 Abort。Stop 的结果、失败或被 runtime 确认后的状态变化应作为 Live Chat 中的新结果呈现，并与 active archive 禁止规则协同。

## Acceptance criteria

- [ ] 只有 active run 时显示 Stop。
- [ ] UI 文案使用 `Stop`，不显示 `Abort` 作为同级用户操作。
- [ ] Stop 调用 Pi Runtime Bridge 的 abort 语义。
- [ ] Stop accepted 后，active-run indicator 结束或进入 runtime 返回的终止状态。
- [ ] Stop 结果或失败说明出现在 Live Chat。
- [ ] Stop 后如果没有 active run，Session 可以 archive。
- [ ] Active run 未停止前，archive action 被禁用或阻止，并给出轻量说明。
- [ ] 有 bridge/projection/UI tests 覆盖 stop、stop failure、archive gating。

## Blocked by

- Issue 4
- Issue 5

## Required verification

- [ ] 先写 failing stop/archive tests。
- [ ] 运行 repo-native test 命令。
- [ ] 如改右侧 action surface，截图验证 Stop 和 archive 状态。

## Out of scope

- 不实现强制杀进程之外的高级恢复流程。
- 不做完整 failure classification。
- 不删除任何 Session material。

---

## Issue 9: 后台并发 Session 使用 Execution Checkout 隔离

## Parent

Local PRD: `.scratch/agent-workspace-control-plane/PRD.md`

## User stories covered

2, 3, 4, 6, 7, 8, 9, 10, 11, 70, 71

## What to build

支持同一 Project 下多个 Session 并发运行，并用 Execution Checkout 隔离后台并发写入。Git repo 中的后台 concurrent Session 默认创建 Pig-managed disposable worktree；前台或显式选择的 Session 可以使用本地 checkout。

Monorepo 场景中，Project 可以是 repo 子目录：Git / worktree 操作用 repo/worktree root，Pi Runtime `cwd` 使用 Execution Checkout 内的 Project 相对路径。Structured Action Surface 应显示 checkout/root/cwd 信息，让用户知道 Pi 正在哪个目录操作。

## Acceptance criteria

- [ ] 同一 Project 可以存在多个 active Session。
- [ ] 后台 concurrent Session 在 Git repo 中默认使用 Pig-managed worktree。
- [ ] 前台或显式选择路径可以使用本地 checkout。
- [ ] Managed worktree 默认 Session-bound、detached/disposable，并在 run 完成后保留供 diff/continue。
- [ ] Archived Session 或 retention rule 可以把 managed worktree 标记为 cleanup candidate，但不会删除 permanent checkout。
- [ ] 用户可以将 managed worktree promote 为 permanent checkout。
- [ ] Monorepo Project 保存 repo root、project root、projectRelativePath、executionCheckoutRoot。
- [ ] Pi Runtime `cwd` 是 execution checkout 内的 Project 相对路径。
- [ ] Diff/snapshot 操作使用 repo/worktree root。
- [ ] Structured Action Surface 显示 checkout/root/cwd 摘要，advanced overrides 默认隐藏。
- [ ] 有 temp Git repo/worktree tests 和 monorepo path mapping tests。

## Blocked by

- Issue 4
- Issue 5

## Required verification

- [ ] 先写 failing checkout manager tests。
- [ ] 用临时 Git repo 测试 worktree create/retain/promote/cleanup-candidate。
- [ ] 运行 repo-native test 命令。
- [ ] 如改右侧 action surface，截图验证 checkout/root/cwd 展示。

## Out of scope

- 不实现完整 branch management。
- 不自动 commit / push / PR。
- 不删除用户管理的 checkout。
- 不支持非 Git 目录的高级隔离策略，非 Git Project 可先退化为 single local checkout。
