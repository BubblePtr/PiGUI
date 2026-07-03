// Structured query model for a session's Agent Runtime Event stream. Entities
// are keyed by protocol identity (runId/messageId/toolCallId), ordering comes
// from the Gateway seq, and Session Status is decided by run/error events
// only — status events never flip it. See docs/adr/0020-agent-runtime-event-model.md.

import type {
  AgentMessagePartType,
  AgentRuntimeEvent,
  AgentRunOutcome,
  AgentRunTrigger,
} from "@pigui/core";
import type { SessionStatus } from "./session-projection";

export type SessionRuntimeRun = {
  runId: string;
  trigger: AgentRunTrigger;
  outcome?: AgentRunOutcome;
  startedAt: string;
  endedAt?: string;
};

export type SessionRuntimeMessagePart = {
  partId: string;
  partType: AgentMessagePartType;
  body: string;
  done: boolean;
  toolCallId?: string;
};

export type SessionRuntimeMessage = {
  messageId: string;
  role: "user" | "assistant";
  // Absent on Gateway-minted chat entries (user echo, steer control): they
  // are created at command accept, before the Active Run exists. See the
  // design doc §10 open gap on user-message run attribution.
  runId?: string;
  turnId?: string;
  phase: "streaming" | "final";
  abandoned?: boolean;
  // Set on mirrored control/error entries (Steer echo, run failures) so the
  // chat can render them as control bubbles.
  controlLabel?: string;
  parts: SessionRuntimeMessagePart[];
  updatedAt: string;
};

export type SessionRuntimeTool = {
  toolCallId: string;
  runId: string;
  turnId: string;
  // "announced": only seen as a message tool_call part; "running": execution
  // started; "done": execution ended.
  phase: "announced" | "running" | "done";
  name?: string;
  argsText?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  updatedAt: string;
};

export type SessionRuntimeStatus = {
  code: string;
  body?: string;
  runId?: string;
  at: string;
};

export type SessionRuntimeError = {
  code: string;
  body: string;
  runId?: string;
  at: string;
};

export type SessionRuntimeOrderEntry = {
  kind: "message" | "tool" | "status" | "error";
  id: string;
  seq: number;
};

export type SessionRuntimeModel = {
  runs: ReadonlyMap<string, SessionRuntimeRun>;
  messages: ReadonlyMap<string, SessionRuntimeMessage>;
  tools: ReadonlyMap<string, SessionRuntimeTool>;
  statuses: readonly SessionRuntimeStatus[];
  errors: readonly SessionRuntimeError[];
  order: readonly SessionRuntimeOrderEntry[];
  lastSeq: number;
  updatedAt: string | null;
};

export type AgentRuntimeEventInput = {
  event: AgentRuntimeEvent;
  seq: number;
  timestamp: string;
};

export function createSessionRuntimeModel(): SessionRuntimeModel {
  return {
    runs: new Map(),
    messages: new Map(),
    tools: new Map(),
    statuses: [],
    errors: [],
    order: [],
    lastSeq: 0,
    updatedAt: null,
  };
}

function withOrderEntry(
  order: readonly SessionRuntimeOrderEntry[],
  entry: SessionRuntimeOrderEntry,
): readonly SessionRuntimeOrderEntry[] {
  return order.some((existing) => existing.kind === entry.kind && existing.id === entry.id)
    ? order
    : [...order, entry];
}

function upsertPart(
  parts: SessionRuntimeMessagePart[],
  event: Extract<AgentRuntimeEvent, { type: "message_part" }>,
): SessionRuntimeMessagePart[] {
  const existingIndex = parts.findIndex((part) => part.partId === event.partId);
  const existing = existingIndex === -1 ? null : parts[existingIndex];
  const body =
    event.bodyMode === "delta" ? `${existing?.body ?? ""}${event.body}` : event.body;
  const next: SessionRuntimeMessagePart = {
    partId: event.partId,
    partType: event.partType,
    body,
    done: event.phase === "end",
    ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
  };

  if (existingIndex === -1) {
    return [...parts, next];
  }

  return parts.map((part, index) => (index === existingIndex ? next : part));
}

export function applyAgentRuntimeEvent(
  model: SessionRuntimeModel,
  input: AgentRuntimeEventInput,
): SessionRuntimeModel {
  // Gateway seq is strictly increasing per session; replays are dropped here
  // instead of via renderer-side seen-id bookkeeping.
  if (input.seq <= model.lastSeq) {
    return model;
  }

  const { event, seq, timestamp } = input;
  const base = { lastSeq: seq, updatedAt: timestamp };

  switch (event.type) {
    case "run": {
      const runs = new Map(model.runs);

      if (event.phase === "start") {
        runs.set(event.runId, {
          runId: event.runId,
          trigger: event.trigger,
          startedAt: timestamp,
        });
      } else {
        const existing = runs.get(event.runId);

        runs.set(event.runId, {
          runId: event.runId,
          trigger: existing?.trigger ?? event.trigger,
          startedAt: existing?.startedAt ?? timestamp,
          endedAt: timestamp,
          ...(event.outcome ? { outcome: event.outcome } : {}),
        });
      }

      return { ...model, ...base, runs };
    }

    case "message": {
      const messages = new Map(model.messages);
      const existing = messages.get(event.messageId);

      if (event.phase === "start") {
        messages.set(event.messageId, {
          messageId: event.messageId,
          role: event.role,
          runId: event.runId,
          turnId: event.turnId,
          phase: "streaming",
          parts: existing?.parts ?? [],
          updatedAt: timestamp,
        });
      } else {
        messages.set(event.messageId, {
          messageId: event.messageId,
          role: event.role,
          runId: event.runId,
          turnId: event.turnId,
          phase: "final",
          ...(event.abandoned ? { abandoned: true } : {}),
          // The end snapshot is the authoritative content.
          parts: event.parts
            ? event.parts.map((part) => ({
                partId: part.partId,
                partType: part.partType,
                body: part.body,
                done: true,
                ...(part.toolCallId ? { toolCallId: part.toolCallId } : {}),
              }))
            : (existing?.parts ?? []).map((part) => ({ ...part, done: true })),
          updatedAt: timestamp,
        });
      }

      return {
        ...model,
        ...base,
        messages,
        order: withOrderEntry(model.order, { kind: "message", id: event.messageId, seq }),
      };
    }

    case "message_part": {
      const messages = new Map(model.messages);
      const existing = messages.get(event.messageId);
      const message: SessionRuntimeMessage = existing ?? {
        messageId: event.messageId,
        role: "assistant",
        runId: event.runId,
        turnId: event.turnId,
        phase: "streaming",
        parts: [],
        updatedAt: timestamp,
      };

      messages.set(event.messageId, {
        ...message,
        parts: upsertPart(message.parts, event),
        updatedAt: timestamp,
      });

      const order = withOrderEntry(model.order, {
        kind: "message",
        id: event.messageId,
        seq,
      });
      const next = { ...model, ...base, messages, order };

      // A tool_call part announces the tool before execution starts.
      if (event.partType === "tool_call" && event.phase === "end" && event.toolCallId) {
        const tools = new Map(model.tools);
        const existingTool = tools.get(event.toolCallId);

        tools.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          runId: event.runId,
          turnId: event.turnId,
          phase: existingTool?.phase ?? "announced",
          ...(existingTool?.name ? { name: existingTool.name } : {}),
          argsText: event.body,
          ...(existingTool?.args !== undefined ? { args: existingTool.args } : {}),
          ...(existingTool?.result !== undefined ? { result: existingTool.result } : {}),
          ...(existingTool?.isError !== undefined ? { isError: existingTool.isError } : {}),
          updatedAt: timestamp,
        });

        return {
          ...next,
          tools,
          order: withOrderEntry(next.order, { kind: "tool", id: event.toolCallId, seq }),
        };
      }

      return next;
    }

    case "tool": {
      const tools = new Map(model.tools);
      const existing = tools.get(event.toolCallId);

      tools.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        runId: event.runId,
        turnId: event.turnId,
        phase: event.phase === "end" ? "done" : "running",
        name: event.name || existing?.name,
        ...(existing?.argsText ? { argsText: existing.argsText } : {}),
        // Validated args from tool execution overwrite message-stream args.
        args: event.args !== undefined ? event.args : existing?.args,
        result: event.result !== undefined ? event.result : existing?.result,
        ...(event.isError !== undefined
          ? { isError: event.isError }
          : existing?.isError !== undefined
            ? { isError: existing.isError }
            : {}),
        updatedAt: timestamp,
      });

      return {
        ...model,
        ...base,
        tools,
        order: withOrderEntry(model.order, { kind: "tool", id: event.toolCallId, seq }),
      };
    }

    case "status": {
      const status: SessionRuntimeStatus = {
        code: event.code,
        ...(event.body ? { body: event.body } : {}),
        ...(event.runId ? { runId: event.runId } : {}),
        at: timestamp,
      };

      return {
        ...model,
        ...base,
        statuses: [...model.statuses, status],
        order: withOrderEntry(model.order, { kind: "status", id: `status-${seq}`, seq }),
      };
    }

    case "error": {
      const error: SessionRuntimeError = {
        code: event.code,
        body: event.body,
        ...(event.runId ? { runId: event.runId } : {}),
        at: timestamp,
      };

      return {
        ...model,
        ...base,
        errors: [...model.errors, error],
        order: withOrderEntry(model.order, { kind: "error", id: `error-${seq}`, seq }),
      };
    }

    // turn boundaries are embedded in message/tool identity; queue and usage
    // are handled by the queued-message and summary projections.
    default:
      return { ...model, ...base };
  }
}

export type LegacyChatEventInput = {
  id: string;
  kind: "message" | "control" | "error";
  role?: "user" | "assistant";
  title?: string;
  body: string;
  messageId?: string;
  timestamp: string;
};

// Mirrors a Gateway-minted legacy chat event (user echo, steer control echo,
// driver/renderer error) into the model so chat can render entirely from it.
// Mirrored entries slot between agent events with a fractional seq and never
// advance the agent seq watermark — advancing it would swallow the next
// Gateway event as a replay.
export function addLegacyChatEventToModel(
  model: SessionRuntimeModel,
  input: LegacyChatEventInput,
): SessionRuntimeModel {
  const messageId = input.messageId ?? input.id;
  const controlLabel =
    input.kind === "control" || input.kind === "error"
      ? (input.title ?? (input.kind === "error" ? "Error" : "Control"))
      : undefined;
  const existing = model.messages.get(messageId);
  const messages = new Map(model.messages);

  messages.set(messageId, {
    messageId,
    role: input.role ?? (input.kind === "error" ? "assistant" : "user"),
    ...(existing?.runId ? { runId: existing.runId } : {}),
    ...(existing?.turnId ? { turnId: existing.turnId } : {}),
    phase: "final",
    ...(controlLabel ? { controlLabel } : {}),
    parts: [
      {
        partId: `${messageId}:legacy`,
        partType: "text",
        body: input.body,
        done: true,
      },
    ],
    updatedAt: input.timestamp,
  });

  return {
    ...model,
    messages,
    order: withOrderEntry(model.order, {
      kind: "message",
      id: messageId,
      seq: model.lastSeq + 0.5,
    }),
    updatedAt: input.timestamp,
  };
}

export function sessionStatusFromRuntimeModel(
  model: SessionRuntimeModel,
): SessionStatus | null {
  if (model.runs.size === 0) {
    return null;
  }

  const runs = [...model.runs.values()];

  if (model.errors.length > 0 || runs.some((run) => run.outcome === "failed")) {
    return "failed";
  }

  if (runs.some((run) => !run.endedAt)) {
    return "running";
  }

  return "completed";
}
