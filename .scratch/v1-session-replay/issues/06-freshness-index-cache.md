# 06 — Freshness & index cache

Status: done
Blocked by: 03

## Parent

[PRD: Pig V1 — Session Replay](../PRD.md)

## What to build

Make the session list stay fresh and load fast. Two coupled concerns:

- **Freshness:** the list rescans the agent directory automatically when the Pig window gains focus (matching the real workflow: run a session in the terminal, switch back to Pig, see it appear). A manual refresh button is the fallback to force a rescan.
- **Index cache:** the Rust scanner maintains a session index cache keyed by file path and invalidated by mtime — each file's `SessionSummary` (including its cost aggregation from slice 03) is computed once and only re-aggregated when the file's mtime changes. This keeps the list near-instant even with many large sessions.

No directory watcher (`fs.watch`) in V1 — that belongs to the future live mode.

## Acceptance criteria

- [ ] The session list rescans automatically when the window regains focus
- [ ] A manual refresh button forces a rescan
- [ ] A new session created in the terminal appears in the list after focusing Pig (no app restart)
- [ ] The session index is cached per file and only recomputed when that file's mtime changes
- [ ] Re-opening with an unchanged directory does not re-aggregate any session (covered by a test asserting the cache is hit when mtime is unchanged)
- [ ] No `fs.watch` / directory watcher is introduced

## Blocked by

- [03 — Cost & token truth (list + detail)](./03-cost-token-truth.md)
