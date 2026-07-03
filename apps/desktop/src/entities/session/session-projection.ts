import type {
  ExecutionCheckout,
  PiQueuedMessage,
  PiRuntimeEvent,
  PiRuntimeSummary,
  PiSessionState,
} from "@/entities/runtime/pi-runtime-bridge";
import {
  addLegacyChatEventToModel,
  applyAgentRuntimeEvent,
  createSessionRuntimeModel,
  sessionStatusFromRuntimeModel,
  type AgentRuntimeEventInput,
  type SessionRuntimeModel,
} from "@/entities/session/session-runtime-model";

export type SessionStatus = "creating" | "running" | "waiting" | "failed" | "completed" | "archived";

export type SessionCreationStage =
  | "preparing checkout"
  | "starting runtime"
  | "sending prompt"
  | "accepted"
  | "failed";

export type SessionCreationFailureStage = Exclude<
  SessionCreationStage,
  "accepted" | "failed"
>;

export type SessionCreationFailure = {
  stage: SessionCreationFailureStage;
  message: string;
};

export type SessionProjection = {
  id: string;
  projectId: string;
  initialPrompt: string;
  status: SessionStatus;
  creationStage: SessionCreationStage;
  checkout: ExecutionCheckout | null;
  runtimeId: string | null;
  piSessionId: string | null;
  runtimeEvents: PiRuntimeEvent[];
  // Structured model built from the Agent Runtime Event stream. Once it has
  // seen run events, it owns the Session Status; legacy event kinds only
  // drive status for bridges that don't speak the new model yet.
  runtimeModel: SessionRuntimeModel;
  queuedMessages: PiQueuedMessage[];
  summary: PiRuntimeSummary;
  stale: boolean;
  staleReason: string | null;
  failure: SessionCreationFailure | null;
  unreadResult: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSessionProjectionInput = {
  id: string;
  projectId: string;
  initialPrompt: string;
  createdAt: string;
};

export type SessionProjectionEvent =
  | {
      type: "creation-stage-changed";
      stage: "starting runtime" | "sending prompt";
      occurredAt: string;
    }
  | {
      type: "checkout-selected";
      stage: "preparing checkout";
      checkout: ExecutionCheckout;
      occurredAt: string;
    }
  | {
      type: "runtime-bound";
      stage: "starting runtime";
      runtimeId: string;
      piSessionId: string;
      summary?: PiRuntimeSummary;
      occurredAt: string;
    }
  | {
      type: "runtime-event-received";
      stage?: "accepted";
      event: PiRuntimeEvent;
    }
  | {
      type: "agent-event-received";
      entry: AgentRuntimeEventInput;
    }
  | {
      type: "run-completed";
      event: PiRuntimeEvent;
    }
  | {
      type: "run-failed";
      event: PiRuntimeEvent;
    }
  | {
      type: "queued-message-added";
      queuedMessage: PiQueuedMessage;
    }
  | {
      type: "queued-message-withdrawn";
      queuedMessageId: string;
      occurredAt: string;
    }
  | {
      type: "queued-message-processing-started";
      queuedMessageId: string;
      event: PiRuntimeEvent;
    }
  | {
      type: "steer-submitted";
      event: PiRuntimeEvent;
    }
  | {
      type: "run-stopped";
      event: PiRuntimeEvent;
    }
  | {
      type: "run-stop-failed";
      event: PiRuntimeEvent;
    }
  | {
      type: "latest-message-rendered";
      occurredAt: string;
    }
  | {
      type: "session-archived";
      occurredAt: string;
    }
  | {
      type: "projection-marked-stale";
      reason: string;
      occurredAt: string;
    }
  | {
      type: "runtime-state-resynced";
      state: PiSessionState;
    }
  | {
      type: "creation-failed";
      stage: SessionCreationFailureStage;
      message: string;
      occurredAt: string;
    };

export type SessionProjectionListItem = {
  id: string;
  title: string;
  active: boolean;
  unread: boolean;
  archived: boolean;
  updatedAt: string;
  projection: SessionProjection;
};

export type GetSessionProjectionListItemsOptions = {
  includeArchived?: boolean;
};

export function createSessionProjection(
  input: CreateSessionProjectionInput,
): SessionProjection {
  return {
    id: input.id,
    projectId: input.projectId,
    initialPrompt: input.initialPrompt,
    status: "creating",
    creationStage: "preparing checkout",
    checkout: null,
    runtimeId: null,
    piSessionId: null,
    runtimeEvents: [],
    runtimeModel: createSessionRuntimeModel(),
    queuedMessages: [],
    summary: {
      provider: null,
      model: null,
      totalTokens: 0,
      totalCostUsd: 0,
    },
    stale: false,
    staleReason: null,
    failure: null,
    unreadResult: false,
    archivedAt: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function isSessionProjectionActive(projection: SessionProjection): boolean {
  return projection.status === "creating" || projection.status === "running";
}

export function isSessionProjectionArchived(projection: SessionProjection): boolean {
  return projection.status === "archived" || projection.archivedAt !== null;
}

export function canArchiveSessionProjection(projection: SessionProjection): boolean {
  return !isSessionProjectionActive(projection);
}

function activeRunUpdatedAt(projection: SessionProjection): string {
  return (
    projection.runtimeEvents[projection.runtimeEvents.length - 1]?.timestamp ??
    projection.updatedAt
  );
}

function projectionListSortKey(projection: SessionProjection): [number, string] {
  if (isSessionProjectionActive(projection)) {
    return [0, activeRunUpdatedAt(projection)];
  }

  if (projection.unreadResult) {
    return [1, projection.updatedAt];
  }

  return [2, projection.updatedAt];
}

export function getSessionProjectionListItems(
  projections: SessionProjection[],
  options: GetSessionProjectionListItemsOptions = {},
): SessionProjectionListItem[] {
  return projections
    .filter(
      (projection) => options.includeArchived || !isSessionProjectionArchived(projection),
    )
    .map((projection) => ({
      id: projection.id,
      title: projection.initialPrompt,
      active: isSessionProjectionActive(projection),
      unread: projection.unreadResult,
      archived: isSessionProjectionArchived(projection),
      updatedAt: projection.updatedAt,
      projection,
    }))
    .sort((left, right) => {
      const [leftGroup, leftTime] = projectionListSortKey(left.projection);
      const [rightGroup, rightTime] = projectionListSortKey(right.projection);

      if (leftGroup !== rightGroup) {
        return leftGroup - rightGroup;
      }

      return rightTime.localeCompare(leftTime);
    });
}

function sessionStatusFromRuntimeState(state: PiSessionState): SessionStatus {
  switch (state.status) {
    case "idle":
      return "waiting";
    case "running":
      return "running";
    case "failed":
      return "failed";
    case "completed":
      return "completed";
  }
}

function mergeRuntimeSummary(
  current: PiRuntimeSummary,
  next: Partial<PiRuntimeSummary> | undefined,
): PiRuntimeSummary {
  if (!next) {
    return current;
  }

  return {
    provider: next.provider ?? current.provider,
    model: next.model ?? current.model,
    totalTokens: next.totalTokens ?? current.totalTokens,
    totalCostUsd: next.totalCostUsd ?? current.totalCostUsd,
  };
}

function unreadResultFromRuntimeEvent(
  projection: SessionProjection,
  event: PiRuntimeEvent,
) {
  return event.role === "assistant" ? true : projection.unreadResult;
}

function queuedMessageProcessingIndex(
  projection: SessionProjection,
  event: PiRuntimeEvent,
) {
  if (event.kind !== "message" || event.role !== "user") {
    return -1;
  }

  return projection.queuedMessages.findIndex(
    (queuedMessage) =>
      queuedMessage.status === "pending" &&
      queuedMessage.piSessionId === event.piSessionId &&
      queuedMessage.body === event.body,
  );
}

function queuedMessagesAfterRuntimeEvent(
  projection: SessionProjection,
  event: PiRuntimeEvent,
) {
  const processingIndex = queuedMessageProcessingIndex(projection, event);

  if (processingIndex === -1) {
    return projection.queuedMessages;
  }

  return projection.queuedMessages.map((queuedMessage, index) =>
    index === processingIndex
      ? {
          ...queuedMessage,
          status: "processing" as const,
          processingStartedAt: event.timestamp,
        }
      : queuedMessage,
  );
}

// Gateway-minted chat events (user echo, steer control, driver/renderer
// errors) exist only on the legacy stream; mirror them into the runtime model
// so chat can render entirely from it. Compat-derived events already reached
// the model through the agent stream.
function runtimeModelAfterLegacyEvent(
  model: SessionRuntimeModel,
  event: PiRuntimeEvent,
): SessionRuntimeModel {
  if (event.derivedFromAgentEvent) {
    return model;
  }

  if (
    (event.kind === "message" && event.role === "user") ||
    event.kind === "control" ||
    event.kind === "error"
  ) {
    return addLegacyChatEventToModel(model, {
      id: event.id,
      kind: event.kind,
      role: event.role,
      title: event.title,
      body: event.body,
      messageId: event.messageId,
      timestamp: event.timestamp,
    });
  }

  return model;
}

// Rebuilds the runtime model from the snapshot's replay sequence, in Gateway
// seq order. The journal only carries boundary events, so the result is fully
// static — no message is left streaming. Without a replay sequence (legacy
// bridges) the model already accumulated live is kept as-is.
function runtimeModelFromReplay(
  current: SessionRuntimeModel,
  state: PiSessionState,
): SessionRuntimeModel {
  if (!state.replay?.length) {
    return current;
  }

  let model = createSessionRuntimeModel();

  for (const step of state.replay) {
    model =
      step.kind === "agent"
        ? applyAgentRuntimeEvent(model, step.entry)
        : runtimeModelAfterLegacyEvent(model, step.event);
  }

  return model;
}

function runtimeEventIdentity(event: PiRuntimeEvent): string | null {
  if (
    (event.kind === "message" || event.kind === "thinking") &&
    event.messageId
  ) {
    return `${event.piSessionId}\u0000${event.kind}\u0000${event.messageId}`;
  }

  if (
    (event.kind === "tool-call" || event.kind === "tool-result") &&
    event.toolCallId
  ) {
    return `${event.piSessionId}\u0000${event.kind}\u0000${event.toolCallId}`;
  }

  return null;
}

function upsertRuntimeEvent(
  events: PiRuntimeEvent[],
  event: PiRuntimeEvent,
): PiRuntimeEvent[] {
  const identity = runtimeEventIdentity(event);

  if (!identity) {
    return [...events, { ...event }];
  }

  const existingIndex = events.findIndex(
    (existingEvent) => runtimeEventIdentity(existingEvent) === identity,
  );

  if (existingIndex === -1) {
    return [...events, { ...event }];
  }

  return events.map((existingEvent, index) =>
    index === existingIndex ? { ...event } : existingEvent,
  );
}

function normalizedRuntimeEvents(events: PiRuntimeEvent[]): PiRuntimeEvent[] {
  return events.reduce<PiRuntimeEvent[]>(
    (normalizedEvents, runtimeEvent) =>
      upsertRuntimeEvent(normalizedEvents, runtimeEvent),
    [],
  );
}

export function applySessionProjectionEvent(
  projection: SessionProjection,
  event: SessionProjectionEvent,
): SessionProjection {
  switch (event.type) {
    case "creation-stage-changed":
      return {
        ...projection,
        creationStage: event.stage,
        updatedAt: event.occurredAt,
      };
    case "checkout-selected":
      return {
        ...projection,
        creationStage: event.stage,
        checkout: { ...event.checkout },
        updatedAt: event.occurredAt,
      };
    case "runtime-bound":
      return {
        ...projection,
        creationStage: event.stage,
        runtimeId: event.runtimeId,
        piSessionId: event.piSessionId,
        summary: event.summary ? { ...event.summary } : projection.summary,
        updatedAt: event.occurredAt,
      };
    case "runtime-event-received":
      return {
        ...projection,
        // Once Active Run events own the status, legacy kinds stop guessing —
        // a compat "Retrying" status must not complete a running Session.
        status:
          projection.runtimeModel.runs.size > 0
            ? projection.status
            : event.event.kind === "error"
              ? "failed"
              : event.event.kind === "status"
                ? "completed"
                : "running",
        creationStage: event.stage ?? projection.creationStage,
        runtimeEvents: upsertRuntimeEvent(projection.runtimeEvents, event.event),
        runtimeModel: runtimeModelAfterLegacyEvent(projection.runtimeModel, event.event),
        queuedMessages: queuedMessagesAfterRuntimeEvent(projection, event.event),
        summary: mergeRuntimeSummary(projection.summary, event.event.summary),
        unreadResult: unreadResultFromRuntimeEvent(projection, event.event),
        updatedAt: event.event.timestamp,
      };
    case "agent-event-received": {
      const runtimeModel = applyAgentRuntimeEvent(projection.runtimeModel, event.entry);

      if (runtimeModel === projection.runtimeModel) {
        return projection;
      }

      const agentEvent = event.entry.event;
      const finalizedAssistantAnswer =
        agentEvent.type === "message" &&
        agentEvent.phase === "end" &&
        agentEvent.role === "assistant" &&
        !agentEvent.abandoned;

      return {
        ...projection,
        status: sessionStatusFromRuntimeModel(runtimeModel) ?? projection.status,
        runtimeModel,
        summary:
          agentEvent.type === "usage"
            ? mergeRuntimeSummary(projection.summary, agentEvent.summary)
            : projection.summary,
        unreadResult: finalizedAssistantAnswer ? true : projection.unreadResult,
        updatedAt: event.entry.timestamp,
      };
    }
    case "run-completed":
      return {
        ...projection,
        status: "completed",
        runtimeEvents: upsertRuntimeEvent(projection.runtimeEvents, event.event),
        runtimeModel: runtimeModelAfterLegacyEvent(projection.runtimeModel, event.event),
        summary: mergeRuntimeSummary(projection.summary, event.event.summary),
        unreadResult: true,
        updatedAt: event.event.timestamp,
      };
    case "run-failed":
      return {
        ...projection,
        status: "failed",
        runtimeEvents: upsertRuntimeEvent(projection.runtimeEvents, event.event),
        runtimeModel: runtimeModelAfterLegacyEvent(projection.runtimeModel, event.event),
        summary: mergeRuntimeSummary(projection.summary, event.event.summary),
        unreadResult: true,
        updatedAt: event.event.timestamp,
      };
    case "queued-message-added":
      return {
        ...projection,
        queuedMessages: [
          ...projection.queuedMessages,
          { ...event.queuedMessage },
        ],
        updatedAt: event.queuedMessage.createdAt,
      };
    case "queued-message-withdrawn":
      return {
        ...projection,
        queuedMessages: projection.queuedMessages.map((queuedMessage) => {
          if (queuedMessage.id !== event.queuedMessageId) {
            return queuedMessage;
          }

          if (queuedMessage.status !== "pending") {
            throw new Error("Queued message can no longer be withdrawn.");
          }

          return {
            ...queuedMessage,
            status: "withdrawn",
            withdrawnAt: event.occurredAt,
          };
        }),
        updatedAt: event.occurredAt,
      };
    case "queued-message-processing-started":
      return {
        ...projection,
        runtimeEvents: upsertRuntimeEvent(projection.runtimeEvents, event.event),
        runtimeModel: runtimeModelAfterLegacyEvent(projection.runtimeModel, event.event),
        queuedMessages: projection.queuedMessages.map((queuedMessage) =>
          queuedMessage.id === event.queuedMessageId
            ? {
                ...queuedMessage,
                status: "processing",
                processingStartedAt: event.event.timestamp,
              }
            : queuedMessage,
        ),
        updatedAt: event.event.timestamp,
      };
    case "steer-submitted":
      return {
        ...projection,
        status: "running",
        runtimeEvents: upsertRuntimeEvent(projection.runtimeEvents, event.event),
        runtimeModel: runtimeModelAfterLegacyEvent(projection.runtimeModel, event.event),
        summary: mergeRuntimeSummary(projection.summary, event.event.summary),
        unreadResult: unreadResultFromRuntimeEvent(projection, event.event),
        updatedAt: event.event.timestamp,
      };
    case "run-stopped":
      return {
        ...projection,
        status: "completed",
        runtimeEvents: upsertRuntimeEvent(projection.runtimeEvents, event.event),
        runtimeModel: runtimeModelAfterLegacyEvent(projection.runtimeModel, event.event),
        summary: mergeRuntimeSummary(projection.summary, event.event.summary),
        unreadResult: true,
        updatedAt: event.event.timestamp,
      };
    case "run-stop-failed":
      return {
        ...projection,
        status: projection.status,
        runtimeEvents: upsertRuntimeEvent(projection.runtimeEvents, event.event),
        runtimeModel: runtimeModelAfterLegacyEvent(projection.runtimeModel, event.event),
        summary: mergeRuntimeSummary(projection.summary, event.event.summary),
        unreadResult: unreadResultFromRuntimeEvent(projection, event.event),
        updatedAt: event.event.timestamp,
      };
    case "latest-message-rendered":
      return {
        ...projection,
        unreadResult: false,
      };
    case "session-archived":
      if (!canArchiveSessionProjection(projection)) {
        throw new Error("Cannot archive an active Session.");
      }

      return {
        ...projection,
        archivedAt: event.occurredAt,
      };
    case "projection-marked-stale":
      return {
        ...projection,
        stale: true,
        staleReason: event.reason,
        updatedAt: event.occurredAt,
      };
    case "runtime-state-resynced": {
      const runtimeModel = runtimeModelFromReplay(projection.runtimeModel, event.state);

      return {
        ...projection,
        // Once the rebuilt model has Active Runs it owns the Session Status;
        // otherwise the bridge-reported state remains the truth.
        status:
          sessionStatusFromRuntimeModel(runtimeModel) ??
          sessionStatusFromRuntimeState(event.state),
        runtimeId: event.state.runtimeId,
        piSessionId: event.state.piSessionId,
        runtimeEvents: normalizedRuntimeEvents(event.state.events),
        runtimeModel,
        summary: event.state.summary ? { ...event.state.summary } : projection.summary,
        stale: false,
        staleReason: null,
        updatedAt: event.state.updatedAt,
      };
    }
    case "creation-failed":
      return {
        ...projection,
        status: "failed",
        creationStage: "failed",
        failure: {
          stage: event.stage,
          message: event.message,
        },
        updatedAt: event.occurredAt,
      };
  }
}
