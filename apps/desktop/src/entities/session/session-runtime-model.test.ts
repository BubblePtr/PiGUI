import { describe, expect, it } from "vitest";
import type { AgentRuntimeEvent } from "@pigui/core";
import {
  addLegacyChatEventToModel,
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
      // Execution timing: startedAt pinned at phase start, kept through end.
      startedAt: "2026-07-02T10:00:03.000Z",
      updatedAt: "2026-07-02T10:00:04.000Z",
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

  it("mirrors Gateway-minted legacy chat events without advancing the agent seq watermark", () => {
    let model = createSessionRuntimeModel();

    // The user echo is minted at command accept, before the run starts.
    model = addLegacyChatEventToModel(model, {
      id: "user-echo-1",
      kind: "message",
      role: "user",
      body: "Ship the slice",
      messageId: "pi-sdk:pi-session-1:user:0",
      timestamp: "2026-07-02T10:00:00.500Z",
    });

    expect(model.lastSeq).toBe(0);
    expect(model.messages.get("pi-sdk:pi-session-1:user:0")).toMatchObject({
      role: "user",
      phase: "final",
      parts: [{ partType: "text", body: "Ship the slice" }],
    });

    // The following agent event is not treated as a replay.
    model = applyAgentRuntimeEvent(model, {
      seq: 1,
      timestamp: "2026-07-02T10:00:01.000Z",
      event: { type: "run", runId, phase: "start", trigger: "prompt", surface: "hidden", origin: "sdk" },
    });

    expect(model.runs.get(runId)).toBeDefined();
    // The mirrored user message orders before the run's first agent event.
    expect(model.order.map((entry) => entry.id)).toEqual([
      "pi-sdk:pi-session-1:user:0",
    ]);
    expect(model.order[0]?.seq).toBeLessThan(1);

    // A steer control echo mid-run keeps its control label and lands after
    // the latest agent event.
    model = addLegacyChatEventToModel(model, {
      id: "steer-echo-1",
      kind: "control",
      role: "user",
      title: "Steer",
      body: "Focus on tests",
      timestamp: "2026-07-02T10:00:02.000Z",
    });

    expect(model.messages.get("steer-echo-1")).toMatchObject({
      role: "user",
      controlLabel: "Steer",
      parts: [{ partType: "text", body: "Focus on tests" }],
    });
    expect(model.order.map((entry) => entry.id)).toEqual([
      "pi-sdk:pi-session-1:user:0",
      "steer-echo-1",
    ]);
    expect(model.order[1]?.seq).toBeGreaterThan(1);

    // Mirroring the same echo twice upserts instead of duplicating.
    const remirrored = addLegacyChatEventToModel(model, {
      id: "steer-echo-1",
      kind: "control",
      role: "user",
      title: "Steer",
      body: "Focus on tests",
      timestamp: "2026-07-02T10:00:02.000Z",
    });

    expect(remirrored.order).toHaveLength(2);
  });

  it("mirrors image parts from a Gateway-minted user echo", () => {
    const model = addLegacyChatEventToModel(createSessionRuntimeModel(), {
      id: "user-echo-image",
      kind: "message",
      role: "user",
      body: "Look at this",
      messageId: "pi-sdk:pi-session-1:user:1",
      timestamp: "2026-07-02T10:00:00.600Z",
      images: [{ mimeType: "image/png", data: "abc", name: "shot.png" }],
    });

    expect(model.messages.get("pi-sdk:pi-session-1:user:1")).toMatchObject({
      role: "user",
      parts: [
        { partType: "text", body: "Look at this" },
        {
          partType: "image",
          body: "data:image/png;base64,abc",
          done: true,
          name: "shot.png",
        },
      ],
    });
  });

  it("keeps distinct user turns when synthetic user:0 is reused with a new piEntryId (DF-008)", () => {
    let model = createSessionRuntimeModel();

    model = addLegacyChatEventToModel(model, {
      id: "user-1",
      kind: "message",
      role: "user",
      body: "First turn",
      messageId: "pi-sdk:pi-session-1:user:0",
      piEntryId: "entry-a",
      timestamp: "2026-07-30T05:52:27.489Z",
    });
    model = addLegacyChatEventToModel(model, {
      id: "user-3",
      kind: "message",
      role: "user",
      body: "Third turn after resume",
      messageId: "pi-sdk:pi-session-1:user:0",
      piEntryId: "entry-c",
      timestamp: "2026-08-01T10:53:25.679Z",
    });

    expect(model.messages.get("pi-sdk:pi-session-1:user:0")).toMatchObject({
      parts: [{ body: "First turn" }],
      piEntryId: "entry-a",
    });
    expect(model.messages.get("pi-sdk:pi-session-1:user:0#entry-c")).toMatchObject({
      parts: [{ body: "Third turn after resume" }],
      piEntryId: "entry-c",
    });
    expect(model.order.map((entry) => entry.id)).toEqual([
      "pi-sdk:pi-session-1:user:0",
      "pi-sdk:pi-session-1:user:0#entry-c",
    ]);
  });

  it("does not erase a finalized assistant answer when the same messageId is reused empty (DF-008)", () => {
    let model = createSessionRuntimeModel();
    const messageId = `${runId}:turn-1:msg-1`;

    model = applyAgentRuntimeEvent(model, {
      seq: 1,
      timestamp: "2026-07-30T05:52:27.761Z",
      event: {
        type: "message",
        runId,
        turnId: `${runId}:turn-1`,
        messageId,
        role: "assistant",
        phase: "start",
        surface: "chat",
        origin: "sdk",
      },
    });
    model = applyAgentRuntimeEvent(model, {
      seq: 2,
      timestamp: "2026-07-30T05:52:46.094Z",
      event: {
        type: "message",
        runId,
        turnId: `${runId}:turn-1`,
        messageId,
        role: "assistant",
        phase: "end",
        parts: [{ partId: `${messageId}:part-0`, partType: "text", body: "Kakeya answer" }],
        surface: "chat",
        origin: "sdk",
      },
    });
    model = applyAgentRuntimeEvent(model, {
      seq: 3,
      timestamp: "2026-08-01T10:53:25.832Z",
      event: {
        type: "message",
        runId,
        turnId: `${runId}:turn-1`,
        messageId,
        role: "assistant",
        phase: "start",
        surface: "chat",
        origin: "sdk",
      },
    });
    model = applyAgentRuntimeEvent(model, {
      seq: 4,
      timestamp: "2026-08-01T10:53:25.832Z",
      event: {
        type: "message",
        runId,
        turnId: `${runId}:turn-1`,
        messageId,
        role: "assistant",
        phase: "end",
        parts: [],
        surface: "chat",
        origin: "sdk",
      },
    });

    expect(model.messages.get(messageId)).toMatchObject({
      phase: "final",
      parts: [{ body: "Kakeya answer" }],
    });
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
