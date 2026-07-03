# Session Fork/Resume 与双轨持久化分层

冷恢复（Resume）与对话分叉（Fork）进入产品边界后，必须先定死两份已经存在的落盘数据的分工：SDK driver 创建 session 时未传 `sessionManager`，Pi 默认已把每个 PiGUI session 持久化为 `~/.pi` 下的树形 jsonl（上下文真相）；切片 6 又建立了 PiGUI 自己的 Session Event Journal（`~/.pigui`，呈现真相）。不定死分工，fork/resume/import/analyze 每个后续能力都会把"该读哪份"重新争论一遍。

## Decision

**双轨真相，不可互换**：

- **Pi jsonl = 上下文真相**。冷恢复时 LLM 上下文永远由 Pi 自己重建（`SessionManager.open` + `buildSessionContext`，compaction/branch summary 都在其中）；PiGUI 永不自行拼装 LLM 上下文。
- **Session Event Journal = 呈现真相**。UI 时间线、run/turn identity、surface 路由、控制事件（steer/queue/retry/abort）只来自 journal 回放。**不做 Pi jsonl → AgentRuntimeEvent 合成器**：run/turn 边界在 jsonl 中根本不存在，Steer 在 jsonl 里与普通 user message 不可区分——合成即猜测，违背 ADR-0020 的确定性 identity 原则。

**Resume 是 Gateway 能力，不是用户动词**。用户只有"打开 Session"；底层热 attach 或冷恢复对用户透明。runtime 采用**全存活 + 懒创建**：本次进程内创建/打开过的 AgentSession 活到 app 退出（idle 实例无定时器、无子进程、无长连接，纯内存成本），冷恢复只在进程重启后触发，保持为低频、必须绝对可靠的路径。驱逐策略推迟，driver 的 `dispose?()` 是预留接缝。

**Fork = 从 user message 边界产生新 PiGUI Session**（新 piSessionId、新 journal、新 Execution Checkout、列表新行、谱系指回源），Pi 侧走 `createBranchedSession` 路径提取 + `parentSession` header，与 Pi TUI 自己的 fork 实现严格同构；被选中 user message 原文预填新 composer。树内 `navigateTree`（非线性历史）排除出产品边界。

**Fork 只 fork 对话，不 fork 磁盘**。Pi 上游 fork 同样无任何磁盘语义；"按工具调用记录 undo diff"不可行（bash 不可逆、write 不记录被覆盖的旧内容）。Git Project 下 fork **强制**新建 managed worktree（防止落进源 Session 的残骸目录，顺带天然还原 pre-fork 磁盘）；非 Git 复用前台目录并警告。消息边界磁盘快照（checkpoint 式时间旅行）显式归 v2。

**Journal 复制截断**。fork 时把源 journal 从头到 fork 点复制进新 journal：重写 piSessionId、按事件顺序重放计数确定性重铸 runId/turnId/messageId；时间线在 fork 点插入分隔标记（视觉锚点 + 跳回源 Session 的导航）。否决"读时回溯 parent 链"：它把复杂度长在冷恢复这条必须傻瓜可靠的读路径上，且 fork 语义已确认新 Session 是独立个体，历史就该是自己的副本。

**Identity 桥（SDK-only）**。Pi 事件流（SDK 与 RPC 同构）不携带 jsonl entry id，fork 需要 PiGUI messageId → Pi entry id 的桥：user message 边界事件产生时 adapter 进程内读 `sessionManager.getLeafId()` 盖进 journal payload——识别在事实发生的那一刻落盘；老 journal 缺字段时降级为 `getUserMessagesForForking()` 序号+文本匹配，含糊必须响亮报错。`piSessionId → session 文件路径` 在创建/恢复时采集并持久化进 Session Projection，`SessionManager.listAll()` 兜底修复。

**`resume_session` / `fork_session` 为 SDK-only Gateway 命令；RPC driver 冻结**。RPC 与 SDK 事件面同构，但命令面隔进程摸不到 SessionManager（无法注入、无法读 leaf、无法提取分支），新能力只补 unsupported stub + 记 capability 缺口，不追赶。保留 RPC driver 的期权价值：跟随用户本机 pi CLI 版本、SDK 版本回归的逃生通道。正式删除需单独 ADR（推翻 ADR-0018 一部分）。

**Sidebar 历史列表只来自持久化的 Session Projection**。不扫 `~/.pi` 自动混入：外部 session 没有 journal/checkout/status，是幽灵行；与 Project Registry"手动添加、不自动发现"纪律一致；`listAll` 需全文解析所有 jsonl，启动性能不可接受。Pi CLI session 未来通过显式 **Session Import** 进入，导入时补建 projection；导入时间线的保真度问题留待 Import 设计时单独决定。

## Consequences

- `CONTEXT.md` 新增 Resume、Fork、Session Import 词条。
- 普通 Session 创建的 checkout 策略改为用户显式选择（LOCAL/WORKTREE dropdown），废除"Project 已有 active session 即自动 worktree"的隐式决定；fork 是唯一强制 worktree 的入口。
- 全存活策略需数据验证：批量打开历史 Session 的单实例内存实测。
- 待办与切片见 `.scratch/session-fork-resume/issues.md`。
