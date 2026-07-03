import { describe, expect, it } from "vitest";
import { shouldJournalRuntimeEvent } from "./agent-runtime-event";

// The Session Event Journal is the physical form of replay: boundary events
// only, never the streaming delta hot path. This predicate is the single
// source of truth for what "boundary" means.
describe("shouldJournalRuntimeEvent", () => {
  it("drops streaming message_part deltas — replay must never re-stream", () => {
    expect(
      shouldJournalRuntimeEvent({
        type: "message_part",
        phase: "update",
        bodyMode: "delta",
        body: "frag",
        origin: "sdk",
      }),
    ).toBe(false);
  });

  it("keeps message_part boundaries — start and end snapshots anchor the timeline", () => {
    expect(
      shouldJournalRuntimeEvent({
        type: "message_part",
        phase: "start",
        bodyMode: "snapshot",
        body: "",
        origin: "sdk",
      }),
    ).toBe(true);
    expect(
      shouldJournalRuntimeEvent({
        type: "message_part",
        phase: "end",
        bodyMode: "snapshot",
        body: "Hello.",
        origin: "sdk",
      }),
    ).toBe(true);
  });

  it("keeps every non-part agent lifecycle event", () => {
    for (const payload of [
      { type: "message", phase: "end", origin: "sdk" },
      { type: "tool", phase: "update", origin: "sdk" },
      { type: "run", phase: "start", origin: "sdk" },
      { type: "turn", phase: "end", origin: "sdk" },
      { type: "status", code: "retrying", origin: "sdk" },
      { type: "error", code: "run_error", origin: "sdk" },
      { type: "usage", origin: "sdk" },
      { type: "queue", origin: "sdk" },
    ]) {
      expect(shouldJournalRuntimeEvent(payload)).toBe(true);
    }
  });

  it("keeps Gateway-minted legacy chat payloads — user messages live only there", () => {
    expect(
      shouldJournalRuntimeEvent({
        kind: "message",
        role: "user",
        body: "Fix the bug",
      }),
    ).toBe(true);
    expect(
      shouldJournalRuntimeEvent({
        kind: "control",
        role: "user",
        title: "Steer",
        body: "Focus on tests",
      }),
    ).toBe(true);
  });
});
