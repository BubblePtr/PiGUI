import type { RuntimeGatewayEventEnvelope, RuntimeGatewaySnapshot } from "@pigui/core";
import type { BackendRpcEvent } from "@pigui/backend";
import { describe, expect, it, vi } from "vitest";
import {
  createRuntimeGatewayClient,
  type RuntimeGatewayClientOptions,
} from "@/entities/runtime/runtime-gateway-client";

describe("Runtime Gateway client", () => {
  it("delegates Electron runtime calls to Gateway methods and suppresses command echo events", async () => {
    const invocations: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const onBackendEvent = vi.fn((handler: (event: BackendRpcEvent) => void) => {
      eventHandlers.push(handler);

      return vi.fn();
    });
    const promptEnvelope: RuntimeGatewayEventEnvelope = {
      id: "evt-user",
      seq: 1,
      sessionId: "session-1",
      piSessionId: "pi-session-1",
      type: "message_update",
      ts: "2026-06-29T12:00:01.000Z",
      payload: {
        kind: "message",
        role: "user",
        body: "Create the Gateway bridge",
      },
    };
    const snapshot: RuntimeGatewaySnapshot = {
      sessionId: "session-1",
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
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
    const invoke: RuntimeGatewayClientOptions["invoke"] = async <T,>(
      command: string,
      args?: Record<string, unknown>,
    ) => {
      invocations.push({ command, args });

      if (command === "create_session") {
        return snapshot as T;
      }

      if (command === "send_prompt") {
        eventHandlers[0]?.({ type: "event", event: promptEnvelope });

        return promptEnvelope as T;
      }

      throw new Error(`unexpected command ${command}`);
    };
    const client = createRuntimeGatewayClient({
      invoke,
      onBackendEvent,
      now: () => "2026-06-29T12:00:02.000Z",
    });

    const runtime = await client.startRuntime({
      sessionId: "session-1",
      projectId: "pig",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
    });
    const state = await client.createPiSessionState({
      runtimeId: runtime.runtimeId,
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const observedEvents: unknown[] = [];

    client.subscribeToEvents(state.piSessionId, (event) => {
      observedEvents.push(event);
    });
    const accepted = await client.sendInitialPrompt({
      piSessionId: state.piSessionId,
      prompt: "Create the Gateway bridge",
    });

    eventHandlers[0]?.({
      type: "event",
      event: {
        id: "evt-assistant",
        seq: 2,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "message_update",
        ts: "2026-06-29T12:00:03.000Z",
        payload: {
          kind: "message",
          role: "assistant",
          body: "Gateway bridge is ready.",
        },
      },
    });

    expect(invocations).toEqual([
      {
        command: "create_session",
        args: {
          sessionId: "session-1",
          projectId: "pig",
          cwd: "/Users/void/code/opensource/Pig",
          checkout: {
            mode: "foreground-local",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig",
          },
        },
      },
      {
        command: "send_prompt",
        args: {
          piSessionId: "pi-session-1",
          prompt: "Create the Gateway bridge",
        },
      },
    ]);
    expect(runtime).toMatchObject({
      runtimeId: "pi-rpc:session-1",
      status: "ready",
    });
    expect(state).toMatchObject({
      piSessionId: "pi-session-1",
      status: "idle",
      summary: {
        provider: "openai",
        model: "gpt-5-codex",
      },
    });
    expect(accepted).toMatchObject({
      accepted: true,
      piSessionId: "pi-session-1",
      event: {
        id: "evt-user",
        kind: "message",
        role: "user",
        body: "Create the Gateway bridge",
      },
    });
    expect(observedEvents).toEqual([
      expect.objectContaining({
        id: "evt-assistant",
        kind: "message",
        role: "assistant",
        body: "Gateway bridge is ready.",
      }),
    ]);
    await expect(client.getSessionState("pi-session-1")).resolves.toMatchObject({
      events: [
        expect.objectContaining({ id: "evt-user" }),
        expect.objectContaining({ id: "evt-assistant" }),
      ],
    });
  });

  it("preserves Gateway message identity metadata for streaming updates", async () => {
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const snapshot: RuntimeGatewaySnapshot = {
      sessionId: "session-1",
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
      status: "idle",
      events: [],
      updatedAt: "2026-06-29T12:00:00.000Z",
    };
    const client = createRuntimeGatewayClient({
      invoke: async <T,>(command: string) => {
        if (command === "create_session" || command === "get_runtime_snapshot") {
          return snapshot as T;
        }

        throw new Error(`unexpected command ${command}`);
      },
      onBackendEvent: (handler) => {
        eventHandlers.push(handler);

        return vi.fn();
      },
    });
    const runtime = await client.startRuntime({
      sessionId: "session-1",
      projectId: "pig",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
    });
    const state = await client.createPiSessionState({
      runtimeId: runtime.runtimeId,
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const observedEvents: unknown[] = [];

    client.subscribeToEvents(state.piSessionId, (event) => {
      observedEvents.push(event);
    });
    eventHandlers[0]?.({
      type: "event",
      event: {
        id: "evt-assistant-1",
        seq: 1,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "message_update",
        ts: "2026-06-29T12:00:01.000Z",
        payload: {
          kind: "message",
          role: "assistant",
          body: "我们",
          messageId: "pi-sdk:pi-session-1:assistant:0",
        },
      },
    });

    expect(observedEvents).toEqual([
      expect.objectContaining({
        id: "evt-assistant-1",
        messageId: "pi-sdk:pi-session-1:assistant:0",
        body: "我们",
      }),
    ]);
  });

  it("preserves Gateway trace event kinds and tool call identity metadata", async () => {
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const snapshot: RuntimeGatewaySnapshot = {
      sessionId: "session-1",
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
      status: "idle",
      events: [],
      updatedAt: "2026-06-29T12:00:00.000Z",
    };
    const client = createRuntimeGatewayClient({
      invoke: async <T,>(command: string) => {
        if (command === "create_session" || command === "get_runtime_snapshot") {
          return snapshot as T;
        }

        throw new Error(`unexpected command ${command}`);
      },
      onBackendEvent: (handler) => {
        eventHandlers.push(handler);

        return vi.fn();
      },
    });
    const runtime = await client.startRuntime({
      sessionId: "session-1",
      projectId: "pig",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
    });
    const state = await client.createPiSessionState({
      runtimeId: runtime.runtimeId,
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const observedEvents: unknown[] = [];

    client.subscribeToEvents(state.piSessionId, (event) => {
      observedEvents.push(event);
    });
    eventHandlers[0]?.({
      type: "event",
      event: {
        id: "evt-thinking-1",
        seq: 1,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "message_update",
        ts: "2026-06-29T12:00:01.000Z",
        payload: {
          kind: "thinking",
          role: "assistant",
          body: "Inspect context first.",
          messageId: "pi-sdk:pi-session-1:assistant:0",
          phase: "delta",
        },
      },
    });
    eventHandlers[0]?.({
      type: "event",
      event: {
        id: "evt-tool-result-1",
        seq: 2,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "tool_execution_update",
        ts: "2026-06-29T12:00:02.000Z",
        payload: {
          kind: "tool-result",
          title: "read",
          body: "Agent instructions",
          toolCallId: "tool-call-1",
          phase: "final",
        },
      },
    });

    expect(observedEvents).toEqual([
      expect.objectContaining({
        id: "evt-thinking-1",
        kind: "thinking",
        role: "assistant",
        messageId: "pi-sdk:pi-session-1:assistant:0",
        phase: "delta",
        body: "Inspect context first.",
      }),
      expect.objectContaining({
        id: "evt-tool-result-1",
        kind: "tool-result",
        title: "read",
        toolCallId: "tool-call-1",
        phase: "final",
        body: "Agent instructions",
      }),
    ]);
  });

  it("maps Agent Runtime Event Model payloads to legacy runtime events for the current UI", async () => {
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const snapshot: RuntimeGatewaySnapshot = {
      sessionId: "session-1",
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
      status: "idle",
      events: [],
      updatedAt: "2026-06-29T12:00:00.000Z",
    };
    const client = createRuntimeGatewayClient({
      invoke: async <T,>(command: string) => {
        if (command === "create_session" || command === "get_runtime_snapshot") {
          return snapshot as T;
        }

        throw new Error(`unexpected command ${command}`);
      },
      onBackendEvent: (handler) => {
        eventHandlers.push(handler);

        return vi.fn();
      },
    });
    const runtime = await client.startRuntime({
      sessionId: "session-1",
      projectId: "pig",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
    });
    const state = await client.createPiSessionState({
      runtimeId: runtime.runtimeId,
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const observedEvents: unknown[] = [];

    client.subscribeToEvents(state.piSessionId, (event) => {
      observedEvents.push(event);
    });

    const runId = "pi-session-1:run-1";
    const turnId = `${runId}:turn-1`;
    const messageId = `${turnId}:msg-1`;
    const partId = `${messageId}:part-0`;
    const agentEnvelopes: RuntimeGatewayEventEnvelope[] = [
      {
        id: "evt-1",
        seq: 1,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "run",
        ts: "2026-06-29T12:00:01.000Z",
        payload: { type: "run", runId, phase: "start", trigger: "prompt", surface: "hidden", origin: "sdk" },
      },
      {
        id: "evt-2",
        seq: 2,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        turnId,
        type: "turn",
        ts: "2026-06-29T12:00:02.000Z",
        payload: { type: "turn", runId, turnId, phase: "start", surface: "hidden", origin: "sdk" },
      },
      {
        id: "evt-3",
        seq: 3,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        turnId,
        type: "message",
        ts: "2026-06-29T12:00:03.000Z",
        payload: {
          type: "message",
          runId,
          turnId,
          messageId,
          role: "assistant",
          phase: "start",
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        id: "evt-4",
        seq: 4,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        turnId,
        type: "message_part",
        ts: "2026-06-29T12:00:04.000Z",
        payload: {
          type: "message_part",
          runId,
          turnId,
          messageId,
          partId,
          partType: "text",
          phase: "update",
          bodyMode: "delta",
          body: "Hel",
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        id: "evt-5",
        seq: 5,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        turnId,
        type: "message_part",
        ts: "2026-06-29T12:00:05.000Z",
        payload: {
          type: "message_part",
          runId,
          turnId,
          messageId,
          partId,
          partType: "text",
          phase: "update",
          bodyMode: "delta",
          body: "lo",
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        id: "evt-6",
        seq: 6,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        turnId,
        type: "message_part",
        ts: "2026-06-29T12:00:06.000Z",
        payload: {
          type: "message_part",
          runId,
          turnId,
          messageId,
          partId,
          partType: "text",
          phase: "end",
          bodyMode: "snapshot",
          body: "Hello",
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        id: "evt-7",
        seq: 7,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        turnId,
        type: "message",
        ts: "2026-06-29T12:00:07.000Z",
        payload: {
          type: "message",
          runId,
          turnId,
          messageId,
          role: "assistant",
          phase: "end",
          parts: [{ partId, partType: "text", body: "Hello" }],
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        id: "evt-8",
        seq: 8,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        turnId,
        type: "tool",
        ts: "2026-06-29T12:00:08.000Z",
        payload: {
          type: "tool",
          runId,
          turnId,
          toolCallId: "call-1",
          phase: "start",
          name: "read_file",
          args: { path: "a.ts" },
          surface: "trace",
          origin: "sdk",
        },
      },
      {
        id: "evt-9",
        seq: 9,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        turnId,
        type: "tool",
        ts: "2026-06-29T12:00:09.000Z",
        payload: {
          type: "tool",
          runId,
          turnId,
          toolCallId: "call-1",
          phase: "end",
          name: "read_file",
          result: { ok: true },
          isError: false,
          surface: "trace",
          origin: "sdk",
        },
      },
      {
        id: "evt-10",
        seq: 10,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "status",
        ts: "2026-06-29T12:00:10.000Z",
        payload: {
          type: "status",
          runId,
          code: "retrying",
          body: "stream disconnected",
          surface: "trace",
          origin: "sdk",
        },
      },
      {
        id: "evt-11",
        seq: 11,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "run",
        ts: "2026-06-29T12:00:11.000Z",
        payload: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "completed",
          surface: "hidden",
          origin: "sdk",
        },
      },
    ];

    for (const envelope of agentEnvelopes) {
      eventHandlers[0]?.({ type: "event", event: envelope });
    }

    expect(observedEvents).toEqual([
      {
        id: "evt-4",
        piSessionId: "pi-session-1",
        kind: "message",
        role: "assistant",
        messageId,
        body: "Hel",
        bodyFormat: "full",
        phase: "delta",
        derivedFromAgentEvent: true,
        timestamp: "2026-06-29T12:00:04.000Z",
      },
      {
        id: "evt-5",
        piSessionId: "pi-session-1",
        kind: "message",
        role: "assistant",
        messageId,
        body: "Hello",
        bodyFormat: "full",
        phase: "delta",
        derivedFromAgentEvent: true,
        timestamp: "2026-06-29T12:00:05.000Z",
      },
      {
        id: "evt-6",
        piSessionId: "pi-session-1",
        kind: "message",
        role: "assistant",
        messageId,
        body: "Hello",
        bodyFormat: "full",
        phase: "final",
        derivedFromAgentEvent: true,
        timestamp: "2026-06-29T12:00:06.000Z",
      },
      {
        id: "evt-8",
        piSessionId: "pi-session-1",
        kind: "tool-call",
        title: "read_file",
        toolCallId: "call-1",
        body: '{"path":"a.ts"}',
        phase: "partial",
        derivedFromAgentEvent: true,
        timestamp: "2026-06-29T12:00:08.000Z",
      },
      {
        id: "evt-9",
        piSessionId: "pi-session-1",
        kind: "tool-result",
        title: "read_file",
        toolCallId: "call-1",
        body: '{"ok":true}',
        phase: "final",
        derivedFromAgentEvent: true,
        timestamp: "2026-06-29T12:00:09.000Z",
      },
      {
        id: "evt-10",
        piSessionId: "pi-session-1",
        kind: "status",
        title: "Retrying",
        body: "stream disconnected",
        derivedFromAgentEvent: true,
        timestamp: "2026-06-29T12:00:10.000Z",
      },
      {
        id: "evt-11",
        piSessionId: "pi-session-1",
        kind: "status",
        title: "Completed",
        body: "Pi SDK runtime ended the active run.",
        derivedFromAgentEvent: true,
        timestamp: "2026-06-29T12:00:11.000Z",
      },
    ]);
  });

  it("keeps a failed Active Run failed: maps the chat error and drops the failed run end", async () => {
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const snapshot: RuntimeGatewaySnapshot = {
      sessionId: "session-1",
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
      status: "idle",
      events: [],
      updatedAt: "2026-06-29T12:00:00.000Z",
    };
    const client = createRuntimeGatewayClient({
      invoke: async <T,>(command: string) => {
        if (command === "create_session" || command === "get_runtime_snapshot") {
          return snapshot as T;
        }

        throw new Error(`unexpected command ${command}`);
      },
      onBackendEvent: (handler) => {
        eventHandlers.push(handler);

        return vi.fn();
      },
    });
    const runtime = await client.startRuntime({
      sessionId: "session-1",
      projectId: "pig",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
    });
    const state = await client.createPiSessionState({
      runtimeId: runtime.runtimeId,
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const observedEvents: unknown[] = [];

    client.subscribeToEvents(state.piSessionId, (event) => {
      observedEvents.push(event);
    });

    eventHandlers[0]?.({
      type: "event",
      event: {
        id: "evt-error",
        seq: 1,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "error",
        ts: "2026-06-29T12:00:01.000Z",
        payload: {
          type: "error",
          runId: "pi-session-1:run-1",
          code: "run_error",
          body: "model overloaded",
          surface: "chat",
          origin: "sdk",
        },
      },
    });
    eventHandlers[0]?.({
      type: "event",
      event: {
        id: "evt-run-end",
        seq: 2,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "run",
        ts: "2026-06-29T12:00:02.000Z",
        payload: {
          type: "run",
          runId: "pi-session-1:run-1",
          phase: "end",
          trigger: "prompt",
          outcome: "failed",
          surface: "hidden",
          origin: "sdk",
        },
      },
    });

    expect(observedEvents).toEqual([
      {
        id: "evt-error",
        piSessionId: "pi-session-1",
        kind: "error",
        title: "Run failed",
        body: "model overloaded",
        derivedFromAgentEvent: true,
        timestamp: "2026-06-29T12:00:01.000Z",
      },
    ]);
  });

  it("rebuilds a seq-ordered replay sequence from the snapshot's journaled events", async () => {
    const runId = "pi-session-1:run-1";
    const turnId = `${runId}:turn-1`;
    const messageId = `${turnId}:msg-1`;
    const partId = `${messageId}:part-0`;
    const runStartPayload = {
      type: "run",
      runId,
      phase: "start",
      trigger: "prompt",
      surface: "hidden",
      origin: "sdk",
    };
    const partEndPayload = {
      type: "message_part",
      runId,
      turnId,
      messageId,
      partId,
      partType: "text",
      phase: "end",
      bodyMode: "snapshot",
      body: "Hello.",
      surface: "chat",
      origin: "sdk",
    };
    const messageEndPayload = {
      type: "message",
      runId,
      turnId,
      messageId,
      role: "assistant",
      phase: "end",
      parts: [{ partId, partType: "text", body: "Hello." }],
      surface: "chat",
      origin: "sdk",
    };
    const runEndPayload = {
      type: "run",
      runId,
      phase: "end",
      trigger: "prompt",
      outcome: "completed",
      surface: "hidden",
      origin: "sdk",
    };
    const snapshot: RuntimeGatewaySnapshot = {
      sessionId: "session-1",
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
      status: "completed",
      events: [
        {
          id: "evt-user",
          seq: 1,
          sessionId: "session-1",
          piSessionId: "pi-session-1",
          type: "message_update",
          ts: "2026-07-03T10:00:01.000Z",
          payload: { kind: "message", role: "user", body: "Fix the bug" },
        },
        {
          id: "evt-run-start",
          seq: 2,
          sessionId: "session-1",
          piSessionId: "pi-session-1",
          type: "run",
          ts: "2026-07-03T10:00:02.000Z",
          payload: runStartPayload,
        },
        {
          id: "evt-part-end",
          seq: 3,
          sessionId: "session-1",
          piSessionId: "pi-session-1",
          turnId,
          type: "message_part",
          ts: "2026-07-03T10:00:03.000Z",
          payload: partEndPayload,
        },
        {
          id: "evt-message-end",
          seq: 4,
          sessionId: "session-1",
          piSessionId: "pi-session-1",
          turnId,
          type: "message",
          ts: "2026-07-03T10:00:04.000Z",
          payload: messageEndPayload,
        },
        {
          id: "evt-run-end",
          seq: 5,
          sessionId: "session-1",
          piSessionId: "pi-session-1",
          type: "run",
          ts: "2026-07-03T10:00:05.000Z",
          payload: runEndPayload,
        },
      ],
      updatedAt: "2026-07-03T10:00:05.000Z",
    };
    const client = createRuntimeGatewayClient({
      invoke: async <T,>(command: string) => {
        if (command === "get_runtime_snapshot") {
          return snapshot as T;
        }

        throw new Error(`unexpected command ${command}`);
      },
      onBackendEvent: () => vi.fn(),
    });

    const state = await client.getSessionState("pi-session-1");

    // The mixed replay sequence keeps Gateway seq order so the projection can
    // interleave agent events and Gateway-minted chat events faithfully.
    expect(state.replay).toEqual([
      {
        kind: "chat",
        seq: 1,
        event: expect.objectContaining({
          id: "evt-user",
          kind: "message",
          role: "user",
          body: "Fix the bug",
        }),
      },
      {
        kind: "agent",
        entry: { seq: 2, timestamp: "2026-07-03T10:00:02.000Z", event: runStartPayload },
      },
      {
        kind: "agent",
        entry: { seq: 3, timestamp: "2026-07-03T10:00:03.000Z", event: partEndPayload },
      },
      {
        kind: "agent",
        entry: { seq: 4, timestamp: "2026-07-03T10:00:04.000Z", event: messageEndPayload },
      },
      {
        kind: "agent",
        entry: { seq: 5, timestamp: "2026-07-03T10:00:05.000Z", event: runEndPayload },
      },
    ]);
    // The legacy folded view stays intact for the fallback rendering path.
    expect(state.events).toEqual([
      expect.objectContaining({ id: "evt-user", kind: "message", role: "user" }),
      expect.objectContaining({
        id: "evt-part-end",
        kind: "message",
        body: "Hello.",
        derivedFromAgentEvent: true,
      }),
      expect.objectContaining({ id: "evt-run-end", kind: "status", title: "Completed" }),
    ]);
  });

  it("exposes the Agent Runtime Event stream with seq for the structured projection", async () => {
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const snapshot: RuntimeGatewaySnapshot = {
      sessionId: "session-1",
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
      status: "idle",
      events: [],
      updatedAt: "2026-06-29T12:00:00.000Z",
    };
    const client = createRuntimeGatewayClient({
      invoke: async <T,>(command: string) => {
        if (command === "create_session" || command === "get_runtime_snapshot") {
          return snapshot as T;
        }

        throw new Error(`unexpected command ${command}`);
      },
      onBackendEvent: (handler) => {
        eventHandlers.push(handler);

        return vi.fn();
      },
    });

    await client.startRuntime({
      sessionId: "session-1",
      projectId: "pig",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
    });

    const observedEntries: unknown[] = [];

    client.subscribeToAgentEvents?.("pi-session-1", (entry) => {
      observedEntries.push(entry);
    });

    const runPayload = {
      type: "run",
      runId: "pi-session-1:run-1",
      phase: "start",
      trigger: "prompt",
      surface: "hidden",
      origin: "sdk",
    };

    eventHandlers[0]?.({
      type: "event",
      event: {
        id: "evt-run",
        seq: 7,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "run",
        ts: "2026-06-29T12:00:01.000Z",
        payload: runPayload,
      },
    });
    // Legacy command-echo envelopes never reach the agent event stream.
    eventHandlers[0]?.({
      type: "event",
      event: {
        id: "evt-legacy",
        seq: 8,
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        type: "message_update",
        ts: "2026-06-29T12:00:02.000Z",
        payload: { kind: "message", role: "user", body: "Hello Pi" },
      },
    });

    expect(observedEntries).toEqual([
      {
        seq: 7,
        timestamp: "2026-06-29T12:00:01.000Z",
        event: runPayload,
      },
    ]);
  });
});
