import type { ExecutionCheckout, PiRuntimeEvent, PiSessionState } from "./pi-runtime-bridge";

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
  stale: boolean;
  staleReason: string | null;
  failure: SessionCreationFailure | null;
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
      occurredAt: string;
    }
  | {
      type: "runtime-event-received";
      stage: "accepted";
      event: PiRuntimeEvent;
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
    stale: false,
    staleReason: null,
    failure: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
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
        updatedAt: event.occurredAt,
      };
    case "runtime-event-received":
      return {
        ...projection,
        status: "running",
        creationStage: event.stage,
        runtimeEvents: [...projection.runtimeEvents, { ...event.event }],
        updatedAt: event.event.timestamp,
      };
    case "projection-marked-stale":
      return {
        ...projection,
        stale: true,
        staleReason: event.reason,
        updatedAt: event.occurredAt,
      };
    case "runtime-state-resynced":
      return {
        ...projection,
        status: sessionStatusFromRuntimeState(event.state),
        runtimeId: event.state.runtimeId,
        piSessionId: event.state.piSessionId,
        runtimeEvents: event.state.events.map((runtimeEvent) => ({ ...runtimeEvent })),
        stale: false,
        staleReason: null,
        updatedAt: event.state.updatedAt,
      };
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
