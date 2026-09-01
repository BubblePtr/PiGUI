# ADR-0028: SessionInspector hosts Session surfaces behind an icon rail

## Status

Accepted (2026-09-02)

## Context

ADR-0008 gave the Live Session page a Structured Action Surface on the right.
ADR-0023 docked Changes there and deliberately stopped short of abstracting an
inspector: "once a second real Session-scoped right-hand surface appears, derive
`SessionInspector` from what the two have in common." Session actions (checkout,
model and cost, archive) stayed behind their own toolbar button and Sheet.

That second surface is here. Actions is Session-scoped, benefits from sitting
beside Chat instead of covering it, and — with Subagent details specced and
Terminal still frozen by ADR-0007 — it will not be the last. Two independent
toolbar buttons, two Sheets and one docked panel were already three ways to
reach one right-hand region, and each new surface would have added a fourth.

Three hosts were prototyped under `/proto/surfaces` and compared with real
Session content:

- **Dock** — Cursor-style tab strip plus a launcher grid. Rejected: tab
  housekeeping falls on the user, the empty state costs an extra step, and the
  strip widens linearly with open instances.
- **Ambient** — surfaces appear on their own in response to runtime events,
  with pin/dismiss. Rejected: automatic switching interrupts, and the panel
  stops being predictable. Its event-to-surface signal is worth keeping as a
  future rail badge.
- **Rail** — a panel with its own icon rail. Chosen, with one correction: the
  rail must not be window chrome.

## Decision

### The inspector is one panel that owns its rail

`SessionInspector` (`shared/ui/session-inspector/`) renders a full-height panel
with a 40px header (surface icon, title, hint, close) and a 44px icon rail on
the panel's own right edge. The rail is part of the panel: closing the inspector
removes both, so nothing stays docked against the window when the user does not
want it. A single toolbar toggle in the HeaderChrome `toolbarActions` slot,
highlighted while open, replaces the former Changes and Session actions buttons.

Panel width: 560px default, 340px minimum, 58vw maximum (Chat keeps the rest),
dragged through the Astryx `useResizable` / `ResizeHandle` pair that already
drove the docked Changes pane.

### The registry carries metadata, not content

`surface-registry.ts` holds id, title, icon and hint per surface, and nothing
else. Surface content stays with the feature that owns the data — Changes is
still `SessionChangesPanel`, Actions is still `SessionActionsContent` — and the
page injects it as children. The registry therefore never learns about Session
state, and adding a surface does not touch the host.

v1 registers `changes` and `actions`. Terminal, File and Browser surfaces remain
frozen by ADR-0007; the plugin surface protocol (#85 / ADR-0018) is unaffected.

### Multi-instance is modelled, not built

Future surfaces (Terminal, Subagent) can be multi-instance. The model, recorded
now so the rail is not redesigned later: the rail keeps one icon per *type* and
never grows with instances; an instance strip lives in the panel header and the
rail badge shows `xN`. The registry keeps the `multiInstance` flag; no instance
UI ships until a real multi-instance surface does.

### Below 1280px the inspector is a Sheet

ADR-0023's breakpoint is unchanged, now applied to the whole inspector rather
than to Changes alone. A narrow window would waste width on the rail, so the
Sheet header carries a segmented switcher instead and both surfaces stay
reachable. Crossing the breakpoint preserves the intent — open, and on which
surface — and only swaps the container.

Open state and active surface live at page level and survive Session switches,
matching what `changesOpen` already did. No new persistence layer.

## Consequences

- One toggle, one region: every Session-scoped surface is reached the same way,
  and Actions no longer hides Chat behind an overlay on a wide window.
- `AgentWorkspaceSessionsView` keeps its thin optional `aside` seam; the split
  layout still knows nothing about diffs, surfaces or plugins.
- Rail badges are wired (`badges` prop) but unproduced: the changed-file count
  lives inside `SessionChangesPanel`'s own fetch, and lifting that data out is
  deliberately left to whoever needs the badge first.
- ADR-0023 is superseded on the toolbar and container questions; its data and
  safety contract for Changes (ADR-0022) is untouched.

## Verification

- Component tests cover rail switching, the "clicking the active icon keeps the
  surface" boundary, and the width bounds.
- Workspace tests cover the docked path (toggle, rail switch, close, resize
  handle, two resizable panels) and the Sheet path (both surfaces reachable
  through the header switcher) at either side of the breakpoint.
- Electron E2E drives the docked inspector against a real Git repository and
  the Sheet fallback in a narrow window.
- Browser screenshots at 1440x900 confirm the three states: open on Changes,
  open on Actions, closed.
