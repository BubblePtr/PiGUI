import { describe, expect, it } from "vitest";
import {
  applySessionProjectionEvent,
  canArchiveSessionProjection,
  createSessionProjection,
  getSessionProjectionListItems,
  type SessionProjection,
} from "@/entities/session/session-projection";

function projection(overrides: Partial<SessionProjection>): SessionProjection {
  return {
    ...createSessionProjection({
      id: overrides.id ?? "session",
      projectId: overrides.projectId ?? "pig",
      initialPrompt: overrides.initialPrompt ?? "Investigate Pig session state",
      createdAt: overrides.createdAt ?? "2026-06-26T08:00:00.000Z",
    }),
    ...overrides,
  };
}

describe("Session Projection state", () => {
  it("lists visible sessions by active runtime activity, unread results, then recent updates", () => {
    const activeOlder = applySessionProjectionEvent(
      projection({
        id: "active-older",
        initialPrompt: "Older active run",
      }),
      {
        type: "runtime-event-received",
        stage: "accepted",
        event: {
          id: "event-active-older",
          piSessionId: "pi-active-older",
          kind: "message",
          role: "assistant",
          body: "Still running",
          timestamp: "2026-06-26T08:04:00.000Z",
        },
      },
    );
    const activeNewer = applySessionProjectionEvent(
      projection({
        id: "active-newer",
        initialPrompt: "Newer active run",
      }),
      {
        type: "runtime-event-received",
        stage: "accepted",
        event: {
          id: "event-active-newer",
          piSessionId: "pi-active-newer",
          kind: "message",
          role: "assistant",
          body: "Most recent runtime activity",
          timestamp: "2026-06-26T08:06:00.000Z",
        },
      },
    );
    const unreadOlderThanNormal = projection({
      id: "unread-result",
      initialPrompt: "Unread completed result",
      status: "completed",
      unreadResult: true,
      updatedAt: "2026-06-26T08:01:00.000Z",
    });
    const normalRecent = projection({
      id: "normal-recent",
      initialPrompt: "Recent read result",
      status: "completed",
      updatedAt: "2026-06-26T08:05:00.000Z",
    });
    const archived = projection({
      id: "archived-session",
      initialPrompt: "Archived checkout snapshot",
      status: "completed",
      archivedAt: "2026-06-26T08:07:00.000Z",
      updatedAt: "2026-06-26T08:07:00.000Z",
    });

    expect(
      getSessionProjectionListItems([
        normalRecent,
        archived,
        activeOlder,
        unreadOlderThanNormal,
        activeNewer,
      ]).map((item) => item.id),
    ).toEqual(["active-newer", "active-older", "unread-result", "normal-recent"]);
    expect(
      getSessionProjectionListItems([
        normalRecent,
        archived,
        activeOlder,
        unreadOlderThanNormal,
        activeNewer,
      ], { includeArchived: true }).map((item) => item.id),
    ).toContain("archived-session");
  });

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

  it("records completion and failure as unread result events that clear after latest message render", () => {
    const base = projection({
      id: "session-result",
      status: "running",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const completed = applySessionProjectionEvent(base, {
      type: "run-completed",
      event: {
        id: "event-completed",
        piSessionId: "pi-session-result",
        kind: "message",
        role: "assistant",
        body: "Run completed. The workspace shell is ready.",
        timestamp: "2026-06-26T08:08:00.000Z",
      },
    });
    const read = applySessionProjectionEvent(completed, {
      type: "latest-message-rendered",
      occurredAt: "2026-06-26T08:09:00.000Z",
    });
    const failed = applySessionProjectionEvent(base, {
      type: "run-failed",
      event: {
        id: "event-failed",
        piSessionId: "pi-session-result",
        kind: "message",
        role: "assistant",
        body: "Run failed. Pi lost the runtime stream.",
        timestamp: "2026-06-26T08:10:00.000Z",
      },
    });

    expect(completed).toMatchObject({
      status: "completed",
      unreadResult: true,
      runtimeEvents: [
        expect.objectContaining({
          id: "event-completed",
          body: "Run completed. The workspace shell is ready.",
        }),
      ],
      updatedAt: "2026-06-26T08:08:00.000Z",
    });
    expect(read).toMatchObject({
      unreadResult: false,
      updatedAt: "2026-06-26T08:08:00.000Z",
    });
    expect(failed).toMatchObject({
      status: "failed",
      unreadResult: true,
      runtimeEvents: [
        expect.objectContaining({
          id: "event-failed",
          body: "Run failed. Pi lost the runtime stream.",
        }),
      ],
      updatedAt: "2026-06-26T08:10:00.000Z",
    });
  });

  it("keeps queued follow-up messages pending until the runtime starts processing them", () => {
    const base = projection({
      id: "active-run",
      status: "running",
      piSessionId: "pi-session-active",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const queued = applySessionProjectionEvent(base, {
      type: "queued-message-added",
      queuedMessage: {
        id: "queued-1",
        piSessionId: "pi-session-active",
        body: "After this, update the usage tests.",
        status: "pending",
        createdAt: "2026-06-26T08:01:00.000Z",
      },
    });
    const withdrawn = applySessionProjectionEvent(queued, {
      type: "queued-message-withdrawn",
      queuedMessageId: "queued-1",
      occurredAt: "2026-06-26T08:01:30.000Z",
    });
    const queuedAgain = applySessionProjectionEvent(withdrawn, {
      type: "queued-message-added",
      queuedMessage: {
        id: "queued-2",
        piSessionId: "pi-session-active",
        body: "Then refresh the browser screenshot.",
        status: "pending",
        createdAt: "2026-06-26T08:02:00.000Z",
      },
    });
    const processing = applySessionProjectionEvent(queuedAgain, {
      type: "queued-message-processing-started",
      queuedMessageId: "queued-2",
      event: {
        id: "queued-2-runtime-event",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "user",
        body: "Then refresh the browser screenshot.",
        timestamp: "2026-06-26T08:03:00.000Z",
      },
    });

    expect(queued.queuedMessages).toEqual([
      expect.objectContaining({
        id: "queued-1",
        body: "After this, update the usage tests.",
        status: "pending",
      }),
    ]);
    expect(queued.runtimeEvents).toEqual([]);
    expect(withdrawn.queuedMessages).toEqual([
      expect.objectContaining({
        id: "queued-1",
        status: "withdrawn",
      }),
    ]);
    expect(processing.queuedMessages).toEqual([
      expect.objectContaining({ id: "queued-1", status: "withdrawn" }),
      expect.objectContaining({
        id: "queued-2",
        status: "processing",
        processingStartedAt: "2026-06-26T08:03:00.000Z",
      }),
    ]);
    expect(processing.runtimeEvents).toEqual([
      expect.objectContaining({
        id: "queued-2-runtime-event",
        role: "user",
        body: "Then refresh the browser screenshot.",
      }),
    ]);
    expect(processing.updatedAt).toBe("2026-06-26T08:03:00.000Z");
  });

  it("promotes a matching queued follow-up when the runtime emits the user message", () => {
    const base = projection({
      id: "active-run",
      status: "running",
      piSessionId: "pi-session-active",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const queued = applySessionProjectionEvent(base, {
      type: "queued-message-added",
      queuedMessage: {
        id: "queued-1",
        piSessionId: "pi-session-active",
        body: "Then refresh the browser screenshot.",
        status: "pending",
        createdAt: "2026-06-26T08:02:00.000Z",
      },
    });
    const processing = applySessionProjectionEvent(queued, {
      type: "runtime-event-received",
      event: {
        id: "runtime-event-follow-up",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "user",
        body: "Then refresh the browser screenshot.",
        timestamp: "2026-06-26T08:03:00.000Z",
      },
    });

    expect(processing.queuedMessages).toEqual([
      expect.objectContaining({
        id: "queued-1",
        status: "processing",
        processingStartedAt: "2026-06-26T08:03:00.000Z",
      }),
    ]);
    expect(processing.runtimeEvents).toEqual([
      expect.objectContaining({
        id: "runtime-event-follow-up",
        role: "user",
        body: "Then refresh the browser screenshot.",
      }),
    ]);
  });

  it("updates one Live Chat assistant message for streaming events with the same message identity", () => {
    const base = projection({
      id: "streaming-run",
      status: "running",
      piSessionId: "pi-session-active",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const first = applySessionProjectionEvent(base, {
      type: "runtime-event-received",
      event: {
        id: "runtime-event-assistant-1",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "assistant",
        body: "我们",
        timestamp: "2026-06-26T08:00:01.000Z",
        messageId: "pi-sdk:pi-session-active:assistant:0",
      },
    });
    const second = applySessionProjectionEvent(first, {
      type: "runtime-event-received",
      event: {
        id: "runtime-event-assistant-2",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "assistant",
        body: "我们被",
        timestamp: "2026-06-26T08:00:02.000Z",
        messageId: "pi-sdk:pi-session-active:assistant:0",
      },
    });
    const latest = applySessionProjectionEvent(second, {
      type: "runtime-event-received",
      event: {
        id: "runtime-event-assistant-3",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "assistant",
        body: "我们被要求",
        timestamp: "2026-06-26T08:00:03.000Z",
        messageId: "pi-sdk:pi-session-active:assistant:0",
      },
    });

    expect(latest.runtimeEvents).toEqual([
      expect.objectContaining({
        role: "assistant",
        body: "我们被要求",
        messageId: "pi-sdk:pi-session-active:assistant:0",
      }),
    ]);
    expect(latest.updatedAt).toBe("2026-06-26T08:00:03.000Z");
  });

  it("updates one trace item for streaming events with the same trace identity", () => {
    const base = projection({
      id: "active-run",
      status: "running",
      piSessionId: "pi-session-active",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const thinkingStarted = applySessionProjectionEvent(base, {
      type: "runtime-event-received",
      event: {
        id: "runtime-thinking-1",
        piSessionId: "pi-session-active",
        kind: "thinking",
        role: "assistant",
        body: "先看",
        timestamp: "2026-06-26T08:00:01.000Z",
        messageId: "pi-sdk:pi-session-active:assistant:0",
      },
    });
    const thinkingUpdated = applySessionProjectionEvent(thinkingStarted, {
      type: "runtime-event-received",
      event: {
        id: "runtime-thinking-2",
        piSessionId: "pi-session-active",
        kind: "thinking",
        role: "assistant",
        body: "先看项目结构",
        timestamp: "2026-06-26T08:00:02.000Z",
        messageId: "pi-sdk:pi-session-active:assistant:0",
      },
    });
    const toolStarted = applySessionProjectionEvent(thinkingUpdated, {
      type: "runtime-event-received",
      event: {
        id: "runtime-tool-1",
        piSessionId: "pi-session-active",
        kind: "tool-call",
        title: "read",
        body: "{\"path\":\"AGENTS.md\"}",
        timestamp: "2026-06-26T08:00:03.000Z",
        toolCallId: "tool-call-1",
      },
    });
    const toolUpdated = applySessionProjectionEvent(toolStarted, {
      type: "runtime-event-received",
      event: {
        id: "runtime-tool-2",
        piSessionId: "pi-session-active",
        kind: "tool-call",
        title: "read",
        body: "{\"path\":\"CONTEXT.md\"}",
        timestamp: "2026-06-26T08:00:04.000Z",
        toolCallId: "tool-call-1",
      },
    });

    expect(toolUpdated.runtimeEvents).toEqual([
      expect.objectContaining({
        id: "runtime-thinking-2",
        kind: "thinking",
        body: "先看项目结构",
        messageId: "pi-sdk:pi-session-active:assistant:0",
      }),
      expect.objectContaining({
        id: "runtime-tool-2",
        kind: "tool-call",
        body: "{\"path\":\"CONTEXT.md\"}",
        toolCallId: "tool-call-1",
      }),
    ]);
  });

  it("records steer control events in the active Live Chat stream", () => {
    const base = projection({
      id: "active-run",
      status: "running",
      piSessionId: "pi-session-active",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const steered = applySessionProjectionEvent(base, {
      type: "steer-submitted",
      event: {
        id: "steer-event-1",
        piSessionId: "pi-session-active",
        kind: "control",
        role: "user",
        title: "Steer",
        body: "Stay focused on the queue behavior.",
        timestamp: "2026-06-26T08:04:00.000Z",
      },
    });

    expect(steered).toMatchObject({
      status: "running",
      unreadResult: false,
      updatedAt: "2026-06-26T08:04:00.000Z",
      runtimeEvents: [
        expect.objectContaining({
          kind: "control",
          title: "Steer",
          body: "Stay focused on the queue behavior.",
        }),
      ],
    });
    expect(steered.queuedMessages).toEqual([]);
  });

  it("records stopped runs as completed and archiveable", () => {
    const base = projection({
      id: "active-run",
      status: "running",
      piSessionId: "pi-session-active",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const stopped = applySessionProjectionEvent(base, {
      type: "run-stopped",
      event: {
        id: "stop-event-1",
        piSessionId: "pi-session-active",
        kind: "status",
        title: "Stopped",
        body: "Pi stopped the active run.",
        timestamp: "2026-06-26T08:05:00.000Z",
      },
    });

    expect(stopped).toMatchObject({
      status: "completed",
      unreadResult: true,
      updatedAt: "2026-06-26T08:05:00.000Z",
      runtimeEvents: [
        expect.objectContaining({
          kind: "status",
          title: "Stopped",
        }),
      ],
    });
    expect(canArchiveSessionProjection(stopped)).toBe(true);
  });

  it("records stop failures without ending the active run", () => {
    const base = projection({
      id: "active-run",
      status: "running",
      piSessionId: "pi-session-active",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const failedStop = applySessionProjectionEvent(base, {
      type: "run-stop-failed",
      event: {
        id: "stop-failed-event-1",
        piSessionId: "pi-session-active",
        kind: "error",
        title: "Stop failed",
        body: "Pi rejected the stop request.",
        timestamp: "2026-06-26T08:05:00.000Z",
      },
    });

    expect(failedStop).toMatchObject({
      status: "running",
      unreadResult: false,
      updatedAt: "2026-06-26T08:05:00.000Z",
      runtimeEvents: [
        expect.objectContaining({
          kind: "error",
          title: "Stop failed",
        }),
      ],
    });
    expect(canArchiveSessionProjection(failedStop)).toBe(false);
  });

  it("prevents active archive and keeps archived sessions available to history queries", () => {
    const active = projection({
      id: "active-run",
      status: "running",
      updatedAt: "2026-06-26T08:00:00.000Z",
    });
    const completed = projection({
      id: "completed-run",
      status: "completed",
      updatedAt: "2026-06-26T08:01:00.000Z",
    });

    expect(canArchiveSessionProjection(active)).toBe(false);
    expect(() =>
      applySessionProjectionEvent(active, {
        type: "session-archived",
        occurredAt: "2026-06-26T08:02:00.000Z",
      }),
    ).toThrow("Cannot archive an active Session.");

    expect(canArchiveSessionProjection(completed)).toBe(true);

    const archived = applySessionProjectionEvent(completed, {
      type: "session-archived",
      occurredAt: "2026-06-26T08:02:00.000Z",
    });

    expect(archived).toMatchObject({
      status: "completed",
      archivedAt: "2026-06-26T08:02:00.000Z",
    });
    expect(getSessionProjectionListItems([archived])).toEqual([]);
    expect(getSessionProjectionListItems([archived], { includeArchived: true })).toEqual([
      expect.objectContaining({
        id: "completed-run",
        archived: true,
      }),
    ]);
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

  it("collapses streaming assistant updates when resyncing runtime state", () => {
    const projection = createSessionProjection({
      id: "session-1",
      projectId: "pig",
      initialPrompt: "测试一下",
      createdAt: "2026-06-26T08:00:00.000Z",
    });
    const resynced = applySessionProjectionEvent(projection, {
      type: "runtime-state-resynced",
      state: {
        piSessionId: "pi-session-1",
        runtimeId: "runtime-1",
        projectId: "pig",
        cwd: "/Users/void/code/opensource/Pig",
        status: "running",
        events: [
          {
            id: "runtime-event-1",
            piSessionId: "pi-session-1",
            kind: "message",
            role: "assistant",
            body: "我们",
            timestamp: "2026-06-26T08:00:03.000Z",
            messageId: "pi-sdk:pi-session-1:assistant:0",
          },
          {
            id: "runtime-event-2",
            piSessionId: "pi-session-1",
            kind: "message",
            role: "assistant",
            body: "我们被",
            timestamp: "2026-06-26T08:00:04.000Z",
            messageId: "pi-sdk:pi-session-1:assistant:0",
          },
          {
            id: "runtime-event-3",
            piSessionId: "pi-session-1",
            kind: "message",
            role: "assistant",
            body: "我们被要求",
            timestamp: "2026-06-26T08:00:05.000Z",
            messageId: "pi-sdk:pi-session-1:assistant:0",
          },
        ],
        updatedAt: "2026-06-26T08:00:05.000Z",
      },
    });

    expect(resynced.runtimeEvents).toEqual([
      expect.objectContaining({
        role: "assistant",
        body: "我们被要求",
        messageId: "pi-sdk:pi-session-1:assistant:0",
      }),
    ]);
  });

  it("derives status from Active Run events and stops letting legacy status events flip it", () => {
    const runId = "pi-session-1:run-1";
    let projection = createSessionProjection({
      id: "session-1",
      projectId: "project-1",
      initialPrompt: "Ship it",
      createdAt: "2026-07-02T10:00:00.000Z",
    });

    projection = applySessionProjectionEvent(projection, {
      type: "agent-event-received",
      entry: {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        },
      },
    });

    expect(projection.status).toBe("running");
    expect(projection.runtimeModel.runs.get(runId)).toBeDefined();

    // The legacy compat stream still records events, but once run events own
    // the status a legacy "status" kind must not complete the session.
    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      event: {
        id: "legacy-retrying",
        piSessionId: "pi-session-1",
        kind: "status",
        title: "Retrying",
        body: "stream disconnected",
        timestamp: "2026-07-02T10:00:02.000Z",
      },
    });

    expect(projection.status).toBe("running");
    expect(projection.runtimeEvents).toHaveLength(1);

    projection = applySessionProjectionEvent(projection, {
      type: "agent-event-received",
      entry: {
        seq: 2,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: {
          type: "message",
          runId,
          turnId: `${runId}:turn-1`,
          messageId: `${runId}:turn-1:msg-1`,
          role: "assistant",
          phase: "end",
          parts: [
            {
              partId: `${runId}:turn-1:msg-1:part-0`,
              partType: "text",
              body: "Done",
            },
          ],
          surface: "chat",
          origin: "sdk",
        },
      },
    });
    projection = applySessionProjectionEvent(projection, {
      type: "agent-event-received",
      entry: {
        seq: 3,
        timestamp: "2026-07-02T10:00:04.000Z",
        event: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "completed",
          surface: "hidden",
          origin: "sdk",
        },
      },
    });

    expect(projection.status).toBe("completed");
    expect(projection.unreadResult).toBe(true);
    expect(projection.updatedAt).toBe("2026-07-02T10:00:04.000Z");
    expect(
      projection.runtimeModel.messages.get(`${runId}:turn-1:msg-1`),
    ).toMatchObject({
      phase: "final",
      parts: [{ partType: "text", body: "Done" }],
    });
  });
});
