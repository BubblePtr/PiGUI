// Public Pi SDK → PiSdkSessionRuntime adapter. All event semantics live in
// agent-runtime-event-normalizer; this module only wires the SDK subscription
// into the normalizer and maps SDK session commands to runtime semantics.

import { createAgentRuntimeEventNormalizer } from "./agent-runtime-event-normalizer";
import type { PiSdkRuntimeFactory, PiSdkSessionRuntime } from "./pi-sdk-driver";

export type PublicPiSdkAgentSession = {
  sessionId: string;
  isStreaming: boolean;
  messages: readonly unknown[];
  model?: unknown;
  thinkingLevel?: unknown;
  agent?: {
    state?: {
      errorMessage?: string;
    };
  };
  prompt(prompt: string): Promise<void>;
  followUp?(message: string): Promise<void>;
  steer?(message: string): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  subscribe(listener: (event: unknown) => void): () => void;
  clearQueue?(): {
    steering: string[];
    followUp: string[];
  };
  pendingMessageCount?: number;
  getSteeringMessages?(): readonly string[];
  getFollowUpMessages?(): readonly string[];
  getSessionStats?(): {
    tokens?: {
      total?: number;
    };
    cost?: number;
  };
  setModel?(model: unknown): Promise<void>;
  setThinkingLevel?(level: unknown): void;
  cycleModel?(direction?: "forward" | "backward"): Promise<unknown>;
  cycleThinkingLevel?(): unknown;
  getAvailableThinkingLevels?(): unknown[];
  supportsThinking?(): boolean;
};

export type PublicPiSdkCreateAgentSessionOptions = {
  cwd?: string;
  noTools?: "all" | "builtin";
  agentDir?: string;
  authStorage?: unknown;
  modelRegistry?: unknown;
  model?: unknown;
  thinkingLevel?: unknown;
  scopedModels?: unknown;
  tools?: string[];
  excludeTools?: string[];
  customTools?: unknown;
  resourceLoader?: unknown;
  sessionManager?: unknown;
  settingsManager?: unknown;
  sessionStartEvent?: unknown;
};

export type PublicPiSdkModule = {
  createAgentSession(options?: PublicPiSdkCreateAgentSessionOptions): Promise<{
    session: PublicPiSdkAgentSession;
  }>;
};

export type PublicPiSdkRuntimeFactoryOptions = {
  sdk: PublicPiSdkModule;
  now?: () => string;
  sessionOptions?: Omit<PublicPiSdkCreateAgentSessionOptions, "cwd">;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function maybeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function modelProvider(model: unknown) {
  if (!isRecord(model)) {
    return null;
  }

  if (isRecord(model.provider)) {
    return (
      maybeString(model.provider.id) ??
      maybeString(model.provider.name) ??
      maybeString(model.provider.provider)
    );
  }

  return maybeString(model.provider) ?? maybeString(model.providerId);
}

function modelId(model: unknown) {
  if (!isRecord(model)) {
    return null;
  }

  return maybeString(model.id) ?? maybeString(model.name);
}

function summaryFromSession(session: PublicPiSdkAgentSession) {
  const stats = session.getSessionStats?.();
  const summary = {
    provider: modelProvider(session.model),
    model: modelId(session.model),
    totalTokens: maybeNumber(stats?.tokens?.total) ?? 0,
    totalCostUsd: maybeNumber(stats?.cost) ?? 0,
  };

  if (
    summary.provider ||
    summary.model ||
    summary.totalTokens > 0 ||
    summary.totalCostUsd > 0
  ) {
    return summary;
  }

  return undefined;
}

function statusFromSession(input: {
  session: PublicPiSdkAgentSession;
  promptCompleted: boolean;
  stopped: boolean;
}) {
  if (input.session.agent?.state?.errorMessage) {
    return "failed";
  }

  if (input.session.isStreaming) {
    return "running";
  }

  return input.promptCompleted || input.stopped ? "completed" : "idle";
}

export function createPublicPiSdkRuntimeFactory(
  options: PublicPiSdkRuntimeFactoryOptions,
): PiSdkRuntimeFactory {
  const now = options.now ?? (() => new Date().toISOString());

  return async (input) => {
    const { session } = await options.sdk.createAgentSession({
      ...options.sessionOptions,
      cwd: input.cwd,
    });
    // One normalizer per session: its lifecycle counters are the identity
    // source for runId/turnId/messageId. The driver subscribes exactly once.
    const normalizer = createAgentRuntimeEventNormalizer({
      piSessionId: session.sessionId,
      origin: "sdk",
    });
    let promptCompleted = false;
    let stopped = false;
    let queuedSequence = 0;
    const queuedMessages = new Map<string, {
      id: string;
      piSessionId: string;
      body: string;
      status: "pending" | "processing" | "withdrawn";
      createdAt: string;
      processingStartedAt?: string;
      withdrawnAt?: string;
    }>();
    const runtime: PiSdkSessionRuntime = {
      piSessionId: session.sessionId,
      runtimeId: `pi-sdk:${input.sessionId}`,
      status: session.isStreaming ? "running" : "idle",
      async sendPrompt(prompt) {
        normalizer.noteRunTrigger("prompt");
        await session.prompt(prompt);
        promptCompleted = true;
      },
      async stopRun() {
        await session.abort();
        stopped = true;
      },
      async getSnapshot() {
        return {
          status: statusFromSession({ session, promptCompleted, stopped }),
          summary: summaryFromSession(session),
          updatedAt: now(),
        };
      },
      onEvent(listener) {
        return session.subscribe((event) => {
          for (const agentEvent of normalizer.normalize(event)) {
            listener({
              piSessionId: session.sessionId,
              ...("turnId" in agentEvent && agentEvent.turnId
                ? { turnId: agentEvent.turnId }
                : {}),
              type: agentEvent.type,
              payload: { ...agentEvent },
            });
          }
        });
      },
      dispose() {
        session.dispose();
      },
    };

    if (session.followUp) {
      runtime.queueFollowUp = async (message) => {
        const queuedMessage = {
          id: `pi-sdk:${session.sessionId}:queued:${queuedSequence}`,
          piSessionId: session.sessionId,
          body: message,
          status: "pending" as const,
          createdAt: now(),
        };

        queuedSequence += 1;
        normalizer.noteRunTrigger("follow_up");
        await session.followUp?.(message);
        queuedMessages.set(queuedMessage.id, queuedMessage);

        return queuedMessage;
      };
    }

    if (session.clearQueue && session.followUp && session.steer) {
      runtime.withdrawQueuedMessage = async (queuedMessageId) => {
        const queuedMessage = queuedMessages.get(queuedMessageId);

        if (!queuedMessage) {
          throw new Error(`Pi SDK queued message "${queuedMessageId}" was not found.`);
        }

        const cleared = session.clearQueue?.() ?? {
          steering: [],
          followUp: [],
        };
        let removedFollowUp = false;

        for (const steering of cleared.steering) {
          await session.steer?.(steering);
        }

        for (const followUp of cleared.followUp) {
          if (!removedFollowUp && followUp === queuedMessage.body) {
            removedFollowUp = true;
            continue;
          }

          await session.followUp?.(followUp);
        }

        if (!removedFollowUp) {
          throw new Error(
            `Pi SDK queued message "${queuedMessageId}" was not present in the follow-up queue.`,
          );
        }

        const withdrawn = {
          ...queuedMessage,
          status: "withdrawn" as const,
          withdrawnAt: now(),
        };

        queuedMessages.set(queuedMessage.id, withdrawn);

        return withdrawn;
      };
    }

    if (session.steer) {
      runtime.steerRun = async (message) => {
        await session.steer?.(message);
      };
    }

    return runtime;
  };
}
