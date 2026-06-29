# 01 — Walking skeleton: session list

Status: done
Blocked by: None - can start immediately

## Parent

[PRD: Pig V1 — Session Replay](../PRD.md)

## What to build

The thinnest end-to-end slice that proves the whole pipe. The Tauri app boots into a React SPA; a single Tauri command `list_sessions()` reads the real Pi agent directory and returns a time-sorted list of sessions, which the UI renders as a list. This slice deliberately shows **only relative time + project name** per row — no cost, no token totals, no title classification yet. Reading is cheap: only the `session` record (its `timestamp` and `cwd`) is consumed per file, not the full event log.

This establishes: agent-directory path resolution, the session scanner, the `list_sessions` Tauri command contract, the React SPA scaffold (Vite + React + TS + TanStack Router/Query), and the design-token styling foundation (CSS-variable token layer → Tailwind v4 consuming tokens → first component primitives). Project is derived from the session's `cwd` and shown as a column; it is normalized away from the on-disk per-project directory layout into one flat, time-sorted index.

Agent directory resolves from `PI_CODING_AGENT_DIR`, falling back to `~/.pi/agent`.

## Acceptance criteria

- [ ] App launches into a window showing a list of sessions read from the real agent directory
- [ ] Sessions are sorted newest-first across all projects (one flat list, not grouped by project dir)
- [ ] Each row shows a relative time (e.g. "2 hours ago") and the project name derived from `cwd`
- [ ] Agent directory is resolved via `PI_CODING_AGENT_DIR` with `~/.pi/agent` fallback
- [ ] Design-token layer exists (CSS variables as single source of truth) and Tailwind v4 consumes it; no hardcoded hex in markup
- [ ] `build_index(dir) → Vec<SessionSummary>` is covered by a test over a fixture directory of real JSONL sessions, asserting count, ordering, and project derivation

## Blocked by

None - can start immediately
