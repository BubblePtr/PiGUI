import { describe, expect, it } from "vitest";
import type { AgentRuntimeEvent } from "@pigui/core";
import { createAgentRuntimeEventNormalizer } from "./agent-runtime-event-normalizer";

// Contract tests for the Agent Runtime Event Model normalizer. Fixtures follow
// agent-core's AgentSessionEvent shapes (agent_start/turn_start/message_*/
// tool_execution_*); expected sequences are the worked examples from
// docs/research/agent-runtime-event-model-design.md §4-§5.

const piSessionId = "pi-session-1";

type Normalizer = ReturnType<typeof createAgentRuntimeEventNormalizer>;

function normalizeAll(normalizer: Normalizer, rawEvents: unknown[]): AgentRuntimeEvent[] {
  return rawEvents.flatMap((rawEvent) => normalizer.normalize(rawEvent));
}

describe("agent runtime event normalizer", () => {
  it("normalizes a prompt-triggered text stream into one Active Run, one Turn, one chat message with delta parts", () => {
    const normalizer = createAgentRuntimeEventNormalizer({ piSessionId });
    const streamingMessage = { role: "assistant", content: [] };
    const finalMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hello world" }],
      stopReason: "stop",
    };

    normalizer.noteRunTrigger("prompt");

    const events = normalizeAll(normalizer, [
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
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "Hello",
          partial: streamingMessage,
        },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: " world",
          partial: streamingMessage,
        },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: {
          type: "text_end",
          contentIndex: 0,
          content: "Hello world",
          partial: streamingMessage,
        },
      },
      { type: "message_end", message: finalMessage },
      { type: "turn_end", message: finalMessage, toolResults: [] },
      { type: "agent_end", messages: [finalMessage] },
    ]);

    const runId = "pi-session-1:run-1";
    const turnId = `${runId}:turn-1`;
    const messageId = `${turnId}:msg-1`;
    const partId = `${messageId}:part-0`;

    expect(events).toEqual([
      { type: "run", runId, phase: "start", trigger: "prompt", surface: "hidden", origin: "sdk" },
      { type: "turn", runId, turnId, phase: "start", surface: "hidden", origin: "sdk" },
      {
        type: "message",
        runId,
        turnId,
        messageId,
        role: "assistant",
        phase: "start",
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "message_part",
        runId,
        turnId,
        messageId,
        partId,
        partType: "text",
        phase: "start",
        bodyMode: "snapshot",
        body: "",
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "message_part",
        runId,
        turnId,
        messageId,
        partId,
        partType: "text",
        phase: "update",
        bodyMode: "delta",
        body: "Hello",
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "message_part",
        runId,
        turnId,
        messageId,
        partId,
        partType: "text",
        phase: "update",
        bodyMode: "delta",
        body: " world",
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "message_part",
        runId,
        turnId,
        messageId,
        partId,
        partType: "text",
        phase: "end",
        bodyMode: "snapshot",
        body: "Hello world",
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "message",
        runId,
        turnId,
        messageId,
        role: "assistant",
        phase: "end",
        parts: [{ partId, partType: "text", body: "Hello world" }],
        surface: "chat",
        origin: "sdk",
      },
      { type: "turn", runId, turnId, phase: "end", surface: "hidden", origin: "sdk" },
      {
        type: "run",
        runId,
        phase: "end",
        trigger: "prompt",
        outcome: "completed",
        surface: "hidden",
        origin: "sdk",
      },
    ]);
  });

  it("keeps thinking as a trace-surfaced part of the same chat message as the text answer", () => {
    const normalizer = createAgentRuntimeEventNormalizer({ piSessionId });
    const streamingMessage = { role: "assistant", content: [] };
    const finalMessage = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Plan: reply briefly" },
        { type: "text", text: "Hi" },
      ],
      stopReason: "stop",
    };

    const events = normalizeAll(normalizer, [
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: streamingMessage },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "thinking_start", contentIndex: 0, partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: {
          type: "thinking_delta",
          contentIndex: 0,
          delta: "Plan: reply briefly",
          partial: streamingMessage,
        },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: {
          type: "thinking_end",
          contentIndex: 0,
          content: "Plan: reply briefly",
          partial: streamingMessage,
        },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "text_start", contentIndex: 1, partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 1,
          delta: "Hi",
          partial: streamingMessage,
        },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: {
          type: "text_end",
          contentIndex: 1,
          content: "Hi",
          partial: streamingMessage,
        },
      },
      { type: "message_end", message: finalMessage },
      { type: "turn_end", message: finalMessage, toolResults: [] },
      { type: "agent_end", messages: [finalMessage] },
    ]);

    const messageId = "pi-session-1:run-1:turn-1:msg-1";
    const thinkingPartId = `${messageId}:part-0`;
    const textPartId = `${messageId}:part-1`;

    const thinkingParts = events.filter(
      (event) => event.type === "message_part" && event.partType === "thinking",
    );

    expect(thinkingParts).toEqual([
      {
        type: "message_part",
        runId: "pi-session-1:run-1",
        turnId: "pi-session-1:run-1:turn-1",
        messageId,
        partId: thinkingPartId,
        partType: "thinking",
        phase: "start",
        bodyMode: "snapshot",
        body: "",
        surface: "trace",
        origin: "sdk",
      },
      {
        type: "message_part",
        runId: "pi-session-1:run-1",
        turnId: "pi-session-1:run-1:turn-1",
        messageId,
        partId: thinkingPartId,
        partType: "thinking",
        phase: "update",
        bodyMode: "delta",
        body: "Plan: reply briefly",
        surface: "trace",
        origin: "sdk",
      },
      {
        type: "message_part",
        runId: "pi-session-1:run-1",
        turnId: "pi-session-1:run-1:turn-1",
        messageId,
        partId: thinkingPartId,
        partType: "thinking",
        phase: "end",
        bodyMode: "snapshot",
        body: "Plan: reply briefly",
        surface: "trace",
        origin: "sdk",
      },
    ]);

    const messageEnd = events.find(
      (event) => event.type === "message" && event.phase === "end",
    );

    expect(messageEnd).toMatchObject({
      messageId,
      parts: [
        { partId: thinkingPartId, partType: "thinking", body: "Plan: reply briefly" },
        { partId: textPartId, partType: "text", body: "Hi" },
      ],
    });
  });

  it("joins the message tool_call part and the tool execution lifecycle by native toolCallId", () => {
    const normalizer = createAgentRuntimeEventNormalizer({ piSessionId });
    const streamingMessage = { role: "assistant", content: [] };
    const toolCall = {
      type: "toolCall",
      id: "call-1",
      name: "read_file",
      arguments: { path: "a.ts" },
    };
    const finalMessage = {
      role: "assistant",
      content: [toolCall],
      stopReason: "toolUse",
    };

    const events = normalizeAll(normalizer, [
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: streamingMessage },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "toolcall_start", contentIndex: 0, partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: {
          type: "toolcall_delta",
          contentIndex: 0,
          delta: '{"path"',
          partial: streamingMessage,
        },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: {
          type: "toolcall_end",
          contentIndex: 0,
          toolCall,
          partial: streamingMessage,
        },
      },
      { type: "message_end", message: finalMessage },
      {
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "read_file",
        args: { path: "a.ts" },
      },
      {
        type: "tool_execution_update",
        toolCallId: "call-1",
        toolName: "read_file",
        args: { path: "a.ts" },
        partialResult: { content: [{ type: "text", text: "export" }] },
      },
      {
        type: "tool_execution_end",
        toolCallId: "call-1",
        toolName: "read_file",
        result: { content: [{ type: "text", text: "export const a = 1;" }] },
        isError: false,
      },
      { type: "turn_end", message: finalMessage, toolResults: [] },
      { type: "agent_end", messages: [finalMessage] },
    ]);

    const runId = "pi-session-1:run-1";
    const turnId = `${runId}:turn-1`;
    const messageId = `${turnId}:msg-1`;
    const partId = `${messageId}:part-0`;

    const toolCallParts = events.filter(
      (event) => event.type === "message_part" && event.partType === "tool_call",
    );

    expect(toolCallParts).toEqual([
      {
        type: "message_part",
        runId,
        turnId,
        messageId,
        partId,
        partType: "tool_call",
        phase: "start",
        bodyMode: "snapshot",
        body: "",
        surface: "trace",
        origin: "sdk",
      },
      {
        type: "message_part",
        runId,
        turnId,
        messageId,
        partId,
        partType: "tool_call",
        phase: "update",
        bodyMode: "delta",
        body: '{"path"',
        surface: "trace",
        origin: "sdk",
      },
      {
        type: "message_part",
        runId,
        turnId,
        messageId,
        partId,
        partType: "tool_call",
        phase: "end",
        bodyMode: "snapshot",
        body: '{"path":"a.ts"}',
        toolCallId: "call-1",
        surface: "trace",
        origin: "sdk",
      },
    ]);

    const messageEnd = events.find(
      (event) => event.type === "message" && event.phase === "end",
    );

    expect(messageEnd).toMatchObject({
      parts: [
        { partId, partType: "tool_call", body: '{"path":"a.ts"}', toolCallId: "call-1" },
      ],
    });

    const toolEvents = events.filter((event) => event.type === "tool");

    expect(toolEvents).toEqual([
      {
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
      {
        type: "tool",
        runId,
        turnId,
        toolCallId: "call-1",
        phase: "update",
        name: "read_file",
        args: { path: "a.ts" },
        result: { content: [{ type: "text", text: "export" }] },
        surface: "trace",
        origin: "sdk",
      },
      {
        type: "tool",
        runId,
        turnId,
        toolCallId: "call-1",
        phase: "end",
        name: "read_file",
        result: { content: [{ type: "text", text: "export const a = 1;" }] },
        isError: false,
        surface: "trace",
        origin: "sdk",
      },
    ]);
  });

  it("scopes Turn and message identity per turn across a multi-turn tool loop, ignoring toolResult transcript messages", () => {
    const normalizer = createAgentRuntimeEventNormalizer({ piSessionId });
    const streamingMessage = { role: "assistant", content: [] };
    const toolCall = {
      type: "toolCall",
      id: "call-1",
      name: "read_file",
      arguments: { path: "a.ts" },
    };
    const turnOneMessage = { role: "assistant", content: [toolCall], stopReason: "toolUse" };
    const toolResultMessage = {
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "read_file",
      content: [{ type: "text", text: "export const a = 1;" }],
      isError: false,
    };
    const turnTwoMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Done" }],
      stopReason: "stop",
    };

    const events = normalizeAll(normalizer, [
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "message_start", message: streamingMessage },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "toolcall_start", contentIndex: 0, partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "toolcall_end", contentIndex: 0, toolCall, partial: streamingMessage },
      },
      { type: "message_end", message: turnOneMessage },
      { type: "tool_execution_start", toolCallId: "call-1", toolName: "read_file", args: { path: "a.ts" } },
      {
        type: "tool_execution_end",
        toolCallId: "call-1",
        toolName: "read_file",
        result: { content: [{ type: "text", text: "export const a = 1;" }] },
        isError: false,
      },
      { type: "message_start", message: toolResultMessage },
      { type: "message_end", message: toolResultMessage },
      { type: "turn_end", message: turnOneMessage, toolResults: [toolResultMessage] },
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
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Done", partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "Done", partial: streamingMessage },
      },
      { type: "message_end", message: turnTwoMessage },
      { type: "turn_end", message: turnTwoMessage, toolResults: [] },
      { type: "agent_end", messages: [turnOneMessage, toolResultMessage, turnTwoMessage] },
    ]);

    const runId = "pi-session-1:run-1";

    const turnEvents = events.filter((event) => event.type === "turn");

    expect(turnEvents).toEqual([
      { type: "turn", runId, turnId: `${runId}:turn-1`, phase: "start", surface: "hidden", origin: "sdk" },
      { type: "turn", runId, turnId: `${runId}:turn-1`, phase: "end", surface: "hidden", origin: "sdk" },
      { type: "turn", runId, turnId: `${runId}:turn-2`, phase: "start", surface: "hidden", origin: "sdk" },
      { type: "turn", runId, turnId: `${runId}:turn-2`, phase: "end", surface: "hidden", origin: "sdk" },
    ]);

    // toolResult transcript messages never become chat messages — they only
    // exist to update the matched tool item.
    const messageStartIds = events.flatMap((event) =>
      event.type === "message" && event.phase === "start" ? [event.messageId] : [],
    );

    expect(messageStartIds).toEqual([
      `${runId}:turn-1:msg-1`,
      `${runId}:turn-2:msg-1`,
    ]);

    const toolEvents = events.filter((event) => event.type === "tool");

    expect(toolEvents.map((event) => event.turnId)).toEqual([
      `${runId}:turn-1`,
      `${runId}:turn-1`,
    ]);
  });

  it("keeps auto retry inside the same Active Run, abandoning the interrupted partial message explicitly", () => {
    const normalizer = createAgentRuntimeEventNormalizer({ piSessionId });
    const streamingMessage = { role: "assistant", content: [] };
    const finalMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      stopReason: "stop",
    };

    const events = normalizeAll(normalizer, [
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
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hel", partial: streamingMessage },
      },
      { type: "auto_retry_start", errorMessage: "stream disconnected", attempt: 1 },
      { type: "auto_retry_end", success: true },
      { type: "message_start", message: streamingMessage },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "text_start", contentIndex: 0, partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello", partial: streamingMessage },
      },
      {
        type: "message_update",
        message: streamingMessage,
        assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "Hello", partial: streamingMessage },
      },
      { type: "message_end", message: finalMessage },
      { type: "turn_end", message: finalMessage, toolResults: [] },
      { type: "agent_end", messages: [finalMessage] },
    ]);

    const runId = "pi-session-1:run-1";
    const turnId = `${runId}:turn-1`;

    // Retry never opens a new Active Run.
    const runStarts = events.filter((event) => event.type === "run" && event.phase === "start");

    expect(runStarts).toHaveLength(1);

    const statusEvents = events.filter((event) => event.type === "status");

    expect(statusEvents).toEqual([
      {
        type: "status",
        runId,
        code: "retrying",
        body: "stream disconnected",
        surface: "trace",
        origin: "sdk",
      },
      { type: "status", runId, code: "retry_succeeded", surface: "trace", origin: "sdk" },
    ]);

    // The interrupted partial message is closed with an explicit abandoned
    // boundary so no consumer is left with dangling streaming state, and the
    // retried response is a new message in the same turn.
    const messageEvents = events.filter((event) => event.type === "message");

    expect(messageEvents).toEqual([
      {
        type: "message",
        runId,
        turnId,
        messageId: `${turnId}:msg-1`,
        role: "assistant",
        phase: "start",
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "message",
        runId,
        turnId,
        messageId: `${turnId}:msg-1`,
        role: "assistant",
        phase: "end",
        abandoned: true,
        parts: [{ partId: `${turnId}:msg-1:part-0`, partType: "text", body: "Hel" }],
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "message",
        runId,
        turnId,
        messageId: `${turnId}:msg-2`,
        role: "assistant",
        phase: "start",
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "message",
        runId,
        turnId,
        messageId: `${turnId}:msg-2`,
        role: "assistant",
        phase: "end",
        parts: [{ partId: `${turnId}:msg-2:part-0`, partType: "text", body: "Hello" }],
        surface: "chat",
        origin: "sdk",
      },
    ]);
  });

  it("closes the streaming message and ends the Active Run as aborted when the user stops mid-stream", () => {
    const normalizer = createAgentRuntimeEventNormalizer({ piSessionId });
    const streamingMessage = { role: "assistant", content: [] };
    const abortedMessage = {
      role: "assistant",
      content: [{ type: "text", text: "Working on it" }],
      stopReason: "aborted",
    };

    const events = normalizeAll(normalizer, [
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
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "Working on it",
          partial: streamingMessage,
        },
      },
      { type: "agent_end", messages: [abortedMessage] },
    ]);

    const runId = "pi-session-1:run-1";
    const turnId = `${runId}:turn-1`;

    // The interrupted message is closed (content stays visible — an abort is
    // not a retry) before the run ends, so no consumer holds streaming state.
    expect(events.slice(-2)).toEqual([
      {
        type: "message",
        runId,
        turnId,
        messageId: `${turnId}:msg-1`,
        role: "assistant",
        phase: "end",
        parts: [{ partId: `${turnId}:msg-1:part-0`, partType: "text", body: "Working on it" }],
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "run",
        runId,
        phase: "end",
        trigger: "unknown",
        outcome: "aborted",
        surface: "hidden",
        origin: "sdk",
      },
    ]);
  });

  it("surfaces a failed Active Run as a chat error with outcome failed", () => {
    const normalizer = createAgentRuntimeEventNormalizer({ piSessionId });
    const failedMessage = {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage: "model overloaded",
    };

    const events = normalizeAll(normalizer, [
      { type: "agent_start" },
      { type: "turn_start" },
      { type: "agent_end", messages: [failedMessage] },
    ]);

    const runId = "pi-session-1:run-1";

    expect(events.slice(-2)).toEqual([
      {
        type: "error",
        runId,
        code: "run_error",
        body: "model overloaded",
        surface: "chat",
        origin: "sdk",
      },
      {
        type: "run",
        runId,
        phase: "end",
        trigger: "unknown",
        outcome: "failed",
        surface: "hidden",
        origin: "sdk",
      },
    ]);
  });
});
