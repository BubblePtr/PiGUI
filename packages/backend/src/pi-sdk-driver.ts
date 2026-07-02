import type {
  RuntimeGatewayQueuedMessage,
  RuntimeGatewaySnapshot,
  RuntimeGatewaySummary,
} from "@pigui/core";
import type {
  CreateRuntimeSessionInput,
  PiRuntimeDriver,
  RuntimeGatewayDriverEvent,
} from "./runtime-gateway";

export type PiSdkPackageModule = typeof import("@earendil-works/pi-coding-agent");

export type PiSdkRuntimeEvent = RuntimeGatewayDriverEvent;

export type PiSdkQueuedMessage = RuntimeGatewayQueuedMessage;

export type PiSdkSnapshotPatch = Partial<
  Pick<RuntimeGatewaySnapshot, "status" | "events" | "summary" | "updatedAt">
>;

export type PiSdkSessionRuntime = {
  piSessionId: string;
  runtimeId?: string;
  status?: RuntimeGatewaySnapshot["status"];
  summary?: RuntimeGatewaySummary;
  sendPrompt(prompt: string): Promise<void>;
  queueFollowUp?(message: string): Promise<PiSdkQueuedMessage>;
  withdrawQueuedMessage?(queuedMessageId: string): Promise<PiSdkQueuedMessage>;
  steerRun?(message: string): Promise<void>;
  stopRun?(): Promise<void>;
  getSnapshot?(): Promise<PiSdkSnapshotPatch>;
  onEvent?(listener: (event: PiSdkRuntimeEvent) => void): () => void;
  dispose?(): void | Promise<void>;
};

export type PiSdkRuntimeFactory = (
  input: CreateRuntimeSessionInput,
) => Promise<PiSdkSessionRuntime>;

export type PiSdkDriverOptions = {
  runtimeFactory?: PiSdkRuntimeFactory;
  now?: () => string;
};

export class PiSdkDriverUnsupportedError extends Error {
  capability: string;

  constructor(capability: string, detail: string) {
    super(`Pi SDK driver does not support "${capability}": ${detail}`);
    this.name = "PiSdkDriverUnsupportedError";
    this.capability = capability;
  }
}

function unsupported(capability: string, detail: string): never {
  throw new PiSdkDriverUnsupportedError(capability, detail);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cloneSummary(summary: RuntimeGatewaySummary): RuntimeGatewaySummary {
  return { ...summary };
}

function cloneSnapshot(snapshot: RuntimeGatewaySnapshot): RuntimeGatewaySnapshot {
  const cloned: RuntimeGatewaySnapshot = {
    ...snapshot,
    events: [...snapshot.events],
  };

  if (snapshot.summary) {
    cloned.summary = cloneSummary(snapshot.summary);
  }

  return cloned;
}

function snapshotFromRuntime(input: {
  appSession: CreateRuntimeSessionInput;
  runtime: PiSdkSessionRuntime;
  now: () => string;
}): RuntimeGatewaySnapshot {
  const snapshot: RuntimeGatewaySnapshot = {
    sessionId: input.appSession.sessionId,
    runtimeId: input.runtime.runtimeId ?? `pi-sdk:${input.appSession.sessionId}`,
    piSessionId: input.runtime.piSessionId,
    projectId: input.appSession.projectId,
    cwd: input.appSession.cwd,
    status: input.runtime.status ?? "idle",
    events: [],
    updatedAt: input.now(),
  };

  if (input.runtime.summary) {
    snapshot.summary = cloneSummary(input.runtime.summary);
  }

  return snapshot;
}

function mergeSnapshotPatch(
  snapshot: RuntimeGatewaySnapshot,
  patch: PiSdkSnapshotPatch,
): RuntimeGatewaySnapshot {
  const merged = cloneSnapshot(snapshot);

  if (patch.status) {
    merged.status = patch.status;
  }

  if (patch.events) {
    merged.events = [...patch.events];
  }

  if (patch.summary) {
    merged.summary = cloneSummary(patch.summary);
  }

  if (patch.updatedAt) {
    merged.updatedAt = patch.updatedAt;
  }

  return merged;
}

export function createPiSdkDriver(options: PiSdkDriverOptions = {}): PiRuntimeDriver {
  const now = options.now ?? (() => new Date().toISOString());
  const runtimes = new Map<string, PiSdkSessionRuntime>();
  const snapshots = new Map<string, RuntimeGatewaySnapshot>();
  const promptCounts = new Map<string, number>();
  const listeners = new Set<(event: RuntimeGatewayDriverEvent) => void>();

  const runtimeFor = (piSessionId: string, capability: string) => {
    const runtime = runtimes.get(piSessionId);

    if (!runtime) {
      throw new Error(`Pi SDK session "${piSessionId}" was not found for "${capability}".`);
    }

    return runtime;
  };
  const emit = (event: RuntimeGatewayDriverEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  return {
    async createSession(input) {
      if (!options.runtimeFactory) {
        unsupported("create_session", "no SDK runtime factory is configured");
      }

      const runtime = await options.runtimeFactory(input);
      const snapshot = snapshotFromRuntime({ appSession: input, runtime, now });

      runtimes.set(runtime.piSessionId, runtime);
      snapshots.set(runtime.piSessionId, snapshot);
      promptCounts.set(runtime.piSessionId, 0);
      runtime.onEvent?.((event) => {
        emit({
          ...event,
          piSessionId: event.piSessionId ?? runtime.piSessionId,
        });
      });

      return cloneSnapshot(snapshot);
    },

    async sendPrompt(input) {
      const runtime = runtimeFor(input.piSessionId, "send_prompt");
      const promptIndex = promptCounts.get(input.piSessionId) ?? 0;

      promptCounts.set(input.piSessionId, promptIndex + 1);
      void (async () => {
        try {
          await runtime.sendPrompt(input.prompt);
        } catch (error) {
          emit({
            piSessionId: input.piSessionId,
            type: "error",
            payload: {
              kind: "error",
              title: "SDK prompt failed",
              body: errorMessage(error),
            },
          });
        }
      })();

      return {
        piSessionId: input.piSessionId,
        type: "message_update",
        payload: {
          kind: "message",
          role: "user",
          body: input.prompt,
          bodyFormat: "full",
          messageId: `pi-sdk:${input.piSessionId}:user:${promptIndex}`,
          phase: "synthetic",
        },
      };
    },

    async queueFollowUp(input) {
      const runtime = runtimeFor(input.piSessionId, "queue_follow_up");

      if (!runtime.queueFollowUp) {
        unsupported("queue_follow_up", "the injected SDK runtime has no queueFollowUp adapter");
      }

      return runtime.queueFollowUp(input.message);
    },

    async withdrawQueuedMessage(input) {
      const runtime = runtimeFor(input.piSessionId, "withdraw_queued_message");

      if (!runtime.withdrawQueuedMessage) {
        unsupported(
          "withdraw_queued_message",
          "the injected SDK runtime has no withdrawQueuedMessage adapter",
        );
      }

      return runtime.withdrawQueuedMessage(input.queuedMessageId);
    },

    async steerRun(input) {
      const runtime = runtimeFor(input.piSessionId, "steer_run");

      if (!runtime.steerRun) {
        unsupported("steer_run", "the injected SDK runtime has no steerRun adapter");
      }

      await runtime.steerRun(input.message);

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
      const runtime = runtimeFor(input.piSessionId, "stop_run");

      if (!runtime.stopRun) {
        unsupported("stop_run", "the injected SDK runtime has no stopRun adapter");
      }

      await runtime.stopRun();

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
      const runtime = runtimeFor(piSessionId, "get_runtime_snapshot");
      const snapshot = snapshots.get(piSessionId);

      if (!snapshot) {
        throw new Error(`Pi SDK snapshot "${piSessionId}" was not found.`);
      }

      if (!runtime.getSnapshot) {
        return cloneSnapshot(snapshot);
      }

      const merged = mergeSnapshotPatch(snapshot, await runtime.getSnapshot());

      snapshots.set(piSessionId, merged);

      return cloneSnapshot(merged);
    },

    onEvent(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
