# 02 — Session detail timeline skeleton

Status: done
Blocked by: 01

## Parent

[PRD: Pig V1 — Session Replay](../PRD.md)

## What to build

Clicking a session row routes into a detail view. A Tauri command `get_session_detail(id)` runs `parse_session(jsonl)` to reconstruct the session's turns from the JSONL event log, and the UI renders them as a top-to-bottom annotated timeline. This slice renders turns as **plain, fully-expanded text** — no folding, no cost badges, no summary header yet. The goal is to prove the parse → command → route → render path end-to-end so you can read a real session as a conversation.

Parsing must handle the observed event vocabulary: event types `session` / `model_change` / `thinking_level_change` / `message`; message roles `user` / `assistant` / `toolResult`; content parts `text` / `thinking` / `toolCall` / `image`. The parser is written as an incremental "feed one line → emit one state update" state machine (so post-hoc = feed all lines, and a future live mode = feed-while-watching), even though V1 only feeds the whole file at once.

## Acceptance criteria

- [ ] Clicking a session row navigates to a detail view for that session
- [ ] The detail view renders the session's turns top-to-bottom in chronological order
- [ ] User text, assistant thinking, assistant text, tool calls, and tool results are all visible and distinguishable
- [ ] The parser is structured as an incremental state machine (one line in → one state update out)
- [ ] `parse_session(jsonl) → SessionDetail` is covered by tests over real fixture sessions, asserting reconstructed turn order and content-part types
- [ ] A back action returns to the session list

## Blocked by

- [01 — Walking skeleton: session list](./01-session-list-skeleton.md)
