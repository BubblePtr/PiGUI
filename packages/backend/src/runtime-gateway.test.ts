import { describe, expect, it } from "vitest";
import {
  createRuntimeGatewayService,
  type PiRuntimeDriver,
  type RuntimeGatewayDriverEvent,
} from "./runtime-gateway";
import { createInMemorySessionEventJournal } from "./session-event-journal";

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
});
