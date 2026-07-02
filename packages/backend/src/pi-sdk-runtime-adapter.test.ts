import { describe, expect, it, vi } from "vitest";
import {
  createPublicPiSdkRuntimeFactory,
  runtimeEventFromAgentSessionEvent,
} from "./pi-sdk-runtime-adapter";

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
    const events: unknown[] = [];

    runtime.onEvent?.((event) => events.push(event));
    listeners[0]?.({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "PIGUI_SDK_SPIKE_OK" }],
      },
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
    expect(events).toEqual([
      expect.objectContaining({
        piSessionId: "sdk-session-1",
        type: "message_update",
        payload: expect.objectContaining({
          kind: "message",
          role: "assistant",
          body: "PIGUI_SDK_SPIKE_OK",
        }),
      }),
    ]);
  });

  it("maps public SDK assistant text deltas to assistant message events", () => {
    expect(
      runtimeEventFromAgentSessionEvent({
        piSessionId: "sdk-session-1",
        now: () => "2026-07-01T00:00:00.000Z",
        event: {
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "PIGUI_SDK_SPIKE_OK",
          },
        },
      }),
    ).toMatchObject({
      piSessionId: "sdk-session-1",
      type: "message_update",
      payload: {
        kind: "message",
        role: "assistant",
        body: "PIGUI_SDK_SPIKE_OK",
        messageId: "pi-sdk:sdk-session-1:assistant:0",
        bodyFormat: "full",
      },
    });
  });

  it("maps public SDK assistant tool call events to tool trace events", () => {
    expect(
      runtimeEventFromAgentSessionEvent({
        piSessionId: "sdk-session-1",
        now: () => "2026-07-01T00:00:00.000Z",
        event: {
          type: "message_update",
          assistantMessageEvent: {
            type: "toolcall_end",
            contentIndex: 1,
            toolCall: {
              type: "toolCall",
              id: "tool-call-1",
              name: "read",
              arguments: { path: "AGENTS.md" },
            },
            partial: {
              role: "assistant",
              content: [
                { type: "text", text: "I will inspect the instructions." },
                {
                  type: "toolCall",
                  id: "tool-call-1",
                  name: "read",
                  arguments: { path: "AGENTS.md" },
                },
              ],
            },
          },
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "I will inspect the instructions." },
              {
                type: "toolCall",
                id: "tool-call-1",
                name: "read",
                arguments: { path: "AGENTS.md" },
              },
            ],
          },
        },
      }),
    ).toMatchObject({
      piSessionId: "sdk-session-1",
      type: "tool_execution_update",
      payload: {
        kind: "tool-call",
        title: "read",
        body: "{\"path\":\"AGENTS.md\"}",
      },
    });
  });

  it("drops SDK user message lifecycle events so send_prompt remains the only user projection event", () => {
    expect(
      runtimeEventFromAgentSessionEvent({
        piSessionId: "sdk-session-1",
        now: () => "2026-07-01T00:00:00.000Z",
        event: {
          type: "message_end",
          message: {
            role: "user",
            content: [{ type: "text", text: "Reply with exactly: PIGUI_SDK_SPIKE_OK" }],
          },
        },
      }),
    ).toBeNull();
  });

  it("normalizes assistant delta and final content to one synthetic message identity", async () => {
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
    const events: Array<{
      payload?: Record<string, unknown>;
    }> = [];

    runtime.onEvent?.((event) => events.push(event));
    listeners[0]?.({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "PIGUI_",
      },
    });
    listeners[0]?.({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "SDK_SPIKE_OK",
      },
    });
    listeners[0]?.({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "PIGUI_SDK_SPIKE_OK" }],
      },
    });

    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({
        role: "assistant",
        body: "PIGUI_",
        messageId: "pi-sdk:sdk-session-1:assistant:0",
        bodyFormat: "full",
        phase: "delta",
      }),
      expect.objectContaining({
        role: "assistant",
        body: "PIGUI_SDK_SPIKE_OK",
        messageId: "pi-sdk:sdk-session-1:assistant:0",
        bodyFormat: "full",
        phase: "delta",
      }),
    ]);
  });

  it("accumulates SDK message_update content fragments when no assistant delta marker is present", async () => {
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
    const events: Array<{
      payload?: Record<string, unknown>;
    }> = [];

    runtime.onEvent?.((event) => events.push(event));
    for (const text of ["We", " are", " done"]) {
      listeners[0]?.({
        type: "message_update",
        message: {
          role: "assistant",
          content: [{ type: "text", text }],
        },
      });
    }

    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({
        body: "We",
        messageId: "pi-sdk:sdk-session-1:assistant:0",
        bodyFormat: "full",
        phase: "partial",
      }),
      expect.objectContaining({
        body: "We are",
        messageId: "pi-sdk:sdk-session-1:assistant:0",
        bodyFormat: "full",
        phase: "partial",
      }),
      expect.objectContaining({
        body: "We are done",
        messageId: "pi-sdk:sdk-session-1:assistant:0",
        bodyFormat: "full",
        phase: "partial",
      }),
    ]);
  });

  it("maps SDK thinking deltas to trace events without leaking them into assistant text", async () => {
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
    const events: Array<{
      payload?: Record<string, unknown>;
    }> = [];

    runtime.onEvent?.((event) => events.push(event));
    listeners[0]?.({
      type: "message_update",
      assistantMessageEvent: {
        type: "thinking_delta",
        delta: "I should inspect the workspace first.",
      },
      message: {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "I should inspect the workspace first.",
          },
        ],
      },
    });
    listeners[0]?.({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Done.",
      },
      message: {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "I should inspect the workspace first.",
          },
          { type: "text", text: "Done." },
        ],
      },
    });

    expect(events.map((event) => event.payload)).toEqual([
      expect.objectContaining({
        kind: "thinking",
        role: "assistant",
        body: "I should inspect the workspace first.",
        messageId: "pi-sdk:sdk-session-1:assistant:0",
        bodyFormat: "full",
        phase: "delta",
      }),
      expect.objectContaining({
        kind: "message",
        role: "assistant",
        body: "Done.",
        messageId: "pi-sdk:sdk-session-1:assistant:0",
        bodyFormat: "full",
        phase: "delta",
      }),
    ]);
  });

  it("maps SDK tool execution end events to tool result trace events", () => {
    expect(
      runtimeEventFromAgentSessionEvent({
        piSessionId: "sdk-session-1",
        now: () => "2026-07-01T00:00:00.000Z",
        event: {
          type: "tool_execution_end",
          toolCallId: "tool-call-1",
          toolName: "read",
          result: { text: "Agent instructions" },
        },
      }),
    ).toMatchObject({
      piSessionId: "sdk-session-1",
      type: "tool_execution_update",
      payload: {
        kind: "tool-result",
        title: "read",
        toolCallId: "tool-call-1",
        body: "{\"text\":\"Agent instructions\"}",
        phase: "final",
      },
    });
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

  it("maps queue and retry lifecycle events to Gateway payloads", () => {
    expect(
      runtimeEventFromAgentSessionEvent({
        piSessionId: "sdk-session-1",
        event: {
          type: "queue_update",
          steering: ["steer"],
          followUp: ["follow"],
        },
      }),
    ).toMatchObject({
      piSessionId: "sdk-session-1",
      type: "queue_update",
      payload: {
        kind: "queue",
        steering: ["steer"],
        followUp: ["follow"],
      },
    });
    expect(
      runtimeEventFromAgentSessionEvent({
        piSessionId: "sdk-session-1",
        event: {
          type: "auto_retry_start",
          attempt: 1,
          maxAttempts: 3,
          errorMessage: "rate limited",
        },
      }),
    ).toMatchObject({
      piSessionId: "sdk-session-1",
      type: "status",
      payload: {
        kind: "status",
        title: "Retrying",
        body: "rate limited",
      },
    });
    expect(
      runtimeEventFromAgentSessionEvent({
        piSessionId: "sdk-session-1",
        event: {
          type: "compaction_start",
          reason: "threshold",
        },
      }),
    ).toMatchObject({
      piSessionId: "sdk-session-1",
      type: "status",
      payload: {
        kind: "status",
        title: "Compacting",
        body: "threshold",
      },
    });
    expect(
      runtimeEventFromAgentSessionEvent({
        piSessionId: "sdk-session-1",
        event: {
          type: "thinking_level_changed",
          level: "high",
        },
      }),
    ).toMatchObject({
      piSessionId: "sdk-session-1",
      type: "model_update",
      payload: {
        kind: "model",
        title: "Thinking level changed",
        thinkingLevel: "high",
      },
    });
  });
});
