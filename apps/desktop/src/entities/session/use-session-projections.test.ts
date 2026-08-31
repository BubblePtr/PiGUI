import { describe, expect, it } from "vitest";
import type { PersistedSessionProjection } from "@pigui/backend";
import { sessionProjectionFromPersistedProjection } from "@/entities/session/use-session-projections";

const record: PersistedSessionProjection = {
  sessionId: "app-session-1",
  runtimeId: "runtime:app-session-1",
  piSessionId: "pi-session-1",
  projectId: "pig",
  initialPrompt: "Investigate Pig session state",
  cwd: "/repo",
  status: "completed",
  sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-1.jsonl",
  updatedAt: "2026-07-18T12:00:00.000Z",
};

describe("session projection hydration", () => {
  it("keeps a renamed Session title across reloads", () => {
    expect(
      sessionProjectionFromPersistedProjection({
        ...record,
        title: "Sidebar actions",
      }).title,
    ).toBe("Sidebar actions");
    expect(sessionProjectionFromPersistedProjection(record).title).toBeNull();
  });
});
