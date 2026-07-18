# PiGUI

> A GUI control plane for [Pi Agent](https://pi.dev) — making the CLI's runtime no longer a black box.

PiGUI is a desktop control plane for the Pi coding agent: it creates, starts, observes, and manages Pi agent workspaces, and replays each session as a legible timeline with cost and token truth. Pi remains the only runtime and owns session truth; PiGUI drives it through a stable Runtime Gateway API whose backend driver can use the Pi SDK or a Pi RPC subprocess depending on isolation and deployment needs.

After a session, PiGUI lets you answer — in seconds — the three questions the terminal hides:

- **How much did this cost?**
- **Which step was expensive?**
- **What was Pi actually thinking?**

## Status

🛠️ **Under active development.** The Electron shell, the Runtime Gateway API, the RPC process driver, the Pi SDK driver spike, and the agent-workspace foundation (sessions, run controls, runtime projections) have landed; usage and config surfaces are in flight.

The product began as a passive session-replay tool and has since evolved into an **Agent Workspace Control Plane** for Pi (see [`docs/adr/0001`](docs/adr/0001-agent-workspace-control-plane.md)). The living source of truth is the domain glossary and the ADRs:

- **Glossary:** [`CONTEXT.md`](CONTEXT.md)
- **Decisions:** [`docs/adr/`](docs/adr/)
- **Feature PRDs:** [`.scratch/<feature>/PRD.md`](.scratch/) (point-in-time planning records)

## Scope

PiGUI organizes Pi's runtime into a desktop control plane: create and drive **Sessions** under a **Project**, replay each **Session Trace** as a legible timeline with cost and token truth, and view cross-session **usage** and **config**. An embedded browser with DOM annotation is planned (the load-bearing reason for the Electron shell). A full terminal emulator and file tree are deliberately deferred.

## Stack

- **Shell:** Electron — a thin `main` process, a Node `utilityProcess` backend (session-log parsing + Pi runtime driver management), and a React renderer (see [`docs/adr/0013`](docs/adr/0013-electron-shell-and-relocatable-backend.md))
- **Frontend:** Vite + React + TypeScript SPA, TanStack (Query/Table/Virtual/Router)
- **Styling:** CSS-variable design tokens (single source of truth) → Tailwind v4 → own component primitives
- **Tooling:** Bun workspaces, electron-vite, Vitest

## Architecture

**The dashboard must never stall the engine.** Pi owns session truth; PiGUI observes and steers it through a stable Runtime Gateway API. The backend lives in a `utilityProcess` so runtime crashes and heavy parsing work never freeze the window, and the same backend protocol can later be relocated behind a remote transport without touching business code.

The whole system is one unidirectional event pipeline, plus two persistence tracks that must never swap roles ([ADR-0021](docs/adr/0021-session-fork-resume-persistence-layering.md)):

```mermaid
flowchart LR
  subgraph backend["packages/backend (utilityProcess)"]
    D["Pi driver<br/>(SDK / RPC)"] --> N["Normalizer<br/>AgentRuntimeEvent"]
    N --> G["Runtime Gateway<br/>envelope: seq + ids"]
    G --> J[("Session Event Journal<br/>presentation truth")]
    G --> P[("Session Projection<br/>query model")]
  end
  Pi["Pi Runtime"] --> D
  Pi --> L[("Pi session jsonl<br/>context truth")]
  G -->|MessagePort| R["Renderer<br/>apps/desktop"]
  R -->|"commands: prompt / queue / steer / stop"| G
```

- **Pi session jsonl** (`~/.pi`) is *context truth*: on cold resume, Pi rebuilds the LLM context from it itself — PiGUI never assembles LLM context.
- **Session Event Journal** (`~/.pigui`) is *presentation truth*: the UI timeline, run/turn identity, and control events only come from replaying it.

### Where things live

| To change… | Go to… |
|---|---|
| UI, pages, interactions | [`apps/desktop/src/`](apps/desktop/src/) — FSD layers: `pages` → `entities` → `shared` ([ADR-0016](docs/adr/0016-fsd-layers-in-apps-desktop.md)) |
| Event semantics (what counts as a message / run / turn) | [`packages/backend/src/gateway/agent-runtime-event-normalizer.ts`](packages/backend/src/gateway/) + its fixture tests ([ADR-0020](docs/adr/0020-agent-runtime-event-model.md)) |
| Gateway protocol (commands, event contract, identity) | [`packages/core/src/`](packages/core/src/) — `runtime-gateway.ts`, `agent-runtime-event.ts` |
| How Pi is driven | [`packages/backend/src/drivers/`](packages/backend/src/drivers/) — `pi-sdk-driver.ts` is the main path; the RPC driver is frozen ([ADR-0018](docs/adr/0018-runtime-gateway-api-and-pi-drivers.md), [ADR-0021](docs/adr/0021-session-fork-resume-persistence-layering.md)) |
| Persistence & replay (journal, projection) | [`packages/backend/src/persistence/`](packages/backend/src/persistence/) |
| Sessions on disk, git worktrees, config inventory | [`packages/backend/src/workspace/`](packages/backend/src/workspace/) |
| Electron shell & transport | [`apps/desktop/electron/`](apps/desktop/electron/) — `main.ts`, `preload.ts`, `backend.ts` |
| Why it is designed this way | [`docs/adr/`](docs/adr/) — terms in [`CONTEXT.md`](CONTEXT.md) |

`apps/server` and `apps/web` are intentional placeholders for the relocatable backend's future remote transport — see their READMEs and [ADR-0015](docs/adr/0015-multi-app-monorepo.md).

### How a prompt flows

What happens when you hit <kbd>Enter</kbd> in the composer:

1. The renderer sends `send_prompt` through the Runtime Gateway client — `apps/desktop/src/entities/runtime/runtime-gateway-client.ts`.
2. The command crosses the MessagePort transport into the `utilityProcess` — `apps/desktop/electron/preload.ts`, `backend.ts`.
3. `createBackendService()` dispatches it to the Runtime Gateway — `packages/backend/src/service.ts`.
4. The Gateway mints the user message id and forwards to the active driver — `packages/backend/src/gateway/runtime-gateway.ts`.
5. The SDK driver drives Pi's `AgentSession`; Pi runs the agent loop — `packages/backend/src/drivers/pi-sdk-driver.ts`.
6. Raw Pi events are normalized into `AgentRuntimeEvent`s (phase, surface, deterministic run/turn/message ids) — `packages/backend/src/gateway/agent-runtime-event-normalizer.ts`.
7. The Gateway stamps each event into a sequenced envelope, journals lifecycle boundaries, and updates the session projection — `packages/backend/src/persistence/`.
8. Events stream back over the same transport; the renderer's projection routes them by `surface` into Live Chat bubbles, the trace panel, or hidden state — `apps/desktop/src/entities/runtime/`.

The best entry point for understanding (and contributing to) the system is the normalizer's fixture contract tests — they are the executable spec of the event protocol. Adding a new fixture stream is a great first PR.

---

Built in public by [@Kieran](https://github.com/BubblePtr).
