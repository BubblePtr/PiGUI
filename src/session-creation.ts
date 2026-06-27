import type { SessionDraft } from "./session-drafts";
import { PiRuntimeBridgeError, type PiRuntimeBridge } from "./pi-runtime-bridge";
import {
  createExecutionCheckoutManager,
  type ExecutionCheckoutManager,
} from "./execution-checkout";
import {
  applySessionProjectionEvent,
  createSessionProjection,
  type SessionCreationFailureStage,
  type SessionProjection,
} from "./session-projection";

export type ProjectSessionCreationTarget = {
  id: string;
  repoRoot: string;
  projectRoot: string;
};

export type SessionProjectionStore = {
  get(id: string): SessionProjection | null;
  list(): SessionProjection[];
  save(projection: SessionProjection): SessionProjection;
};

export type CreateSessionFromDraftInput = {
  bridge: PiRuntimeBridge;
  checkoutManager?: ExecutionCheckoutManager;
  projections: SessionProjectionStore;
  draft: SessionDraft;
  project: ProjectSessionCreationTarget;
  executionMode?: "foreground" | "background";
  now?: () => string;
  idFactory?: () => string;
  onProjectionChange?: (projection: SessionProjection) => void;
};

export type CreateSessionFromDraftResult =
  | {
      ok: true;
      clearDraft: true;
      projection: SessionProjection;
      unsubscribeRuntimeEvents: () => void;
    }
  | {
      ok: false;
      clearDraft: false;
      projection: SessionProjection;
    };

export function createInMemorySessionProjectionStore(): SessionProjectionStore {
  const projections = new Map<string, SessionProjection>();

  return {
    get(id) {
      return projections.get(id) ?? null;
    },
    list() {
      return Array.from(projections.values());
    },
    save(projection) {
      projections.set(projection.id, projection);

      return projection;
    },
  };
}

function defaultIdFactory() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `session-${crypto.randomUUID()}`;
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSessionCreationFailureStage(
  stage: string,
): stage is SessionCreationFailureStage {
  return (
    stage === "preparing checkout" ||
    stage === "starting runtime" ||
    stage === "sending prompt"
  );
}

function failureDetail(error: unknown, fallbackStage: SessionCreationFailureStage) {
  if (error instanceof PiRuntimeBridgeError) {
    return {
      stage: isSessionCreationFailureStage(error.stage) ? error.stage : fallbackStage,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      stage: fallbackStage,
      message: error.message,
    };
  }

  return {
    stage: fallbackStage,
    message: String(error),
  };
}

export async function createSessionFromDraft(
  input: CreateSessionFromDraftInput,
): Promise<CreateSessionFromDraftResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const idFactory = input.idFactory ?? defaultIdFactory;
  const checkoutManager = input.checkoutManager ?? createExecutionCheckoutManager();
  let failureStage: SessionCreationFailureStage = "preparing checkout";
  let projection = createSessionProjection({
    id: idFactory(),
    projectId: input.draft.projectId,
    initialPrompt: input.draft.prompt,
    createdAt: now(),
  });

  const commit = (nextProjection: SessionProjection) => {
    projection = input.projections.save(nextProjection);
    input.onProjectionChange?.(projection);
  };

  commit(projection);
  let unsubscribeRuntimeEvents: (() => void) | null = null;

  try {
    const checkout = await checkoutManager.prepareCheckout({
      sessionId: projection.id,
      strategy:
        input.executionMode === "background" ? "background-managed" : "foreground-local",
      project: input.project,
      now,
    });

    commit(
      applySessionProjectionEvent(projection, {
        type: "checkout-selected",
        stage: "preparing checkout",
        checkout,
        occurredAt: now(),
      }),
    );

    failureStage = "starting runtime";
    const runtime = await input.bridge.startRuntime({
      sessionId: projection.id,
      projectId: input.project.id,
      checkout,
    });
    const piState = await input.bridge.createPiSessionState({
      runtimeId: runtime.runtimeId,
      projectId: input.project.id,
      cwd: checkout.runtimeCwd,
    });
    unsubscribeRuntimeEvents = input.bridge.subscribeToEvents(piState.piSessionId, (event) => {
      commit(
        applySessionProjectionEvent(projection, {
          type: "runtime-event-received",
          event,
        }),
      );
    });

    commit(
      applySessionProjectionEvent(projection, {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: runtime.runtimeId,
        piSessionId: piState.piSessionId,
        summary: piState.summary,
        occurredAt: now(),
      }),
    );
    failureStage = "sending prompt";
    commit(
      applySessionProjectionEvent(projection, {
        type: "creation-stage-changed",
        stage: "sending prompt",
        occurredAt: now(),
      }),
    );

    const accepted = await input.bridge.sendInitialPrompt({
      piSessionId: piState.piSessionId,
      prompt: input.draft.prompt,
    });

    commit(
      applySessionProjectionEvent(projection, {
        type: "runtime-event-received",
        stage: "accepted",
        event: accepted.event,
      }),
    );

    return {
      ok: true,
      clearDraft: true,
      projection,
      unsubscribeRuntimeEvents,
    };
  } catch (error) {
    unsubscribeRuntimeEvents?.();
    const detail = failureDetail(error, failureStage);

    commit(
      applySessionProjectionEvent(projection, {
        type: "creation-failed",
        stage: detail.stage,
        message: detail.message,
        occurredAt: now(),
      }),
    );

    return {
      ok: false,
      clearDraft: false,
      projection,
    };
  }
}
