# Session Fork/Resume — Issues

设计决议见 [ADR-0021](../../docs/adr/0021-session-fork-resume-persistence-layering.md)，术语见根目录 `CONTEXT.md`（Resume / Fork / Session Creation Boundary 词条）。设计讨论定案于 2026-07-03。

---

## 01 — Checkout 策略改为用户显式选择

Status: done
Blocked by: None

废除"Project 已有 active session 即自动走 managed worktree"的隐式决定（`agent-workspace.tsx` 中 `shouldCreateBackgroundSession`）。Session Draft composer 增加 LOCAL / WORKTREE dropdown，默认值可以智能推荐但必须用户可改。fork 入口不受此影响——它是唯一强制 worktree 的入口（ADR-0021）。

## 02 — Idle runtime 内存实测

Status: done
Blocked by: None

验证"全存活 + 懒创建"策略的成本假设：脚本化打开 20–50 个历史 Session，测量每个 idle AgentSession 实例的增量 RSS。结论写回本文件；若单实例成本超预期（>20MB 量级），把驱逐策略从 v2 提前。

结论（2026-07-03，本机实测）：保留"全存活 + 懒创建"，驱逐策略不提前。复跑命令：

```bash
PIGUI_IDLE_MEMORY_SAMPLE_SIZE=20 PIGUI_IDLE_MEMORY_MIN_SAMPLES=20 bun --filter @pigui/backend measure:idle-memory
```

测量脚本先预热 1 个 `AgentSession`，避免把 Pi SDK / tool / model registry 的进程级初始化算成单实例成本；随后打开 20 个历史 session 并保持全部 idle 实例存活到测量结束。结果：baseline RSS 317.36 MB，final RSS 393.61 MB，总增量 76.25 MB，平均 3.81 MB/session，最大单步 9.91 MB，低于 20 MB 阈值，`shouldAdvanceEviction=false`。

## 03 — Session Projection 持久化 + piSessionId→文件路径映射

Status: done
Blocked by: None

冷恢复与 sidebar 列表的共同前置。Projection 持久化到 `~/.pigui`（journal 旁边）；创建/恢复 session 时从 `sessionManager.getSessionFile()` 采集 Pi jsonl 路径存入 projection，`SessionManager.listAll()` 兜底修复。Sidebar 历史列表只读持久化 projection，不扫 `~/.pi`。

实现（2026-07-03）：新增 Session Projection store（file + in-memory），Runtime Gateway 在 `create_session` / `get_runtime_snapshot` / `resume_session` 同步 projection；backend `list_session_projections` 从 projection store 读取并用 `SessionManager.listAll()` 修复缺失 `sessionFile`；Electron sidebar 只读 projection 列表，不再通过 `list_sessions` 扫旧 trace。

## 04 — `resume_session`（冷恢复，SDK-only）

Status: done
Blocked by: 03

Gateway 新命令：`SessionManager.open(path)` 注入 `createAgentSession`；UI 侧"打开 Session"透明触发（热 attach 不可用时走冷恢复）。UI 时间线走 journal replay（已有），对话上下文由 Pi 自行重建。RPC driver 记 capability 缺口。

实现（2026-07-03）：Runtime Gateway 增加 `resume_session`；SDK driver 通过 `runtimeResumer` 注入 `SessionManager.open(sessionFile)` + `createAgentSession({ sessionManager })`；renderer bridge 增加 `resumeSession()`；Session 页打开带 `sessionFile` 的 persisted projection 时自动冷恢复，并用 journal snapshot 执行 `runtime-state-resynced`。

## 05 — Identity 桥：user message 边界采集 Pi entry id

Status: done
Blocked by: None

user message 边界事件产生时，adapter 进程内读 `sessionManager.getLeafId()`，把 Pi entry id 盖进 journal payload。这是 fork 点定位的正路；老 journal 缺字段降级为 `getUserMessagesForForking()` 序号+文本匹配（Steer 会造成序号错位，含糊必须报错不许猜）。

实现（2026-07-04 修正）：Public SDK adapter 在 raw SDK user `message_end` 后等待一个 microtask，再通过 `SessionManager.getLeafId()` / `getEntry()` 验证并回溯到最近 user message entry；SDK driver 等待该 user boundary 后把正确 `piEntryId` 写入 Gateway-minted user message payload。真实 SDK opt-in smoke 已验证：连续两条 prompt 后 fork 第二条成功。

## 06 — `fork_session`（SDK-only）

Status: done
Blocked by: 03, 05

Gateway 新命令：从时间线 user message 分叉出新 PiGUI Session。Pi 侧 `createBranchedSession`；journal 复制截断（重写 piSessionId、确定性重铸 identity）+ fork 分隔标记；被选 user message 原文预填新 composer；Git Project 强制新 managed worktree。

实现（2026-07-03）：确认当前 `@earendil-works/pi-coding-agent@0.80.2` 的 `SessionManager.createBranchedSession(leafId)` / `SessionManager.create()` 能覆盖 SDK fork 命令面。Runtime Gateway 增加 `fork_session`，SDK driver 注入 `runtimeForker`，RPC driver 保持 unsupported stub；fork 时复制源 Session Event Journal 到被选 user message 前，重写新 `piSessionId` identity 并插入 fork marker，保存新 Session Projection。renderer bridge 暴露 `forkSession()`，Live Chat 在带 `piEntryId` 的 user message 上显示 fork 入口；Git Project fork 强制准备 managed worktree，并把被选 user message 原文写入新 Session 的 Follow-up Draft composer。

## 07 — Session Import

Status: wontfix
Blocked by: None

决议（2026-07-04）：不支持把 PiGUI 之外产生的 Pi CLI/TUI session 导入 PiGUI。PiGUI 的 Session 列表只展示从 PiGUI 中创建的 Session；外部 Pi session 不自动扫描、不手动导入、不补建 Session Projection。需要继续外部工作时，用户在目标 Project 内新建 PiGUI Session，边界与 Codex 的本地 thread 体验保持一致。
