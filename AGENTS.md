# Pig — Agent Instructions

> Canonical agent instructions for this repo, shared across all runtimes (Pi, Claude Code, and any other agent). `CLAUDE.md` imports this file — edit here, not there.

Pig is a passive flight recorder for the Pi coding agent. It reads Pi's session logs and replays each session as a legible timeline with cost and token truth. It does not launch or host Pi. For product scope and decisions, read `README.md` and `.scratch/v1-session-replay/PRD.md`.

## Agent skills

### Issue tracker

Issues live as local Markdown files under `.scratch/<feature>/` — no remote issue tracker. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Using the default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
