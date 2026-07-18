import { describe, expect, it, vi } from "vitest";
import {
  createRuntimeGatewayService,
  type PiRuntimeDriver,
  type RuntimeGatewayDriverEvent,
} from "./runtime-gateway";
import { createInMemorySessionEventJournal } from "../persistence/session-event-journal";
import { createInMemorySessionProjectionStore } from "../persistence/session-projection-store";

function createFakeRuntimeDriver(): PiRuntimeDriver & {
  emitDriverEvent(event: RuntimeGatewayDriverEvent): void;
} {
  const driverListeners = new Set<(event: RuntimeGatewayDriverEvent) => void>();

  return {
    emitDriverEvent(event) {
      for (const listener of driverListeners) {
        listener(event);
      }
    },
    async createSession(input) {
      return {
        sessionId: input.sessionId,
        runtimeId: `runtime:${input.sessionId}`,
        piSessionId: "pi-session-1",
        projectId: input.projectId,
        cwd: input.cwd,
        status: "idle",
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-1.jsonl",
        events: [],
        summary: {
          provider: "openai",
          model: "gpt-5-codex",
          totalTokens: 0,
          totalCostUsd: 0,
        },
        updatedAt: "2026-06-29T12:00:00.000Z",
      };
    },
    async resumeSession(input) {
      return {
        sessionId: input.sessionId,
        runtimeId: `runtime:${input.sessionId}`,
        piSessionId: input.piSessionId,
        projectId: input.projectId,
        cwd: input.cwd,
        status: "idle",
        sessionFile: input.sessionFile,
        checkout: input.checkout,
        events: [],
        summary: {
          provider: "openai",
          model: "gpt-5-codex",
          totalTokens: 42,
          totalCostUsd: 0.001,
        },
        updatedAt: "2026-07-03T12:00:00.000Z",
      };
    },
    async forkSession(input) {
      return {
        selectedText: "Revise this branch",
        snapshot: {
          sessionId: input.sessionId,
          runtimeId: `runtime:${input.sessionId}`,
          piSessionId: "pi-session-forked",
          projectId: input.projectId,
          cwd: input.cwd,
          status: "idle",
          sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-forked.jsonl",
          checkout: input.checkout,
          events: [],
          summary: {
            provider: "openai",
            model: "gpt-5-codex",
            totalTokens: 42,
            totalCostUsd: 0.001,
          },
          updatedAt: "2026-07-03T12:10:00.000Z",
        },
      };
    },
    async sendPrompt(input) {
      return {
        piSessionId: input.piSessionId,
        type: "message_update",
        payload: {
          kind: "message",
          role: "user",
          body: input.prompt,
        },
      };
    },
    async queueFollowUp(input) {
      return {
        id: "queued-1",
        piSessionId: input.piSessionId,
        body: input.message,
        status: "pending",
        createdAt: "2026-06-29T12:00:00.000Z",
      };
    },
    async withdrawQueuedMessage(input) {
      return {
        id: input.queuedMessageId,
        piSessionId: input.piSessionId,
        body: "queued",
        status: "withdrawn",
        createdAt: "2026-06-29T12:00:00.000Z",
        withdrawnAt: "2026-06-29T12:00:00.000Z",
      };
    },
    async steerRun(input) {
      return {
        piSessionId: input.piSessionId,
        type: "control",
        payload: {
          kind: "control",
          role: "user",
          title: "Steer",
          body: input.message,
        },
      };
    },
    async stopRun(input) {
      return {
        piSessionId: input.piSessionId,
        type: "status",
        payload: {
          kind: "status",
          title: "Stopped",
          body: "Pi stopped the active run.",
        },
      };
    },
    async getSnapshot(piSessionId) {
      return {
        sessionId: "app-session-1",
        runtimeId: "runtime:app-session-1",
        piSessionId,
        projectId: "pig",
        cwd: "/repo",
        status: "idle",
        events: [],
        updatedAt: "2026-06-29T12:00:00.000Z",
      };
    },
    onEvent(listener) {
      driverListeners.add(listener);

      return () => {
        driverListeners.delete(listener);
      };
    },
  };
}

function agentEvent(
  piSessionId: string,
  payload: Record<string, unknown>,
): RuntimeGatewayDriverEvent {
  return {
    piSessionId,
    type: String(payload.type),
    payload: { origin: "sdk", ...payload },
  };
}

describe("Runtime Gateway service", () => {
  it("dispatches PiGUI runtime methods and emits product event envelopes", async () => {
    const service = createRuntimeGatewayService({
      driver: createFakeRuntimeDriver(),
      now: () => "2026-06-29T12:00:00.000Z",
      idFactory: () => "evt-fixed",
    });
    const events: unknown[] = [];

    service.onEvent((event) => events.push(event));

    await expect(
      service.handleRequest({
        id: "req-create",
        method: "create_session",
        params: {
          sessionId: "app-session-1",
          projectId: "pig",
          cwd: "/repo",
        },
      }),
    ).resolves.toEqual({
      id: "req-create",
      result: expect.objectContaining({
        runtimeId: "runtime:app-session-1",
        piSessionId: "pi-session-1",
      }),
    });

    await expect(
      service.handleRequest({
        id: "req-prompt",
        method: "send_prompt",
        params: {
          piSessionId: "pi-session-1",
          prompt: "Build the gateway.",
        },
      }),
    ).resolves.toEqual({
      id: "req-prompt",
      result: expect.objectContaining({
        seq: 1,
        sessionId: "app-session-1",
        piSessionId: "pi-session-1",
        type: "message_update",
      }),
    });

    expect(events).toEqual([
      {
        type: "event",
        event: expect.objectContaining({
          id: "evt-fixed",
          seq: 1,
          sessionId: "app-session-1",
          piSessionId: "pi-session-1",
          type: "message_update",
          payload: expect.objectContaining({
            body: "Build the gateway.",
          }),
        }),
      },
    ]);
  });

  it("serves the journaled boundary events from get_runtime_snapshot, without streaming deltas", async () => {
    const driver = createFakeRuntimeDriver();
    let idCounter = 0;
    const service = createRuntimeGatewayService({
      driver,
      journal: createInMemorySessionEventJournal(),
      now: () => "2026-07-03T10:00:00.000Z",
      idFactory: () => `evt-${(idCounter += 1)}`,
    });

    await service.handleRequest({
      id: "req-create",
      method: "create_session",
      params: { sessionId: "app-session-1", projectId: "pig", cwd: "/repo" },
    });
    // The minted user echo (seq 1) must be journaled: user messages live only
    // on this stream until the §10 protocol gap is settled.
    await service.handleRequest({
      id: "req-prompt",
      method: "send_prompt",
      params: { piSessionId: "pi-session-1", prompt: "Fix the bug" },
    });

    driver.emitDriverEvent(
      agentEvent("pi-session-1", {
        type: "run",
        runId: "pi-session-1:run-1",
        phase: "start",
        trigger: "prompt",
        surface: "hidden",
      }),
    );
    driver.emitDriverEvent(
      agentEvent("pi-session-1", {
        type: "message_part",
        runId: "pi-session-1:run-1",
        turnId: "pi-session-1:run-1:turn-1",
        messageId: "pi-session-1:run-1:turn-1:msg-1",
        partId: "pi-session-1:run-1:turn-1:msg-1:part-0",
        partType: "text",
        phase: "start",
        bodyMode: "snapshot",
        body: "",
        surface: "chat",
      }),
    );
    driver.emitDriverEvent(
      agentEvent("pi-session-1", {
        type: "message_part",
        runId: "pi-session-1:run-1",
        turnId: "pi-session-1:run-1:turn-1",
        messageId: "pi-session-1:run-1:turn-1:msg-1",
        partId: "pi-session-1:run-1:turn-1:msg-1:part-0",
        partType: "text",
        phase: "update",
        bodyMode: "delta",
        body: "Hello",
        surface: "chat",
      }),
    );
    driver.emitDriverEvent(
      agentEvent("pi-session-1", {
        type: "message_part",
        runId: "pi-session-1:run-1",
        turnId: "pi-session-1:run-1:turn-1",
        messageId: "pi-session-1:run-1:turn-1:msg-1",
        partId: "pi-session-1:run-1:turn-1:msg-1:part-0",
        partType: "text",
        phase: "end",
        bodyMode: "snapshot",
        body: "Hello.",
        surface: "chat",
      }),
    );
    driver.emitDriverEvent(
      agentEvent("pi-session-1", {
        type: "run",
        runId: "pi-session-1:run-1",
        phase: "end",
        trigger: "prompt",
        outcome: "completed",
        surface: "hidden",
      }),
    );

    const response = await service.handleRequest({
      id: "req-snapshot",
      method: "get_runtime_snapshot",
      params: { piSessionId: "pi-session-1" },
    });
    const snapshot = response.result as {
      status: string;
      events: Array<{ seq: number; payload: Record<string, unknown> }>;
    };

    expect(snapshot.status).toBe("idle");
    expect(snapshot.events.map((event) => event.seq)).toEqual([1, 2, 3, 5, 6]);
    expect(snapshot.events[0]?.payload).toEqual(
      expect.objectContaining({ kind: "message", role: "user", body: "Fix the bug" }),
    );
    expect(
      snapshot.events.some(
        (event) =>
          event.payload.type === "message_part" && event.payload.phase === "update",
      ),
    ).toBe(false);
  });

  it("persists Session Projection records when SDK sessions are created", async () => {
    const projections = createInMemorySessionProjectionStore();
    const service = createRuntimeGatewayService({
      driver: createFakeRuntimeDriver(),
      projections,
      now: () => "2026-07-03T10:00:00.000Z",
      idFactory: () => "evt-fixed",
    });

    await service.handleRequest({
      id: "req-create",
      method: "create_session",
      params: {
        sessionId: "app-session-1",
        projectId: "pig",
        cwd: "/repo",
      },
    });
    await service.handleRequest({
      id: "req-prompt",
      method: "send_prompt",
      params: {
        piSessionId: "pi-session-1",
        prompt: "Persist this title",
      },
    });

    await expect(projections.list()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "app-session-1",
        initialPrompt: "Persist this title",
        runtimeId: "runtime:app-session-1",
        piSessionId: "pi-session-1",
        projectId: "pig",
        cwd: "/repo",
        status: "idle",
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-1.jsonl",
      }),
    ]);
  });

  it("preserves the persisted initial prompt when snapshots refresh Projection records", async () => {
    const projections = createInMemorySessionProjectionStore();
    const service = createRuntimeGatewayService({
      driver: createFakeRuntimeDriver(),
      projections,
      now: () => "2026-07-03T10:00:00.000Z",
      idFactory: () => "evt-fixed",
    });

    await service.handleRequest({
      id: "req-create",
      method: "create_session",
      params: {
        sessionId: "app-session-1",
        projectId: "pig",
        cwd: "/repo",
      },
    });
    await service.handleRequest({
      id: "req-prompt",
      method: "send_prompt",
      params: {
        piSessionId: "pi-session-1",
        prompt: "Persisted title",
      },
    });
    await service.handleRequest({
      id: "req-snapshot",
      method: "get_runtime_snapshot",
      params: { piSessionId: "pi-session-1" },
    });

    await expect(projections.list()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "app-session-1",
        initialPrompt: "Persisted title",
      }),
    ]);
  });

  it("resumes persisted SDK sessions and restores the gateway session mapping", async () => {
    const journal = createInMemorySessionEventJournal();
    const projections = createInMemorySessionProjectionStore();
    const service = createRuntimeGatewayService({
      driver: createFakeRuntimeDriver(),
      journal,
      projections,
      now: () => "2026-07-03T12:00:00.000Z",
      idFactory: () => "evt-resumed",
    });

    journal.append({
      id: "evt-old-user",
      seq: 7,
      sessionId: "app-session-resumed",
      piSessionId: "pi-session-resumed",
      type: "message_update",
      ts: "2026-07-03T11:00:00.000Z",
      payload: {
        kind: "message",
        role: "user",
        body: "Existing history",
      },
    });

    const resumeResponse = await service.handleRequest({
      id: "req-resume",
      method: "resume_session",
      params: {
        sessionId: "app-session-resumed",
        projectId: "pig",
        piSessionId: "pi-session-resumed",
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-resumed.jsonl",
        cwd: "/repo",
        checkout: {
          mode: "foreground-local",
          root: "/repo",
          runtimeCwd: "/repo",
        },
      },
    });
    const snapshot = resumeResponse.result as {
      events: Array<{ payload: Record<string, unknown> }>;
    };

    expect(resumeResponse).toEqual({
      id: "req-resume",
      result: expect.objectContaining({
        sessionId: "app-session-resumed",
        runtimeId: "runtime:app-session-resumed",
        piSessionId: "pi-session-resumed",
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-resumed.jsonl",
      }),
    });
    expect(snapshot.events).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          body: "Existing history",
        }),
      }),
    ]);
    await expect(projections.list()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "app-session-resumed",
        runtimeId: "runtime:app-session-resumed",
        piSessionId: "pi-session-resumed",
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-resumed.jsonl",
      }),
    ]);

    await expect(
      service.handleRequest({
        id: "req-prompt-after-resume",
        method: "send_prompt",
        params: {
          piSessionId: "pi-session-resumed",
          prompt: "Continue after resume",
        },
      }),
    ).resolves.toEqual({
      id: "req-prompt-after-resume",
      result: expect.objectContaining({
        sessionId: "app-session-resumed",
        piSessionId: "pi-session-resumed",
        type: "message_update",
      }),
    });
  });

  it("preserves projection-only fields and terminal status while resuming cold sessions", async () => {
    const projections = createInMemorySessionProjectionStore();
    const service = createRuntimeGatewayService({
      driver: createFakeRuntimeDriver(),
      projections,
      now: () => "2026-07-03T12:00:00.000Z",
      idFactory: () => "evt-resumed",
    });

    await projections.save({
      sessionId: "app-session-resumed",
      runtimeId: "runtime:app-session-resumed",
      piSessionId: "pi-session-resumed",
      projectId: "pig",
      initialPrompt: "Keep this title",
      cwd: "/repo",
      status: "completed",
      sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-resumed.jsonl",
      updatedAt: "2026-07-03T11:00:00.000Z",
    });
    await service.handleRequest({
      id: "req-resume",
      method: "resume_session",
      params: {
        sessionId: "app-session-resumed",
        projectId: "pig",
        piSessionId: "pi-session-resumed",
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-resumed.jsonl",
        cwd: "/repo",
      },
    });

    await expect(projections.list()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "app-session-resumed",
        initialPrompt: "Keep this title",
        status: "completed",
      }),
    ]);
  });

  it("forks a persisted SDK session and copies journal history before the selected user message", async () => {
    const journal = createInMemorySessionEventJournal();
    const projections = createInMemorySessionProjectionStore();
    let idCounter = 0;
    const service = createRuntimeGatewayService({
      driver: createFakeRuntimeDriver(),
      journal,
      projections,
      now: () => "2026-07-03T12:10:00.000Z",
      idFactory: () => `evt-fork-${(idCounter += 1)}`,
    });

    journal.append({
      id: "evt-source-user-1",
      seq: 1,
      sessionId: "app-session-source",
      piSessionId: "pi-session-source",
      type: "message_update",
      ts: "2026-07-03T11:00:00.000Z",
      payload: {
        kind: "message",
        role: "user",
        body: "Earlier user",
        messageId: "pi-sdk:pi-session-source:user:0",
        piEntryId: "pi-entry-user-1",
      },
    });
    journal.append({
      id: "evt-source-run",
      seq: 2,
      sessionId: "app-session-source",
      piSessionId: "pi-session-source",
      type: "run",
      ts: "2026-07-03T11:00:01.000Z",
      payload: {
        type: "run",
        runId: "pi-session-source:run-1",
        phase: "end",
        trigger: "prompt",
        outcome: "completed",
        origin: "sdk",
        surface: "hidden",
      },
    });
    journal.append({
      id: "evt-source-user-2",
      seq: 3,
      sessionId: "app-session-source",
      piSessionId: "pi-session-source",
      type: "message_update",
      ts: "2026-07-03T11:05:00.000Z",
      payload: {
        kind: "message",
        role: "user",
        body: "Revise this branch",
        messageId: "pi-sdk:pi-session-source:user:1",
        piEntryId: "pi-entry-user-2",
      },
    });
    journal.append({
      id: "evt-source-after-fork",
      seq: 4,
      sessionId: "app-session-source",
      piSessionId: "pi-session-source",
      type: "message_update",
      ts: "2026-07-03T11:06:00.000Z",
      payload: {
        kind: "message",
        role: "assistant",
        body: "This answer is after the fork point.",
        messageId: "pi-session-source:run-2:turn-1:msg-1",
      },
    });

    const forkResponse = await service.handleRequest({
      id: "req-fork",
      method: "fork_session",
      params: {
        sessionId: "app-session-forked",
        projectId: "pig",
        sourcePiSessionId: "pi-session-source",
        sourceSessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-source.jsonl",
        piEntryId: "pi-entry-user-2",
        cwd: "/repo-forked",
        checkout: {
          mode: "managed-worktree",
          root: "/repo-forked",
          runtimeCwd: "/repo-forked",
        },
      },
    });

    expect(forkResponse).toEqual({
      id: "req-fork",
      result: {
        selectedText: "Revise this branch",
        snapshot: expect.objectContaining({
          sessionId: "app-session-forked",
          runtimeId: "runtime:app-session-forked",
          piSessionId: "pi-session-forked",
          cwd: "/repo-forked",
          sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-forked.jsonl",
        }),
      },
    });

    await expect(journal.read("pi-session-forked")).resolves.toEqual([
      expect.objectContaining({
        id: "evt-fork-1",
        seq: 1,
        sessionId: "app-session-forked",
        piSessionId: "pi-session-forked",
        payload: expect.objectContaining({
          body: "Earlier user",
          messageId: "pi-sdk:pi-session-forked:user:0",
          piEntryId: "pi-entry-user-1",
        }),
      }),
      expect.objectContaining({
        id: "evt-fork-2",
        seq: 2,
        sessionId: "app-session-forked",
        piSessionId: "pi-session-forked",
        payload: expect.objectContaining({
          runId: "pi-session-forked:run-1",
        }),
      }),
      expect.objectContaining({
        id: "evt-fork-3",
        seq: 3,
        sessionId: "app-session-forked",
        piSessionId: "pi-session-forked",
        type: "fork",
        payload: expect.objectContaining({
          kind: "fork",
          sourcePiSessionId: "pi-session-source",
          sourceSessionId: "app-session-source",
          piEntryId: "pi-entry-user-2",
        }),
      }),
    ]);
    await expect(projections.list()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "app-session-forked",
        runtimeId: "runtime:app-session-forked",
        piSessionId: "pi-session-forked",
        cwd: "/repo-forked",
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-forked.jsonl",
      }),
    ]);
    await expect(
      service.handleRequest({
        id: "req-prompt-after-fork",
        method: "send_prompt",
        params: {
          piSessionId: "pi-session-forked",
          prompt: "Continue fork",
        },
      }),
    ).resolves.toEqual({
      id: "req-prompt-after-fork",
      result: expect.objectContaining({
        sessionId: "app-session-forked",
        piSessionId: "pi-session-forked",
        type: "message_update",
      }),
    });
  });

  it("checks the journal fork point before creating a forked runtime", async () => {
    const journal = createInMemorySessionEventJournal();
    const driver = createFakeRuntimeDriver();
    const forkSession = vi.spyOn(driver, "forkSession");
    const service = createRuntimeGatewayService({
      driver,
      journal,
    });

    journal.append({
      id: "evt-source-user",
      seq: 1,
      sessionId: "app-session-source",
      piSessionId: "pi-session-source",
      type: "message_update",
      ts: "2026-07-03T11:00:00.000Z",
      payload: {
        kind: "message",
        role: "user",
        body: "Earlier user",
        piEntryId: "pi-entry-user-1",
      },
    });

    const response = await service.handleRequest({
      id: "req-fork-missing",
      method: "fork_session",
      params: {
        sessionId: "app-session-forked",
        projectId: "pig",
        sourcePiSessionId: "pi-session-source",
        sourceSessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-source.jsonl",
        piEntryId: "pi-entry-user-missing",
        cwd: "/repo-forked",
      },
    });

    expect(response).toEqual({
      id: "req-fork-missing",
      error:
        'Fork point "pi-entry-user-missing" was not found in the Session Event Journal.',
    });
    expect(forkSession).not.toHaveBeenCalled();
    await expect(journal.read("pi-session-forked")).resolves.toEqual([]);
  });

  it("rewrites only identity fields while preserving copied message text", async () => {
    const journal = createInMemorySessionEventJournal();
    const service = createRuntimeGatewayService({
      driver: createFakeRuntimeDriver(),
      journal,
      now: () => "2026-07-03T12:10:00.000Z",
      idFactory: () => "evt-fork",
    });

    journal.append({
      id: "evt-source-user-1",
      seq: 1,
      sessionId: "app-session-source",
      piSessionId: "pi-session-source",
      type: "message_update",
      ts: "2026-07-03T11:00:00.000Z",
      payload: {
        kind: "message",
        role: "user",
        body: "Path mentions pi-session-source and must stay literal.",
        messageId: "pi-sdk:pi-session-source:user:0",
        piEntryId: "pi-entry-user-1",
      },
    });
    journal.append({
      id: "evt-source-user-2",
      seq: 2,
      sessionId: "app-session-source",
      piSessionId: "pi-session-source",
      type: "message_update",
      ts: "2026-07-03T11:01:00.000Z",
      payload: {
        kind: "message",
        role: "user",
        body: "Fork from here",
        messageId: "pi-sdk:pi-session-source:user:1",
        piEntryId: "pi-entry-user-2",
      },
    });

    await service.handleRequest({
      id: "req-fork",
      method: "fork_session",
      params: {
        sessionId: "app-session-forked",
        projectId: "pig",
        sourcePiSessionId: "pi-session-source",
        sourceSessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-source.jsonl",
        piEntryId: "pi-entry-user-2",
        cwd: "/repo-forked",
      },
    });

    await expect(journal.read("pi-session-forked")).resolves.toEqual([
      expect.objectContaining({
        ts: "2026-07-03T11:00:00.000Z",
        payload: expect.objectContaining({
          body: "Path mentions pi-session-source and must stay literal.",
          messageId: "pi-sdk:pi-session-forked:user:0",
        }),
      }),
      expect.objectContaining({
        type: "fork",
      }),
    ]);
  });

  it("does not rescan all projections when an initial prompt is already persisted", async () => {
    const projections = createInMemorySessionProjectionStore();
    const list = vi.spyOn(projections, "list");
    const service = createRuntimeGatewayService({
      driver: createFakeRuntimeDriver(),
      projections,
    });

    await service.handleRequest({
      id: "req-create",
      method: "create_session",
      params: {
        sessionId: "app-session-1",
        projectId: "pig",
        cwd: "/repo",
      },
    });
    await service.handleRequest({
      id: "req-prompt-1",
      method: "send_prompt",
      params: { piSessionId: "pi-session-1", prompt: "First prompt" },
    });
    const listCallsAfterFirstPrompt = list.mock.calls.length;

    await service.handleRequest({
      id: "req-prompt-2",
      method: "send_prompt",
      params: { piSessionId: "pi-session-1", prompt: "Second prompt" },
    });

    expect(list).toHaveBeenCalledTimes(listCallsAfterFirstPrompt);
  });
});
