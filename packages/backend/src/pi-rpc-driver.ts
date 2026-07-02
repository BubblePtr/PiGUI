import type {
  PiRpcRawEvent,
  PiRpcResponse,
  PiRpcTransport,
  RuntimeGatewaySnapshot,
  RuntimeGatewaySummary,
} from "@pigui/core";
import type {
  PiRuntimeDriver,
  RuntimeGatewayDriverEvent,
} from "./runtime-gateway";

export type PiRpcProcessDriverOptions = {
  transport: PiRpcTransport;
  now?: () => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (isRecord(part) && typeof part.text === "string") {
        return part.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function timestampFrom(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return fallback;
}

function defaultSummary(overrides: Partial<RuntimeGatewaySummary> = {}): RuntimeGatewaySummary {
  return {
    provider: null,
    model: null,
    totalTokens: 0,
    totalCostUsd: 0,
    ...overrides,
  };
}

function summaryFromRpcState(state: unknown): RuntimeGatewaySummary {
  if (!isRecord(state) || !isRecord(state.model)) {
    return defaultSummary();
  }

  return defaultSummary({
    provider: maybeString(state.model.provider),
    model: maybeString(state.model.id),
  });
}

function summaryFromMessage(message: Record<string, unknown>) {
  const usage = isRecord(message.usage) ? message.usage : null;
  const cost = usage && isRecord(usage.cost) ? usage.cost : null;
  const summary: Partial<RuntimeGatewaySummary> = {};
  const provider = maybeString(message.provider);
  const model = maybeString(message.model);
  const totalTokens = numberFrom(usage?.totalTokens);
  const totalCostUsd = numberFrom(cost?.total);

  if (provider) {
    summary.provider = provider;
  }

  if (model) {
    summary.model = model;
  }

  if (totalTokens !== null) {
    summary.totalTokens = totalTokens;
  }

  if (totalCostUsd !== null) {
    summary.totalCostUsd = totalCostUsd;
  }

  return Object.keys(summary).length ? summary : undefined;
}

function statusFromRpcState(state: unknown): RuntimeGatewaySnapshot["status"] {
  if (!isRecord(state)) {
    return "idle";
  }

  return state.isStreaming ? "running" : "idle";
}

function serializeEventBody(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

function queuedMessageIdFromResponse(response: PiRpcResponse, fallback: string) {
  const data = isRecord(response.data) ? response.data : null;

  return (
    maybeString(data?.queuedMessageId) ??
    maybeString(data?.queueId) ??
    maybeString(data?.id) ??
    fallback
  );
}

function normalizeRpcEvent(input: {
  rawEvent: PiRpcRawEvent;
  piSessionId: string;
  now: () => string;
}): RuntimeGatewayDriverEvent | null {
  const { rawEvent, piSessionId, now } = input;
  const timestamp = timestampFrom(rawEvent.timestamp, now());

  if (rawEvent.type === "message_update") {
    return null;
  }

  if (
    rawEvent.type === "message_start" ||
    rawEvent.type === "message_end" ||
    rawEvent.type === "turn_end"
  ) {
    const message = isRecord(rawEvent.message) ? rawEvent.message : null;
    const role = message?.role === "user" || message?.role === "assistant" ? message.role : null;
    const body = textFromContent(message?.content);

    if (!message || !role || !body) {
      return null;
    }

    if (role === "user") {
      return null;
    }

    return {
      piSessionId,
      turnId: maybeString(rawEvent.turnId) ?? undefined,
      type: "message_update",
      payload: {
        kind: "message",
        role,
        body,
        timestamp: timestampFrom(message.timestamp, timestamp),
        summary: summaryFromMessage(message),
      },
    };
  }

  if (
    rawEvent.type === "tool_execution_start" ||
    rawEvent.type === "tool_execution_update" ||
    rawEvent.type === "tool_execution_end"
  ) {
    const detail =
      rawEvent.type === "tool_execution_end"
        ? rawEvent.result
        : rawEvent.type === "tool_execution_update"
          ? rawEvent.partialResult
          : rawEvent.args;

    const toolCallId = maybeString(rawEvent.toolCallId);

    return {
      piSessionId,
      turnId: maybeString(rawEvent.turnId) ?? undefined,
      type: "tool_execution_update",
      payload: {
        kind: rawEvent.type === "tool_execution_end" ? "tool-result" : "tool-call",
        title: maybeString(rawEvent.toolName) ?? "Tool call",
        body: serializeEventBody(detail),
        ...(toolCallId ? { toolCallId } : {}),
      },
    };
  }

  if (rawEvent.type === "agent_end") {
    return {
      piSessionId,
      type: "status",
      payload: {
        kind: "status",
        title: "Agent run ended",
        body: "Pi Runtime ended the active run.",
        timestamp,
      },
    };
  }

  if (rawEvent.type === "error" || typeof rawEvent.error === "string") {
    return {
      piSessionId,
      type: "error",
      payload: {
        kind: "error",
        title: "Runtime error",
        body: maybeString(rawEvent.error) ?? "Pi Runtime reported an error.",
        timestamp,
      },
    };
  }

  return null;
}

export function createPiRpcProcessDriver(
  options: PiRpcProcessDriverOptions,
): PiRuntimeDriver {
  const now = options.now ?? (() => new Date().toISOString());
  const snapshots = new Map<string, RuntimeGatewaySnapshot>();
  const listeners = new Set<(event: RuntimeGatewayDriverEvent) => void>();
  let requestCounter = 0;
  let activePiSessionId: string | null = null;

  const nextRequestId = () => {
    requestCounter += 1;

    return `runtime-gateway-rpc-${requestCounter}`;
  };
  const emit = (event: RuntimeGatewayDriverEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  options.transport.onEvent((rawEvent) => {
    const piSessionId =
      maybeString(rawEvent.piSessionId) ?? maybeString(rawEvent.sessionId) ?? activePiSessionId;

    if (!piSessionId) {
      return;
    }

    const event = normalizeRpcEvent({ rawEvent, piSessionId, now });

    if (event) {
      emit(event);
    }
  });

  return {
    async createSession(input) {
      const runtimeId = `pi-rpc:${input.sessionId}`;

      await options.transport.start({
        command: "pi",
        args: ["--mode", "rpc", "--session-id", input.sessionId],
        cwd: input.cwd,
      });

      const response = await options.transport.send({
        id: nextRequestId(),
        type: "get_state",
      });

      if (!response.success) {
        throw new Error(response.error ?? "Pi RPC get_state failed.");
      }

      const data = isRecord(response.data) ? response.data : {};
      const piSessionId = maybeString(data.sessionId) ?? input.sessionId;
      const snapshot: RuntimeGatewaySnapshot = {
        sessionId: input.sessionId,
        runtimeId,
        piSessionId,
        projectId: input.projectId,
        cwd: input.cwd,
        status: statusFromRpcState(response.data),
        events: [],
        summary: summaryFromRpcState(response.data),
        updatedAt: now(),
      };

      activePiSessionId = piSessionId;
      snapshots.set(piSessionId, snapshot);

      return { ...snapshot, events: [...snapshot.events], summary: { ...snapshot.summary! } };
    },

    async sendPrompt(input) {
      const response = await options.transport.send({
        id: nextRequestId(),
        type: "prompt",
        message: input.prompt,
      });

      if (!response.success) {
        throw new Error(response.error ?? "Pi RPC rejected the prompt.");
      }

      return {
        piSessionId: input.piSessionId,
        type: "message_update",
        payload: {
          kind: "message",
          role: "user",
          body: input.prompt,
        },
      };
    },

    async queueFollowUp(input) {
      const requestId = nextRequestId();
      const response = await options.transport.send({
        id: requestId,
        type: "prompt",
        message: input.message,
        streamingBehavior: "followUp",
      });

      if (!response.success) {
        throw new Error(response.error ?? "Pi RPC rejected the queued follow-up.");
      }

      return {
        id: queuedMessageIdFromResponse(response, `queued-${requestId}`),
        piSessionId: input.piSessionId,
        body: input.message,
        status: "pending",
        createdAt: now(),
      };
    },

    async withdrawQueuedMessage(input) {
      const response = await options.transport.send({
        id: nextRequestId(),
        type: "withdraw_follow_up",
        queuedMessageId: input.queuedMessageId,
      });

      if (!response.success) {
        throw new Error(response.error ?? "Pi RPC rejected queued message withdrawal.");
      }

      return {
        id: input.queuedMessageId,
        piSessionId: input.piSessionId,
        body: "",
        status: "withdrawn",
        createdAt: now(),
        withdrawnAt: now(),
      };
    },

    async steerRun(input) {
      const response = await options.transport.send({
        id: nextRequestId(),
        type: "steer",
        message: input.message,
      });

      if (!response.success) {
        throw new Error(response.error ?? "Pi RPC rejected the steer input.");
      }

      return {
        piSessionId: input.piSessionId,
        type: "control",
        payload: {
          kind: "control",
          role: "user",
          title: "Steer",
          body: input.message,
        },
      };
    },

    async stopRun(input) {
      const response = await options.transport.send({
        id: nextRequestId(),
        type: "abort",
      });

      if (!response.success) {
        throw new Error(response.error ?? "Pi RPC rejected the stop request.");
      }

      return {
        piSessionId: input.piSessionId,
        type: "status",
        payload: {
          kind: "status",
          title: "Stopped",
          body: "Pi stopped the active run.",
        },
      };
    },

    async getSnapshot(piSessionId) {
      const snapshot = snapshots.get(piSessionId);

      if (!snapshot) {
        throw new Error(`Pi session "${piSessionId}" was not found.`);
      }

      return {
        ...snapshot,
        events: [...snapshot.events],
        summary: snapshot.summary ? { ...snapshot.summary } : undefined,
      };
    },

    onEvent(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
