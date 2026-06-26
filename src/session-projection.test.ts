import { describe, expect, it } from "vitest";
import {
  applySessionProjectionEvent,
  createSessionProjection,
} from "./session-projection";

describe("Session Projection state", () => {
  it("tracks creation stages, runtime binding, and the first runtime event", () => {
    const created = createSessionProjection({
      id: "session-1",
      projectId: "pig",
      initialPrompt: "Create a resumable live session",
      createdAt: "2026-06-26T08:00:00.000Z",
    });
    const withCheckout = applySessionProjectionEvent(created, {
      type: "checkout-selected",
      stage: "preparing checkout",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
      occurredAt: "2026-06-26T08:00:01.000Z",
    });
    const withRuntime = applySessionProjectionEvent(withCheckout, {
      type: "runtime-bound",
      stage: "starting runtime",
      runtimeId: "runtime-1",
      piSessionId: "pi-session-1",
      occurredAt: "2026-06-26T08:00:02.000Z",
    });
    const running = applySessionProjectionEvent(withRuntime, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-1",
        piSessionId: "pi-session-1",
        kind: "message",
        role: "user",
        body: "Create a resumable live session",
        timestamp: "2026-06-26T08:00:03.000Z",
      },
    });

    expect(created).toMatchObject({
      projectId: "pig",
      status: "creating",
      creationStage: "preparing checkout",
      runtimeEvents: [],
      stale: false,
    });
    expect(withCheckout).toMatchObject({
      status: "creating",
      creationStage: "preparing checkout",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
    });
    expect(withRuntime).toMatchObject({
      status: "creating",
      creationStage: "starting runtime",
      runtimeId: "runtime-1",
      piSessionId: "pi-session-1",
    });
    expect(running).toMatchObject({
      status: "running",
      creationStage: "accepted",
      runtimeEvents: [
        expect.objectContaining({
          id: "runtime-event-1",
          body: "Create a resumable live session",
        }),
      ],
      updatedAt: "2026-06-26T08:00:03.000Z",
    });
  });

  it("marks stale projection state and resyncs from Pi Session State as runtime truth", () => {
    const projection = createSessionProjection({
      id: "session-1",
      projectId: "pig",
      initialPrompt: "Create a resumable live session",
      createdAt: "2026-06-26T08:00:00.000Z",
    });
    const stale = applySessionProjectionEvent(projection, {
      type: "projection-marked-stale",
      reason: "runtime event stream disconnected",
      occurredAt: "2026-06-26T08:00:10.000Z",
    });
    const resynced = applySessionProjectionEvent(stale, {
      type: "runtime-state-resynced",
      state: {
        piSessionId: "pi-session-1",
        runtimeId: "runtime-1",
        projectId: "pig",
        cwd: "/Users/void/code/opensource/Pig",
        status: "completed",
        updatedAt: "2026-06-26T08:00:12.000Z",
        events: [
          {
            id: "runtime-event-1",
            piSessionId: "pi-session-1",
            kind: "message",
            role: "user",
            body: "Create a resumable live session",
            timestamp: "2026-06-26T08:00:03.000Z",
          },
          {
            id: "runtime-event-2",
            piSessionId: "pi-session-1",
            kind: "message",
            role: "assistant",
            body: "Live session is ready.",
            timestamp: "2026-06-26T08:00:12.000Z",
          },
        ],
      },
    });

    expect(stale).toMatchObject({
      stale: true,
      staleReason: "runtime event stream disconnected",
      updatedAt: "2026-06-26T08:00:10.000Z",
    });
    expect(resynced).toMatchObject({
      status: "completed",
      stale: false,
      staleReason: null,
      runtimeId: "runtime-1",
      piSessionId: "pi-session-1",
      runtimeEvents: [
        expect.objectContaining({ id: "runtime-event-1" }),
        expect.objectContaining({ id: "runtime-event-2", body: "Live session is ready." }),
      ],
      updatedAt: "2026-06-26T08:00:12.000Z",
    });
  });
});
