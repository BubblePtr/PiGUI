import { describe, expect, it } from "vitest";
import type { PersistedSessionProjection } from "@pace/backend";
import { getSessionProjectionListItems } from "@/entities/session/session-projection";
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
  it("keeps last user submission order after cold hydration despite newer assistant activity", () => {
    const sessions = [
      sessionProjectionFromPersistedProjection({
        ...record, sessionId: "older-input", status: "running",
        lastUserMessageAt: "2026-07-18T10:00:00.000Z",
        updatedAt: "2026-07-18T12:00:00.000Z",
      }),
      sessionProjectionFromPersistedProjection({
        ...record, sessionId: "newer-input",
        lastUserMessageAt: "2026-07-18T11:00:00.000Z",
        updatedAt: "2026-07-18T11:30:00.000Z",
      }),
    ];
    expect(getSessionProjectionListItems(sessions).map((item) => item.id)).toEqual([
      "newer-input", "older-input",
    ]);
  });

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

it("uses Pi names below manual titles and above initial prompts", () => {
  const named = sessionProjectionFromPersistedProjection({ ...record, sessionName: "Auto title" } as PersistedSessionProjection);
  expect(getSessionProjectionListItems([named])[0]?.title).toBe("Auto title");
  expect(getSessionProjectionListItems([{ ...named, title: "Manual title" }])[0]?.title).toBe("Manual title");
});
