# ADR-0038：工作区失效信号，Agent 副作用后的 Changes 收敛

- 状态：Proposed
- 日期：2026-09-11
- 来源：架构讨论（2026-09-10）、codex 交叉审查 `.scratch/workspace-invalidation/review-codex.md`

## 背景

Pace 的运行时链路是事件驱动的：UI 动作经 Gateway API 进入后端，后端通过 `PiSdkDriver` 驱动 Pi，Pi 的事件流经 normalizer 稳定化后推回渲染层。这条链路只覆盖"用户或 Pace 发起的动作"。Agent 自己的副作用不在其中：Agent 在 bash 工具里执行 `git checkout other-branch`，[ADR-0022](0022-session-changes-and-diff-surface.md) 定义的 Changes 面板、composer 分支 chip 和 dock rail badge 都不会变化。

当前 `useSessionChanges`（`apps/desktop/src/entities/session/use-session-changes.ts`）是纯拉取：只在挂载、session 切换、手动刷新、checkout 命令返回和点击 changed-file 链接时重读。后端 `SessionChangesReader` 每次读取都串行执行 status、分支、worktree 占用，再逐文件读 numstat 与 patch，成本不可忽略。工作区链路没有任何文件系统监听，也没有定时轮询。

副作用无法穷举。Agent 可以执行任意命令，Pace 不可能从命令文本推导出仓库状态变化。

## 决策

### 1. 区分失效信号与真值读取，Git/FS 拥有工作区真值

延续 [ADR-0002](0002-pi-only-runtime.md) 与 [ADR-0018](0018-runtime-gateway-api-and-pi-drivers.md) 的"Pi 拥有会话真值，Pace 只观察"：**Git 与文件系统拥有工作区真值，Pace 只观察**。

Pace 不解析工具命令，不从事件推导状态变化。失效信号只回答一个问题："现在该重读一次了"。真值永远由既有的 `get_session_changes` 后端命令从 Git 读取，通知的生产者不预读、不缓存。

### 2. 失效信号只来自 Pace 进程内可观察的事实

所有信号来源必须在 Pace 自己的边界内：Pi SDK 已经推给 driver 的事件流、后端进程的 `fs.watch`、渲染层的窗口事件。**Pace 不为此功能向用户的 Pi 配置、extension 目录或 `~/.pi` 写入任何东西**，也不依赖用户安装 Pi hook 或 extension 来上报副作用。GUI 不应为一个不可配置的功能入侵用户配置文件。

### 3. 三层信号，承诺"在边界处收敛"而非"实时同步"

| 层 | 来源 | 覆盖 | 盲区 |
| --- | --- | --- | --- |
| 因果提示 | normalizer 产出的 `tool` phase `end`（含 `isError`）、`turn` end、`run` end | Agent 自己在工具内的改动 | Agent 之外的行为者；工具启动的后台进程在工具结束后的写入 |
| 事实监听 | 后端 `fs.watch` 监听 Git 元数据：HEAD、index、refs、packed-refs | 任何人做的分支切换、commit、stage | 只改工作树文件、不动 Git 元数据的外部写入 |
| 兜底 | 窗口 focus / visibilitychange、后端重连的 lifecycle connected | 用户离开又回来期间的一切变化 | 窗口一直在前台时的外部写入 |

三层合起来的承诺是：**工作区展示在工具边界和窗口重新激活时收敛到真值**。它不承诺所有工作区变更实时同步。前台外部编辑器只改工作树文件的场景三层都不触发，手动刷新按钮保留。

不做定时轮询。理由是每次读取的 CPU 与磁盘成本，以及与 Agent 工具调用的并发读取压力。`SessionChangesReader` 已设置 `GIT_OPTIONAL_LOCKS=0`，index.lock 争抢不是理由。

通知携带 `source`（`tool` / `git-watch` / `focus` / `reconnect`），只表达信号来源，不表达行为者。Agent 自己的 Git 命令同样会触发 `git-watch`，因此不能据此向用户提示"外部改动"。

### 4. 失效按 checkout 身份分发，不按 session

Gateway 事件的身份是单个 session，但工作区真值属于 checkout。用户查看 session B 时，同一 checkout 上的 session A 切了分支，B 必须刷新。

后端维护 checkout 到 session 的关联，以规范化后的 execution checkout 路径为键。失效与 debounce 在 checkout 粒度共享，向该 checkout 关联的所有 session 分发。渲染层由当前启用的 `useSessionChanges` 响应，其他 session 不触发读取。

UI 里的 `checkout_session_branch` 命令成功后，同样向同 checkout 的兄弟 session 分发失效。

读取结果不跨 session 复用：`SessionChanges` 受各 session 的 `diffRoot` 影响，不同 worktree 也不能只按 common-dir 合并。

### 5. debounce 与读取合并是两件事

后端侧：trailing debounce 带最大等待时间，turn end、run end 与显式 stop 时 flush pending。初值 500ms 是待测参数，不是可靠性保证。

渲染层侧：每个读取作用域同时最多一个请求在执行。请求进行中收到新失效只标记 dirty，当前请求完成后补读一次。后台刷新保留同 session 的旧快照并标记 refreshing，不得像首次加载那样置空进 loading，否则分支 chip、badge 与打开的 diff 会反复闪烁。切换 session 不沿用旧快照。

### 6. 不复用 projection.stale

[ADR-0022](0022-session-changes-and-diff-surface.md) 与面板文案里的 stale 指 runtime projection 过期（"Runtime state is stale. This diff is fresh"），多处运行状态依赖 `!projection.stale`。工作树刷新状态是 `useSessionChanges` 自己的 refreshing 语义，与 projection.stale 互不影响。工具结束不得写成 projection stale。

### 7. 复用现有事件出口，不新建传输通道

工作区失效不是 Pi 事件，不进 journal，不参与 seq 排序，不改 runtime projection。但也不新建 IPC 通道：`service.ts` 已有 terminal 的临时 envelope 先例（外层 `type: event`，`seq: 0`，不入 journal）。失效通知沿同一出口发送，`event.type = workspace.invalidated`，payload 为 `{ checkoutId, sessionIds, source }`。另建外层 type 会被 Electron main 的事件守卫拦截，反而扩大改动。

### 8. Git 元数据监听路径由 Git 解析

Pace 的 execution checkout 使用 `git worktree add --detach`（`packages/backend/src/workspace/execution-checkout.ts`）。linked worktree 的 `.git` 是文件，HEAD 与 index 属于各 worktree，refs 在 common dir 共享，且可能存于 `packed-refs`。监听目标必须用 `git rev-parse --git-path` 解析并规范化为绝对路径，不得手写 `.git/HEAD` 之类的字面路径。

`fs.watch` 绑定 inode，Git 通过 rename 写入元数据文件，同名重建后监听不会跟随。因此监听父目录并过滤目标文件名，处理 rename、无 filename 与 watcher error，恢复时重建监听并触发一次失效。监听按 checkout 引用计数，归零时释放。不递归监听整个 `.git`。

### 9. 本期范围

第一期只覆盖 Changes 面板、composer 分支 chip 与 rail badge，即 `useSessionChanges` 的全部消费者。Files 面板有独立的目录与预览状态，其失效消费者列为后续任务。

## 实施顺序

第一期：因果提示层 + 兜底层。不改 normalizer，不建新 IPC，不动 journal 格式。

| 文件 | 职责 |
| --- | --- |
| `packages/backend/src/service.ts` | 消费归一化的 tool end、turn end、run end；从 projection 解析 checkout 交给调度器；经现有 listeners 发临时 envelope；checkout 命令成功也失效同 checkout |
| `packages/backend/src/workspace/workspace-invalidation.ts`（新增） | checkout 到 session 关联、共享 debounce、终止 flush 与清理。不解析命令、不读 Git |
| `packages/core/src/runtime-gateway.ts` | 定义 `workspace.invalidated` payload 形状，不改 `AgentRuntimeEvent` union |
| `apps/desktop/src/entities/session/use-session-changes.ts` | 订阅通知；仅当前启用 session 响应；合并 focus、visibility、重连；单请求执行与 dirty 补读；后台刷新保留旧快照 |
| `apps/desktop/src/pages/agent-workspace.tsx` | 仅在需要展示 refreshing 状态时改动 |

第二期：Git 元数据监听层，含路径解析、监听生命周期、worktree 与 packed-refs 行为测试。

第一期的最小验证变体：只改 `useSessionChanges` 直接消费现有 tool envelope。它只覆盖当前 session，不能宣称完成本 ADR。

## 测试边界

测试保护的是可观察行为，用假时钟与 Promise gate，不用真实 sleep：

- session A 修改共享 checkout，正在显示的 session B 刷新。
- 密集工具调用、失败工具与 turn / run 终止合并为有限次读取。
- 慢请求进行中收到失效，最终读到新值且没有并发读取。
- 切换 session、禁用、卸载时不误写旧快照。
- Chat workspace（[ADR-0034](0034-projectless-chat-workspace.md)）不查 Git。
- 后端重连后补读当前可见 session。

## 后果

- 工作区展示在工具边界与窗口激活时收敛，用户不再需要在 Agent 切分支后手动刷新。
- Pace 仍不理解工具命令，副作用无法穷举这一前提被接受而非绕过。
- 用户侧 Pi 配置零改动，Pi 仍是唯一的会话真值来源。
- 第一期不覆盖前台外部工作树写入，手动刷新按钮保留，产品文案不得承诺实时同步。
- 后续 Files 面板的失效消费、以及是否需要受限工作树监听，另行决策。
