import { describe, expect, it } from "vitest";
import { createRuntimeGatewaySequencer } from "./runtime-gateway";

describe("Runtime Gateway contract", () => {
  it("wraps runtime events in a stable product envelope with monotonic sequence numbers", () => {
    const nextEvent = createRuntimeGatewaySequencer({
      now: () => "2026-06-29T12:00:00.000Z",
      idFactory: () => "evt-fixed",
    });

    const first = nextEvent({
      sessionId: "app-session-1",
      piSessionId: "pi-session-1",
      turnId: "turn-1",
      type: "message_update",
      payload: {
        kind: "message",
        role: "assistant",
        body: "Hello from Pi.",
      },
    });
    const second = nextEvent({
      sessionId: "app-session-1",
      piSessionId: "pi-session-1",
      type: "tool_execution_update",
      payload: {
        kind: "tool-call",
        title: "read",
        body: "{\"path\":\"README.md\"}",
      },
    });

    expect(first).toEqual({
      id: "evt-fixed",
      seq: 1,
      sessionId: "app-session-1",
      piSessionId: "pi-session-1",
      turnId: "turn-1",
      type: "message_update",
      ts: "2026-06-29T12:00:00.000Z",
      payload: {
        kind: "message",
        role: "assistant",
        body: "Hello from Pi.",
      },
    });
    expect(second).toMatchObject({
      seq: 2,
      sessionId: "app-session-1",
      piSessionId: "pi-session-1",
      type: "tool_execution_update",
    });
  });

  it("continues after a replayed journal sequence", () => {
    const nextEvent = createRuntimeGatewaySequencer({
      now: () => "2026-07-18T12:00:00.000Z",
      idFactory: () => "evt-after-replay",
    });

    nextEvent.advanceTo(41);

    expect(
      nextEvent({
        sessionId: "app-session-1",
        piSessionId: "pi-session-1",
        type: "run",
        payload: { type: "run", phase: "start" },
      }),
    ).toMatchObject({ seq: 42 });
  });
});
