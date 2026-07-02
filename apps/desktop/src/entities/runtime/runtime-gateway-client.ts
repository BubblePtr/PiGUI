import type {
  RuntimeGatewayEventEnvelope,
  RuntimeGatewayQueuedMessage,
  RuntimeGatewaySnapshot,
  RuntimeGatewaySummary,
} from "@pigui/core";
import type { BackendRpcEvent } from "@pigui/backend";
import {
  PiRuntimeBridgeError,
  cloneSessionState,
  defaultRuntimeSummary,
  type PiQueuedMessage,
  type PiRuntimeBridge,
  type PiRuntimeEvent,
  type PiRuntimeHandle,
  type PiRuntimeSummary,
  type PiSessionState,
} from "@/entities/runtime/pi-runtime-bridge";
import { invoke as invokeRuntime, onBackendEvent as onRuntimeBackendEvent } from "@/shared/runtime";

type InvokeGatewayMethod = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;
type SubscribeBackendEvent = (listener: (event: BackendRpcEvent) => void) => () => void;

export type RuntimeGatewayClientOptions = {
  invoke?: InvokeGatewayMethod;
  onBackendEvent?: SubscribeBackendEvent;
  now?: () => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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

function eventKindFromEnvelope(
  envelope: RuntimeGatewayEventEnvelope,
): PiRuntimeEvent["kind"] {
  const kind = isRecord(envelope.payload) ? envelope.payload.kind : null;

  if (
    kind === "message" ||
    kind === "thinking" ||
    kind === "tool-call" ||
    kind === "tool-result" ||
    kind === "error" ||
    kind === "usage" ||
    kind === "status" ||
    kind === "control"
  ) {
    return kind;
  }

  if (envelope.type === "tool_execution_update") {
    return "tool-call";
  }

  if (envelope.type === "error") {
    return "error";
  }

  if (envelope.type === "status") {
    return "status";
  }

  return "message";
}

function runtimeSummaryFromGateway(
  summary: RuntimeGatewaySummary | Partial<RuntimeGatewaySummary> | undefined,
): PiRuntimeSummary | undefined {
  if (!summary) {
    return undefined;
  }

  return defaultRuntimeSummary(summary);
}

function partialSummaryFromPayload(value: unknown): Partial<PiRuntimeSummary> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const summary: Partial<PiRuntimeSummary> = {};

  if (typeof value.provider === "string" || value.provider === null) {
    summary.provider = value.provider;
  }

  if (typeof value.model === "string" || value.model === null) {
    summary.model = value.model;
  }

  if (typeof value.totalTokens === "number" && Number.isFinite(value.totalTokens)) {
    summary.totalTokens = value.totalTokens;
  }

  if (typeof value.totalCostUsd === "number" && Number.isFinite(value.totalCostUsd)) {
    summary.totalCostUsd = value.totalCostUsd;
  }

  return Object.keys(summary).length ? summary : undefined;
}

function runtimeEventFromEnvelope(envelope: RuntimeGatewayEventEnvelope): PiRuntimeEvent {
  const payload = isRecord(envelope.payload) ? envelope.payload : {};
  const event: PiRuntimeEvent = {
    id: envelope.id,
    piSessionId: envelope.piSessionId,
    kind: eventKindFromEnvelope(envelope),
    body: serializeEventBody(payload.body),
    timestamp: maybeString(payload.timestamp) ?? envelope.ts,
  };
  const role = maybeString(payload.role);
  const title = maybeString(payload.title);
  const messageId = maybeString(payload.messageId);
  const toolCallId = maybeString(payload.toolCallId);
  const bodyFormat = maybeString(payload.bodyFormat);
  const phase = maybeString(payload.phase);
  const summary = partialSummaryFromPayload(payload.summary);

  if (messageId) {
    event.messageId = messageId;
  }

  if (toolCallId) {
    event.toolCallId = toolCallId;
  }

  if (role === "user" || role === "assistant") {
    event.role = role;
  }

  if (title) {
    event.title = title;
  }

  if (summary) {
    event.summary = summary;
  }

  if (bodyFormat === "full" || bodyFormat === "delta") {
    event.bodyFormat = bodyFormat;
  }

  if (phase === "partial" || phase === "delta" || phase === "final") {
    event.phase = phase;
  }

  return event;
}

function stateFromSnapshot(snapshot: RuntimeGatewaySnapshot): PiSessionState {
  const state: PiSessionState = {
    piSessionId: snapshot.piSessionId,
    runtimeId: snapshot.runtimeId,
    projectId: snapshot.projectId,
    cwd: snapshot.cwd,
    status: snapshot.status,
    events: snapshot.events.map(runtimeEventFromEnvelope),
    updatedAt: snapshot.updatedAt,
  };
  const summary = runtimeSummaryFromGateway(snapshot.summary);

  if (summary) {
    state.summary = summary;
  }

  return state;
}

function cloneRuntimeEvent(event: PiRuntimeEvent): PiRuntimeEvent {
  const cloned: PiRuntimeEvent = {
    id: event.id,
    piSessionId: event.piSessionId,
    kind: event.kind,
    body: event.body,
    timestamp: event.timestamp,
  };

  if (event.role) {
    cloned.role = event.role;
  }

  if (event.title) {
    cloned.title = event.title;
  }

  if (event.messageId) {
    cloned.messageId = event.messageId;
  }

  if (event.toolCallId) {
    cloned.toolCallId = event.toolCallId;
  }

  if (event.summary) {
    cloned.summary = { ...event.summary };
  }

  if (event.bodyFormat) {
    cloned.bodyFormat = event.bodyFormat;
  }

  if (event.phase) {
    cloned.phase = event.phase;
  }

  return cloned;
}

function cloneQueuedMessage(message: PiQueuedMessage): PiQueuedMessage {
  return { ...message };
}

function queuedMessageFromGateway(message: RuntimeGatewayQueuedMessage): PiQueuedMessage {
  const queued: PiQueuedMessage = {
    id: message.id,
    piSessionId: message.piSessionId,
    body: message.body,
    status: message.status,
    createdAt: message.createdAt,
  };

  if (message.processingStartedAt) {
    queued.processingStartedAt = message.processingStartedAt;
  }

  if (message.withdrawnAt) {
    queued.withdrawnAt = message.withdrawnAt;
  }

  return queued;
}

function echoFingerprint(event: Pick<PiRuntimeEvent, "piSessionId" | "kind" | "role" | "title" | "body">) {
  return [
    event.piSessionId,
    event.kind,
    event.role ?? "",
    event.title ?? "",
    event.body,
  ].join("\u0000");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createRuntimeGatewayClient(
  options: RuntimeGatewayClientOptions = {},
): PiRuntimeBridge {
  const invoke = options.invoke ?? invokeRuntime;
  const onBackendEvent = options.onBackendEvent ?? onRuntimeBackendEvent;
  const now = options.now ?? (() => new Date().toISOString());
  const runtimes = new Map<string, PiRuntimeHandle>();
  const states = new Map<string, PiSessionState>();
  const queuedMessages = new Map<string, PiQueuedMessage>();
  const listeners = new Map<string, Set<(event: PiRuntimeEvent) => void>>();
  const seenEventIds = new Map<string, Set<string>>();
  const pendingEchoFingerprints = new Set<string>();
  const suppressedEnvelopeIds = new Set<string>();
  let unsubscribeBackendEvent: (() => void) | null = null;

  const rememberState = (state: PiSessionState) => {
    states.set(state.piSessionId, cloneSessionState(state));
  };
  const rememberSeen = (event: PiRuntimeEvent) => {
    const seen = seenEventIds.get(event.piSessionId) ?? new Set<string>();

    if (seen.has(event.id)) {
      return false;
    }

    seen.add(event.id);
    seenEventIds.set(event.piSessionId, seen);

    return true;
  };
  const recordEvent = (event: PiRuntimeEvent, notifyListeners: boolean) => {
    if (!rememberSeen(event)) {
      return;
    }

    const state = states.get(event.piSessionId);

    if (state) {
      state.events = [...state.events, cloneRuntimeEvent(event)];
      state.updatedAt = event.timestamp;

      if (event.summary) {
        state.summary = defaultRuntimeSummary({
          ...(state.summary ?? defaultRuntimeSummary()),
          ...event.summary,
        });
      }

      if (event.kind === "error") {
        state.status = "failed";
      } else if (event.kind === "status") {
        state.status = "completed";
      } else {
        state.status = "running";
      }
    }

    if (!notifyListeners) {
      return;
    }

    for (const listener of listeners.get(event.piSessionId) ?? []) {
      listener(cloneRuntimeEvent(event));
    }
  };
  const ensureBackendSubscription = () => {
    if (unsubscribeBackendEvent) {
      return;
    }

    unsubscribeBackendEvent = onBackendEvent((event) => {
      if (event.type !== "event") {
        return;
      }

      const runtimeEvent = runtimeEventFromEnvelope(event.event);
      const fingerprint = echoFingerprint(runtimeEvent);

      if (suppressedEnvelopeIds.has(event.event.id)) {
        suppressedEnvelopeIds.delete(event.event.id);
        return;
      }

      if (pendingEchoFingerprints.has(fingerprint)) {
        pendingEchoFingerprints.delete(fingerprint);
        suppressedEnvelopeIds.add(event.event.id);
        return;
      }

      recordEvent(runtimeEvent, true);
    });
  };
  const releaseBackendSubscriptionIfIdle = () => {
    const hasListeners = [...listeners.values()].some((sessionListeners) => sessionListeners.size > 0);

    if (hasListeners || !unsubscribeBackendEvent) {
      return;
    }

    unsubscribeBackendEvent();
    unsubscribeBackendEvent = null;
  };
  const invokeEventCommand = async (
    method: string,
    args: Record<string, unknown>,
    expectedEcho: Pick<PiRuntimeEvent, "piSessionId" | "kind" | "role" | "title" | "body">,
  ) => {
    const fingerprint = echoFingerprint(expectedEcho);
    pendingEchoFingerprints.add(fingerprint);

    try {
      const envelope = await invoke<RuntimeGatewayEventEnvelope>(method, args);
      suppressedEnvelopeIds.add(envelope.id);

      return envelope;
    } finally {
      pendingEchoFingerprints.delete(fingerprint);
    }
  };

  return {
    async startRuntime(input) {
      try {
        const snapshot = await invoke<RuntimeGatewaySnapshot>("create_session", {
          sessionId: input.sessionId,
          projectId: input.projectId,
          cwd: input.checkout.runtimeCwd,
          checkout: input.checkout,
        });
        const runtime: PiRuntimeHandle = {
          runtimeId: snapshot.runtimeId,
          sessionId: input.sessionId,
          projectId: input.projectId,
          checkout: input.checkout,
          status: "ready",
        };

        runtimes.set(runtime.runtimeId, { ...runtime, checkout: { ...runtime.checkout } });
        rememberState(stateFromSnapshot(snapshot));

        return { ...runtime, checkout: { ...runtime.checkout } };
      } catch (error) {
        throw new PiRuntimeBridgeError({
          stage: "starting runtime",
          message: errorMessage(error),
        });
      }
    },

    async createPiSessionState(input) {
      const runtime = runtimes.get(input.runtimeId);

      if (!runtime) {
        throw new PiRuntimeBridgeError({
          stage: "starting runtime",
          message: `Runtime "${input.runtimeId}" was not found.`,
        });
      }

      const state = [...states.values()].find((candidate) => candidate.runtimeId === input.runtimeId);

      if (!state) {
        throw new PiRuntimeBridgeError({
          stage: "starting runtime",
          message: `Runtime snapshot "${input.runtimeId}" was not found.`,
        });
      }

      state.projectId = input.projectId;
      state.cwd = input.cwd;

      return cloneSessionState(state);
    },

    async sendInitialPrompt(input) {
      try {
        const envelope = await invokeEventCommand(
          "send_prompt",
          {
            piSessionId: input.piSessionId,
            prompt: input.prompt,
          },
          {
            piSessionId: input.piSessionId,
            kind: "message",
            role: "user",
            body: input.prompt,
          },
        );
        const event = runtimeEventFromEnvelope(envelope);

        recordEvent(event, false);

        return {
          accepted: true,
          piSessionId: input.piSessionId,
          event: cloneRuntimeEvent(event),
        };
      } catch (error) {
        throw new PiRuntimeBridgeError({
          stage: "sending prompt",
          message: errorMessage(error),
        });
      }
    },

    async queueFollowUp(input) {
      try {
        const queuedMessage = queuedMessageFromGateway(
          await invoke<RuntimeGatewayQueuedMessage>("queue_follow_up", {
            piSessionId: input.piSessionId,
            message: input.message,
          }),
        );

        queuedMessages.set(queuedMessage.id, queuedMessage);

        return cloneQueuedMessage(queuedMessage);
      } catch (error) {
        throw new PiRuntimeBridgeError({
          stage: "queuing message",
          message: errorMessage(error),
        });
      }
    },

    async withdrawQueuedMessage(input) {
      try {
        const withdrawnMessage = queuedMessageFromGateway(
          await invoke<RuntimeGatewayQueuedMessage>("withdraw_queued_message", {
            piSessionId: input.piSessionId,
            queuedMessageId: input.queuedMessageId,
          }),
        );

        queuedMessages.set(withdrawnMessage.id, withdrawnMessage);

        return cloneQueuedMessage(withdrawnMessage);
      } catch (error) {
        throw new PiRuntimeBridgeError({
          stage: "withdrawing queued message",
          message: errorMessage(error),
        });
      }
    },

    async steerRun(input) {
      try {
        const envelope = await invokeEventCommand(
          "steer_run",
          {
            piSessionId: input.piSessionId,
            message: input.message,
          },
          {
            piSessionId: input.piSessionId,
            kind: "control",
            role: "user",
            title: "Steer",
            body: input.message,
          },
        );
        const event = runtimeEventFromEnvelope(envelope);

        recordEvent(event, false);

        return cloneRuntimeEvent(event);
      } catch (error) {
        throw new PiRuntimeBridgeError({
          stage: "steering run",
          message: errorMessage(error),
        });
      }
    },

    async abortRun(input) {
      try {
        const envelope = await invokeEventCommand(
          "stop_run",
          {
            piSessionId: input.piSessionId,
          },
          {
            piSessionId: input.piSessionId,
            kind: "status",
            title: "Stopped",
            body: "Pi stopped the active run.",
          },
        );
        const event = runtimeEventFromEnvelope(envelope);

        recordEvent(event, false);

        return cloneRuntimeEvent(event);
      } catch (error) {
        throw new PiRuntimeBridgeError({
          stage: "stopping run",
          message: errorMessage(error),
        });
      }
    },

    async getSessionState(piSessionId) {
      const localState = states.get(piSessionId);

      try {
        const remoteState = stateFromSnapshot(
          await invoke<RuntimeGatewaySnapshot>("get_runtime_snapshot", {
            piSessionId,
          }),
        );
        const localEvents = localState?.events ?? [];

        remoteState.events =
          remoteState.events.length >= localEvents.length
            ? remoteState.events
            : localEvents.map(cloneRuntimeEvent);
        if (localState?.summary) {
          remoteState.summary = defaultRuntimeSummary({
            ...remoteState.summary,
            ...localState.summary,
          });
        }
        rememberState(remoteState);

        return cloneSessionState(remoteState);
      } catch (error) {
        if (localState) {
          return cloneSessionState(localState);
        }

        throw new PiRuntimeBridgeError({
          stage: "starting runtime",
          message: errorMessage(error),
        });
      }
    },

    subscribeToEvents(piSessionId, listener) {
      ensureBackendSubscription();

      const sessionListeners = listeners.get(piSessionId) ?? new Set();

      sessionListeners.add(listener);
      listeners.set(piSessionId, sessionListeners);

      return () => {
        sessionListeners.delete(listener);
        releaseBackendSubscriptionIfIdle();
      };
    },
  };
}
