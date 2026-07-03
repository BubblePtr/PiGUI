import { describe, expect, it, vi } from "vitest";
import { createPublicPiSdkRuntimeFactory } from "./pi-sdk-runtime-adapter";

describe("Pi SDK public runtime adapter", () => {
  it("adapts a public SDK AgentSession to the PiRuntimeDriver runtime contract", async () => {
    const listeners: Array<(event: unknown) => void> = [];
    const prompt = vi.fn(async () => {});
    const session = {
      sessionId: "sdk-session-1",
      isStreaming: false,
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: "PIGUI_SDK_SPIKE_OK" }],
        },
      ],
      prompt,
      abort: vi.fn(async () => {}),
      dispose: vi.fn(),
      subscribe(listener: (event: unknown) => void) {
        listeners.push(listener);

        return vi.fn();
      },
    };
    const createAgentSession = vi.fn(async () => ({ session }));
    const runtimeFactory = createPublicPiSdkRuntimeFactory({
      sdk: { createAgentSession },
      now: () => "2026-07-01T00:00:00.000Z",
    });

    const runtime = await runtimeFactory({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });

    await runtime.sendPrompt("Reply with exactly: PIGUI_SDK_SPIKE_OK");

    await expect(runtime.getSnapshot?.()).resolves.toMatchObject({
      status: "completed",
    });
    runtime.dispose?.();
    expect(runtime.piSessionId).toBe("sdk-session-1");
    expect(createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/Users/void/code/opensource/Pig",
      }),
    );
    expect(createAgentSession).toHaveBeenCalledWith(
      expect.not.objectContaining({
        noTools: expect.anything(),
      }),
    );
    expect(prompt).toHaveBeenCalledWith("Reply with exactly: PIGUI_SDK_SPIKE_OK");
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("emits Agent Runtime Event Model payloads from the SDK subscription with prompt trigger attribution", async () => {
    const listeners: Array<(event: unknown) => void> = [];
    const session = {
      sessionId: "sdk-session-1",
      isStreaming: false,
      messages: [],
      prompt: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
      dispose: vi.fn(),
      subscribe(listener: (event: unknown) => void) {
        listeners.push(listener);

        return vi.fn();
      },
    };
    const runtimeFactory = createPublicPiSdkRuntimeFactory({
      sdk: { createAgentSession: vi.fn(async () => ({ session })) },
      now: () => "2026-07-01T00:00:00.000Z",
    });
    const runtime = await runtimeFactory({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const events: unknown[] = [];

    runtime.onEvent?.((event) => events.push(event));
    await runtime.sendPrompt("Go");

    const streamingMessage = { role: "assistant", content: [] };
    const finalMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hi" }],
      stopReason: "stop",
    };

    for (const rawEvent of [
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: streamingMessage },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "text_start", contentIndex: 0, partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hi", partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "Hi", partial: streamingMessage },
      },
      { type: "message_end", message: finalMessage },
      { type: "turn_end", message: finalMessage, toolResults: [] },
      { type: "agent_end", messages: [finalMessage] },
    ]) {
      listeners[0]?.(rawEvent);
    }

    const runId = "sdk-session-1:run-1";
    const turnId = `${runId}:turn-1`;
    const messageId = `${turnId}:msg-1`;
    const partId = `${messageId}:part-0`;
    const base = { runId, turnId, messageId, partId };

    expect(events).toEqual([
      {
        piSessionId: "sdk-session-1",
        type: "run",
        payload: { type: "run", runId, phase: "start", trigger: "prompt", surface: "hidden", origin: "sdk" },
      },
      {
        piSessionId: "sdk-session-1",
        turnId,
        type: "turn",
        payload: { type: "turn", runId, turnId, phase: "start", surface: "hidden", origin: "sdk" },
      },
      {
        piSessionId: "sdk-session-1",
        turnId,
        type: "message",
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
        piSessionId: "sdk-session-1",
        turnId,
        type: "message_part",
        payload: {
          type: "message_part",
          ...base,
          partType: "text",
          phase: "start",
          bodyMode: "snapshot",
          body: "",
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        piSessionId: "sdk-session-1",
        turnId,
        type: "message_part",
        payload: {
          type: "message_part",
          ...base,
          partType: "text",
          phase: "update",
          bodyMode: "delta",
          body: "Hi",
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        piSessionId: "sdk-session-1",
        turnId,
        type: "message_part",
        payload: {
          type: "message_part",
          ...base,
          partType: "text",
          phase: "end",
          bodyMode: "snapshot",
          body: "Hi",
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        piSessionId: "sdk-session-1",
        turnId,
        type: "message",
        payload: {
          type: "message",
          runId,
          turnId,
          messageId,
          role: "assistant",
          phase: "end",
          parts: [{ partId, partType: "text", body: "Hi" }],
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        piSessionId: "sdk-session-1",
        turnId,
        type: "turn",
        payload: { type: "turn", runId, turnId, phase: "end", surface: "hidden", origin: "sdk" },
      },
      {
        piSessionId: "sdk-session-1",
        type: "run",
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
    ]);
  });

  it("attributes the Active Run started by a queued follow-up to the follow_up trigger", async () => {
    const listeners: Array<(event: unknown) => void> = [];
    const session = {
      sessionId: "sdk-session-1",
      isStreaming: false,
      messages: [],
      prompt: vi.fn(async () => {}),
      followUp: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
      dispose: vi.fn(),
      subscribe(listener: (event: unknown) => void) {
        listeners.push(listener);

        return vi.fn();
      },
    };
    const runtimeFactory = createPublicPiSdkRuntimeFactory({
      sdk: { createAgentSession: vi.fn(async () => ({ session })) },
      now: () => "2026-07-01T00:00:00.000Z",
    });
    const runtime = await runtimeFactory({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const events: Array<{ payload?: Record<string, unknown> }> = [];

    runtime.onEvent?.((event) => events.push(event as { payload?: Record<string, unknown> }));
    await runtime.queueFollowUp?.("And then?");
    listeners[0]?.({ type: "agent_start" });

    expect(events).toEqual([
      {
        piSessionId: "sdk-session-1",
        type: "run",
        payload: {
          type: "run",
          runId: "sdk-session-1:run-1",
          phase: "start",
          trigger: "follow_up",
          surface: "hidden",
          origin: "sdk",
        },
      },
    ]);
  });

  it("maps public SDK queue, steer, stop, and usage stats into runtime semantics", async () => {
    const session = {
      sessionId: "sdk-session-1",
      isStreaming: false,
      messages: [],
      model: {
        provider: {
          id: "anthropic",
        },
        id: "claude-opus-4-5",
      },
      thinkingLevel: "high",
      prompt: vi.fn(async () => {}),
      followUp: vi.fn(async () => {}),
      steer: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
      clearQueue: vi.fn(() => ({
        steering: ["keep steering"],
        followUp: ["Queued follow-up", "Keep follow-up"],
      })),
      getSessionStats: vi.fn(() => ({
        sessionId: "sdk-session-1",
        tokens: {
          input: 10,
          output: 20,
          cacheRead: 3,
          cacheWrite: 4,
          total: 37,
        },
        cost: 0.0123,
      })),
      dispose: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    };
    const runtimeFactory = createPublicPiSdkRuntimeFactory({
      sdk: {
        createAgentSession: vi.fn(async () => ({ session })),
      },
      now: () => "2026-07-01T00:00:00.000Z",
    });
    const runtime = await runtimeFactory({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });

    await expect(runtime.queueFollowUp?.("Queued follow-up")).resolves.toEqual({
      id: "pi-sdk:sdk-session-1:queued:0",
      piSessionId: "sdk-session-1",
      body: "Queued follow-up",
      status: "pending",
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    await expect(
      runtime.withdrawQueuedMessage?.("pi-sdk:sdk-session-1:queued:0"),
    ).resolves.toMatchObject({
      id: "pi-sdk:sdk-session-1:queued:0",
      status: "withdrawn",
      withdrawnAt: "2026-07-01T00:00:00.000Z",
    });
    await runtime.steerRun?.("Steer now");
    await runtime.stopRun?.();

    await expect(runtime.getSnapshot?.()).resolves.toMatchObject({
      status: "completed",
      summary: {
        provider: "anthropic",
        model: "claude-opus-4-5",
        totalTokens: 37,
        totalCostUsd: 0.0123,
      },
    });
    expect(session.followUp).toHaveBeenNthCalledWith(1, "Queued follow-up");
    expect(session.followUp).toHaveBeenNthCalledWith(2, "Keep follow-up");
    expect(session.steer).toHaveBeenNthCalledWith(1, "keep steering");
    expect(session.steer).toHaveBeenNthCalledWith(2, "Steer now");
    expect(session.abort).toHaveBeenCalledTimes(1);
  });

  it("does not report a queued message withdrawn when the SDK queue no longer contains it", async () => {
    const session = {
      sessionId: "sdk-session-1",
      isStreaming: false,
      messages: [],
      prompt: vi.fn(async () => {}),
      followUp: vi.fn(async () => {}),
      steer: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
      clearQueue: vi.fn(() => ({
        steering: [],
        followUp: ["Other follow-up"],
      })),
      dispose: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    };
    const runtimeFactory = createPublicPiSdkRuntimeFactory({
      sdk: {
        createAgentSession: vi.fn(async () => ({ session })),
      },
      now: () => "2026-07-01T00:00:00.000Z",
    });
    const runtime = await runtimeFactory({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const queued = await runtime.queueFollowUp?.("Queued follow-up");

    await expect(runtime.withdrawQueuedMessage?.(queued?.id ?? "")).rejects.toThrow(
      'Pi SDK queued message "pi-sdk:sdk-session-1:queued:0" was not present in the follow-up queue.',
    );
    expect(session.followUp).toHaveBeenNthCalledWith(1, "Queued follow-up");
    expect(session.followUp).toHaveBeenNthCalledWith(2, "Other follow-up");
  });

  it("passes resource, auth, model registry, and model options through public createAgentSession", async () => {
    const session = {
      sessionId: "sdk-session-1",
      isStreaming: false,
      messages: [],
      prompt: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
      dispose: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    };
    const createAgentSession = vi.fn(async () => ({ session }));
    const authStorage = { kind: "auth" };
    const modelRegistry = { kind: "registry" };
    const resourceLoader = { kind: "resource-loader" };
    const model = { provider: "anthropic", id: "claude-opus-4-5" };
    const runtimeFactory = createPublicPiSdkRuntimeFactory({
      sdk: { createAgentSession },
      sessionOptions: {
        authStorage,
        modelRegistry,
        resourceLoader,
        model,
        thinkingLevel: "high",
        noTools: "builtin",
      },
    });

    await runtimeFactory({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });

    expect(createAgentSession).toHaveBeenCalledWith({
      authStorage,
      modelRegistry,
      resourceLoader,
      model,
      thinkingLevel: "high",
      cwd: "/Users/void/code/opensource/Pig",
      noTools: "builtin",
    });
  });

  it("does not disable SDK tools unless the caller explicitly requests it", async () => {
    const session = {
      sessionId: "sdk-session-1",
      isStreaming: false,
      messages: [],
      prompt: vi.fn(async () => {}),
      abort: vi.fn(async () => {}),
      dispose: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    };
    const createAgentSession = vi.fn(async () => ({ session }));
    const runtimeFactory = createPublicPiSdkRuntimeFactory({
      sdk: { createAgentSession },
    });

    await runtimeFactory({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });

    expect(createAgentSession).toHaveBeenCalledWith({
      cwd: "/Users/void/code/opensource/Pig",
    });
  });

});
