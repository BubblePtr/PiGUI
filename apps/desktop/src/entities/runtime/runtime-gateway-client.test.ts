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
});
