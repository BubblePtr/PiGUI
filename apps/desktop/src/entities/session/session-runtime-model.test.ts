import { describe, expect, it } from "vitest";
import type { AgentRuntimeEvent } from "@pigui/core";
import {
  applyAgentRuntimeEvent,
  createSessionRuntimeModel,
  sessionStatusFromRuntimeModel,
  type SessionRuntimeModel,
} from "./session-runtime-model";

// The structured query model per the design doc §7: upsert keys come from
// protocol identity, ordering comes from Gateway seq, and Session Status is
// decided by run/error events only.

const runId = "pi-session-1:run-1";
const turnId = `${runId}:turn-1`;
const messageId = `${turnId}:msg-1`;
const partId = `${messageId}:part-0`;

function applyAll(
  model: SessionRuntimeModel,
  entries: Array<{ seq: number; timestamp: string; event: AgentRuntimeEvent }>,
): SessionRuntimeModel {
  return entries.reduce(
    (current, entry) => applyAgentRuntimeEvent(current, entry),
    model,
  );
}

describe("session runtime model", () => {
  it("assembles a streamed text answer into one keyed message and derives status from the Active Run", () => {
    let model = createSessionRuntimeModel();

    model = applyAll(model, [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: { type: "run", runId, phase: "start", trigger: "prompt", surface: "hidden", origin: "sdk" },
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: { type: "turn", runId, turnId, phase: "start", surface: "hidden", origin: "sdk" },
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: {
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
        seq: 4,
        timestamp: "2026-07-02T10:00:04.000Z",
        event: {
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
        seq: 5,
        timestamp: "2026-07-02T10:00:05.000Z",
        event: {
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
    ]);

    expect(sessionStatusFromRuntimeModel(model)).toBe("running");

    const streamingMessage = model.messages.get(messageId);

    expect(streamingMessage).toMatchObject({
      messageId,
      role: "assistant",
      runId,
      turnId,
      phase: "streaming",
      parts: [{ partId, partType: "text", body: "Hello", done: false }],
    });

    model = applyAll(model, [
      {
        seq: 6,
        timestamp: "2026-07-02T10:00:06.000Z",
        event: {
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
        seq: 7,
        timestamp: "2026-07-02T10:00:07.000Z",
        event: {
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
        seq: 8,
        timestamp: "2026-07-02T10:00:08.000Z",
        event: { type: "turn", runId, turnId, phase: "end", surface: "hidden", origin: "sdk" },
      },
      {
        seq: 9,
        timestamp: "2026-07-02T10:00:09.000Z",
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
    ]);

    expect(sessionStatusFromRuntimeModel(model)).toBe("completed");
    expect(model.messages.get(messageId)).toMatchObject({
      phase: "final",
      parts: [{ partId, partType: "text", body: "Hello", done: true }],
    });
    expect(model.runs.get(runId)).toMatchObject({
      trigger: "prompt",
      outcome: "completed",
      startedAt: "2026-07-02T10:00:01.000Z",
      endedAt: "2026-07-02T10:00:09.000Z",
    });
    expect(model.order).toEqual([{ kind: "message", id: messageId, seq: 3 }]);
  });

  it("keeps Session Status owned by run events: a retrying status never completes the session", () => {
    let model = createSessionRuntimeModel();

    model = applyAll(model, [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: { type: "run", runId, phase: "start", trigger: "prompt", surface: "hidden", origin: "sdk" },
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "status",
          runId,
          code: "retrying",
          body: "stream disconnected",
          surface: "trace",
          origin: "sdk",
        },
      },
    ]);

    expect(sessionStatusFromRuntimeModel(model)).toBe("running");
    expect(model.statuses).toEqual([
      {
        code: "retrying",
        body: "stream disconnected",
        runId,
        at: "2026-07-02T10:00:02.000Z",
      },
    ]);
    expect(model.order).toEqual([{ kind: "status", id: "status-2", seq: 2 }]);
  });

  it("merges the announced tool_call part with tool execution: validated args win, result comes from execution", () => {
    let model = createSessionRuntimeModel();

    model = applyAll(model, [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: { type: "run", runId, phase: "start", trigger: "prompt", surface: "hidden", origin: "sdk" },
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
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
      },
    ]);

    expect(model.tools.get("call-1")).toMatchObject({
      toolCallId: "call-1",
      phase: "announced",
      argsText: '{"path":"a.ts"}',
    });

    model = applyAll(model, [
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: {
          type: "tool",
          runId,
          turnId,
          toolCallId: "call-1",
          phase: "start",
          name: "read_file",
          args: { path: "a.ts", validated: true },
          surface: "trace",
          origin: "sdk",
        },
      },
      {
        seq: 4,
        timestamp: "2026-07-02T10:00:04.000Z",
        event: {
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
    ]);

    expect(model.tools.get("call-1")).toMatchObject({
      toolCallId: "call-1",
      phase: "done",
      name: "read_file",
      argsText: '{"path":"a.ts"}',
      args: { path: "a.ts", validated: true },
      result: { ok: true },
      isError: false,
    });
    expect(model.order).toEqual([
      { kind: "message", id: messageId, seq: 2 },
      { kind: "tool", id: "call-1", seq: 2 },
    ]);
  });

  it("fails the session on a run error even when a later run end reports completed", () => {
    let model = createSessionRuntimeModel();

    model = applyAll(model, [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: { type: "run", runId, phase: "start", trigger: "prompt", surface: "hidden", origin: "sdk" },
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "error",
          runId,
          code: "run_error",
          body: "model overloaded",
          surface: "chat",
          origin: "sdk",
        },
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "failed",
          surface: "hidden",
          origin: "sdk",
        },
      },
    ]);

    expect(sessionStatusFromRuntimeModel(model)).toBe("failed");
    expect(model.errors).toEqual([
      {
        code: "run_error",
        body: "model overloaded",
        runId,
        at: "2026-07-02T10:00:02.000Z",
      },
    ]);
  });

  it("ignores replayed events at or below the last applied seq", () => {
    let model = createSessionRuntimeModel();
    const runStart = {
      seq: 1,
      timestamp: "2026-07-02T10:00:01.000Z",
      event: {
        type: "run",
        runId,
        phase: "start",
        trigger: "prompt",
        surface: "hidden",
        origin: "sdk",
      } satisfies AgentRuntimeEvent,
    };

    model = applyAgentRuntimeEvent(model, runStart);

    const replayed = applyAgentRuntimeEvent(model, runStart);

    expect(replayed).toBe(model);
  });
});
