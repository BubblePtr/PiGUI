# Session Fork/Resume — Issues

设计决议见 [ADR-0021](../../docs/adr/0021-session-fork-resume-persistence-layering.md)，术语见根目录 `CONTEXT.md`（Resume / Fork / Session Import 词条）。设计讨论定案于 2026-07-03。

---

## 01 — Checkout 策略改为用户显式选择

Status: ready-for-agent
Blocked by: None

废除"Project 已有 active session 即自动走 managed worktree"的隐式决定（`agent-workspace.tsx` 中 `shouldCreateBackgroundSession`）。Session Draft composer 增加 LOCAL / WORKTREE dropdown，默认值可以智能推荐但必须用户可改。fork 入口不受此影响——它是唯一强制 worktree 的入口（ADR-0021）。

## 02 — Idle runtime 内存实测

Status: ready-for-agent
Blocked by: None

验证"全存活 + 懒创建"策略的成本假设：脚本化打开 20–50 个历史 Session，测量每个 idle AgentSession 实例的增量 RSS。结论写回本文件；若单实例成本超预期（>20MB 量级），把驱逐策略从 v2 提前。

## 03 — Session Projection 持久化 + piSessionId→文件路径映射

Status: needs-triage
Blocked by: None

冷恢复与 sidebar 列表的共同前置。Projection 持久化到 `~/.pigui`（journal 旁边）；创建/恢复 session 时从 `sessionManager.getSessionFile()` 采集 Pi jsonl 路径存入 projection，`SessionManager.listAll()` 兜底修复。Sidebar 历史列表只读持久化 projection，不扫 `~/.pi`。

## 04 — `resume_session`（冷恢复，SDK-only）

Status: needs-triage
Blocked by: 03

Gateway 新命令：`SessionManager.open(path)` 注入 `createAgentSession`；UI 侧"打开 Session"透明触发（热 attach 不可用时走冷恢复）。UI 时间线走 journal replay（已有），对话上下文由 Pi 自行重建。RPC driver 记 capability 缺口。

## 05 — Identity 桥：user message 边界采集 Pi entry id

Status: needs-triage
Blocked by: None

user message 边界事件产生时，adapter 进程内读 `sessionManager.getLeafId()`，把 Pi entry id 盖进 journal payload。这是 fork 点定位的正路；老 journal 缺字段降级为 `getUserMessagesForForking()` 序号+文本匹配（Steer 会造成序号错位，含糊必须报错不许猜）。

## 06 — `fork_session`（SDK-only）

Status: needs-triage
Blocked by: 03, 05

Gateway 新命令：从时间线 user message 分叉出新 PiGUI Session。Pi 侧 `createBranchedSession`；journal 复制截断（重写 piSessionId、确定性重铸 identity）+ fork 分隔标记；被选 user message 原文预填新 composer；Git Project 强制新 managed worktree。

## 07 — Session Import（占位）

Status: needs-info
Blocked by: None

把 Pi CLI/TUI session 显式导入 PiGUI。v1 只确定入口位置与词条边界，不实现。待决：导入时间线的保真度方案（低保真合成 vs 只可续聊不展示历史）。
