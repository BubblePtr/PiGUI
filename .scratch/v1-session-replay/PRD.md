# PRD: Pig V1 — Session Replay（会话飞行记录仪）

Status: done
Feature: v1-session-replay
Created: 2026-06-20

> 🗄️ 历史归档（更新于 2026-06-29）：本 PRD 写于 Tauri 外壳、被动飞行记录仪时期，记录的是**当时**的决策。外壳此后迁至 Electron（见 [ADR-0013](../../docs/adr/0013-electron-shell-and-relocatable-backend.md)），产品已演进为 Agent Workspace Control Plane（见 [ADR-0001](../../docs/adr/0001-agent-workspace-control-plane.md)）。当前架构真相以 [CONTEXT.md](../../CONTEXT.md) 与 `docs/adr/` 为准；下文 Tauri/Rust/被动观察者等描述按历史阅读。

> 定位：Pig 是 Pi Agent 的**被动飞行记录仪**。它不启动 Pi、不接管交互，只读取 `~/.pi/agent` 下的会话日志，把单次会话**复盘**成一条看得懂的时间线 + 一份成本/token 真相。让 Pi 在命令行之外不再是黑盒。

---

## Problem Statement

我（Pi 的日常使用者）在终端里用 Pi 编码。终端是一个**流式、易逝**的界面：thinking 一闪而过、完整的工具输入输出滚出屏幕、每一步烧了多少 token / 多少钱完全不可见、上下文窗口怎么一步步被填满更是无从感知。一次会话结束后，我想回答三个最朴素的问题——**这次烧了多少钱？贵在哪一步？Pi 当时到底在想什么？**——却没有任何工具能让我看清。Pi 的运行机制对我是个黑盒。

## Solution

一个桌面应用 Pig。我在终端照常用 Pi；跑完一段，切到 Pig，就能：

1. 在一个**全局最近会话列表**里，一眼认出"刚才那次"——看到它的时间、项目、标题、总花费和主模型。
2. 点进去，进入**会话详情**：顶部一个汇总头（总花费/总 token/主模型/回合数/时长），下面一条**标注式折叠时间线**——把终端藏起来的东西全摊开：完整 thinking（默认半展开）、完整工具 I/O（默认折叠、可下钻）、以及**每一步的成本/token 徽章**。

10 秒内回答出"烧了多少、贵在哪、它在想什么"——而这三件事在终端里都看不到。

## User Stories

1. As a Pi user, I want Pig to read my existing `~/.pi/agent` session logs without me configuring anything, so that I can start replaying sessions immediately.
2. As a Pi user, I want Pig to keep running independently of Pi, so that opening Pig never touches or risks my live `pi` process.
3. As a Pi user, I want to open Pig and immediately see my most recent sessions across all projects sorted newest-first, so that "the one I just ran" is always at the top.
4. As a Pi user, I want each session row to show a relative time and project name, so that I can place the session in time and context at a glance.
5. As a Pi user, I want each session row to show a meaningful title, so that I can recognize what the session was about.
6. As a Pi user, when a session starts with a slash command, I want the title rendered as a typed chip (e.g. `⚡ grilling`) with the arguments as subtitle, so that command sessions are instantly recognizable instead of opaque.
7. As a Pi user, when a session starts with a skill invocation, I want the title rendered as a skill chip (e.g. `🧩 kami`), so that I can tell which skill drove it.
8. As a Pi user, when a session starts with a natural-language message, I want the title to be the first complete sentence (no mid-word truncation), so that the title reads cleanly.
9. As a Pi user, I want each session row to show total cost in dollars as the most prominent field, so that I can spot the expensive session at a glance.
10. As a Pi user, I want each session row to show total token count and the primary model, so that I understand the scale and which model drove the cost.
11. As a Pi user, I want to filter the session list by project, so that I can narrow to one codebase when I need to.
12. As a Pi user, I want trivial throwaway sessions (e.g. `hi`, `echo test`) to simply show their raw first message and sink to the bottom by low cost, so that they don't clutter my attention.
13. As a Pi user, I want to click a session and see a summary header with total cost, total tokens, primary model, turn count, and duration, so that I get the whole session's shape before scrolling.
14. As a Pi user, I want the session detail to render as a top-to-bottom annotated timeline of turns, so that I re-walk the session the way it actually happened.
15. As a Pi user, I want each turn collapsed to a one-line summary by default (what it did + that step's cost/tokens), so that I see the skeleton without drowning in detail.
16. As a Pi user, I want to expand any turn to see its full detail on demand, so that I can deep-dive only where I'm suspicious.
17. As a Pi user, I want thinking blocks half-expanded by default (first lines + "expand all"), so that I can read what Pi was thinking without an extra click, since that's the core of the black box.
18. As a Pi user, I want tool inputs and outputs folded by default and expandable, so that an 8000-line file read doesn't bury the timeline.
19. As a Pi user, I want each step to carry a cost/token badge, so that I can see exactly where the spend went, step by step.
20. As a Pi user, I want costs labeled as "API list price" (nominal), so that I understand they're computed from list pricing, not my actual (possibly subscription/discounted) bill.
21. As a Pi user, I want images embedded in a session rendered inline as thumbnails, so that multimodal turns are legible.
22. As a Pi user, when a session switches models mid-way, I want cost aggregated correctly per model segment, so that the totals are accurate.
23. As a Pi user, I want very long timelines to scroll smoothly via virtualization, so that an 8MB session doesn't freeze the UI.
24. As a Pi user, when I switch back to Pig after running a session in the terminal, I want the list to refresh automatically on window focus, so that my new session appears with zero clicks.
25. As a Pi user, I want a manual refresh button as a fallback, so that I can force a rescan whenever I want.
26. As a Pi user, I want the session list to load fast even with many sessions, so that the app feels instant — backed by an mtime-invalidated index cache.
27. As a Pi user, I want Pig to read `PI_CODING_AGENT_DIR` (falling back to `~/.pi/agent`), so that a non-default Pi config directory still works.

## Implementation Decisions

### Architecture
- **Passive observer.** Pig never launches or hosts Pi. It only reads files under the Pi agent directory. Fully decoupled from Pi's process lifecycle and RPC protocol. (Q1)
- **Post-hoc first, incremental-ready.** V1 is a retrospective browser. The parser is written as a "feed one line → emit one state update" incremental state machine, so post-hoc = feed all lines, and future live mode = feed-while-watching. No live `fs.watch` in V1. (Q2)
- **Tauri shell.** Rust backend does parsing/scanning/aggregation; web frontend does rendering. Responsibilities orthogonal. (Q3)
- **Frontend:** Vite + React + TypeScript SPA (no Next.js). TanStack Query/Table/Virtual/Router (headless). Styling in three layers: CSS-variable **design tokens (single source of truth)** → Tailwind v4 consumes tokens → own component primitives. Markup never hardcodes hex. (Q12)

### Backend modules (Rust)
- **Session scanner / index.** Walks the agent directory's `sessions/<project-encoded>/` subdirs, produces a time-sorted list of `SessionSummary`. Maintains an **index cache keyed by file path, invalidated by mtime** — each file is aggregated once and only re-aggregated when its mtime changes. (Q7, Q11)
- **Session parser.** `parse_session(jsonl) → SessionDetail`. Consumes the JSONL event log (event types observed: `session`, `model_change`, `thinking_level_change`, `message`; message roles: `user`, `assistant`, `toolResult`; content parts: `text`, `thinking`, `toolCall`, `image`). Reconstructs turns, attaches per-turn `usage`/`cost` (already present on assistant messages — no pricing table needed), computes the summary header. Incremental state-machine form.
- **Title classifier.** `classify_title(first_user_message) → Title`, a pure function with three branches: slash-command → command chip + args; skill tag (`<skill name="…">`) → skill chip; natural language → first complete sentence (sentence-aware truncation). Trivial messages fall through as raw text. (Q7 revised)
- **Tauri command contract** (the Rust↔React seam): `list_sessions() → Vec<SessionSummary>` and `get_session_detail(id) → SessionDetail`. These two commands ARE the API contract.

### Domain types
- `SessionSummary`: id, relative-time/timestamp, project (derived from cwd), classified `Title`, total cost, total tokens, primary model.
- `SessionDetail`: summary header fields (total cost, total tokens, primary model, turn count, duration) + ordered list of `Turn`s.
- `Turn`: role, content parts (thinking / text / toolCall / toolResult / image), per-step `usage` { input, output, cacheRead, cacheWrite, totalTokens } and `cost` breakdown.
- `Title`: a tagged enum — `Command { name, args }` | `Skill { name }` | `Text { sentence }` | `Raw { text }`.

### Path resolution
- Agent dir resolved as `PI_CODING_AGENT_DIR` env var, falling back to `~/.pi/agent`. This is the **only** deliberate investment toward future distribution; everything else is built as a self-tool. (Q13)

### Cost semantics
- Cost is taken verbatim from the `cost` object already computed and stored on each assistant message's `usage`. Pig does not maintain its own pricing table. Displayed and labeled as **"API list price" (nominal)** — not reconciled against real billing. (Q9)

### Freshness
- List refreshes via **rescan-on-window-focus** + a manual refresh button. The mtime index makes rescan near-free. No directory watcher in V1. (Q11)

### Navigation
- Global recent-session list is the primary entry (sorted newest-first across all projects); project is a metadata column + filter, not the navigation axis. Storage layout (per-project dirs) is normalized away into one time-sorted index. (Q6)

## Testing Decisions

- **What makes a good test here:** assert *external behavior* of the pure core — given fixture JSONL in, assert the domain structs out (computed cost/tokens, reconstructed turns, classified title). Never assert internal state-machine steps or private helpers.
- **Primary seam (single):** the Rust pure-core transforms `parse_session(jsonl) → SessionDetail` and `build_index(dir) → Vec<SessionSummary>`. Test at this highest point — it is also the Tauri command contract — rather than across an IPC boundary. (Confirmed with user.)
- **Fixtures = real data.** Copy a handful of real sessions from `~/.pi/agent/sessions` into a fixture directory, deliberately including: the ~8MB session (perf + virtualization input), a session opening with a slash command, one opening with a `<skill>` tag, one opening with natural language, a trivial `echo`/`hi` session, and a session with a mid-way `model_change` (multi-model cost aggregation).
- **Title classifier gets its own unit tests** — branch-heavy pure function, highest error risk: slash vs skill vs natural-language vs trivial, plus sentence-aware truncation edge cases.
- **Frontend tested lightly at component level** — given fixture `SessionDetail`, assert correct badge rendering and default fold states (thinking half-expanded, tool I/O folded). Heavy testing lives in the Rust core, consistent with the project's TDD-on-Rust-core convention.

## Out of Scope

- Cost waterfall chart and context-growth (cumulative-input) curve → **V1.5** (second-layer views on the same parsed data).
- Cross-session aggregate Dashboard (weekly spend, top tools, per-project totals) → **V2**.
- Plugin management (read/write `settings.json`, `pi install/remove/update`) → **V2** — a different, write-oriented muscle that would pollute the pure-observer architecture.
- Live `fs.watch` real-time tailing of active sessions.
- AI-generated summary titles and manual session renaming (sidecar).
- Real billing reconciliation (subscription/discount-aware actual cost).
- Fork / branched-timeline rendering (`--fork`, edit-and-rerun) — V1 treats sessions as linear; branch when real data demands it.
- All defensive engineering for *other people*: polished empty states, cross-platform installers, generalized pricing tables, multi-OS packaging. V1 is a self-tool.

## Further Notes

- **V1 definition of done:** after a real session, open Pig and answer within 10 seconds — *how much did this cost, which step was expensive, what was Pi thinking* — all three invisible in the terminal.
- **Build-in-public stance:** "public" means the *process* is public, not that V1 must be installable by others. Ship a self-tool that's genuinely good daily-use; distributability is a downstream result, not a starting posture. (Echoes the Voily lesson: don't let peripheral engineering starve the MVP core.)
- **Data quality is a gift:** every assistant message already carries `usage` with a fully-computed `cost` breakdown, and events form a `parentId` chain (linear in normal use). This is why no pricing table is needed and why the timeline metaphor (not a tree) fits the data's true shape. (Q5)
- **Derived defaults (not separately decided):** huge tool results / images fold by default with lazy render; multi-model sessions segment cost by `model_change`; long timelines use TanStack Virtual.
