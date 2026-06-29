# 05 — Timeline transparency UX

Status: done
Blocked by: 02, 03

## Parent

[PRD: Pig V1 — Session Replay](../PRD.md)

## What to build

Turn the raw, fully-expanded timeline from slice 02 into the disciplined, foldable transparency surface that is Pig's core value: every hidden detail is *reachable*, not *in your face*.

- **Turns collapse to a one-line summary by default** (what the step did + its cost/token badge from slice 03), expandable on demand
- **Thinking blocks are half-expanded by default** (first lines + "expand all") — the core of the black box, surfaced without an extra click
- **Tool inputs and outputs fold by default** and expand on demand, so an 8000-line file read doesn't bury the timeline
- **Images render inline as thumbnails**
- **Long timelines virtualize** (TanStack Virtual) so an ~8MB session scrolls smoothly

## Acceptance criteria

- [ ] Each turn shows a one-line summary (action + cost/token badge) by default and expands on click
- [ ] Thinking blocks default to half-expanded with an "expand all" affordance
- [ ] Tool inputs/outputs are folded by default and expandable
- [ ] Images embedded in a session render as inline thumbnails
- [ ] The ~8MB fixture session scrolls smoothly via virtualization without freezing the UI
- [ ] Default fold states are covered by component tests over a fixture `SessionDetail`

## Blocked by

- [02 — Session detail timeline skeleton](./02-session-detail-timeline.md)
- [03 — Cost & token truth (list + detail)](./03-cost-token-truth.md)
