import type {
  RuntimeGatewayEventEnvelope,
  RuntimeGatewayEventInput,
  RuntimeGatewayQueuedMessage,
  RuntimeGatewayRequest,
  RuntimeGatewayResponse,
  RuntimeGatewaySnapshot,
} from "@pigui/core";
import { createRuntimeGatewaySequencer, shouldJournalRuntimeEvent } from "@pigui/core";
import type { SessionEventJournal } from "./session-event-journal";

export type RuntimeGatewayDriverEvent = Omit<RuntimeGatewayEventInput, "sessionId"> & {
  sessionId?: string;
};

export type CreateRuntimeSessionInput = {
  sessionId: string;
  projectId: string;
  cwd: string;
  checkout?: unknown;
};

export type SendPromptInput = {
  piSessionId: string;
  prompt: string;
};

export type QueueFollowUpInput = {
  piSessionId: string;
  message: string;
};

export type WithdrawQueuedMessageInput = {
  piSessionId: string;
  queuedMessageId: string;
};

export type SteerRunInput = {
  piSessionId: string;
  message: string;
};

export type StopRunInput = {
  piSessionId: string;
};

export type PiRuntimeDriver = {
  createSession(input: CreateRuntimeSessionInput): Promise<RuntimeGatewaySnapshot>;
  sendPrompt(input: SendPromptInput): Promise<RuntimeGatewayDriverEvent>;
  queueFollowUp(input: QueueFollowUpInput): Promise<RuntimeGatewayQueuedMessage>;
  withdrawQueuedMessage(input: WithdrawQueuedMessageInput): Promise<RuntimeGatewayQueuedMessage>;
  steerRun(input: SteerRunInput): Promise<RuntimeGatewayDriverEvent>;
  stopRun(input: StopRunInput): Promise<RuntimeGatewayDriverEvent>;
  getSnapshot(piSessionId: string): Promise<RuntimeGatewaySnapshot>;
  onEvent(listener: (event: RuntimeGatewayDriverEvent) => void): () => void;
};

export type RuntimeGatewayBackendEvent = {
  type: "event";
  event: RuntimeGatewayEventEnvelope;
};

export type RuntimeGatewayService = {
  handleRequest(request: RuntimeGatewayRequest): Promise<RuntimeGatewayResponse>;
  onEvent(listener: (event: RuntimeGatewayBackendEvent) => void): () => void;
};

export type RuntimeGatewayServiceOptions = {
  driver: PiRuntimeDriver;
  // Boundary-event journal backing snapshot replay; without it snapshots
  // fall back to whatever events the driver reports (historically none).
  journal?: SessionEventJournal;
  now?: () => string;
  idFactory?: () => string;
};

export function createRuntimeGatewayService(
  options: RuntimeGatewayServiceOptions,
): RuntimeGatewayService {
  const listeners = new Set<(event: RuntimeGatewayBackendEvent) => void>();
  const sessionIdsByPiSessionId = new Map<string, string>();
  const nextEvent = createRuntimeGatewaySequencer({
    now: options.now,
    idFactory: options.idFactory,
  });

  const emit = (event: RuntimeGatewayDriverEvent) => {
    const sessionId =
      event.sessionId ?? sessionIdsByPiSessionId.get(event.piSessionId);

    if (!sessionId) {
      return null;
    }

    const envelope = nextEvent({
      sessionId,
      piSessionId: event.piSessionId,
      turnId: event.turnId,
      type: event.type,
      payload: event.payload,
    });
    const backendEvent: RuntimeGatewayBackendEvent = {
      type: "event",
      event: envelope,
    };

    if (options.journal && shouldJournalRuntimeEvent(envelope.payload)) {
      options.journal.append(envelope);
    }

    for (const listener of listeners) {
      listener(backendEvent);
    }

    return envelope;
  };

  options.driver.onEvent((event) => {
    emit(event);
  });

  return {
    async handleRequest(request) {
      try {
        return {
          id: request.id,
          result: await dispatchRuntimeGatewayRequest({
            request,
            driver: options.driver,
            journal: options.journal,
            emit,
            rememberSession(snapshot) {
              sessionIdsByPiSessionId.set(snapshot.piSessionId, snapshot.sessionId);
            },
          }),
        };
      } catch (error) {
        return {
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    onEvent(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

async function dispatchRuntimeGatewayRequest(input: {
  request: RuntimeGatewayRequest;
  driver: PiRuntimeDriver;
  journal?: SessionEventJournal;
  emit: (event: RuntimeGatewayDriverEvent) => RuntimeGatewayEventEnvelope | null;
  rememberSession: (snapshot: RuntimeGatewaySnapshot) => void;
}) {
  const params = paramsRecord(input.request.params);

  switch (input.request.method) {
    case "create_session": {
      const snapshot = await input.driver.createSession({
        sessionId: requiredString(params.sessionId, "sessionId"),
        projectId: requiredString(params.projectId, "projectId"),
        cwd: requiredString(params.cwd, "cwd"),
        checkout: params.checkout,
      });

      input.rememberSession(snapshot);

      return snapshot;
    }
    case "send_prompt":
      return input.emit(
        await input.driver.sendPrompt({
          piSessionId: requiredString(params.piSessionId, "piSessionId"),
          prompt: requiredString(params.prompt, "prompt"),
        }),
      );
    case "queue_follow_up":
      return input.driver.queueFollowUp({
        piSessionId: requiredString(params.piSessionId, "piSessionId"),
        message: requiredString(params.message, "message"),
      });
    case "withdraw_queued_message":
      return input.driver.withdrawQueuedMessage({
        piSessionId: requiredString(params.piSessionId, "piSessionId"),
        queuedMessageId: requiredString(params.queuedMessageId, "queuedMessageId"),
      });
    case "steer_run":
      return input.emit(
        await input.driver.steerRun({
          piSessionId: requiredString(params.piSessionId, "piSessionId"),
          message: requiredString(params.message, "message"),
        }),
      );
    case "stop_run":
      return input.emit(
        await input.driver.stopRun({
          piSessionId: requiredString(params.piSessionId, "piSessionId"),
        }),
      );
    case "get_runtime_snapshot": {
      const piSessionId = requiredString(params.piSessionId, "piSessionId");
      const snapshot = await input.driver.getSnapshot(piSessionId);
      const journaled = (await input.journal?.read(piSessionId)) ?? [];

      // The journal is the Gateway's event truth; drivers only own
      // status/summary. Fall back to driver events when nothing was journaled.
      return journaled.length ? { ...snapshot, events: journaled } : snapshot;
    }
    default:
      throw new Error(`Unknown Runtime Gateway method "${input.request.method}".`);
  }
}

function paramsRecord(params: unknown) {
  return isRecord(params) ? params : {};
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
