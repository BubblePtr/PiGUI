# PRD: Pig Agent Workspace Control Plane MVP

Status: ready-for-agent
Feature: agent-workspace-control-plane
Created: 2026-06-25

> 定位：Pig 从 Pi Session Trace 的被动飞行记录仪，升级为面向 Pi Runtime 的 Agent Workspace Control Plane。首版只支持 Pi Runtime，不做通用 agent host；核心是 Project 下的 Session Draft、Live Session View、Pi Runtime Bridge、Execution Checkout 和 Queue/Steer/Stop 交互。

---

## Problem Statement

我（Pi 的日常使用者）现在缺少一个能承载 Pi 工作流的 GUI。终端里的 Pi 能跑任务、能多模型、能 steer / follow-up / abort，但这些操作缺少一个稳定的工作台心智：我看不清每个 Project 下有哪些 Session 正在跑、哪些有新结果、哪些运行在隔离 checkout 里，也不能在一个界面里自然地继续引导当前运行、排队下一步、查看运行结果、归档历史。

Pig 原先的 Trace / Usage 能回答“过去发生了什么”，但不能很好地回答“我现在在哪个 Project 下工作、当前有哪些 Session、Pi 正在做什么、下一步我该怎么控制它”。Pi 缺少的不是另一个通用 IDE，而是一个专门围绕 Pi Runtime 的 Agent Workspace GUI。

## Solution

Pig 首版扩展为 Pi-only Agent Workspace Control Plane：

1. Project 成为顶层工作对象，可以是 Git repo，也可以是 monorepo 里的 package/app 子目录。
2. 用户点击 New Session / 加号时进入 Project-scoped Session Draft，而不是立即创建空 Session。
3. 用户提交 Session Draft 后，Pig 通过显式 Session Creation 状态机创建 Session Projection、选择 Execution Checkout、启动/attach Pi Runtime、创建 Pi Session State，并发送 initial prompt。
4. Live Session View 以 Pi RPC/event stream 为主数据源，不再用 Trace replay 驱动 live UI。
5. Session 页面采用三栏结构：左侧 Project / Session 列表，中间 Live Chat + run timeline，右侧 Structured Action Surface。
6. 多个 Session 可以并发运行；Git repo 中的后台并发 Session 默认使用 Pig-managed disposable worktree。
7. active run 期间，输入区默认 Queue；用户可以显式 Steer 修正当前运行；Stop 作为次级安全阀。
8. Trace、Usage 和历史复盘能力保留为 Analyze 视角，而不是和 live Session 入口混在一起。

首版不做完整 terminal emulator，不做 file tree，不做通用 ACP runtime host，不做 PR/commit 自动化闭环。目标是先打通 Project → Session Draft → Pi RPC live run → Queue/Steer/Stop → Session list indicators 这条最小但真实的工作流。

## User Stories

1. As a Pi user, I want Pig to show a Project as the top-level workspace, so that I can organize Pi work around a repo or monorepo package.
2. As a Pi user, I want a Project to be allowed inside a monorepo subdirectory, so that I can work on one app/package without treating the whole repo as my daily context.
3. As a Pi user, I want Pig to preserve the Project subdirectory as Pi Runtime `cwd`, so that Pi loads the right context files and project-local resources.
4. As a Pi user, I want Pig to use the Git repo root for worktree and diff operations, so that monorepo Git behavior remains correct.
5. As a Pi user, I want the app to support multiple Sessions under one Project, so that I can run several Pi conversations against the same codebase.
6. As a Pi user, I want multiple Sessions to run concurrently, so that one long-running Pi job does not block me from starting another.
7. As a Pi user, I want background concurrent Sessions in Git repos to use isolated Execution Checkouts by default, so that concurrent Pi processes do not write into the same checkout.
8. As a Pi user, I want the first or explicit foreground Session to be able to use my local checkout, so that I can choose direct local work when appropriate.
9. As a Pi user, I want Pig-managed worktrees to be disposable by default, so that background Session isolation does not force me to manage branches manually.
10. As a Pi user, I want completed managed worktrees to be retained long enough to inspect diff and continue follow-up, so that I do not lose work immediately after a run.
11. As a Pi user, I want to promote a managed worktree to a permanent checkout, so that useful work can continue outside the disposable lifecycle.
12. As a Pi user, I want archived Sessions to be hidden from the default Session list, so that my current working view stays focused.
13. As a Pi user, I want archived Sessions to remain available through Analyze or history, so that archiving does not delete evidence.
14. As a Pi user, I want Pig to prevent archiving an active run, so that archive never silently stops Pi.
15. As a Pi user, I want New Session to open an input area instead of immediately creating a Session, so that empty drafts do not clutter the Session list.
16. As a Pi user, I want each Project to have at most one Session Draft, so that repeatedly clicking New Session returns me to the same unfinished input.
17. As a Pi user, I want Session Drafts to persist across app restarts, so that I do not lose a half-written prompt.
18. As a Pi user, I want Session Drafts to stay out of the Session list, so that I never confuse an unfinished prompt with a real Session.
19. As a Pi user, I want the New Session / plus entry to show a light draft indicator, so that I know a Project has unfinished input without seeing a fake Session.
20. As a Pi user, I want the draft to clear only after Pi accepts the initial prompt or emits the first runtime event, so that failed creation does not lose my text.
21. As a Pi user, I want failed Session creation to preserve the draft and show the failure stage, so that I can retry without rewriting.
22. As a Pi user, I want Session Creation to expose preparing checkout, starting runtime, and sending prompt states, so that failures are understandable.
23. As a Pi user, I want a real Session to appear only after I submit a draft, so that the Session list represents committed work.
24. As a Pi user, I want the Live Session View to attach to Pi Runtime events, so that I see the real current state instead of a delayed file replay.
25. As a Pi user, I want live messages, tool calls, errors, and token/cost deltas to stream from Pi Runtime, so that the UI feels like a control plane.
26. As a Pi user, I want Pig to fall back to trace/projection only when runtime is unavailable or the Session is ended, so that live state remains authoritative.
27. As a Pi user, I want Session Trace to remain available for Analyze, so that historical replay and cost analysis are not lost.
28. As a Pi user, I want Pi Session State to remain the runtime truth, so that Pig does not invent a second chat protocol.
29. As a Pi user, I want Pig to store Session Projection for list, search, lifecycle, checkout, and Analyze, so that the GUI is fast and recoverable.
30. As a Pi user, I want Projection to resync when it disagrees with Pi Runtime, so that stale UI state does not override the runtime truth.
31. As a Pi user, I want the Session page to have a left Project/Session list, so that I can switch between Sessions quickly.
32. As a Pi user, I want the center area to show Live Chat plus run timeline, so that I can understand both conversation and execution.
33. As a Pi user, I want the right side to show Structured Action Surface, so that diff, checkout, model/cost, archive, and handoff actions are available without a terminal.
34. As a Pi user, I want the first version to avoid a terminal emulator, so that the MVP does not get stuck on PTY and shell integration complexity.
35. As a Pi user, I want the first version to avoid a file tree, so that Pig stays focused on Pi Session control instead of becoming an IDE.
36. As a Pi user, I want Session list items with active runs to show a spinner/shimmer only, so that the list stays quiet and scannable.
37. As a Pi user, I want non-running Sessions to avoid Completed/Waiting labels, so that stale status tags do not clutter the list.
38. As a Pi user, I want failure and completion to show as new results in Live Chat, so that status details are visible in context.
39. As a Pi user, I want an Unread Result Indicator for Sessions with unseen messages or run results, so that I know where something changed.
40. As a Pi user, I want the unread indicator to clear only after opening the Session and rendering the latest message, so that passive hover or project switching does not lose the signal.
41. As a Pi user, I want active runs sorted above other Sessions, so that currently running work stays visible.
42. As a Pi user, I want Sessions with unread results next, so that new outcomes are easy to inspect.
43. As a Pi user, I want the rest of the list sorted by recent update time, so that recent history remains easy to find.
44. As a Pi user, I want multiple active runs sorted by recent runtime event time, so that the most active run floats to the top.
45. As a Pi user, I want the normal submit button to be an icon, so that the input area stays compact.
46. As a Pi user, I want no active run to mean ordinary prompt submission, so that the basic chat path stays obvious.
47. As a Pi user, I want active run Enter/default submit to Queue, so that my next instruction is safely scheduled after current work.
48. As a Pi user, I want Steer to appear only while active run input would Queue, so that I understand it as an alternative to queueing.
49. As a Pi user, I want the UI text to say Steer, so that it matches Pi/Codex mental models.
50. As a Pi user, I want the UI text to say Queue, so that it clearly describes scheduling the next follow-up.
51. As a Pi user, I want the same send icon to remain the main submit button during active runs, so that the control stays visually stable.
52. As a Pi user, I want a tooltip or status hint to explain that the send icon queues during active runs, so that I do not accidentally expect immediate execution.
53. As a Pi user, I want Queued Messages to appear immediately after queueing, so that I know the message was accepted.
54. As a Pi user, I want Queued Messages visually separated from Live Chat messages, so that I do not confuse pending follow-ups with already-sent messages.
55. As a Pi user, I want Queued Messages to turn into formal Live Chat messages only when Pi starts processing them, so that the chat timeline reflects actual runtime order.
56. As a Pi user, I want Queued Messages to be withdrawable before Pi starts processing them, so that I can fix a queued instruction.
57. As a Pi user, I want Queued Messages to become non-withdrawable after processing starts, so that the UI matches runtime reality.
58. As a Pi user, I want multiple Queued Messages to execute in submission order, so that queue behavior is predictable.
59. As a Pi user, I want no queued-message reordering in MVP, so that the feature stays simple and trustworthy.
60. As a Pi user, I want Steer submissions to appear immediately in the Live Chat screen, so that I can see the direction correction was captured.
61. As a Pi user, I want Steer displayed as a steer/control event near the current run, so that I do not confuse it with a Queued Message.
62. As a Pi user, I want Stop available as a secondary safety action, so that I can halt an active run when needed.
63. As a Pi user, I want Stop to map to Pi abort internally, so that Pig uses Pi's native runtime behavior.
64. As a Pi user, I do not want both Stop and Abort exposed, so that the UI does not ask me to understand protocol vocabulary.
65. As a Pi user, I want Pi model/provider selection to remain a Pi session configuration dimension, so that Pig supports Pi's multi-model capability without becoming a multi-runtime host.
66. As a Pi user, I want Pig to be Pi-only for the first version, so that the MVP can go deep on Pi instead of shallow across runtimes.
67. As a Pi user, I want Analyze separate from live Session controls, so that historical trace analysis does not compete with active work.
68. As a Pi user, I want cost and token summaries still available, so that the new workspace control plane keeps Pig's original evidence value.
69. As a Pi user, I want model/cost summary visible in the right action surface, so that runtime choices remain inspectable while working.
70. As a Pi user, I want checkout/root/cwd information visible without exposing too many choices, so that I can trust where Pi is operating.
71. As a Pi user, I want advanced checkout/model overrides hidden by default, so that Session creation remains fast.
72. As a Pi user, I want future Tasks to remain separate from Sessions, so that scheduled automation can be added later without renaming live chats.

## Implementation Decisions

- Pig becomes an Agent Workspace Control Plane, while retaining Session Trace and Usage as evidence and Analyze material.
- First implementation supports only Pi Runtime. Model/provider remains a Pi session configuration dimension; other agent runtimes are out of scope.
- The initial Pi integration should use a Pi Runtime Bridge based on `pi --mode rpc` / Pi RPC semantics. SDK integration can be a later deeper integration if RPC proves insufficient.
- Pig must model Project, Session Draft, Session, Agent Run, Execution Checkout, Pi Session State, Session Projection, Runtime Event Stream, Queue, Steer, Queued Message, Analyze, and Structured Action Surface using the glossary vocabulary.
- Project is a user-selected working root and can be a Git repo or a monorepo subdirectory.
- In a Git repo, managed worktrees are created from the Git repo root, while Pi Runtime `cwd` is the Project-relative path inside the Execution Checkout.
- Pig stores `repoRoot`, `projectRoot`, `projectRelativePath`, and `executionCheckoutRoot` to keep Git operations and Pi context loading distinct.
- Concurrent Sessions must not default to writing the same checkout. Background concurrent Sessions in Git repos default to Pig-managed disposable worktrees.
- Pig-managed worktrees are normally Session-bound, detached by default, retained after run completion, and become cleanup candidates only after archive or retention limits.
- A worktree can be promoted to permanent checkout; permanent checkout is not deleted by Session archive.
- New Session / plus opens a Project-scoped Session Draft and does not create a Session, Pi Session State, Agent Run, Execution Checkout, or trace.
- Each Project has at most one Session Draft. Re-entering New Session opens the existing draft without a replacement prompt.
- Session Draft persists across app restart and is not shown in Session list or Analyze.
- Session Draft clears only after Pi Runtime accepts the initial prompt or emits the first runtime event.
- Session Creation is an explicit state machine: create Projection, select/create Execution Checkout, start/attach Pi Runtime, create Pi Session State, send initial prompt, then transition to running/failed/terminal state.
- Session Creation failures preserve initial prompt, failure stage, error detail, and retry path.
- Pi Session State is the runtime source of truth. Pig stores Session Projection as a UI/query/lifecycle projection, not as an independent chat protocol.
- Live Session View uses Pi RPC/event stream and current Pi Session State as primary data source.
- Session Trace/log replay is used for backfill, restore, audit, Analyze, and ended Session read-only views, not as live UI's primary driver.
- Session Projection should include Pi session id, Project id, Execution Checkout, runtime cwd, model/provider summary, trace path, status, unread state, active-run metadata, queue metadata, cost summary, lifecycle events, and stale/reconciliation metadata.
- Session Projection internal statuses are `creating`, `running`, `waiting`, `failed`, `completed`, and `archived`; UI does not expose this full taxonomy.
- Session list UI exposes only active-run dynamic indicator, unread result indicator, default ordering, and archive visibility.
- Active run is represented visually with spinner/shimmer, not the text `Running`.
- Failure and completion are presented as Live Chat results/messages, not as left-list failure/completed labels.
- Unread Result Indicator is a message signal. It clears only when the Session opens and Live Chat renders the latest message/run result.
- Session list ordering is active run first, unread result second, then recent update descending. Active run group orders by recent runtime event time.
- Archived Sessions are hidden from default list but recoverable through Analyze/history. Archive does not delete Projection, Trace, checkout snapshot, or audit material.
- Active runs cannot be archived. User must Stop first, then archive after no active run remains.
- Session page uses a three-column layout: Project/Session list, Live Chat + run timeline, Structured Action Surface.
- Structured Action Surface covers diff summary, checkout information, runtime cwd, model/cost summary, open external editor, preset commands, handoff, archive, and future commit/push/PR actions.
- MVP does not implement terminal emulator or file tree.
- No active run means normal prompt submission through the send icon.
- Active run means Enter/default submit queues a follow-up. The main submit button remains the same send icon, with tooltip/status explaining Queue.
- Steer appears only when active-run input would otherwise Queue. Steer uses the UI text `Steer` and is a clear alternative action.
- Queue uses the UI text `Queue`, but no Queue/Steer labels are shown when there is no active run.
- Queued Message appears immediately as pending UI, not inside the formal Live Chat message flow.
- Queued Message converts to formal Live Chat message only when Pi starts processing it.
- Queued Message can be withdrawn before processing starts; after processing starts it can only be corrected by another Queue or Steer.
- Multiple Queued Messages execute in submission order; MVP does not support reordering.
- Steer appears immediately in the Live Chat screen as a steer/control event under the current active run, not as a pending Queue item.
- Stop is a secondary safety action. UI text is `Stop`; internal implementation maps to Pi `abort`.
- Pig should not expose both Stop and Abort in the UI.
- Analyze remains the place for historical Session Trace, cost/token, model/tool behavior, and usage pattern review.
- Future Task terminology is reserved for scheduled/automated work, not ordinary Project Sessions.

## Testing Decisions

- Good tests assert external behavior at the highest stable seam, not implementation details or private reducers.
- Primary seam: Pi Runtime Bridge contract. Use a fake JSONL RPC process/transport to assert Session Creation, attach/reconnect, Runtime Event Stream ingestion, Queue, Steer, Stop, and stale/runtime failure behavior without launching a real Pi process.
- Secondary seam: Session Projection reducer/query model. Given runtime events, checkout lifecycle events, draft events, and user actions, assert resulting Projection state, active-run indicator, unread indicator, ordering keys, archive eligibility, queue state, and stale reconciliation.
- UI behavior seam: Live Session View with mocked bridge/projection data. Assert the user-visible behavior: draft persistence, one draft per Project, submit creation state, Queue default on active run, Steer alternative, pending Queued Message area, withdraw behavior, Steer display in Live Chat, Stop safety action, and list indicators.
- Checkout seam: Execution Checkout manager. Use temporary Git repos and worktrees to assert repo-root worktree creation, project-relative runtime cwd, managed worktree retention, cleanup candidate rules, and permanent checkout promotion.
- Monorepo seam: Project path mapping. Given repo root and Project subdirectory, assert stored roots and Pi runtime cwd are correct, while diff/snapshot operations use worktree root.
- Existing prior art: current React component tests around app shell, session list, session detail, usage aggregation, and Tauri runtime fallback. New tests should follow the same Vitest/React Testing Library style for UI behavior.
- Existing browser fallback can be extended for development fixtures, but product correctness should be tested against bridge/projection interfaces rather than hardcoded visual fixtures.
- For TDD, first write failing tests for the bridge/projection state transitions before implementing production bridge or UI code.
- For UI/CSS changes, verify with a dev-server screenshot in addition to tests before claiming the feature works.
- Avoid tests that assert exact private status strings in UI. UI tests should assert observable indicators: spinner/shimmer, unread indicator, draft hint, pending queue region, and presence/absence of controls.
- Avoid real network/model calls. Pi Runtime tests should use fake RPC streams and fixture events.

## Out of Scope

- Supporting Claude, Codex, Gemini, OpenCode, ACP-hosted agents, or any non-Pi Runtime.
- Using ACP as the first implementation substrate.
- Replacing Pi's session protocol with a Pig-owned chat protocol.
- Full terminal emulator, PTY, shell integration, terminal scrollback, terminal permissions, or embedded shell.
- File tree, file explorer, inline code editor, or IDE-like project browser.
- Commit, push, PR automation as part of the MVP, beyond leaving room in Structured Action Surface.
- Full branch management beyond managed worktree lifecycle and future promotion.
- Queued Message reordering.
- Complex read receipts or scroll-bottom detection for unread clearing.
- Showing full internal Session Status taxonomy in the left list.
- Showing failed/completed labels in the left list.
- Archiving active runs.
- Automatically deleting Projection, Trace, or snapshot on archive.
- Scheduling or automation Tasks.
- Generic configurable runtime selection.
- Real billing reconciliation beyond Pig's existing cost/token evidence.
- Full Analyze redesign; existing Trace/Usage evidence remains, but live Session control is the focus.

## Further Notes

- This PRD supersedes the earlier passive-only product framing for this feature area. Existing Trace and Usage remain valuable, but become Analyze/evidence surfaces inside a broader Agent Workspace.
- README may still describe Pig as implementation-not-started/passive; current source and ADRs show the product has moved beyond that wording.
- Pi RPC documentation confirms `prompt`, `steer`, `follow_up`, `abort`, state, queue, messages, model, and event stream commands exist in the installed Pi package. Pig should use those native semantics rather than inventing parallel terms.
- `Stop` is product language. `abort` is Pi protocol language.
- Queue/Steer are intentionally user-visible because they map to how the user already controls Codex/Pi-like agents.
- The first useful MVP vertical slice is: Project list entry, one Project with Session Draft, submit to fake/real Pi RPC bridge, Live Session View stream, Queue/Steer/Stop controls, pending Queued Message, Session list active/unread indicators.
- Recommended first issue after this PRD: build the fakeable Pi Runtime Bridge and Session Projection state machine before polishing UI chrome.
