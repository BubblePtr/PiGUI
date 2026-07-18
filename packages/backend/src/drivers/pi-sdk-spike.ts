import type {
  RuntimeGatewayBackendEvent,
  RuntimeGatewayServiceOptions,
} from "../gateway/runtime-gateway";
import { createRuntimeGatewayService } from "../gateway/runtime-gateway";
import {
  createPiSdkDriver,
  type PiSdkRuntimeFactory,
  type PiSdkSessionRuntime,
} from "./pi-sdk-driver";

export const PI_SDK_SPIKE_ENV = "PIGUI_RUN_PI_SDK_SPIKE";
export const PI_SDK_SPIKE_PROMPT = "Reply with exactly: PIGUI_SDK_SPIKE_OK";
export const PI_SDK_SPIKE_EXPECTED_TEXT = "PIGUI_SDK_SPIKE_OK";

export type PiSdkSpikeCapabilityStatus =
  | "confirmed"
  | "partial"
  | "missing"
  | "unknown"
  | "not-required";

export type PiSdkSpikeCapability =
  | "create_session"
  | "send_prompt"
  | "receive_normalized_runtime_event"
  | "get_runtime_snapshot"
  | "session_identity"
  | "message_identity"
  | "event_order"
  | "Queue"
  | "Steer"
  | "Stop"
  | "usage_cost"
  | "model_thinking"
  | "extension_ui_request"
  | "resource_loading_cwd"
  | "auth_model_registry"
  | "error_crash_recovery";

export type PiSdkSpikeCapabilityResult = {
  status: PiSdkSpikeCapabilityStatus;
  evidence?: string;
  notes?: string;
};

export type PiSdkSpikeReport = {
  ok: boolean;
  enabled: boolean;
  reason?: "not-enabled" | "failed";
  prompt: string;
  capabilities: Record<PiSdkSpikeCapability, PiSdkSpikeCapabilityResult>;
  events: RuntimeGatewayBackendEvent[];
  snapshot?: unknown;
  error?: string;
};

export type RunPiSdkDriverSpikeOptions = {
  env?: Record<string, string | undefined>;
  cwd: string;
  projectId?: string;
  sessionId?: string;
  runtimeFactory: PiSdkRuntimeFactory;
  now?: RuntimeGatewayServiceOptions["now"];
  idFactory?: RuntimeGatewayServiceOptions["idFactory"];
  waitTimeoutMs?: number;
};

function defaultCapabilities(): Record<PiSdkSpikeCapability, PiSdkSpikeCapabilityResult> {
  return {
    create_session: { status: "unknown" },
    send_prompt: { status: "unknown" },
    receive_normalized_runtime_event: { status: "unknown" },
    get_runtime_snapshot: { status: "unknown" },
    session_identity: { status: "unknown" },
    message_identity: { status: "unknown" },
    event_order: { status: "unknown" },
    Queue: { status: "not-required" },
    Steer: { status: "not-required" },
    Stop: { status: "not-required" },
    usage_cost: { status: "not-required" },
    model_thinking: { status: "not-required" },
    extension_ui_request: { status: "not-required" },
    resource_loading_cwd: { status: "not-required" },
    auth_model_registry: { status: "not-required" },
    error_crash_recovery: { status: "not-required" },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eventEnvelopes(events: RuntimeGatewayBackendEvent[]) {
  return events.filter((event) => event.type === "event").map((event) => event.event);
}

function payloadString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function payloadNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasExpectedAssistantEvent(events: RuntimeGatewayBackendEvent[]) {
  const assistantText = eventEnvelopes(events).map((event) => {
    const payload = event.payload;

    if (
      payload.kind === "message" &&
      payload.role === "assistant"
    ) {
      return payloadString(payload.body);
    }

    return "";
  }).join("");

  return assistantText.includes(PI_SDK_SPIKE_EXPECTED_TEXT);
}

function hasCompletedStatusEvent(events: RuntimeGatewayBackendEvent[]) {
  return eventEnvelopes(events).some((event) => {
    const payload = event.payload;

    return (
      payload.kind === "status" &&
      payload.title === "Completed"
    );
  });
}

function sameSessionIdentity(input: {
  snapshot: Record<string, unknown>;
  events: RuntimeGatewayBackendEvent[];
  ignoredEventId?: string | null;
}) {
  const piSessionId = payloadString(input.snapshot.piSessionId);
  const envelopes = eventEnvelopes(input.events).filter(
    (event) => event.id !== input.ignoredEventId,
  );

  if (!piSessionId || envelopes.length === 0) {
    return false;
  }

  return envelopes.every((event) => event.piSessionId === piSessionId);
}

function hasOrderedEvents(events: RuntimeGatewayBackendEvent[]) {
  const seqs = eventEnvelopes(events).map((event) => event.seq);

  if (seqs.length === 0) {
    return false;
  }

  return seqs.every((seq, index) => index === 0 || seq > seqs[index - 1]!);
}

function hasMessageIdentity(events: RuntimeGatewayBackendEvent[]) {
  return eventEnvelopes(events).some(
    (event) =>
      typeof event.turnId === "string" ||
      typeof event.payload.messageId === "string" ||
      typeof event.payload.id === "string",
  );
}

function coreCapabilitiesConfirmed(capabilities: Record<PiSdkSpikeCapability, PiSdkSpikeCapabilityResult>) {
  return (
    capabilities.create_session.status === "confirmed" &&
    capabilities.send_prompt.status === "confirmed" &&
    capabilities.receive_normalized_runtime_event.status === "confirmed" &&
    capabilities.get_runtime_snapshot.status === "confirmed" &&
    capabilities.session_identity.status === "confirmed"
  );
}

async function disposeCreatedRuntimes(runtimes: PiSdkSessionRuntime[]) {
  await Promise.allSettled(runtimes.map((runtime) => runtime.dispose?.()));
}

async function waitFor(input: {
  predicate: () => boolean;
  timeoutMs: number;
  intervalMs?: number;
}) {
  const startedAt = Date.now();
  const intervalMs = input.intervalMs ?? 25;

  while (!input.predicate()) {
    if (Date.now() - startedAt >= input.timeoutMs) {
      return false;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  return true;
}

export async function runPiSdkDriverSpike(
  options: RunPiSdkDriverSpikeOptions,
): Promise<PiSdkSpikeReport> {
  const env = options.env ?? process.env;
  const capabilities = defaultCapabilities();
  const events: RuntimeGatewayBackendEvent[] = [];

  if (env[PI_SDK_SPIKE_ENV] !== "1") {
    return {
      ok: false,
      enabled: false,
      reason: "not-enabled",
      prompt: PI_SDK_SPIKE_PROMPT,
      capabilities,
      events,
    };
  }

  const createdRuntimes: PiSdkSessionRuntime[] = [];
  const runtimeFactory: PiSdkRuntimeFactory = async (input) => {
    const runtime = await options.runtimeFactory(input);

    createdRuntimes.push(runtime);

    return runtime;
  };
  const service = createRuntimeGatewayService({
    driver: createPiSdkDriver({
      runtimeFactory,
      now: options.now,
    }),
    now: options.now,
    idFactory: options.idFactory,
  });

  service.onEvent((event) => {
    events.push(event);
  });

  try {
    const createResponse = await service.handleRequest({
      id: "sdk-spike-create",
      method: "create_session",
      params: {
        sessionId: options.sessionId ?? "sdk-spike-session",
        projectId: options.projectId ?? "sdk-spike",
        cwd: options.cwd,
      },
    });

    if (createResponse.error || !isRecord(createResponse.result)) {
      throw new Error(createResponse.error ?? "SDK spike create_session returned no snapshot.");
    }

    capabilities.create_session = {
      status: "confirmed",
      evidence: payloadString(createResponse.result.piSessionId),
    };

    const sendResponse = await service.handleRequest({
      id: "sdk-spike-prompt",
      method: "send_prompt",
      params: {
        piSessionId: createResponse.result.piSessionId,
        prompt: PI_SDK_SPIKE_PROMPT,
      },
    });

    if (sendResponse.error || !isRecord(sendResponse.result)) {
      throw new Error(sendResponse.error ?? "SDK spike send_prompt returned no event.");
    }

    capabilities.send_prompt = {
      status: "confirmed",
      evidence: "send_prompt accepted by Runtime Gateway",
    };
    const syntheticSendEventId = payloadString(sendResponse.result.id);
    await waitFor({
      predicate: () => hasExpectedAssistantEvent(events) && hasCompletedStatusEvent(events),
      timeoutMs: options.waitTimeoutMs ?? 30_000,
    });

    const snapshotResponse = await service.handleRequest({
      id: "sdk-spike-snapshot",
      method: "get_runtime_snapshot",
      params: {
        piSessionId: createResponse.result.piSessionId,
      },
    });

    if (snapshotResponse.error || !isRecord(snapshotResponse.result)) {
      throw new Error(snapshotResponse.error ?? "SDK spike get_runtime_snapshot returned no snapshot.");
    }

    capabilities.get_runtime_snapshot = {
      status: "confirmed",
      evidence: payloadString(snapshotResponse.result.piSessionId),
    };
    capabilities.receive_normalized_runtime_event = hasExpectedAssistantEvent(events)
      ? {
          status: "confirmed",
          evidence: PI_SDK_SPIKE_EXPECTED_TEXT,
        }
      : {
          status: "missing",
          notes: "No assistant Runtime Gateway event contained the expected spike text.",
        };
    capabilities.session_identity = sameSessionIdentity({
      snapshot: snapshotResponse.result,
      events,
      ignoredEventId: syntheticSendEventId,
    })
      ? {
          status: "confirmed",
          evidence: payloadString(snapshotResponse.result.piSessionId),
        }
      : {
          status: "missing",
          notes: "Gateway events did not share the snapshot piSessionId.",
        };
    capabilities.event_order = hasOrderedEvents(events)
      ? {
          status: "confirmed",
          evidence: "Gateway event seq values are increasing.",
        }
      : {
          status: "partial",
          notes: "Gateway events were not strictly ordered by seq.",
        };
    capabilities.message_identity = hasMessageIdentity(events)
      ? {
          status: "partial",
          evidence: "Gateway event included turnId or message identity payload.",
        }
      : {
          status: "missing",
          notes: "No stable message identity was visible in Gateway events.",
        };
    const snapshotSummary = isRecord(snapshotResponse.result.summary)
      ? snapshotResponse.result.summary
      : null;
    const totalTokens = payloadNumber(snapshotSummary?.totalTokens);
    const totalCostUsd = payloadNumber(snapshotSummary?.totalCostUsd);
    const provider = payloadString(snapshotSummary?.provider);
    const model = payloadString(snapshotSummary?.model);
    const snapshotCwd = payloadString(snapshotResponse.result.cwd);

    if (snapshotSummary && totalTokens !== null && totalCostUsd !== null) {
      capabilities.usage_cost = {
        status: "confirmed",
        evidence: `totalTokens=${totalTokens} totalCostUsd=${totalCostUsd}`,
      };
    }

    if (provider || model) {
      capabilities.model_thinking = {
        status: "partial",
        evidence: `provider=${provider || "unknown"} model=${model || "unknown"}`,
        notes: "Snapshot summary maps model identity; Gateway model/thinking commands are not part of this spike contract yet.",
      };
    }

    if (snapshotCwd === options.cwd) {
      capabilities.resource_loading_cwd = {
        status: "partial",
        evidence: snapshotCwd,
        notes: "Snapshot cwd maps through Runtime Gateway; full resource discovery remains a separate product verification.",
      };
    }

    return {
      ok: coreCapabilitiesConfirmed(capabilities),
      enabled: true,
      prompt: PI_SDK_SPIKE_PROMPT,
      capabilities,
      events,
      snapshot: snapshotResponse.result,
    };
  } catch (error) {
    return {
      ok: false,
      enabled: true,
      reason: "failed",
      prompt: PI_SDK_SPIKE_PROMPT,
      capabilities,
      events,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await disposeCreatedRuntimes(createdRuntimes);
  }
}
