// PROTO cot-live — fold the mock event stream into a runtime-model-ish state,
// then derive the CoT view per ADR-0030 (phase, anchor, flat step list).

import type { ChatToolItem } from "@/shared/ui/chat/chat-tool";
import type { ProtoEvent, ProtoPartType } from "./script";

export type ProtoPart = {
  partId: string;
  partType: ProtoPartType;
  body: string;
  done: boolean;
  startedAt: number;
  endedAt?: number;
  toolCallId?: string;
  toolName?: string;
};

export type ProtoMessage = {
  messageId: string;
  startedAt: number;
  endedAt?: number;
  parts: ProtoPart[];
};

export type ProtoToolExecution = {
  name: string;
  startedAt?: number;
  endedAt?: number;
  result?: string;
  isError?: boolean;
};

export type ProtoState = {
  runStartedAt?: number;
  runEndedAt?: number;
  messages: ProtoMessage[];
  tools: Record<string, ProtoToolExecution>;
};

export function foldEvents(events: ProtoEvent[], untilMs: number): ProtoState {
  const state: ProtoState = { messages: [], tools: {} };
  for (const event of events) {
    if (event.t > untilMs) {
      break;
    }
    switch (event.type) {
      case "run":
        if (event.phase === "start") state.runStartedAt = event.t;
        else state.runEndedAt = event.t;
        break;
      case "message": {
        if (event.phase === "start") {
          state.messages.push({ messageId: event.messageId, startedAt: event.t, parts: [] });
        } else {
          const message = state.messages.find((m) => m.messageId === event.messageId);
          if (message) message.endedAt = event.t;
        }
        break;
      }
      case "part": {
        const message = state.messages.find((m) => m.messageId === event.messageId);
        if (!message) break;
        let part = message.parts.find((p) => p.partId === event.partId);
        if (!part) {
          part = {
            partId: event.partId,
            partType: event.partType,
            body: "",
            done: false,
            startedAt: event.t,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          };
          message.parts.push(part);
        }
        if (event.phase === "update") part.body += event.body;
        else if (event.phase === "end") {
          part.body = event.body;
          part.done = true;
          part.endedAt = event.t;
        }
        break;
      }
      case "tool": {
        const tool = state.tools[event.toolCallId] ?? { name: event.name };
        if (event.phase === "start") tool.startedAt = event.t;
        else {
          tool.endedAt = event.t;
          tool.result = event.result;
          tool.isError = event.isError;
        }
        state.tools[event.toolCallId] = tool;
        break;
      }
    }
  }
  return state;
}

// ---------------------------------------------------------------------------

export type CotPhase = "hidden" | "thinking" | "acting" | "answering" | "settled";

export type CotStackItem =
  | {
      kind: "thinking";
      id: string;
      text: string;
      live: boolean;
      /** Wall time the model spent on this thinking part (ticking while live). */
      durationMs: number;
    }
  | { kind: "interim"; id: string; text: string }
  | {
      kind: "tools";
      id: string;
      tools: ChatToolItem[];
      live: boolean;
      /** toolCallId of the call currently streaming or executing, while live. */
      activeToolCallId?: string;
    };

export type CotView = {
  phase: CotPhase;
  elapsedMs?: number;
  /** Flat list of steps in Turn order; the last one may be live. */
  stack: CotStackItem[];
  /** Text the answer bubble shows (final, or presumed final while answering). */
  answer?: { text: string; streaming: boolean };
};

function toolItem(part: ProtoPart, state: ProtoState, nowMs: number): ChatToolItem {
  const exec = part.toolCallId ? state.tools[part.toolCallId] : undefined;
  let toolState: ChatToolItem["state"] = part.done ? "input-available" : "input-streaming";
  if (exec?.endedAt !== undefined) {
    toolState = exec.isError ? "output-error" : "output-available";
  }
  const durationMs =
    exec?.startedAt !== undefined ? (exec.endedAt ?? nowMs) - exec.startedAt : undefined;
  return {
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    state: toolState,
    argsText: part.body || undefined,
    output: exec?.result,
    durationMs: exec?.endedAt !== undefined ? durationMs : undefined,
  };
}

function isExecuted(part: ProtoPart, state: ProtoState) {
  return part.toolCallId ? state.tools[part.toolCallId]?.endedAt !== undefined : false;
}

export function deriveCot(state: ProtoState, nowMs: number): CotView {
  const messages = state.messages;
  const current = messages[messages.length - 1];
  const anchor = messages[0]?.startedAt;

  // --- phase -------------------------------------------------------------
  let phase: CotPhase = "hidden";
  const runEnded = state.runEndedAt !== undefined;
  const streamingText = current?.parts.find((p) => p.partType === "text" && !p.done);
  const hasUnfinishedTool = Object.values(state.tools).some(
    (t) => t.startedAt !== undefined && t.endedAt === undefined,
  );
  const announcedTool = current?.parts.some(
    (p) => p.partType === "tool_call" && !isExecuted(p, state),
  );
  const latestPart = current?.parts[current.parts.length - 1];

  if (runEnded) phase = "settled";
  else if (streamingText) phase = "answering";
  else if (hasUnfinishedTool || (announcedTool && latestPart?.partType === "tool_call"))
    phase = "acting";
  else if (current) phase = "thinking";

  const live = phase === "thinking" || phase === "acting";

  // --- steps ---------------------------------------------------------------
  const stack: CotStackItem[] = [];
  let answer: CotView["answer"];

  messages.forEach((message, messageIndex) => {
    const isCurrent = messageIndex === messages.length - 1;
    const hasToolCall = message.parts.some((p) => p.partType === "tool_call");
    const finalCandidate = isCurrent && !hasToolCall;

    type Slot = { kind: "part"; part: ProtoPart } | { kind: "tools"; parts: ProtoPart[] };
    const slots: Slot[] = [];
    for (const part of message.parts) {
      if (part.partType === "tool_call") {
        const last = slots[slots.length - 1];
        if (last?.kind === "tools") last.parts.push(part);
        else slots.push({ kind: "tools", parts: [part] });
      } else {
        slots.push({ kind: "part", part });
      }
    }

    slots.forEach((slot, slotIndex) => {
      if (slot.kind === "part") {
        const { part } = slot;
        if (part.partType === "text") {
          if (finalCandidate) {
            answer = { text: part.body, streaming: !part.done };
          } else {
            // Reclassified the moment a tool_call shows up in the same message.
            stack.push({ kind: "interim", id: part.partId, text: part.body });
          }
          return;
        }
        // A thinking part is a step of its own; the duration is its own span.
        const thinkingLive = live && isCurrent && !part.done;
        stack.push({
          kind: "thinking",
          id: part.partId,
          text: part.body,
          live: thinkingLive,
          durationMs: (part.endedAt ?? (thinkingLive ? nowMs : part.startedAt)) - part.startedAt,
        });
        return;
      }
      // A burst of tool calls is one step, live until every call has executed.
      const pending = slot.parts.filter((p) => !isExecuted(p, state));
      const burstLive = live && pending.length > 0;
      stack.push({
        kind: "tools",
        id: `${message.messageId}-tools-${slotIndex}`,
        tools: slot.parts.map((p) => toolItem(p, state, nowMs)),
        live: burstLive,
        // Pi executes calls in order, so the first unexecuted one is the active one.
        activeToolCallId: burstLive ? pending[0].toolCallId : undefined,
      });
    });
  });

  // --- clock ---------------------------------------------------------------
  let elapsedMs: number | undefined;
  if (anchor !== undefined) {
    if (live) {
      elapsedMs = nowMs - anchor;
    } else if (phase === "answering") {
      elapsedMs = (streamingText?.startedAt ?? nowMs) - anchor;
    } else if (phase === "settled" && current) {
      const firstText = current.parts.find((p) => p.partType === "text");
      elapsedMs = (firstText?.startedAt ?? current.endedAt ?? nowMs) - anchor;
    }
  }

  return { phase, elapsedMs, stack, answer };
}
