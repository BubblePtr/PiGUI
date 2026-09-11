# PR #273 独立审查（Grok）

- 对象：https://github.com/BubblePtr/pace/pull/273，分支 `feat/workspace-invalidation-phase-1`（HEAD `74a4f9f`，相对 `origin/main` 两提交）
- Spec：Issue #272、`docs/adr/0038-workspace-invalidation-signals.md` 决策 1–9
- 范围：只读。未改代码、未提交、未复用实现者判断；未重跑 `bun run test` / 截图（以 diff 与源码对照为准）

## 结论：可合并

第一期因果提示层 + 兜底层按 ADR 落地：失效按 checkout 分发给兄弟 session，Chat 不建关联、页面不查 Git，`projection.stale` 未复用，没有新 IPC / 轮询 / fs.watch / 用户 Pi 配置写入，hook 单请求 + dirty 补读且后台刷新保留旧快照。协调者点名的三处（`path.resolve` vs `realpath`、checkout 的 `source: "tool"`、envelope 占位 `sessionId`/`piSessionId`）经独立核对均不构成当前用户可见回归，不列为必改。

无必改项。下文可选硬化不阻塞合并。

## Spec 对照表

### ADR-0038 决策 1–9

| # | 决策 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 失效信号与真值读取分离；通知生产者不预读、不缓存；真值仍走 `get_session_changes` | **满足** | 调度器只 `emit` payload（`packages/backend/src/workspace/workspace-invalidation.ts:24-32`）。service 测试断言 `read` 未被调用（`packages/backend/src/service.test.ts:1751-1770`）。渲染层仍 `loadChanges(readSessionId)`（`apps/desktop/src/entities/session/use-session-changes.ts:76`）。 |
| 2 | 信号只来自 Pace 边界；不写用户 Pi 配置 / `~/.pi` / extension | **满足** | diff 只触及 service、新调度器、core payload、`useSessionChanges`、agent-workspace 链接等待。无 `fs.watch`、无对 agentDir 的新写入。 |
| 3 | 三层中本期只要因果 + 兜底；`source` 为 tool/git-watch/focus/reconnect；不做轮询 | **满足** | 后端：tool end invalidate、turn/run end 与 stop flush（`service.ts:227-231`、`324-327`）。渲染：focus / visibilitychange / `lifecycle === "connected"`（`use-session-changes.ts:108-129`）。无 `setInterval`、无 git-watch 实现。类型预留 `git-watch`（`packages/core/src/runtime-gateway.ts:22-26`），符合第二期，本期不发射。 |
| 4 | 按规范化 checkout 分发，不按单个 session；UI checkout 成功也通知兄弟；读取结果不跨 session 复用 | **部分** | 关联键是 `path.resolve(root)`（`workspace-invalidation.ts:42-46`）；同键 session 一起出现在 `sessionIds`（同文件 `27-30`；测试 `workspace-invalidation.test.ts:40-53`、`service.test.ts:1740-1769`）。Chat / 其他 checkout 被排除。UI `checkout_session_branch` 成功 `invalidate`+`flush`（`service.ts:365-375`），测试期望 `[["a","b"]]`（`service.test.ts:1718-1719`）。**缺口**：`resolve` 不跟随 symlink，见下方独立判断。产品路径上兄弟 session 写入同一 projection 字符串时仍能会合。 |
| 5 | 后端 trailing debounce + 最大等待，终止 flush；渲染单请求 + dirty 补读；后台刷新保留旧快照；切 session 不沿用 | **满足** | 500ms trailing / 2000ms deadline（`workspace-invalidation.ts:54-57`），假时钟测试（`workspace-invalidation.test.ts:6-20`）。`inFlight`/`dirty`/`generation`（`use-session-changes.ts:16-22, 60-102`）。`changes: previous?.scope === scope ? previous.changes : null`（`:71`）；`loading`/`refreshing` 分离（`:143-144`）。切 session / disable / unmount 测试（`use-session-changes.test.ts:58-85`）；慢读 dirty 无并发（同文件 `:122-141`）。 |
| 6 | 不复用 `projection.stale`；工具结束不得写成 projection stale | **满足** | 工作树状态是 hook 的 `refreshing`。Changes 面板仍把 `projection?.stale` 传给 runtime 文案（`agent-workspace.tsx:2549`），语义未混用。diff 未写 `projection-marked-stale`。 |
| 7 | 复用临时 envelope（`type: event`, `seq: 0`），不新建 IPC；不进 journal、不改 `AgentRuntimeEvent` | **满足** | `service.ts:142-152` 与 terminal 先例同形（`:240-256`）。Electron 守卫只认外层 `type === "event"`（`apps/desktop/electron/main.ts:793-799`、转发 `:220-221`）。journal 断言无 `workspace.invalidated`（`service.test.ts:1771-1773`）。core 只新增 `WorkspaceInvalidatedPayload`，未改 `AgentRuntimeEvent` union。无新 `ipcMain` 通道。 |
| 8 | Git 元数据监听路径由 `git rev-parse --git-path` 解析 | **不适用（第二期）** | 本期无 watcher。 |
| 9 | 第一期只覆盖 `useSessionChanges` 消费者；Files 另算 | **满足** | Files 面板未接失效。页面启用条件仍是绑定 runtime、非 draft、非 Chat（`agent-workspace.tsx:4059-4065`）。额外把文件链接解析改成等待 `loading \|\| refreshing`（`:4075`），是保留旧快照后的必要后果，不是 Files 失效。 |

### Issue #272 验收 checklist

| 验收项 | 判定 | 证据 |
| --- | --- | --- |
| session A 改共享 checkout，正在显示的 B 刷新 | **满足**（分层） | 后端 fan-out `sessionIds: ["a","b"]`（`service.test.ts:1767-1769`）。hook 仅当 `payload.sessionIds.includes(sessionId)` 才读（`use-session-changes.ts:121-123`；测试 `:100-103`）。没有单测把「A 的 tool envelope → 已挂载的 B hook」串起来，但两层契约对齐。 |
| 密集工具、失败工具、turn/run 终止合并为有限次读取（假时钟） | **满足** | 连续 invalidate 被 deadline 收成 1 次，flush 再 1 次（`workspace-invalidation.test.ts:6-20`）。`isError: true` 的 tool 仍提示；chat/other 不进名单；turn/run 触发 flush（`service.test.ts:1759-1769`）。 |
| 慢请求中收到失效，最终新值且无并发（Promise gate） | **满足** | `use-session-changes.test.ts:122-141`：刷新中两次 `refresh` 不增加并发；gate 释放后才第三次读并换新快照。 |
| 切 session / 禁用 / 卸载不误写旧快照 | **满足** | `use-session-changes.test.ts:58-85`。 |
| Chat workspace 不查 Git | **满足** | 后端 `projectId !== CHAT_PROJECT_ID` 才 associate（`service.ts:159-163`）；chat 的 tool end 不出现在 `sessionIds`（`service.test.ts:1743-1769`）。页面 `enabled: … && !isChatProjectId(projectId)`（`agent-workspace.tsx:4061-4064`）。hook 测的是 `enabled: false` 而非 Chat 路由（`use-session-changes.test.ts:87-119`），生产门闩仍在。 |
| 后端重连后补读当前可见 session | **满足** | `lifecycle === "connected"` 走同一 `invalidate()`；`visibilityState === "hidden"` 时丢弃（`use-session-changes.ts:109-126`）。与「当前可见」一致：后台重连靠 focus/visibility 兜底。 |
| 后台刷新期间 chip / badge / 已打开 diff 不闪烁 | **满足**（代码） | `refreshing` 时保留 `changes`，`loading` 为 false（`use-session-changes.ts:143-144`）。PR 描述的三张 PNG SHA 相同；本次未打开图片复核。 |
| typecheck / test / build | **未独立复跑** | PR 正文声称通过。审查不把 CI 声明当自己的证据。 |

## 协调者点名三项（独立判断）

### 1. `path.resolve` vs Changes 读取时的 `realpath`

会。`path.resolve` 只做词法绝对化（`.` / `..` / 多余斜杠），不跟随 symlink。`SessionChangesReader` 读 Git 时用 `realpath`（`packages/backend/src/workspace/session-changes.ts:325-326`）。若两个 projection 把同一 inode 写成不同字符串（例如 macOS `/tmp/repo` vs git toplevel `/private/tmp/repo`），`associate` 会当成两个 checkout，兄弟 session 不会一起失效。

本期不阻塞的原因：foreground-local 兄弟 session 从同一 Project Registry 路径写入，managed worktree 则每 session 独立根。测试覆盖的是 `"/repo/child/.."` → `"/repo"`（`workspace-invalidation.test.ts:40-53`），说明作者有意做词法规范化。`realpath` 是异步且路径不存在会抛，不适合当前同步 `associate`。

建议（可选，可放到第二期 watcher 之前）：路径存在则 `realpathSync`，否则回退 `resolve`；用 symlink fixture 锁行为。

### 2. `checkout_session_branch` 成功后 `source: "tool"`

调度器 `flushCheckout` 写死 `source: "tool"`（`workspace-invalidation.ts:31`），checkout 与 tool end 无法区分。ADR 的 source 枚举是 `tool | git-watch | focus | reconnect`，没有命令/UI 取值；渲染层完全不读 `source`（`use-session-changes.ts:118-126`）。

「tool」不精确，但用户不可见，也没有更贴切的现有枚举。扩展 union 是规格增补，不是本期缺陷。保持 `tool` 表示因果层即可。

### 3. envelope `sessionId: payload.sessionIds[0] ?? ""`、`piSessionId: ""`

Electron main **不会**拦：守卫只检查外层 `type === "event"`（`main.ts:793-799`）。

其它订阅者当前也不会当作用户可见的 runtime 更新：

| 订阅者 | 行为 |
| --- | --- |
| `use-session-changes.ts:118-126` | 认 `workspace.invalidated` + `sessionIds.includes` |
| `use-session-projections.tsx:128-141` | 只处理 `session_info_changed` 与 `sessionId === "__backend__"` |
| `terminal-client.ts:104-118` | 无 `terminalId` 则返回 |
| `pi-rpc-runtime-bridge.ts:275-281` | `piSessionId === ""` 为 falsy，直接 return。若改成真实 Pi id，normalize 虽对未知 type 返回 null，仍少一层保险 |
| `runtime-gateway-client.ts:346-355, 72-102, 643-662` | payload 无 `origin`，落入 `runtimeEventFromEnvelope`；未知 `envelope.type` 默认 `kind: "message"`，记在 `piSessionId === ""` 的 seen 集合。`states.get("")` 无状态、无 listener，**不改真实 session 的 projection** |

空 `piSessionId` 在现有代码里是防御，不是漏洞：填 `sessionIds[0]` 对应的真实 Pi id 反而更危险。与 ADR「不改 runtime projection」字面相符，靠的是空键死信，不是显式过滤。

建议（可选）：gateway client 对 `event.event.type === "workspace.invalidated"`（以及 terminal 同类临时 envelope）直接 return，不要映射成 message。

## Standards 问题清单

### 低：潜在误映射，不是当前回归

`runtime-gateway-client` 把非 AgentRuntime payload 一律收成 `kind: "message"`（`runtime-gateway-client.ts:102, 141-197`）。`workspace.invalidated` 因此进入 `seenEventIds.get("")`。违反「测试保护行为」的精神：没有任何测试锁住「该 envelope 不得进入 Pi runtime 时间线」。建议在 client 显式忽略，并加一条断言 `states` / listener 不被碰到。

### 低：`FullChatComposer` 本地回退未排除 Chat

`agent-workspace.tsx:670-673`：无 `providedSessionChanges` 时，只要有 `piSessionId` 就 `enabled`。生产页面总会传入 page-level hook（Chat 上该 hook 为 disabled 对象，本地回退关闭）。孤立渲染 composer 的测试或未来调用点可能对 Chat 发 `get_session_changes`。建议本地 `enabled` 同样 `&& !isChatProjectId(projection.projectId)`。

### 低：测试命名略宽于行为

`use-session-changes.test.ts:87` 写 “disabled Chat”，实际只传 `enabled: false`，没有 Chat `projectId`。后端 Chat 排除有独立测试，不构成验收缺口。

### 未发现问题（对照审查轴）

- 测试用假时钟与 Promise gate，无真实 `sleep`。
- 注释英文、先写 why（如 `workspace-invalidation.ts:56`、`service.ts:165-166`、`use-session-changes.ts:112`）。
- 无多余抽象：调度器按 ADR 文件职责；`ReadScope` 是 generation/dirty 令牌，不是投机 API。
- timer / listener：hook 卸载移除 window/document 与 `onBackendEvent`（`use-session-changes.ts:130-137`）；checkout 引用归零时 `cancel`（`workspace-invalidation.ts:35-38`）。`dispose` 仅测试调用，service 随 utilityProcess 生命周期，可接受。
- 无 Fowler 基线必须改的味道；`source` 含未用的 `git-watch` 来自 ADR 类型，不是投机枚举。

## 必改项

无。

## 可选项

1. **symlink checkout 键**（决策 4 的剩余）：存在则 `realpath`，用 symlink fixture 覆盖；更适合第二期 watcher 之前做，否则 inode 监听会再撞一次。
2. **gateway client 显式忽略 `workspace.invalidated`**：不要依赖 `piSessionId: ""` 死信。
3. **composer 本地回退排除 Chat**：与页面 `isChatProjectId` 对齐。
4. **checkout `source`**：若以后 UI 要展示来源，再扩展 union；现在不要为了字面精确改协议。
5. 文档：`CONTEXT.md` 没有 Changes / 失效词条（原先也没有）；`docs/design/workspace.md:59` 仍写「点击后刷新」未提等待 `refreshing`。都不阻塞。
