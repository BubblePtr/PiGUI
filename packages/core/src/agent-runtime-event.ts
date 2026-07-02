// Agent Runtime Event Model — the product-layer event contract carried as the
// Runtime Gateway envelope payload. Boundaries come from agent-core lifecycle,
// never from renderer guesses. See docs/adr/0020-agent-runtime-event-model.md.

import type { RuntimeGatewaySummary } from "./runtime-gateway";

export type AgentRunPhase = "start" | "update" | "end";

// Lifecycle (`phase`) and content encoding (`bodyMode`) are deliberately
// separate axes; the legacy `partial | delta | final` tri-state is retired.
export type AgentBodyMode = "delta" | "snapshot";

export type AgentSurface = "chat" | "trace" | "status" | "composer" | "hidden";

export type AgentEventOrigin = "sdk" | "rpc";

export type AgentRunTrigger = "prompt" | "steer" | "follow_up" | "unknown";

export type AgentRunOutcome = "completed" | "aborted" | "failed";

export type AgentMessagePartType = "text" | "thinking" | "tool_call";

export type AgentStatusCode =
  | "retrying"
  | "retry_succeeded"
  | "retry_failed"
  | "compacting"
  | "compaction_done"
  | "runtime_unavailable"
  | "first_token_timeout"
  | "model_changed"
  | "thinking_level_changed";

export type AgentMessagePartSnapshot = {
  partId: string;
  partType: AgentMessagePartType;
  body: string;
  toolCallId?: string;
};

export type AgentRuntimeEvent =
  // Message lifecycle. Carries no streaming body; `end` carries the final
  // parts snapshot as the authoritative message content. `abandoned` marks a
  // partial message closed by retry — consumers must never be left holding
  // dangling streaming state, but abandoned content is not a final answer.
  | {
      type: "message";
      runId: string;
      turnId: string;
      messageId: string;
      role: "user" | "assistant";
      phase: "start" | "end";
      parts?: AgentMessagePartSnapshot[];
      abandoned?: boolean;
      surface: "chat";
      origin: AgentEventOrigin;
    }
  // Part-level streaming updates — the hot path. `update` events carry only
  // the delta fragment; `start`/`end` carry snapshots.
  | {
      type: "message_part";
      runId: string;
      turnId: string;
      messageId: string;
      partId: string;
      partType: AgentMessagePartType;
      phase: AgentRunPhase;
      bodyMode: AgentBodyMode;
      body: string;
      toolCallId?: string;
      surface: "chat" | "trace";
      origin: AgentEventOrigin;
    }
  // Tool execution lifecycle, joined to the message's tool_call part by
  // toolCallId. Validated args from execution overwrite message-stream args.
  | {
      type: "tool";
      runId: string;
      turnId: string;
      toolCallId: string;
      phase: AgentRunPhase;
      name: string;
      args?: unknown;
      result?: unknown;
      isError?: boolean;
      surface: "trace";
      origin: AgentEventOrigin;
    }
  // Active Run / Turn boundaries. Hidden: they drive the projection state
  // machine and are never rendered as bubbles. Session completion is decided
  // by run(end).outcome, not by status events.
  | {
      type: "run";
      runId: string;
      phase: "start" | "end";
      trigger: AgentRunTrigger;
      outcome?: AgentRunOutcome;
      surface: "hidden";
      origin: AgentEventOrigin;
    }
  | {
      type: "turn";
      runId: string;
      turnId: string;
      phase: "start" | "end";
      surface: "hidden";
      origin: AgentEventOrigin;
    }
  | {
      type: "status";
      runId?: string;
      code: AgentStatusCode;
      body?: string;
      surface: "status" | "composer" | "trace" | "hidden";
      origin: AgentEventOrigin;
    }
  | {
      type: "error";
      runId?: string;
      turnId?: string;
      code: string;
      body: string;
      surface: "chat";
      origin: AgentEventOrigin;
    }
  | {
      type: "usage";
      runId: string;
      summary: Partial<RuntimeGatewaySummary>;
      surface: "hidden";
      origin: AgentEventOrigin;
    }
  | {
      type: "queue";
      steering: string[];
      followUp: string[];
      surface: "hidden";
      origin: AgentEventOrigin;
    };

// Surface routing — the single source of truth. Page components must not
// re-derive placement; policy changes happen here only.

export function surfaceForMessagePart(partType: AgentMessagePartType): "chat" | "trace" {
  return partType === "text" ? "chat" : "trace";
}

export const AGENT_STATUS_SURFACES: Record<
  AgentStatusCode,
  "status" | "composer" | "trace" | "hidden"
> = {
  retrying: "trace",
  retry_succeeded: "trace",
  retry_failed: "trace",
  compacting: "trace",
  compaction_done: "trace",
  runtime_unavailable: "composer",
  first_token_timeout: "composer",
  model_changed: "status",
  thinking_level_changed: "status",
};
