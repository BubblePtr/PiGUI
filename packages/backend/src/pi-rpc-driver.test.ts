import { describe, expect, it } from "vitest";
import { createFakePiRpcTransport } from "@pigui/core/testing";
import { createPiRpcProcessDriver } from "./pi-rpc-driver";

describe("Pi RPC process driver", () => {
  it("adapts Pi RPC transport commands and raw events to Runtime Gateway driver events", async () => {
    const transport = createFakePiRpcTransport({
      sessionId: "pi-session-rpc",
      model: {
        provider: "openai",
        id: "gpt-5-codex",
      },
      now: () => "2026-06-29T12:00:00.000Z",
    });
    const driver = createPiRpcProcessDriver({
      transport,
      now: () => "2026-06-29T12:00:00.000Z",
    });
    const observedEvents: unknown[] = [];

    driver.onEvent((event) => observedEvents.push(event));

    const snapshot = await driver.createSession({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const accepted = await driver.sendPrompt({
      piSessionId: snapshot.piSessionId,
      prompt: "Create a Runtime Gateway session.",
    });

    // Fragments without their agent-core lifecycle are dropped instead of
    // guessed at — boundaries come from run/turn/message events only.
    transport.emitEvent({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Gateway session is ready." }],
        timestamp: 1_782_539_201_000,
      },
    });
    transport.emitEvent({
      type: "tool_execution_start",
      toolCallId: "tool-read-1",
      toolName: "read",
      args: { path: "README.md" },
    });

    expect(transport.startCalls).toEqual([
      {
        command: "pi",
        args: ["--mode", "rpc", "--session-id", "app-session-1"],
        cwd: "/Users/void/code/opensource/Pig",
      },
    ]);
    expect(transport.commands).toEqual([
      expect.objectContaining({ type: "get_state" }),
      expect.objectContaining({
        type: "prompt",
        message: "Create a Runtime Gateway session.",
      }),
    ]);
    expect(snapshot).toMatchObject({
      sessionId: "app-session-1",
      runtimeId: "pi-rpc:app-session-1",
      piSessionId: "pi-session-rpc",
      projectId: "pig",
      status: "idle",
      summary: {
        provider: "openai",
        model: "gpt-5-codex",
      },
    });
    expect(accepted).toMatchObject({
      piSessionId: "pi-session-rpc",
      type: "message_update",
      payload: {
        kind: "message",
        role: "user",
        body: "Create a Runtime Gateway session.",
      },
    });
    expect(observedEvents).toEqual([]);
  });

  it("emits Agent Runtime Event Model payloads with rpc origin and prompt trigger attribution", async () => {
    const transport = createFakePiRpcTransport({
      sessionId: "pi-session-rpc",
      now: () => "2026-07-03T08:00:00.000Z",
    });
    const driver = createPiRpcProcessDriver({
      transport,
      now: () => "2026-07-03T08:00:00.000Z",
    });
    const observedEvents: Array<{ type?: string; payload?: Record<string, unknown> }> = [];

    driver.onEvent((event) =>
      observedEvents.push(event as { type?: string; payload?: Record<string, unknown> }),
    );

    const snapshot = await driver.createSession({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });

    await driver.sendPrompt({
      piSessionId: snapshot.piSessionId,
      prompt: "Create a Runtime Gateway session.",
    });

    const streamingMessage = { role: "assistant", content: [] };
    const finalMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Ready." }],
      provider: "openai",
      model: "gpt-5-codex",
      usage: { totalTokens: 42, cost: { total: 0.001 } },
      stopReason: "stop",
    };

    transport.emitEvent({ type: "agent_start" });
    transport.emitEvent({ type: "turn_start" });
    transport.emitEvent({ type: "message_start", message: streamingMessage });
    transport.emitEvent({
      type: "message_update",
      message: streamingMessage,
      assistantMessageEvent: { type: "text_start", contentIndex: 0, partial: streamingMessage },
    });
    transport.emitEvent({
      type: "message_update",
      message: streamingMessage,
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "Ready.",
        partial: streamingMessage,
      },
    });
    transport.emitEvent({ type: "message_end", message: finalMessage });
    transport.emitEvent({ type: "turn_end", message: finalMessage, toolResults: [] });
    transport.emitEvent({ type: "agent_end", messages: [finalMessage] });

    const runId = "pi-session-rpc:run-1";

    expect(observedEvents.map((event) => event.type)).toEqual([
      "run",
      "turn",
      "message",
      "message_part",
      "message_part",
      "message",
      "usage",
      "turn",
      "run",
    ]);
    expect(observedEvents[0]?.payload).toEqual({
      type: "run",
      runId,
      phase: "start",
      trigger: "prompt",
      surface: "hidden",
      origin: "rpc",
    });
    expect(observedEvents[5]?.payload).toMatchObject({
      type: "message",
      messageId: `${runId}:turn-1:msg-1`,
      phase: "end",
      parts: [{ partType: "text", body: "Ready." }],
      origin: "rpc",
    });
    expect(observedEvents[6]?.payload).toMatchObject({
      type: "usage",
      runId,
      summary: {
        provider: "openai",
        model: "gpt-5-codex",
        totalTokens: 42,
        totalCostUsd: 0.001,
      },
      origin: "rpc",
    });
  });

  it("drops raw RPC user message lifecycle events so the prompt is projected once", async () => {
    const transport = createFakePiRpcTransport({
      sessionId: "pi-session-rpc",
      now: () => "2026-07-01T08:00:00.000Z",
    });
    const driver = createPiRpcProcessDriver({
      transport,
      now: () => "2026-07-01T08:00:00.000Z",
    });
    const observedEvents: unknown[] = [];

    driver.onEvent((event) => observedEvents.push(event));

    const snapshot = await driver.createSession({
      sessionId: "app-session-1",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });
    const accepted = await driver.sendPrompt({
      piSessionId: snapshot.piSessionId,
      prompt: "Why is the prompt duplicated?",
    });

    for (const type of ["message_start", "message_end"] as const) {
      transport.emitEvent({
        type,
        message: {
          role: "user",
          content: [{ type: "text", text: "Why is the prompt duplicated?" }],
          timestamp: 1_783_564_800_000,
        },
      });
    }

    expect(accepted).toMatchObject({
      type: "message_update",
      payload: {
        kind: "message",
        role: "user",
        body: "Why is the prompt duplicated?",
      },
    });
    expect(observedEvents).toEqual([]);
  });
});
