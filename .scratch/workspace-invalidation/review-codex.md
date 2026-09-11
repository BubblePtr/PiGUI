# 工作区失效方案交叉审查

## 结论：有条件同意

同意“失效信号只提示重读，Git/FS 提供真值”和先做工具结束层的方向；不同意将当前草稿直接视为可实施规格。必须先修正 stale 语义、worktree 监听路径、跨 session 通知范围及读取调度，并明确本期只刷新 Changes/分支信息，还是整个 Files 工作区。

审查基于当前 checkout `3cbf2d3`，完整阅读方案后核对源码及本地 Pi 0.84.3 依赖；Nowledge 检索仅用于定位历史背景，结论以当前代码为准。本次只产出本报告，未修改代码、未提交 Git；文档审查不适用实现前 TDD，不运行无关构建或 UI 测试。

## 事实核对表

下表路径均相对仓库根目录。

| 方案陈述 | 代码证据 file:line | 结论 |
| --- | --- | --- |
| Agent 副作用不会反映到 UI | `apps/desktop/src/entities/session/use-session-changes.ts:50`；`apps/desktop/src/pages/agent-workspace.tsx:3124` | 对 Changes/分支信息的自动刷新成立；不能泛指整个 UI，工具结果和运行状态已经实时更新。 |
| hook 是纯拉取，只在挂载等时机读取 | `apps/desktop/src/entities/session/use-session-changes.ts:41`、`:50`、`:80` | 基本成立，但还包括 sessionId 切换、enabled 恢复及 loadChanges 函数引用变化。页面在 runtime 绑定、非 Draft、非 Chat 时启用，见 `apps/desktop/src/pages/agent-workspace.tsx:4059`。 |
| checkout 成功调用 getSessionChanges | `apps/desktop/src/entities/session/use-session-changes.ts:92`；`packages/backend/src/service.ts:468`；`packages/backend/src/workspace/session-changes.ts:640` | 不准确：checkout RPC 后端直接 `reader.read(input)`，hook 使用返回快照，没有再发 getSessionChanges。 |
| 手动 refresh、changed-file 链接重读 | `apps/desktop/src/entities/session/use-session-changes.ts:86`；`apps/desktop/src/pages/agent-workspace.tsx:2550`、`:4251` | 成立；链接点击先 refresh 再解析目标。 |
| Git 子进程有 15s、8MB、200 文件限制 | `packages/backend/src/workspace/session-changes.ts:10`、`:199`、`:220`、`:684`、`:709` | 数字正确，含义需收窄：15s 是每条命令超时；8MiB 是 status stdout 上限；200 是读取完整 status 后的条目截断，不是整个请求的时间/工作量上限。另有单 patch 512KiB、总返回 patch 2MiB 限制。 |
| 读取只是重跑 git status | `packages/backend/src/workspace/session-changes.ts:657`、`:676`、`:683`、`:713`；`:557`、`:569` | 描述过简：还读 HEAD、分支、worktree 占用，并逐文件串行读 numstat/patch。总 patch 上限在生成后裁剪，不能据此认为工作量很小。 |
| 没有 watcher、没有轮询 | hook 全文件；对 `packages/backend/src`、`apps/desktop/src`、`apps/desktop/electron` 检索 watch/watchFile/chokidar/setInterval | 对工作区 Changes 链路成立；全仓绝对表述不成立，已有 UI 时钟和 updater 定时器（`apps/desktop/src/pages/agent-workspace.tsx:3173`、`apps/desktop/electron/updater.ts:128`）。 |
| normalizer 已处理 tool_execution_end | `packages/backend/src/gateway/agent-runtime-event-normalizer.ts:262`、`:302`、`:473` | 成立，转换成 `type: tool, phase: end`，保留 isError；缺 runId/turnId/toolCallId 时丢弃。Gateway 不应继续匹配原始事件名。 |
| 后端容易拿到 sessionId / checkout | `packages/backend/src/drivers/pi-sdk-runtime-adapter.ts:753`；`packages/backend/src/gateway/runtime-gateway.ts:152`；`packages/backend/src/service.ts:437` | Gateway envelope 有应用 sessionId；normalizer 本身没有 checkout。service 已能由 projection 解析 executionCheckoutRoot/root 和 diffRoot，无须从工具命令猜路径。 |
| 需要独立通道经 gateway 推送 | `packages/backend/src/service.ts:179`、`:188`；`apps/desktop/electron/backend.ts:19`；`apps/desktop/electron/main.ts:220`；`apps/desktop/electron/preload.ts:13` | 独立事件语义合理，新建物理通道没有必要。已有不入 journal、不参与排序的 terminal envelope，可复用 service 事件出口。 |
| git status 会与工具争 index.lock | `packages/backend/src/workspace/session-changes.ts:201` | 作为本项目主要理由不成立：已设置 `GIT_OPTIONAL_LOCKS=0`，禁止可选锁操作；仍有 CPU、磁盘和并发读取成本，不应宣称没有任何 Git 并发风险。 |
| watcher 按 checkout 共享即可 | `packages/backend/src/service.ts:447`；`packages/backend/src/workspace/session-changes.ts:325`、`:691` | 必要但不充分：还要共享调度并向同 checkout 的其他 session 分发；读取结果还受 diffRoot 影响。 |
| 分支切换可复用 ADR-0022 的 stale | `docs/adr/0022-session-changes-and-diff-surface.md:40`；`apps/desktop/src/pages/agent-workspace.tsx:2311`、`:2549` | 不成立：实际传入的是 projection.stale，UI 明说 runtime 过期、diff 是新的；不是 Git 快照的 stale。 |

## 问题清单（按严重度）

### P1：直接监听 checkout/.git 会漏掉项目正式支持的 worktree

证据：`packages/backend/src/workspace/execution-checkout.ts:26` 实际调用 `git worktree add --detach`。linked worktree 的 `.git` 是指向管理目录的文件；HEAD/index 属于各 worktree，普通 refs 共享。直接拼接 `.git/HEAD`、`.git/index`、`.git/refs` 不成立。[Git worktree 文档](https://git-scm.com/docs/git-worktree)

建议：由 Git 解析实际 git-dir/common-dir 和 `git rev-parse --git-path HEAD/index/refs/heads` 等路径，规范化为绝对路径；不要手工假定目录布局。还需考虑 `packed-refs`，以及现有 branch picker 的 worktree 占用信息：新增/删除另一 worktree 可能改变占用却不修改这些监听目标。证据为 `session-changes.ts:683`；Git 允许 refs 存于 `packed-refs`。[Git 仓库布局](https://git-scm.com/docs/gitrepository-layout)

第二层独立 PR 合理，但它不能按现稿的三个字面路径实现。

### P1：三层不是完整覆盖，也不能可靠归因 external

证据：Changes 会展示 unstaged/untracked 文件（`session-changes.ts:126`、`:684`）；第一层只观察工具完成，第二层只观察 Git 元数据。由此可构造盲区：外部编辑器、Pace Terminal 中的脚本、后台生成器只写工作树，窗口始终在前台，则三层均可能不触发。Agent 工具启动后台进程后先结束，后台后续写入也不在 tool end 快照内；工具在另一个仓库操作则不属于当前 checkout 的通知范围。

建议：明确承诺是“工具边界与重新激活时收敛”，而非所有工作区变更实时同步；保留手动刷新。若必须覆盖前台外部写入，需要另行设计受限工作树监听或可见时低频检查，不能称当前三层已覆盖。`reason` 应表达信号来源（tool/git-watch/focus），不能表达行为者；Agent 自己的 Git 命令也会触发 watcher，不能据此提示“外部人员改动”。本期不需要用户提示时可省略 reason。

### P1：debounce 不等于读请求合并，自动 refresh 会暴露现有交互和负载问题

证据：`use-session-changes.ts:41` 每次 refresh 改 requestKey，`:83` 立即返回 `changes=null/loading=true`；`:77` 只阻止旧结果写入，不取消后端 Git 子进程。`session-changes.ts:713` 串行处理最多 200 个文件，每个命令独立超时。

风险：若每 500ms 发一次通知、每次读取需数秒，会启动多个完整读取，旧请求继续消耗资源；持续刷新还会反复隐藏分支/badge/diff，甚至一直等不到一个未被取消的结果。草稿“一层后端重读”与“渲染层只调用 refresh”也有歧义，若两处都读则重复。

建议：只由既有 RPC 读取真值，通知生产者不预读。每个读取作用域最多一个请求执行，期间只置 dirty，完成后再补一次；使用带最大等待时间的 trailing debounce，turn/run 终止时合并 pending timer。首次加载与后台刷新分开，保留同 session 的旧快照并标记正在刷新；切换 session 不得沿用旧快照。500ms 作为待测初值，不能作为可靠性保证。

### P1：只通知产生事件的 session，会漏掉正在看的兄弟 session

证据：Gateway 的事件身份是单个 session（`runtime-gateway.ts:153`）；UI hook 绑定当前选中 session（`agent-workspace.tsx:4059`）；读取根目录来自各 projection（`service.ts:447`）。

场景：用户查看 session B，后台 session A 在相同 checkout 改文件。只发 `{sessionId:A}`，B 的 hook 不刷新；第二层若也只看 Git 元数据，普通文件写入仍漏掉。

建议：失效与 debounce 按规范化 checkout 身份共享，向关联 session 分发；不要每次事件扫描/重读所有历史 session。实际读取去重还需包含 diffRoot，返回体中的 sessionId 不能直接跨 session 复用；不同 worktree 不能只按 common-dir 合并 Changes 真值。UI checkout 成功也应通知兄弟 session，后端已有明确落点 `service.ts:468`。

### P1：现有 stale 不能用于工作树失效

证据：`agent-workspace.tsx:2549` 传 `projection.stale`，`:2313` 文案明确“Runtime state is stale. This diff is fresh”；运行状态多处依赖 `!projection.stale`，例如 `:983`。

建议：不要把工具结束写成 projection-marked-stale。保持 runtime stale 与 Changes 刷新状态独立；初版可沿用“新快照替换现有 diff”，若保留旧数据，新增 hook 层 refreshing/invalidated 语义。现有路径折叠与选中目标清理已在 `agent-workspace.tsx:2217`，无需先建设通用快照框架。

### P2：tool end / turn end 不是崩溃后的完成保证

证据：本地依赖 `node_modules/.bun/@earendil-works+pi-agent-core@0.84.3+c9e75ddbd11a69ea/node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:295` 顺序执行路径在 tool 返回后发送 end，再检查 abort；`:453` 将常规工具异常转为错误结果，`:525` 发 end。因此不能笼统说正常 abort 一定丢 end，但也不能说一定收到：工具不返回、执行宿主被杀或事件传输中断均无保证。Pace normalizer 只是消费收到的事件（`:262`），并不为所有未结束工具补 end；run end 支持 aborted/failed（`:542`）。

建议：成功及 isError 的 tool end 都触发；turn end 刷 pending，run end、显式 stop 完成、可观察的致命错误提供补偿。backend reconnect 已有 lifecycle connected 信号（`use-session-projections.tsx:137`），恢复后也应重读当前可见 session；focus/visibilitychange 合并且只在可见、已绑定 runtime、非 Chat 时执行。完全崩溃后的刷新依赖宿主恢复，不能在死去的 backend 中承诺必刷。

### P2：macOS recursive 可用不等于 watcher 可靠

Node 24 文档指出 fs.watch 存在平台/文件系统限制；macOS/Linux 的监听会绑定 inode，删除重建同名文件后不会自动跟随新 inode；filename 也不保证总有值。[Node fs.watch caveats](https://nodejs.org/docs/latest-v24.x/api/fs.html#caveats)

建议：监听有关父目录并过滤元数据目标，处理 rename/recreate、无 filename 和 watcher error；恢复时重建监听并触发一次失效，监听引用计数归零时释放。递归 refs 只是覆盖子目录的手段，不能取代丢失信号后的补偿；没必要递归监听整个 `.git` objects/logs。初版不用 watcher 就不需提前实现这套生命周期。

### P2：独立语义边界合理，但无需另建传输，也不宜伪造 projection 更新

实际链路为 runtimeGateway.onEvent → service listeners → backend.ts MessagePort → main.ts `webContents.send("pigui:backend-event")` → preload ipcRenderer → shared onBackendEvent。README 的 MessagePort 箭头是简图，renderer 实际经主进程 IPC 接收。

`service.ts:188` 已有 terminal 临时 envelope 先例；`packages/core/src/runtime-gateway.ts:20` 的 payload 是 Record、type 是 string。建议在 service 订阅已归一化 envelope，将提示交给 workspace 调度器，调度器经现有 service 出口发 `event.type=workspace.invalidated`（外层仍是 `type:event`，seq 0，不入 journal、不改 runtime projection）。若另建外层 type，`electron/main.ts:793` 的守卫不会识别，反而扩大改动。

现有 projection writer（`runtime-gateway.ts:550`）负责持久化生命周期/usage/name，不是通用 cache invalidation 总线；`use-session-projections.tsx:128` 也只局部处理 name 和连接状态。不能仅“save projection”就期待 Changes 重读，也不应更新 updatedAt/status 制造刷新。更小的验证方案是前端直接订阅现有 tool/turn/run envelope、调用 hook 调度，无须新增后端事件，但必须说明只解决当前 session，或补 checkout 范围匹配；这一限制使它不适合作为完整跨 session 方案。

### P2：workspace 命名覆盖面比实际消费者大

证据：`apps/desktop/src/pages/session-files-panel.tsx:85` 独立维护目录/preview，`:115` 调自己的 Files RPC。刷新 useSessionChanges 不会刷新 Files。

建议：本期明确范围是 Changes + composer branch + badge；Files 的失效消费者列为后续任务。如果产品要求“切分支后整个工作区 UI 更新”，Files 列表和预览必须一并纳入验收，但不要在本次审查擅自扩展实现。

## 建议的最小实施落点

推荐第一期做“工具层 + 激活/重连兜底”，第二期再做 Git 元数据 watcher。不改 normalizer、不建新 IPC、不动 journal 格式。

| 文件 | 最小职责 |
| --- | --- |
| `packages/backend/src/service.ts` | 在现有 runtimeGateway.onEvent 消费归一化 tool/end、turn/end、run/end；从 projection 解析 checkout 交给调度器；经现有 listeners 发临时 invalidation envelope；checkout RPC 成功也失效同 checkout。 |
| `packages/backend/src/workspace/workspace-invalidation.ts`（新增） | 仅管理 checkout→session 关联、共享 debounce、终止 flush 与清理；不解析命令、不读 Git、不建设持久化事件系统。 |
| `apps/desktop/src/entities/session/use-session-changes.ts` | 订阅临时通知；仅当前 enabled session 响应；合并 focus/可见性/重连；实现单个请求执行与 dirty 补读，后台刷新保留旧快照；保持现有首次加载门槛。 |
| `packages/backend/src/service.test.ts`、新增调度器测试、`apps/desktop/src/entities/session/use-session-changes.test.ts` | 先写真实行为回归：A 改共享 checkout、B 正在显示；密集/失败工具与终止边界合并；慢请求期间失效最终读到新值；切 session/禁用/卸载不误写；Chat 不查 Git；重连补读。用假时钟和 Promise gate，不用真实 sleep。 |
| `apps/desktop/src/pages/agent-workspace.tsx`（按需要） | 仅在展示 refreshing 状态或传入就绪/连接信息确有需要时改；不把 workspace dirty 接到 projection.stale。 |

建议把通知 payload 形状定义在已有共享协议位置（例如 `packages/core/src/runtime-gateway.ts`），不必修改 AgentRuntimeEvent union 或 runtime-gateway-client；hook 可像现有 session-projections provider 一样使用 shared onBackendEvent。读取并发若要跨多个消费者去重，可放 service 的请求入口，但不能仅按 checkout 缓存不同 diffRoot 的完整响应。

若协调者只想先验证“当前 session 工具后刷新”的效果，可将首个 PR 缩到 hook 及其测试，直接消费现有 envelope；跨 session 覆盖必须明确留待后续，不能宣称已完成本方案。

第二期再新增真实 Git 路径解析、watcher 建立/重建/释放和 worktree/packed-refs 行为测试。实现后的验证应包含目标测试、项目规定的 typecheck/test/build，并用 dev-server 截图确认分支、badge、diff 在后台刷新期间稳定；本报告不代表这些尚未实施的行为已通过验证。
