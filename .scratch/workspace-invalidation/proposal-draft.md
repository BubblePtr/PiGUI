# 方案草稿：Agent 副作用后的工作区状态失效（待交叉审查）

## 问题
Pace 的运行时链路是事件驱动的：UI 动作 → gateway → driver → Pi。但 Agent 自己的副作用（例如在 bash 工具里执行 `git checkout other-branch`）不会反映到 UI。

现状（代码事实）：
- `apps/desktop/src/entities/session/use-session-changes.ts` 是纯拉取：只在挂载、手动 refresh、checkout 成功、点击 changed-file 链接时调用 `getSessionChanges` 重跑 git status。
- `packages/backend/src/workspace/session-changes.ts` 用 `git status` / `git diff` 子进程读取，有 15s 超时、8MB status 上限、200 文件上限。
- 没有任何 fs watcher，没有轮询。
- `packages/backend/src/gateway/agent-runtime-event-normalizer.ts` 已经归一化 Pi 的 `tool_execution_end` 事件。

## 核心原则
不穷举副作用。区分"失效信号"（何时该重读）和"真值读取"（git/FS 是工作区状态的权威）。延续 "Pi 拥有会话真值，Pace 只观察" 的原则："Git/FS 拥有工作区真值，Pace 只观察"。

## 三层失效信号
1. 因果提示：任何 `tool_execution_end`（不解析命令内容）→ 后端 debounce（turn 内 tool end 后 ~500ms 无新事件刷一次；turn end 必刷一次）→ 重读 git status。覆盖 Agent 自己的改动。盲区：Agent 之外的行为者。
2. 事实监听：fs watcher 只监听 `.git/HEAD`、`.git/index`、`.git/refs/`，捕获分支切换 / commit / stage，不管谁做的。不监听整个工作树。
3. 兜底：窗口 focus / visibilitychange 时刷新一次。不做定时轮询（大仓库 git status 昂贵，且与 Agent 工具调用抢 index.lock）。

## 架构落点
- 不走 runtime event pipeline（工作区变化不是 Pi 的事件）。
- 后端 workspace 层新增独立观察通道 `workspace.invalidated { sessionId, reason }`，经 gateway 推到渲染层；渲染层只调用现有 `refresh()`。
- reason 区分 agent / external，未来 external 可提示用户。

## 已识别边界
- 多 session 共用一个 checkout：watcher 按 checkout 路径共享。
- turn 内工具调用密集：debounce 要宽。
- 分支切换使打开的 diff 失效：复用 ADR-0022 已定义的 stale 状态。

## 实施顺序
先做第 1 层（gateway tool end 处理里加 debounced 通知，改动最小），第 2 层独立 PR。
