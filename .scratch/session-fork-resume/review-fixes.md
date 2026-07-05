# Fork/Resume 实现 — Review 修复指令

Status: done
Blocked by: None

来源：对工作区未提交实现（issues 01–06）的多角度 code review（2026-07-04）。8 条 finding 全部经独立 verifier 三态核实为 CONFIRMED。按严重度排序，**F1 不修不能合并**。修完后跑全量测试，并对 F1 用真实 SDK opt-in 冒烟验证一次 fork 全链路。

修复记录（2026-07-04）：F1–F8 已处理。F1 的真实 SDK 结果证明 user `message_end` listener 内立即读 leaf 仍会拿到旧 entry，因此最终采集点改为 user `message_end` 后一个 microtask，再用 `SessionManager.getEntry()` 验证/回溯到最近 user message entry。真实 opt-in smoke 已完成：两条 prompt 后 fork 第二条成功，`selectedTextMatchesSecondPrompt=true`。

---

## F1（P0）piEntryId 采集时序错误 — fork 锚点系统性错位

`packages/backend/src/pi-sdk-driver.ts:236-251`

**缺陷**：`sendPrompt` 用 floating promise 发出 prompt 后**同步**调 `runtime.getLeafId()`。真实 SDK 里 user entry 要等 agent 事件流的 `message_end` 才被 `sessionManager.appendMessage()` 写入并推进 leaf（`agent-session.js:283-287` → `session-manager.js:668-671`），所以同步读永远拿到**上一个** entry（首条 prompt 为 null）。stamp 进 journal 的 `piEntryId` 指向前一条 assistant entry，fork 时 `forkEntryDetail` 抛 "Invalid entry ID for forking" 或锚点错位。

**掩盖机制**：`pi-sdk-driver.test.ts:205-211` 的 mock 在 Promise executor 里同步改 leafId——executor 构造时同步执行，真实 SDK 从不保证这一点。

**修复方向**：把采集点移到"Pi 已 append user entry 之后"。推荐：在 adapter 的事件订阅里，收到 role=user 的 `message_end`（或 agent-core 对应边界事件）时读 `sessionManager.getLeafId()`，把 piEntryId 关联到该 user message 边界，再经 normalizer/gateway 盖进 Gateway-minted user message payload。禁止在 driver 发 prompt 的同一 tick 读 leaf。

**验收**：
- mock 必须复现真实时序：leafId 只在事件回调阶段推进（不允许 executor 同步赋值），旧写法的测试要能红。
- 新增契约测试：连续两条 prompt，断言各自 journal user message 的 piEntryId 指向正确的 user entry（非前一条 assistant）。
- opt-in 真实 SDK 冒烟：发两条 prompt → fork 第二条 → 成功且分叉点正确。

## F2（P0）projection 快照覆盖写冲掉 initialPrompt

`packages/backend/src/runtime-gateway.ts:321`（get_runtime_snapshot）、`:227-229`（resume_session）

**缺陷**：`projectionFromRuntimeSnapshot`（`session-projection-store.ts:69-84`）不含 `initialPrompt` 字段，而两个 store 的 `save()` 都是整记录替换。`send_prompt` 落盘的标题会被随后任意一次 snapshot 读取或冷恢复冲成 undefined → sidebar 显示 "Untitled Session"。`fork_session` 在 L267 显式回注了 initialPrompt，证明另两条路径是遗漏。

**修复方向**：在 gateway 层 save 前先读旧记录 merge（保留 initialPrompt 及其他快照不产出的字段），或给 store 增加 patch/merge 语义并让三条路径统一走它。不要在每个调用点各自记得回注——那就是第三处会忘的地方。

**验收**：测试：create → send_prompt（标题落盘）→ get_runtime_snapshot → list，断言标题仍在；resume 路径同样断言。

## F3（P0）坏 projection 触发永久 ~/.pi 全扫 + 静默死端

`packages/backend/src/service.ts:216-225`；`apps/desktop/src/pages/agent-workspace.tsx:1956-1963`

**缺陷**（三合一）：
1. 一个 `sessionFile` 缺失且不可修复的 projection（Pi jsonl 被删/移）使 `projections.every(p => p.sessionFile)` 永久失败 → **每次** `list_session_projections` 都调 `piSessionListAll()` 全文解析整个 `~/.pi`（ADR-0021 点名拒绝的启动成本）。
2. 修复后 `Promise.all(repaired.map(save))` 无条件重写**全部** projection 文件，包括未变化的。
3. renderer 对无 sessionFile 的行静默 early-return：用户点开是空聊天、无报错、无法恢复。

**修复方向**：
- 修复失败的 projection 打持久标记（如 `sessionFileMissing: true`），下次列表不再触发 listAll；或 listAll 结果按进程内 memoize。
- 只 save `sessionFile` 实际变化的记录（对象恒等或字段比较过滤）。
- renderer 对不可恢复行显示明确状态（只读/历史缺失提示），不许静默空白。

**验收**：测试：含一条不可修复 projection 时，第二次 list 不再调 listAll（spy 断言）；save 只发生在变更记录上；UI 层对无 sessionFile 行渲染可见的不可恢复提示。

## F4（P1）fork 失败泄漏半成品

`packages/backend/src/runtime-gateway.ts:233-274`、`copyJournalForFork :342-380`

**缺陷**：执行顺序是 `driver.forkSession`（创建分支 jsonl + 注册存活 runtime）→ 边扫边把源事件 append 进目标 journal → 扫完才发现 fork 点不存在并抛错。全程无 try/catch，孤儿分支文件、孤儿 runtime、半写 journal 无人清理。

**修复方向**：把 fork 点定位改为**纯读前置检查**——先在源 journal 里找到 fork 点（找不到立即抛，零副作用），确认存在后再依次执行 driver fork 与 journal 复制。这同时是 F1 降级路径（旧 journal 无 piEntryId）的正确失败方式。

**验收**：测试：对不含目标 piEntryId 的源 journal 执行 fork_session → 抛错且 driver.forkSession 未被调用、目标 journal 为空。

## F5（P1）冷恢复失败永不重试

`apps/desktop/src/pages/agent-workspace.tsx:1971-1977, 2004-2016`

**缺陷**：`resumeAttemptedKeysRef.current.add(resumeKey)` 在 await 之前执行，catch 里只标 stale 不删 key；同一会话再次选中被 L1973 守卫拦截，组件生命周期内永不重试；stale 横幅无重试入口。

**修复方向**：失败时从 ref 删除 key（保留 in-flight 防重入可改存 promise）；stale 横幅加"重试"动作触发再次 resume。

**验收**：测试：首次 resume reject → 再次选中同一会话 → resumeSession 被第二次调用。

## F6（P1）终态与归档状态在持久化层丢失

`apps/desktop/src/pages/agent-workspace.tsx:1109`；`packages/backend/src/pi-sdk-runtime-adapter.ts:205-219`；`packages/backend/src/session-projection-store.ts:12`

**缺陷**：(a) driver 的 `promptCompleted`/`stopped` 是进程内标志，冷恢复后新 runtime 快照 status=idle，落盘后 renderer 把 idle 映射为 waiting——已完成会话重启后显示为 waiting。(b) `PersistedSessionProjection.status` 类型不含 archived，`archivedAt` 从不落盘——归档会话重启后全部还阳（新持久化功能的缺口，非回归）。

**修复方向**：持久化终态：projection 里已有的终态（completed/failed）不被 idle 快照降级覆盖（与 F2 的 merge 语义合并处理）；archived/archivedAt 纳入 PersistedSessionProjection 并在归档事件时落盘。

**验收**：测试：completed 会话冷恢复 + 重启后列表仍为完成态；归档会话重启后仍归档。

## F7（P2）journal 复制的 identity 重铸是全字符串盲替换

`packages/backend/src/runtime-gateway.ts:418-447`

**缺陷**：`rewritePiSessionIdentity` 对 payload 所有字符串值做 `split(sourceId).join(targetId)`，不限定 id 字段。消息正文/工具输出里含源 piSessionId 子串（如出现过 session 文件路径）会被改写，journal 失真。它也是绕开 normalizer 的平行重铸器，会随 ADR-0020 id 规则漂移。

**修复方向**：重铸限定 id 字段白名单（`piSessionId`/`runId`/`turnId`/`messageId`/`partId`/payload 内嵌 id 字段），正文类字段（`body`、parts 文本、工具输出）原样保留；并把复制截断+重铸逻辑从 gateway 内联函数下沉到 session-event-journal 模块（altitude 修正，顺带解决 gateway 泄漏 envelope 内部结构的问题）。

**验收**：测试：源会话某条消息正文包含源 piSessionId 字符串 → fork 后正文原样、id 字段已重写。

## F8（P2）send_prompt 热路径 O(N) 全店扫描

`packages/backend/src/runtime-gateway.ts:276-280, 449-465`；`packages/backend/src/session-projection-store.ts:117-141`

**缺陷**：`setProjectionInitialPrompt` 每次 send_prompt 先 `store.list()`（readdir + 逐文件 readFile + parse 全部 projection）再线性找 piSessionId，且 initialPrompt 已设置时照扫不误。

**修复方向**：利用 gateway 已有的 `sessionIdsByPiSessionId` map（L112）+ store 增加按 sessionId 的 keyed `get()`（文件名即 `encodeURIComponent(sessionId).json`，O(1) 读）；initialPrompt 已知已设置后短路。顺带给 file store 补内存缓存——`list()` 是 send_prompt 与 F3 修复路径共享的底座。

**验收**：测试：第二次 send_prompt 不再触发全目录读（spy readdir/list 调用次数）。

---

## 顺手清理（不阻塞，同 PR 可带）

- `apps/desktop/src/entities/runtime/runtime-gateway-client.ts:636/849/885`：`startRuntime`/`resumeSession`/`forkSession` 三份几乎相同的 runtime 注册块（后两份逐字节相同），提取 `registerRuntime()` 私有 helper（注意保留 resume/fork 的 `if (input.checkout)` 守卫差异）。
- `apps/desktop/src/pages/agent-workspace.tsx:2484-2486`：`executionMode: input.executionMode ?? (shouldRecommendManagedCheckout ? …)` 的 `??` 右侧是死分支（唯一调用方总是提供 executionMode），删除回退，`shouldRecommendManagedCheckout` 本身仍被 recommendedCheckoutMode 使用、保留。
- `copyJournalForFork` 复制事件时 `ts` 被 `nextEvent` 盖成 fork 时刻（`packages/core/src/runtime-gateway.ts:82-94`）。当前 UI 不渲染 per-event ts，无可见影响，但做 F7 下沉时顺带保留源 `ts`，免得未来 UI 渲染时间时踩雷。
- 三处重复的 session-id 生成器（`agent-workspace.tsx:1179` 复制了 `session-creation.ts:69` 的 `defaultIdFactory`）与两处重复的 encodeURIComponent 文件名安全逻辑（`session-projection-store.ts:47` vs `session-event-journal.ts:53`）：各收敛到一处导出。

## 明确不用修（review 已排除的误报）

- `createBranchedSession` 就地切换 sessionManager 的假设**成立**（上游 `session-manager.js:1037-1054` 就地改 `sessionFile` 并 rebuild index，Pi 自己的 fork 用同一模式）。
- fork 预填文本（selectedText）冷重启不丢——Follow-up Draft 持久化在 localStorage（`pigui.followUpDrafts.v1`）。
