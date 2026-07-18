import type {
  RuntimeGatewayEventEnvelope,
  RuntimeGatewayEventInput,
  RuntimeGatewayQueuedMessage,
  RuntimeGatewayRequest,
  RuntimeGatewayResponse,
  RuntimeGatewaySnapshot,
} from "@pigui/core";
import { createRuntimeGatewaySequencer, shouldJournalRuntimeEvent } from "@pigui/core";
import {
  copiedSessionEventInputsForFork,
  forkMarkerEventInput,
  prepareSessionEventJournalFork,
  type PreparedSessionEventJournalFork,
  type SessionEventJournal,
} from "../persistence/session-event-journal";
import {
  mergeSessionProjection,
  projectionFromRuntimeSnapshot,
  type SessionProjectionStore,
  type PersistedSessionProjection,
} from "../persistence/session-projection-store";

export type RuntimeGatewayDriverEvent = Omit<RuntimeGatewayEventInput, "sessionId"> & {
  sessionId?: string;
};

export type CreateRuntimeSessionInput = {
  sessionId: string;
  projectId: string;
  cwd: string;
  checkout?: unknown;
};

export type ResumeRuntimeSessionInput = CreateRuntimeSessionInput & {
  piSessionId: string;
  sessionFile: string;
};

export type ForkRuntimeSessionInput = CreateRuntimeSessionInput & {
  sourcePiSessionId: string;
  sourceSessionFile: string;
  piEntryId: string;
};

export type ForkRuntimeSessionResult = {
  snapshot: RuntimeGatewaySnapshot;
  selectedText?: string;
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
  resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeGatewaySnapshot>;
  forkSession(input: ForkRuntimeSessionInput): Promise<ForkRuntimeSessionResult>;
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
  projections?: SessionProjectionStore;
  now?: () => string;
  idFactory?: () => string;
};

export function createRuntimeGatewayService(
  options: RuntimeGatewayServiceOptions,
): RuntimeGatewayService {
  const listeners = new Set<(event: RuntimeGatewayBackendEvent) => void>();
  const sessionIdsByPiSessionId = new Map<string, string>();
  const now = options.now ?? (() => new Date().toISOString());
  const nextEvent = createRuntimeGatewaySequencer({
    now,
    idFactory: options.idFactory,
  });
  const projectionWrites = createRuntimeEventProjectionWriter(options.projections);

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
      ts: event.ts,
      payload: event.payload,
    });
    const backendEvent: RuntimeGatewayBackendEvent = {
      type: "event",
      event: envelope,
    };

    if (options.journal && shouldJournalRuntimeEvent(envelope.payload)) {
      options.journal.append(envelope);
    }

    projectionWrites.enqueue(envelope);

    for (const listener of listeners) {
      listener(backendEvent);
    }

    return envelope;
  };
  const appendJournalEvent = (event: RuntimeGatewayEventInput) => {
    const envelope = nextEvent(event);

    options.journal?.append(envelope);

    return envelope;
  };

  options.driver.onEvent((event) => {
    emit(event);
  });

  return {
    async handleRequest(request) {
      try {
        const result = await dispatchRuntimeGatewayRequest({
          request,
          driver: options.driver,
          journal: options.journal,
          projections: options.projections,
          emit,
          appendJournalEvent,
          now,
          advanceEventSequence(events) {
            nextEvent.advanceTo(
              events.reduce((highestSeq, event) => Math.max(highestSeq, event.seq), 0),
            );
          },
          rememberSession(snapshot) {
            sessionIdsByPiSessionId.set(snapshot.piSessionId, snapshot.sessionId);
          },
          resolveSessionId(piSessionId) {
            return sessionIdsByPiSessionId.get(piSessionId) ?? null;
          },
        });

        await projectionWrites.flush();

        return {
          id: request.id,
          result,
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
  projections?: SessionProjectionStore;
  emit: (event: RuntimeGatewayDriverEvent) => RuntimeGatewayEventEnvelope | null;
  appendJournalEvent: (event: RuntimeGatewayEventInput) => RuntimeGatewayEventEnvelope;
  now: () => string;
  advanceEventSequence: (events: RuntimeGatewayEventEnvelope[]) => void;
  rememberSession: (snapshot: RuntimeGatewaySnapshot) => void;
  resolveSessionId: (piSessionId: string) => string | null;
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
      await saveSnapshotProjection({
        store: input.projections,
        snapshot,
      });

      return snapshot;
    }
    case "resume_session": {
      const piSessionId = requiredString(params.piSessionId, "piSessionId");
      const journaled = (await input.journal?.read(piSessionId)) ?? [];

      input.advanceEventSequence(journaled);

      const snapshot = await input.driver.resumeSession({
        sessionId: requiredString(params.sessionId, "sessionId"),
        projectId: requiredString(params.projectId, "projectId"),
        piSessionId,
        sessionFile: requiredString(params.sessionFile, "sessionFile"),
        cwd: requiredString(params.cwd, "cwd"),
        checkout: params.checkout,
      });
      const snapshotWithEvents = journaled.length
        ? { ...snapshot, events: journaled }
        : snapshot;

      input.rememberSession(snapshotWithEvents);
      await saveSnapshotProjection({
        store: input.projections,
        snapshot: snapshotWithEvents,
      });

      return snapshotWithEvents;
    }
    case "fork_session": {
      const sourcePiSessionId = requiredString(
        params.sourcePiSessionId,
        "sourcePiSessionId",
      );
      const piEntryId = requiredString(params.piEntryId, "piEntryId");
      const preparedForkJournal = await prepareForkJournal({
        journal: input.journal,
        sourcePiSessionId,
        piEntryId,
      });
      const result = await input.driver.forkSession({
        sessionId: requiredString(params.sessionId, "sessionId"),
        projectId: requiredString(params.projectId, "projectId"),
        sourcePiSessionId,
        sourceSessionFile: requiredString(
          params.sourceSessionFile,
          "sourceSessionFile",
        ),
        piEntryId,
        cwd: requiredString(params.cwd, "cwd"),
        checkout: params.checkout,
      });
      const journaled = await copyJournalForFork({
        appendJournalEvent: input.appendJournalEvent,
        preparedForkJournal,
        sourcePiSessionId,
        targetSessionId: result.snapshot.sessionId,
        targetPiSessionId: result.snapshot.piSessionId,
        piEntryId,
      });
      const snapshotWithEvents = journaled.length
        ? { ...result.snapshot, events: journaled }
        : result.snapshot;

      input.rememberSession(snapshotWithEvents);
      await saveSnapshotProjection({
        store: input.projections,
        snapshot: snapshotWithEvents,
        patch: result.selectedText ? { initialPrompt: result.selectedText } : undefined,
      });

      return {
        snapshot: snapshotWithEvents,
        ...(result.selectedText ? { selectedText: result.selectedText } : {}),
      };
    }
    case "send_prompt":
      await setProjectionInitialPrompt({
        store: input.projections,
        sessionId: input.resolveSessionId(requiredString(params.piSessionId, "piSessionId")),
        piSessionId: requiredString(params.piSessionId, "piSessionId"),
        prompt: requiredString(params.prompt, "prompt"),
      });

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
    case "archive_session":
      return archiveSessionProjection({
        store: input.projections,
        sessionId: requiredString(params.sessionId, "sessionId"),
        archivedAt: input.now(),
      });
    case "get_runtime_snapshot": {
      const piSessionId = requiredString(params.piSessionId, "piSessionId");
      const journaled = (await input.journal?.read(piSessionId)) ?? [];

      input.advanceEventSequence(journaled);

      const snapshot = await input.driver.getSnapshot(piSessionId);
      const snapshotWithEvents = journaled.length
        ? { ...snapshot, events: journaled }
        : snapshot;

      // The journal is the Gateway's event truth; drivers only own
      // status/summary. Fall back to driver events when nothing was journaled.
      await saveSnapshotProjection({
        store: input.projections,
        snapshot: snapshotWithEvents,
      });

      return snapshotWithEvents;
    }
    default:
      throw new Error(`Unknown Runtime Gateway method "${input.request.method}".`);
  }
}

function createRuntimeEventProjectionWriter(store?: SessionProjectionStore) {
  const pendingWrites = new Map<string, Promise<void>>();

  const enqueue = (event: RuntimeGatewayEventEnvelope) => {
    if (!store || !projectionPatchFromRuntimeEvent(event)) {
      return;
    }

    const previousWrite = pendingWrites.get(event.sessionId) ?? Promise.resolve();
    const write = previousWrite
      .then(async () => {
        const current = await store.get(event.sessionId);

        if (!current) {
          return;
        }

        const next = projectionAfterRuntimeEvent(current, event);

        if (next !== current) {
          await store.save(next);
        }
      })
      .catch((error) => {
        console.error(
          `PiGUI failed to persist Session Projection "${event.sessionId}":`,
          error,
        );
      });

    pendingWrites.set(event.sessionId, write);
    void write.finally(() => {
      if (pendingWrites.get(event.sessionId) === write) {
        pendingWrites.delete(event.sessionId);
      }
    });
  };

  return {
    enqueue,
    async flush() {
      await Promise.all([...pendingWrites.values()]);
    },
  };
}

function projectionPatchFromRuntimeEvent(event: RuntimeGatewayEventEnvelope) {
  const payload = event.payload;

  if (payload.type === "run") {
    if (payload.phase === "start") {
      return { status: "running" as const };
    }

    if (payload.phase === "end") {
      return {
        status: payload.outcome === "failed" ? ("failed" as const) : ("completed" as const),
      };
    }
  }

  if (payload.type === "error") {
    return { status: "failed" as const };
  }

  if (payload.type === "usage") {
    return { summary: runtimeSummaryPatch(payload.summary) };
  }

  if (payload.kind === "error") {
    return { status: "failed" as const };
  }

  if (payload.kind === "status") {
    return { status: "completed" as const };
  }

  if (payload.kind === "message" || payload.kind === "control") {
    return {
      status: "running" as const,
      summary: runtimeSummaryPatch(payload.summary),
    };
  }

  return null;
}

function projectionAfterRuntimeEvent(
  current: PersistedSessionProjection,
  event: RuntimeGatewayEventEnvelope,
) {
  const patch = projectionPatchFromRuntimeEvent(event);

  if (!patch) {
    return current;
  }

  return mergeSessionProjection(current, {
    ...current,
    ...patch,
    summary: patch.summary
      ? {
          provider: patch.summary.provider ?? current.summary?.provider ?? null,
          model: patch.summary.model ?? current.summary?.model ?? null,
          totalTokens: patch.summary.totalTokens ?? current.summary?.totalTokens ?? 0,
          totalCostUsd:
            patch.summary.totalCostUsd ?? current.summary?.totalCostUsd ?? 0,
        }
      : current.summary,
    updatedAt: event.ts,
  });
}

function runtimeSummaryPatch(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    provider:
      typeof value.provider === "string" || value.provider === null
        ? value.provider
        : undefined,
    model:
      typeof value.model === "string" || value.model === null
        ? value.model
        : undefined,
    totalTokens:
      typeof value.totalTokens === "number" && Number.isFinite(value.totalTokens)
        ? value.totalTokens
        : undefined,
    totalCostUsd:
      typeof value.totalCostUsd === "number" && Number.isFinite(value.totalCostUsd)
        ? value.totalCostUsd
        : undefined,
  };
}

async function archiveSessionProjection(input: {
  store?: SessionProjectionStore;
  sessionId: string;
  archivedAt: string;
}) {
  if (!input.store) {
    throw new Error("Session Projection persistence is unavailable.");
  }

  const projection = await input.store.get(input.sessionId);

  if (!projection) {
    throw new Error(`Session "${input.sessionId}" was not found.`);
  }

  if (projection.status === "running") {
    throw new Error("Cannot archive an active Session.");
  }

  if (projection.status === "archived") {
    return projection;
  }

  const archived: PersistedSessionProjection = {
    ...projection,
    status: "archived",
    archivedAt: input.archivedAt,
    updatedAt: input.archivedAt,
  };

  await input.store.save(archived);

  return archived;
}

async function getProjectionBySessionId(input: {
  store: SessionProjectionStore;
  sessionId: string;
}) {
  return input.store.get(input.sessionId);
}

async function saveMergedProjection(input: {
  store?: SessionProjectionStore;
  projection: PersistedSessionProjection;
}) {
  if (!input.store) {
    return;
  }

  const current = await getProjectionBySessionId({
    store: input.store,
    sessionId: input.projection.sessionId,
  });

  await input.store.save(mergeSessionProjection(current, input.projection));
}

async function saveSnapshotProjection(input: {
  store?: SessionProjectionStore;
  snapshot: RuntimeGatewaySnapshot;
  patch?: Partial<PersistedSessionProjection>;
}) {
  await saveMergedProjection({
    store: input.store,
    projection: {
      ...projectionFromRuntimeSnapshot(input.snapshot),
      ...input.patch,
    },
  });
}

async function prepareForkJournal(input: {
  journal?: SessionEventJournal;
  sourcePiSessionId: string;
  piEntryId: string;
}): Promise<PreparedSessionEventJournalFork | null> {
  if (!input.journal) {
    return null;
  }

  return prepareSessionEventJournalFork({
    journal: input.journal,
    sourcePiSessionId: input.sourcePiSessionId,
    piEntryId: input.piEntryId,
  });
}

async function copyJournalForFork(input: {
  appendJournalEvent: (event: RuntimeGatewayEventInput) => RuntimeGatewayEventEnvelope;
  preparedForkJournal: PreparedSessionEventJournalFork | null;
  sourcePiSessionId: string;
  targetSessionId: string;
  targetPiSessionId: string;
  piEntryId: string;
}) {
  if (!input.preparedForkJournal) {
    return [];
  }

  const copied = copiedSessionEventInputsForFork({
    prepared: input.preparedForkJournal,
    sourcePiSessionId: input.sourcePiSessionId,
    targetSessionId: input.targetSessionId,
    targetPiSessionId: input.targetPiSessionId,
  }).map(input.appendJournalEvent);

  copied.push(
    input.appendJournalEvent(
      forkMarkerEventInput({
        prepared: input.preparedForkJournal,
        sourcePiSessionId: input.sourcePiSessionId,
        targetSessionId: input.targetSessionId,
        targetPiSessionId: input.targetPiSessionId,
        piEntryId: input.piEntryId,
      }),
    ),
  );

  return copied;
}

async function setProjectionInitialPrompt(input: {
  store?: SessionProjectionStore;
  sessionId: string | null;
  piSessionId: string;
  prompt: string;
}) {
  if (!input.store) {
    return;
  }

  const projection = input.sessionId
    ? await input.store.get(input.sessionId)
    : (await input.store.list()).find(
        (candidate) => candidate.piSessionId === input.piSessionId,
      );

  if (!projection || projection.initialPrompt) {
    return;
  }

  await input.store.save({
    ...projection,
    initialPrompt: input.prompt,
  });
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
