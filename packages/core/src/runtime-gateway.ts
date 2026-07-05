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
  updatedAt: string;
};

export type RuntimeGatewayQueuedMessage = {
  id: string;
  piSessionId: string;
  body: string;
  status: "pending" | "processing" | "withdrawn";
  createdAt: string;
  processingStartedAt?: string;
  withdrawnAt?: string;
};

export type RuntimeGatewaySequencerOptions = {
  now?: () => string;
  idFactory?: () => string;
};

export function createRuntimeGatewaySequencer(
  options: RuntimeGatewaySequencerOptions = {},
) {
  const now = options.now ?? (() => new Date().toISOString());
  const idFactory =
    options.idFactory ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `evt-${crypto.randomUUID()}`
        : `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let seq = 0;

  return (event: RuntimeGatewayEventInput): RuntimeGatewayEventEnvelope => {
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
}
