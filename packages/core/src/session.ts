// Session data contracts — the ubiquitous language shared across the process
// seam: the utilityProcess parser produces these; the renderer consumes them.

export type MessageRole = "user" | "assistant" | "toolResult" | "unknown";

export type SessionContentPart = {
  partType: string;
  text?: string;
  name?: string;
  // toolResult only: success/failure straight from the JSONL record, and
  // execution time derived from event timestamps (Pi ships no duration field).
  isError?: boolean;
  durationMs?: number;
  payload: unknown;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

export type CostBreakdown = {
  inputUsd: number;
  outputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  totalUsd: number;
};

export type SessionTurn = {
  kind: "message" | "annotation";
  role?: MessageRole;
  timestamp?: string;
  title?: string;
  model?: string;
  usage?: TokenUsage;
  cost?: CostBreakdown;
  parts: SessionContentPart[];
};

export type SessionDetail = {
  id: string;
  timestamp: string;
  project: string;
  totalCostUsd: number;
  totalTokens: number;
  primaryModel?: string;
  turnCount: number;
  durationSeconds?: number;
  turns: SessionTurn[];
};

export type ModelUsage = {
  model: string;
  costUsd: number;
  tokens: number;
};

export type NamedCount = {
  name: string;
  count: number;
};

export type Title =
  | { kind: "command"; name: string; args: string }
  | { kind: "skill"; name: string }
  | { kind: "text"; sentence: string }
  | { kind: "raw"; text: string };

export type SessionSummary = {
  id: string;
  timestamp: string;
  project: string;
  title: Title;
  totalCostUsd: number;
  totalTokens: number;
  primaryModel?: string;
  modelBreakdown: ModelUsage[];
  toolCounts: NamedCount[];
  skillCounts: NamedCount[];
};
