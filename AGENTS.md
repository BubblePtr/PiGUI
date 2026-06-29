# Pig — Agent Instructions

> Canonical agent instructions for this repo, shared across all runtimes (Pi, Claude Code, and any other agent). `CLAUDE.md` imports this file — edit here, not there.

Pig is a GUI control plane for the Pi coding agent. It creates, starts, observes, and manages Pi agent workspaces — and replays each session as a legible timeline with cost and token truth. It drives Pi as an isolated subprocess (Pi owns session truth; Pig observes and steers it over a transport-agnostic RPC protocol). The desktop shell is Electron (`utilityProcess` backend + React renderer; see `docs/adr/0013-electron-shell-and-relocatable-backend.md`). For product scope and decisions, read `README.md` and `.scratch/v1-session-replay/PRD.md`.

## Agent skills

### Issue tracker

Issues and PRDs live **in the repo** as markdown under `.scratch/<feature>/` — no external tracker. PRDs at `.scratch/<feature>/PRD.md`, slices as `issues.md` or `issues/NN-*.md`, status via the `Status:` front matter. See `docs/agents/issue-tracker.md`.

### Triage roles

The default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), expressed as an issue's `Status:` value. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
