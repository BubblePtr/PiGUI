# PiGUI — Agent Instructions

> Canonical agent instructions for this repo, shared across all runtimes (Pi, Claude Code, and any other agent). `CLAUDE.md` imports this file — edit here, not there.

PiGUI is the missing GUI for the Pi coding agent — a visualization host for Pi's runtime and plugin ecosystem, built on an agent-workspace control plane. It creates, starts, observes, and manages Pi agent workspaces — and replays each session as a legible timeline with cost and token truth; plugin-declared panels and dynamic workflow views are the roadmap. It drives Pi as an isolated subprocess (Pi owns session truth; PiGUI observes and steers it over a transport-agnostic RPC protocol). The desktop shell is Electron (`utilityProcess` backend + React renderer; see `docs/adr/0013-electron-shell-and-relocatable-backend.md`). For product scope and decisions, read `README.md` and `.scratch/v1-session-replay/PRD.md`.

**Orientation**: the "Architecture" section of `README.md` is the canonical map — the event-pipeline diagram, the "Where things live" table (which file to edit for which concern), and the step-by-step prompt flow. Consult it before searching the codebase. Backend modules mirror that map: `packages/backend/src/{drivers,gateway,persistence,workspace}` with `service.ts` as the composition root.

## Agent skills

### Issue tracker

Hybrid since 2026-08-09: actionable slices/tasks live on **GitHub Issues** (`gh issue`), while PRDs and decision records stay **in the repo** at `.scratch/<feature>/PRD.md`. Pre-migration issue markdown under `.scratch/<feature>/issues[/]` is archive. See `docs/agents/issue-tracker.md`.

### Triage roles

The default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), expressed as GitHub labels on issues. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Design system discipline

The dev-only `/design` page (`apps/desktop/src/pages/design.tsx`) is the living registry of the design system. Hard rules:

- **Astryx first — discover before you write.** Before building or extending any UI, run `bunx astryx build "<idea>"` to get a composition kit (closest page template + blocks + components), then `bunx astryx template <name>` / `bunx astryx component <Name>` to study the pieces. Only hand-roll a component in `shared/ui/` when the kit shows Astryx has no equivalent (current known gaps: chain-of-thought, text shimmer, KPI/chart primitives). Full CLI workflow and styling rules: `apps/desktop/AGENTS.md`.
- **Reusable components live in `apps/desktop/src/shared/ui/` — nowhere else.** Page-level composition stays in `pages/`; if a piece of UI is (or becomes) reusable across pages, extract it to `shared/ui/` first.
- **Every component added to `shared/ui/` MUST be registered on the Design page in the same PR**, showing all its variants and typical states (loading / empty / error where applicable). Changing a component's variants means updating its Design page entry in the same PR.
- Token usage goes through the semantic bridge in `apps/desktop/src/app/styles.css` (`--foreground`, `--primary`, …) or raw Astryx first-level tokens — never hard-coded colors/radii/spacing in components.
- The ledger of self-built components (why each exists, what's planned) is `docs/self-built-ui.md` — reconcile it at the end of any UI work.

PRD: `.scratch/design-system-gallery/PRD.md`.

## Runtime gotchas

- **Never exercise the terminal pty driver (`packages/backend/src/drivers/terminal.ts`) under the Bun runtime** (`bun script.ts`, `bun -e`). Bun's Node-API support breaks `@lydell/node-pty`: the pty spawns, then its fd dies early (`ioctl(2) failed, EBADF`) and output is lost. The production path never hits this — the backend runs in Electron's Node via `utilityProcess`, and vitest runs on Node too — so the rule only applies to one-off debug scripts: run those with `node script.mjs` instead.
