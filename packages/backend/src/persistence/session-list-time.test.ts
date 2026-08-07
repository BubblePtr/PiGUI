import { describe, expect, it } from "vitest";
import {
  lastChatActivityAtFromGatewayEvents,
  resolvePersistedListUpdatedAt,
} from "./session-list-time";

describe("session list time (DF-012)", () => {
  it("picks the latest message/control/error envelope ts", () => {
    expect(
      lastChatActivityAtFromGatewayEvents([
        {
          ts: "2026-08-01T11:00:00.000Z",
          payload: { kind: "message", role: "user" },
        },
        {
          ts: "2026-08-01T11:01:00.000Z",
          payload: { type: "run", phase: "end" },
        },
        {
          ts: "2026-08-01T11:02:00.000Z",
          payload: { kind: "message", role: "assistant" },
        },
        {
          ts: "2026-08-01T11:03:00.000Z",
          payload: { kind: "control" },
        },
      ]),
    ).toBe("2026-08-01T11:03:00.000Z");
  });

  it("ignores non-chat envelopes", () => {
    expect(
      lastChatActivityAtFromGatewayEvents([
        {
          ts: "2026-08-01T11:00:00.000Z",
          payload: { type: "usage" },
        },
        {
          ts: "2026-08-01T11:01:00.000Z",
          payload: { type: "run", phase: "start" },
        },
      ]),
    ).toBeNull();
  });

  it("prefers event activity over snapshot wall-clock", () => {
    expect(
      resolvePersistedListUpdatedAt({
        events: [
          {
            ts: "2026-08-01T12:03:34.764Z",
            payload: { kind: "message", role: "assistant" },
          },
        ],
        previousUpdatedAt: "2026-08-07T05:00:00.000Z",
        snapshotUpdatedAt: "2026-08-07T05:30:00.000Z",
      }),
    ).toBe("2026-08-01T12:03:34.764Z");
  });

  it("keeps previous list time when resume has no chat events", () => {
    expect(
      resolvePersistedListUpdatedAt({
        events: [],
        previousUpdatedAt: "2026-08-01T12:03:34.764Z",
        snapshotUpdatedAt: "2026-08-07T05:30:00.000Z",
      }),
    ).toBe("2026-08-01T12:03:34.764Z");
  });
});
