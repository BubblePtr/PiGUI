import type { RuntimePromptImage } from "./prompt-image";

export type RuntimeGatewayRequest = {
  id: string;
  method: string;
  params?: unknown;
};

export type RuntimeGatewayResponse = {
  id: string;
  result?: unknown;
  error?: string;
};

export type RuntimeGatewayEventPayload = Record<string, unknown>;

export type RuntimeGatewayEventEnvelope = {
  id: string;
  seq: number;
  sessionId: string;
  piSessionId: string;
  turnId?: string;
  type: string;
  ts: string;
  payload: RuntimeGatewayEventPayload;
};

export type RuntimeGatewayEventInput = {
  sessionId: string;
  piSessionId: string;
  turnId?: string;
  type: string;
  ts?: string;
  payload: RuntimeGatewayEventPayload;
};

export type RuntimeGatewaySummary = {
  provider: string | null;
  model: string | null;
  totalTokens: number;
  totalCostUsd: number;
};

export type RuntimeThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type RuntimeModelInputModality = "text" | "image";

export type RuntimeModelCapability = {
  provider: string;
  modelId: string;
  name: string;
  thinkingLevels: RuntimeThinkingLevel[];
  /** Context window in tokens; absent when the source doesn't report it. */
  contextWindow?: number;
  /** Max output tokens; absent when the source doesn't report it. */
  maxTokens?: number;
  /** Supported input modalities; absent when the source doesn't report it. */
  input?: RuntimeModelInputModality[];
};

export type RuntimeModelSelection = {
  provider: string;
  modelId: string;
  thinkingLevel: RuntimeThinkingLevel;
};

export type RuntimeModelControls = {
  models: RuntimeModelCapability[];
  selected: RuntimeModelSelection | null;
};

/** Current-runtime tool definition. Absent names are omitted, not invented. */
export type RuntimeToolSchema = {
  description: string;
  parameters: unknown;
};

export type RuntimeToolSchemas = {
  schemas: Record<string, RuntimeToolSchema>;
};

export type RuntimeGatewaySnapshot = {
  sessionId: string;
  runtimeId: string;
  piSessionId: string;
  projectId: string;
  cwd: string;
  status: "idle" | "running" | "failed" | "completed";
  sessionFile?: string;
  checkout?: unknown;
  events: RuntimeGatewayEventEnvelope[];
  summary?: RuntimeGatewaySummary;
  modelControls?: RuntimeModelControls;
  updatedAt: string;
};

export type RuntimeGatewayQueuedMessage = {
  id: string;
  piSessionId: string;
  body: string;
  images?: RuntimePromptImage[];
  status: "pending" | "processing" | "withdrawn";
  createdAt: string;
  processingStartedAt?: string;
  withdrawnAt?: string;
};

export type RuntimeGatewaySequencerOptions = {
  now?: () => string;
  idFactory?: () => string;
};

export type RuntimeGatewaySequencer = {
  (event: RuntimeGatewayEventInput): RuntimeGatewayEventEnvelope;
  advanceTo(seq: number): void;
};

export function createRuntimeGatewaySequencer(
  options: RuntimeGatewaySequencerOptions = {},
): RuntimeGatewaySequencer {
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory =
    options.idFactory ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `evt-${crypto.randomUUID()}`
        : `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let seq = 0;

  const nextEvent = (event: RuntimeGatewayEventInput): RuntimeGatewayEventEnvelope => {
    seq += 1;

    return {
      id: idFactory(),
      seq,
      sessionId: event.sessionId,
      piSessionId: event.piSessionId,
      turnId: event.turnId,
      type: event.type,
      ts: event.ts ?? now(),
      payload: { ...event.payload },
    };
  };

  nextEvent.advanceTo = (nextSeq: number) => {
    if (Number.isSafeInteger(nextSeq) && nextSeq > seq) {
      seq = nextSeq;
    }
  };

  return nextEvent;
}
