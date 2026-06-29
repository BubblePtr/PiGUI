# PRD: Pig 外壳迁移 — Tauri → Electron（可重定位后端）

Status: done
Feature: electron-shell-migration
Created: 2026-06-29
ADR: docs/adr/0013-electron-shell-and-relocatable-backend.md

> 定位：把 Pig 的桌面外壳从 Tauri 2 切到 Electron，并借此一步把后端定型为**传输无关、可重定位的服务**（utilityProcess 现在 / 远程 transport 远期）。承重理由是确定要内嵌浏览器做 DOM annotation——Agent GUI 标配，Tauri 2 多 webview 不成熟。这是一次**纯架构迁移**，对终端用户的可见功能应当**零行为变化**。

---

## Problem Statement

我（Pig 的开发者）需要在 Pig 里内嵌一个浏览器，做页面预览和 DOM 元素标注（annotation）——这是 Agent GUI 的事实标配（Codex、Claude Desktop、Cursor 都有）。但当前外壳是 Tauri 2，它的多 webview 仍是实验特性、对"嵌任意页面 + 注入标注层 + 检视 DOM"支持受限，这条确定要做的承重需求在 Tauri 上无法干净落地。继续在 Tauri 上叠加 Issue 7 之后的功能，等于往一个已判死刑的地基上浇水泥：每多写一个 Tauri 专有原语、每多一个 `invoke` 命令，未来迁移的账单就涨一点。而现在恰好是缝隙的历史最低点——前端对外壳仅有 6 个 `invoke` 命令、且已被 `invoke()` 与 `PiRpcTransport` 两个抽象完全解耦。

## Solution

把外壳换成 Electron，趁缝隙最小先迁移、再做其他功能。迁移后：

1. 终端用户**看不出任何区别**——会话列表、会话详情、用量、配置视图的行为与数据完全一致。
2. 后端（会话日志解析 + `pi` 子进程管理）搬进 Node `utilityProcess`，main 进程保持极薄（只管窗口与 IPC 路由）。Pi 崩了或解析卡了不冻结窗口——落地"仪表盘不该让发动机熄火"。
3. UI↔后端的全部流量收进**一条传输无关的 RPC 协议**：`{id, method, params} → {id, result/error}` 信封 + 单向 `event` 推流。今天用 MessagePort，远期换 WebSocket 时业务代码一行不改、只换 transport 实现。
4. 约 1802 行的 Rust 会话解析器重写为 TS（I/O 密集的 JSONL 解析 + 字符串启发式，Node 能力齐备）。产品未发布、无既有基准，**不与 Rust 输出逐字节对拍**——按 TDD 针对自有 fixture 写期望值即可。
5. 外壳从第一天立安全默认，为后续内嵌浏览器（敌意网页内容）打好隔离地基。
6. `src-tauri/` 在 TS 解析器测试转绿后整体删除。

## User Stories

1. As a Pi user, I want every existing Pig view (session list, session detail, usage, config) to behave and show data identically after the shell migration, so that the switch is invisible to me.
2. As a Pi user, I want Pig to keep reading my existing `~/.pi/agent` session logs with no reconfiguration, so that nothing about my setup changes.
3. As a Pi user, I want session titles, slash-command chips, skill chips, cost/token badges, and ordering to render exactly as before, so that I notice no regression.
4. As a Pi user, I want the live session view (steer/queue, run timeline, Pi events) to keep working after the migration, so that interactive sessions are unaffected.
5. As a Pi user, I want a Pi runtime crash to never freeze or kill the Pig window, so that the dashboard survives an engine failure.
6. As a Pi user, I want a slow or stuck session-log parse to never freeze the UI, so that the window stays responsive.
7. As a Pi developer, I want the desktop shell to be Electron, so that I can later embed a browser with page preview and DOM annotation — the load-bearing reason for the switch.
8. As a Pi developer, I want the session-log parser and `pi` subprocess management to live in a Node `utilityProcess`, so that the backend is isolated from the window and can later be relocated behind a remote transport.
9. As a Pi developer, I want the `main` process to stay thin (window lifecycle + IPC routing only), so that backend complexity never leaks into shell concerns.
10. As a Pi developer, I want all UI↔backend traffic (session-data queries, Pi control, Pi event stream) to flow through a single transport-agnostic RPC protocol, so that swapping MessagePort for WebSocket later touches only the transport implementation.
11. As a Pi developer, I want the unified protocol to use a request/response envelope (`{id, method, params}` → `{id, result/error}`) plus a one-way `event` push, so that both query-shaped and stream-shaped traffic share one channel and one serialization.
12. As a Pi developer, I want the frontend `invoke()` and `PiRpcTransport` abstractions kept as the UI-side seam, so that the renderer code is untouched and only the implementation behind them is replaced.
13. As a Pi developer, I want the browser-only fallback used in web/dev mode to keep working, so that UI development outside Electron stays possible.
14. As a Pi developer, I want the Rust session parser rewritten in TypeScript with behavior preserved, so that cost/token truth and titles remain correct without a Rust toolchain.
15. As a Pi developer, I want the TS parser to count characters by Unicode scalar (not UTF-16 code units), so that CJK/emoji titles truncate correctly at the same boundaries.
16. As a Pi developer, I want the TS parser tested against the existing `fixtures/pi-agent` golden inputs, so that I reuse the prior art rather than inventing new fixtures.
17. As a Pi developer, I want the migration done as a bounded, self-contained change before any new backend command lands, so that the seam stays at its historical minimum.
18. As a Pi developer, I want the Electron shell to ship secure defaults from day one (`contextIsolation: true`, `sandbox`, preload-exposed typed invoke, no `nodeIntegration` in the renderer), so that the later embedded browser has a safe foundation.
19. As a Pi developer, I want embedded web content (later feature) to be unable to reach the utilityProcess backend, so that hostile pages cannot drive Pi or read the filesystem.
20. As a Pi developer, I want the toolchain to be electron-vite reusing the existing Vite + React setup with Bun as package manager, so that build/HMR stays familiar.
21. As a Pi developer, I want `src-tauri/` removed only after the TS parser tests pass, so that I never delete the reference implementation before parity is demonstrated.
22. As a Pi developer, I want remote/VPS/auth/WebSocket explicitly out of scope for this migration, so that I only keep the seam open without paying the cost of crossing a network trust boundary now.
23. As a Pi developer, I want the `pi` subprocess to remain an isolated child process spoken to over stdio JSON-RPC (never embedded in-process via a TS SDK), so that the engine/dashboard decoupling principle is preserved.
24. As a Pi developer, I want the config inventory and execution-checkout backend logic ported alongside the parser, so that all current backend commands have a TS home.

## Implementation Decisions

- **外壳框架**：Tauri 2 → Electron。承重理由是内嵌浏览器 + DOM annotation（见 ADR-0013）。"Pi 是 TS SDK 更好集成"不作为理由——集成始终是 `spawn("pi")` + stdio JSON-RPC，宿主语言无关。
- **进程拓扑**：三进程。`main`（薄，窗口 + IPC 路由）；Node `utilityProcess`（后端：会话解析 + `pi` 子进程管理 + config/checkout）；renderer（现有 React UI，不动）。
- **统一 RPC 协议**：把现有两种形状——请求/响应式 `invoke`（`list_sessions` / `get_session_detail` / `get_config_inventory`）与流式 `PiRpcTransport`（`start` / `send` / `stop` + 事件）——合并为单一协议：
  - 请求/响应信封：`{ id, method, params } → { id, result } | { id, error }`
  - 单向事件推流：`{ type: "event", ... }`（承载 Pi 消息增量、工具调用、状态/队列变化、token/cost 增量、错误）
  - 所有 UI↔后端流量复用同一 message channel 与同一序列化。
- **Transport 抽象**：一个 transport 接口，两个实现——MessagePort 版（本次）、WebSocket 版（远期，不实现）。`PiRpcTransport` 演进为这个统一接口；前端 `invoke()` 改为走同一协议的请求/响应。
- **后端模块（TS 重写）**：`sessions`（JSONL 遍历 + 增量解析 + 标题启发式 + 用量/成本聚合）、`config`（配置清单）、`execution-checkout`、`pi-rpc`（`child_process.spawn("pi")` + readline，取代 285 行 Rust 传输，预期更短）。字符计数用 `Array.from(str).length` 或 `Intl.Segmenter`，不用 `.length`。
- **不计算定价**：解析器只对数据自带的 `usage` + 已算好的 `cost` 求和，不维护定价表——因此浮点累加差异为噪声级，无"静默算错金额"的风险源。
- **安全默认（外壳）**：`contextIsolation: true` + `sandbox` + preload 暴露 typed invoke + renderer 关闭 `nodeIntegration`。后端在 utilityProcess，被嵌入网页内容永远不可达。
- **工具链**：electron-vite（main/preload/renderer 三段拆分），沿用 Vite + React；Bun 作包管理器，Electron 主进程运行 Node（非 Bun）。
- **清理**：`src-tauri/` 在 TS 解析器测试全绿后整体删除（含 `Cargo.toml` 那条已过时的 "passive flight recorder" 描述）。
- **时机**：先于 Issue 7 之后任何新 backend 命令落地，作为独立有界的迁移。

## Testing Decisions

好的测试只验**外部行为**，不验实现细节：给定输入日志/协议消息，断言对外可见的输出（解析结果 JSON、RPC response、event 序列），不断言内部数据结构或调用次序。

- **主缝（最高、理想单缝）= 统一 RPC 协议处理器**。后端服务在 utilityProcess 之外也应可独立驱动：用**内存版 transport** 喂入请求信封、断言 response 信封；订阅 event 流、断言事件序列。Electron 不进测试。覆盖 `list_sessions` / `get_session_detail` / `get_config_inventory` 经协议往返，以及 Pi 控制命令 + 事件转发。
- **次缝（已有先例）= 解析器模块**。对 `src-tauri/fixtures/pi-agent` 的**同一批金标准输入**断言解析输出。现 Rust 测试（`src-tauri/src/sessions.rs` 的 `mod tests`，约 20 个 `#[test]`，以 `fixtures/pi-agent` 为输入）即直接先例——把这些用例语义翻译为 TS 测试。重点覆盖：标题分类（slash chip / skill chip / 自然语句首句 / trivial 原样）、Unicode 边界截断、用量/成本聚合、JSONL 行级容错、缺失/异常记录。
- **不做**：不与 Rust 输出逐字节对拍（产品未发布、无基准、不拿 Rust 当 oracle）；先写失败测试再实现（项目 TDD 纪律）。
- **前端**：`invoke()` / `PiRpcTransport` 是既有 UI 侧缝（已自带 browser fallback，见 `src/tauri-runtime.ts` / `src/pi-rpc-transport.ts`），迁移只换其背后实现，渲染层测试不变。

## Out of Scope

- 远程/VPS 部署、瘦客户端、WebSocket transport、鉴权、TLS、重连、多客户端会话归属——只**留缝不建**。
- 内嵌浏览器、页面预览、DOM annotation 功能本身——这是迁移**之后**的后续功能；本 PRD 只为它打外壳与安全地基。
- "向敌意页面注入标注脚本 vs 沙箱"的张力——留到该功能开发时单独决策。
- 任何对终端用户可见的功能/UI 变化、新视图、新数据——本次是纯架构迁移，行为零变化。
- 把后端真正搬到远程（涉及数据引力：`~/.pi/agent`、Execution Checkout worktree、Pi 进程都在用户本机，远程化是另一个产品形态）。

## Further Notes

- 这是对一个只活在团队记忆里、从未进 ADR 的 Tauri 选型的**正式反转**，已落 ADR-0013，并同步修正 AGENTS.md / README.md 中过时的 "passive flight recorder / does not launch or host Pi" 描述。
- 迁移性质是**机械且有界**：后端命令面仅 6 个、UI 完全解耦，主要工作是把 I/O 解析逻辑平移到 Node + 实现一个 Electron 版 transport/invoke + 一个 utilityProcess 引导。不是重写地狱。
- 建议的有依赖序拆分（供后续建 issue 参考，本 PRD 不创建）：①Electron 外壳脚手架（electron-vite + 安全默认 + 薄 main）→ ②统一 RPC 协议 + MessagePort transport（前端 `invoke`/`PiRpcTransport` 切到新实现）→ ③解析器 + config/checkout + pi-rpc 的 TS 移植（TDD，复用 fixtures）→ ④删除 `src-tauri/`。
- README 的 Status 段（"implementation not yet started / six issues"）属进度漂移、与本迁移无关，未在此处理。
