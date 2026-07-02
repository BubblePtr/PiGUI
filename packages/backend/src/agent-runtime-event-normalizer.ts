// Semantic normalization layer: agent-core raw events in, AgentRuntimeEvent
// out. A pure synchronous state machine — the only place SDK/RPC event shapes
// are mapped to the product contract. Identity is derived by counting
// lifecycle events, never from timestamps or in-process randomness, so a
// replayed fixture always yields the same ids.
// See docs/adr/0020-agent-runtime-event-model.md.

import {
  AGENT_STATUS_SURFACES,
  surfaceForMessagePart,
  type AgentEventOrigin,
  type AgentMessagePartSnapshot,
  type AgentMessagePartType,
  type AgentRuntimeEvent,
  type AgentRunTrigger,
  type AgentStatusCode,
} from "@pigui/core";

export type AgentRuntimeEventNormalizerInput = {
  piSessionId: string;
  origin?: AgentEventOrigin;
};

export type AgentRuntimeEventNormalizer = {
  normalize(rawEvent: unknown): AgentRuntimeEvent[];
  // Drivers call this when a command is accepted so the next agent_start can
  // attribute the Active Run to what actually triggered it.
  noteRunTrigger(trigger: Exclude<AgentRunTrigger, "unknown">): void;
};

type PartState = {
  partId: string;
  partType: AgentMessagePartType;
  body: string;
  toolCallId?: string;
};

type MessageState = {
  messageId: string;
  role: "assistant";
  parts: Map<number, PartState>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createAgentRuntimeEventNormalizer(
  input: AgentRuntimeEventNormalizerInput,
): AgentRuntimeEventNormalizer {
  const origin = input.origin ?? "sdk";
  let runSeq = 0;
  let turnSeq = 0;
  let messageSeq = 0;
  let runId: string | null = null;
  let turnId: string | null = null;
  let runTrigger: AgentRunTrigger = "unknown";
  let pendingTrigger: AgentRunTrigger | null = null;
  let message: MessageState | null = null;

  function partSnapshots(state: MessageState): AgentMessagePartSnapshot[] {
    return [...state.parts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, part]) => ({
        partId: part.partId,
        partType: part.partType,
        body: part.body,
        ...(part.toolCallId ? { toolCallId: part.toolCallId } : {}),
      }));
  }

  function partEvent(
    part: PartState,
    phase: "start" | "update" | "end",
    bodyMode: "delta" | "snapshot",
    body: string,
  ): AgentRuntimeEvent {
    if (!runId || !turnId || !message) {
      throw new Error("Agent message part event arrived outside an active message.");
    }

    return {
      type: "message_part",
      runId,
      turnId,
      messageId: message.messageId,
      partId: part.partId,
      partType: part.partType,
      phase,
      bodyMode,
      body,
      ...(part.toolCallId ? { toolCallId: part.toolCallId } : {}),
      surface: surfaceForMessagePart(part.partType),
      origin,
    };
  }

  const STREAM_PART_TYPES: Record<string, AgentMessagePartType> = {
    text: "text",
    thinking: "thinking",
    toolcall: "tool_call",
  };

  function streamPartEvents(assistantMessageEvent: Record<string, unknown>): AgentRuntimeEvent[] {
    if (!message || typeof assistantMessageEvent.contentIndex !== "number") {
      return [];
    }

    const eventType =
      typeof assistantMessageEvent.type === "string" ? assistantMessageEvent.type : "";
    const [prefix, lifecycle] = [
      eventType.slice(0, eventType.lastIndexOf("_")),
      eventType.slice(eventType.lastIndexOf("_") + 1),
    ];
    const partType = STREAM_PART_TYPES[prefix];

    if (!partType) {
      return [];
    }

    const contentIndex = assistantMessageEvent.contentIndex;
    const existing = message.parts.get(contentIndex);

    if (lifecycle === "start") {
      const part: PartState = {
        partId: `${message.messageId}:part-${contentIndex}`,
        partType,
        body: "",
      };

      message.parts.set(contentIndex, part);

      return [partEvent(part, "start", "snapshot", "")];
    }

    if (!existing) {
      return [];
    }

    if (lifecycle === "delta") {
      const delta = typeof assistantMessageEvent.delta === "string" ? assistantMessageEvent.delta : "";

      existing.body += delta;

      return [partEvent(existing, "update", "delta", delta)];
    }

    if (lifecycle === "end") {
      // toolcall_end carries the parsed ToolCall block instead of text content;
      // its native id becomes the join key with tool execution events.
      const toolCall = isRecord(assistantMessageEvent.toolCall)
        ? assistantMessageEvent.toolCall
        : null;

      if (partType === "tool_call" && toolCall) {
        existing.body = JSON.stringify(toolCall.arguments ?? {});
        existing.toolCallId = typeof toolCall.id === "string" ? toolCall.id : undefined;

        return [partEvent(existing, "end", "snapshot", existing.body)];
      }

      const content =
        typeof assistantMessageEvent.content === "string"
          ? assistantMessageEvent.content
          : existing.body;

      existing.body = content;

      return [partEvent(existing, "end", "snapshot", content)];
    }

    return [];
  }

  function toolExecutionEvent(rawEvent: Record<string, unknown>): AgentRuntimeEvent[] {
    if (!runId || !turnId || typeof rawEvent.toolCallId !== "string") {
      return [];
    }

    const name = typeof rawEvent.toolName === "string" ? rawEvent.toolName : "";

    if (rawEvent.type === "tool_execution_start") {
      return [
        {
          type: "tool",
          runId,
          turnId,
          toolCallId: rawEvent.toolCallId,
          phase: "start",
          name,
          args: rawEvent.args,
          surface: "trace",
          origin,
        },
      ];
    }

    if (rawEvent.type === "tool_execution_update") {
      return [
        {
          type: "tool",
          runId,
          turnId,
          toolCallId: rawEvent.toolCallId,
          phase: "update",
          name,
          args: rawEvent.args,
          result: rawEvent.partialResult,
          surface: "trace",
          origin,
        },
      ];
    }

    return [
      {
        type: "tool",
        runId,
        turnId,
        toolCallId: rawEvent.toolCallId,
        phase: "end",
        name,
        result: rawEvent.result,
        isError: typeof rawEvent.isError === "boolean" ? rawEvent.isError : undefined,
        surface: "trace",
        origin,
      },
    ];
  }

  function statusEvent(code: AgentStatusCode, body: string | undefined): AgentRuntimeEvent {
    return {
      type: "status",
      ...(runId ? { runId } : {}),
      code,
      ...(body ? { body } : {}),
      surface: AGENT_STATUS_SURFACES[code],
      origin,
    };
  }

  function closeOpenMessage(options: { abandoned?: boolean } = {}): AgentRuntimeEvent[] {
    if (!runId || !turnId || !message) {
      return [];
    }

    const openMessage = message;

    message = null;

    return [
      {
        type: "message",
        runId,
        turnId,
        messageId: openMessage.messageId,
        role: "assistant",
        phase: "end",
        ...(options.abandoned ? { abandoned: true } : {}),
        parts: partSnapshots(openMessage),
        surface: "chat",
        origin,
      },
    ];
  }

  return {
    noteRunTrigger(trigger) {
      pendingTrigger = trigger;
    },

    normalize(rawEvent) {
      if (!isRecord(rawEvent)) {
        return [];
      }

      if (rawEvent.type === "agent_start") {
        runSeq += 1;
        turnSeq = 0;
        runId = `${input.piSessionId}:run-${runSeq}`;
        runTrigger = pendingTrigger ?? "unknown";
        pendingTrigger = null;

        return [{ type: "run", runId, phase: "start", trigger: runTrigger, surface: "hidden", origin }];
      }

      if (rawEvent.type === "turn_start" && runId) {
        turnSeq += 1;
        messageSeq = 0;
        turnId = `${runId}:turn-${turnSeq}`;

        return [{ type: "turn", runId, turnId, phase: "start", surface: "hidden", origin }];
      }

      if (rawEvent.type === "message_start" && runId && turnId) {
        const rawMessage = isRecord(rawEvent.message) ? rawEvent.message : null;

        if (rawMessage?.role !== "assistant") {
          return [];
        }

        messageSeq += 1;
        message = {
          messageId: `${turnId}:msg-${messageSeq}`,
          role: "assistant",
          parts: new Map(),
        };

        return [
          {
            type: "message",
            runId,
            turnId,
            messageId: message.messageId,
            role: "assistant",
            phase: "start",
            surface: "chat",
            origin,
          },
        ];
      }

      if (rawEvent.type === "message_update" && message) {
        const assistantMessageEvent = isRecord(rawEvent.assistantMessageEvent)
          ? rawEvent.assistantMessageEvent
          : null;

        if (!assistantMessageEvent) {
          return [];
        }

        return streamPartEvents(assistantMessageEvent);
      }

      if (rawEvent.type === "message_end" && runId && turnId && message) {
        const endedMessage = message;

        message = null;

        return [
          {
            type: "message",
            runId,
            turnId,
            messageId: endedMessage.messageId,
            role: "assistant",
            phase: "end",
            parts: partSnapshots(endedMessage),
            surface: "chat",
            origin,
          },
        ];
      }

      if (
        rawEvent.type === "tool_execution_start" ||
        rawEvent.type === "tool_execution_update" ||
        rawEvent.type === "tool_execution_end"
      ) {
        return toolExecutionEvent(rawEvent);
      }

      if (rawEvent.type === "queue_update") {
        return [
          {
            type: "queue",
            steering: Array.isArray(rawEvent.steering)
              ? rawEvent.steering.filter((entry): entry is string => typeof entry === "string")
              : [],
            followUp: Array.isArray(rawEvent.followUp)
              ? rawEvent.followUp.filter((entry): entry is string => typeof entry === "string")
              : [],
            surface: "hidden",
            origin,
          },
        ];
      }

      if (rawEvent.type === "compaction_start") {
        return [
          statusEvent("compacting", typeof rawEvent.reason === "string" ? rawEvent.reason : undefined),
        ];
      }

      if (rawEvent.type === "compaction_end") {
        return [statusEvent("compaction_done", undefined)];
      }

      if (rawEvent.type === "auto_retry_start" && runId) {
        return [
          // Retry interrupts the in-flight message; close it with an explicit
          // abandoned boundary before reporting the retry status.
          ...closeOpenMessage({ abandoned: true }),
          statusEvent("retrying", typeof rawEvent.errorMessage === "string" ? rawEvent.errorMessage : undefined),
        ];
      }

      if (rawEvent.type === "auto_retry_end" && runId) {
        if (rawEvent.success === true) {
          return [statusEvent("retry_succeeded", undefined)];
        }

        return [
          statusEvent(
            "retry_failed",
            typeof rawEvent.finalError === "string" ? rawEvent.finalError : undefined,
          ),
        ];
      }

      if (rawEvent.type === "turn_end" && runId && turnId) {
        return [{ type: "turn", runId, turnId, phase: "end", surface: "hidden", origin }];
      }

      if (rawEvent.type === "agent_end" && runId) {
        const endedRunId = runId;
        // Outcome comes from the last assistant message's stopReason — the
        // only termination signal agent-core exposes on agent_end.
        const messages = Array.isArray(rawEvent.messages) ? rawEvent.messages : [];
        const lastAssistant = [...messages]
          .reverse()
          .find((entry): entry is Record<string, unknown> => isRecord(entry) && entry.role === "assistant");
        const stopReason = lastAssistant?.stopReason;
        const outcome =
          stopReason === "aborted" ? "aborted" : stopReason === "error" ? "failed" : "completed";
        const errorEvents: AgentRuntimeEvent[] =
          outcome === "failed"
            ? [
                {
                  type: "error",
                  runId: endedRunId,
                  code: "run_error",
                  body:
                    typeof lastAssistant?.errorMessage === "string"
                      ? lastAssistant.errorMessage
                      : "Active Run failed.",
                  surface: "chat",
                  origin,
                },
              ]
            : [];
        const closureEvents = closeOpenMessage();

        runId = null;
        turnId = null;

        return [
          ...closureEvents,
          ...errorEvents,
          {
            type: "run",
            runId: endedRunId,
            phase: "end",
            trigger: runTrigger,
            outcome,
            surface: "hidden",
            origin,
          },
        ];
      }

      return [];
    },
  };
}
