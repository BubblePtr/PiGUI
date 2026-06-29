# 03 — Cost & token truth (list + detail)

Status: done
Blocked by: 02

## Parent

[PRD: Pig V1 — Session Replay](../PRD.md)

## What to build

Surface the cost and token reality through both views. The Rust core aggregates per-step `usage`/`cost` (taken verbatim from each assistant message — Pig keeps no pricing table of its own) into per-step figures and per-session totals, correctly **segmenting across `model_change`** so multi-model sessions total accurately.

- **List:** each row gains `total cost ($)` as the most prominent field, plus `total tokens` and `primary model`.
- **Detail:** a summary header appears (total cost, total tokens, primary model, turn count, duration), and each step carries a cost/token badge.
- All displayed cost is labeled **"API list price"** (nominal), signaling it is computed from list pricing, not reconciled against the user's actual (possibly subscription/discounted) bill.

`SessionSummary` and `SessionDetail` are enriched with these aggregate fields.

## Acceptance criteria

- [ ] Each list row shows total cost in dollars (most prominent), total tokens, and primary model
- [ ] Detail view shows a summary header: total cost, total tokens, primary model, turn count, duration
- [ ] Each step in the timeline shows a cost/token badge
- [ ] All cost figures are labeled "API list price" / nominal
- [ ] Cost and tokens are aggregated verbatim from message `usage`; no independent pricing table exists
- [ ] A session that switches models mid-way aggregates cost correctly per model segment (covered by a multi-model fixture test)

## Blocked by

- [02 — Session detail timeline skeleton](./02-session-detail-timeline.md)
