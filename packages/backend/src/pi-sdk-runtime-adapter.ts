// Public Pi SDK → PiSdkSessionRuntime adapter. All event semantics live in
// agent-runtime-event-normalizer; this module only wires the SDK subscription
// into the normalizer and maps SDK session commands to runtime semantics.

import { createAgentRuntimeEventNormalizer } from "./agent-runtime-event-normalizer";
import type {
  PiSdkRuntimeFactory,
  PiSdkRuntimeForker,
  PiSdkRuntimeResumer,
  PiSdkSessionRuntime,
  PiSdkUserMessageBoundary,
} from "./pi-sdk-driver";
import type {
  CreateRuntimeSessionInput,
  ForkRuntimeSessionInput,
  ResumeRuntimeSessionInput,
} from "./runtime-gateway";

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
  sessionManager?: {
    getCwd?(): string | undefined;
    getSessionFile?(): string | undefined;
    getLeafId?(): string | null;
    getEntry?(entryId: string): unknown;
  };
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

export type PublicPiSdkSessionManager = {
  getCwd?(): string | undefined;
  getSessionDir?(): string | undefined;
  getSessionFile?(): string | undefined;
  getLeafId?(): string | null;
  getEntry?(entryId: string): unknown;
  createBranchedSession?(leafId: string): string | undefined;
  newSession?(options?: { parentSession?: string }): string | undefined;
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
  SessionManager?: {
    open(path: string): PublicPiSdkSessionManager;
    create?(
      cwd: string,
      sessionDir?: string,
      options?: { parentSession?: string },
    ): PublicPiSdkSessionManager;
  };
};

export type PublicPiSdkRuntimeFactoryOptions = {
  sdk: PublicPiSdkModule;
  now?: () => string;
  sessionOptions?: Omit<PublicPiSdkCreateAgentSessionOptions, "cwd">;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUserMessageEndEvent(value: unknown) {
  return (
    isRecord(value) &&
    value.type === "message_end" &&
    isRecord(value.message) &&
    value.message.role === "user"
  );
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function maybeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractUserMessageText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (part): part is { type: string; text: string } =>
        isRecord(part) &&
        part.type === "text" &&
        typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("");
}

function forkEntryDetail(entry: unknown) {
  if (!isRecord(entry)) {
    throw new Error("Invalid entry ID for forking");
  }

  if (entry.type !== "message" || !isRecord(entry.message)) {
    throw new Error("Invalid entry ID for forking");
  }

  if (entry.message.role !== "user") {
    throw new Error("Invalid entry ID for forking");
  }

  return {
    parentId: typeof entry.parentId === "string" ? entry.parentId : null,
    selectedText: extractUserMessageText(entry.message.content),
  };
}

function userEntryIdFromSessionManager(
  sessionManager: PublicPiSdkAgentSession["sessionManager"] | undefined,
) {
  const leafId = sessionManager?.getLeafId?.() ?? null;

  if (!leafId) {
    return undefined;
  }

  if (!sessionManager?.getEntry) {
    return leafId;
  }

  const visited = new Set<string>();
  let entryId: string | null = leafId;

  while (entryId && !visited.has(entryId)) {
    visited.add(entryId);

    const entry = sessionManager.getEntry(entryId);

    if (
      isRecord(entry) &&
      entry.type === "message" &&
      isRecord(entry.message) &&
      entry.message.role === "user"
    ) {
      return typeof entry.id === "string" ? entry.id : entryId;
    }

    entryId =
      isRecord(entry) && typeof entry.parentId === "string"
        ? entry.parentId
        : null;
  }

  return undefined;
}

async function waitForSessionManagerAppend() {
  await Promise.resolve();
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

  return async (input) =>
    createPublicPiSdkRuntime({
      input,
      now,
      session: (
        await options.sdk.createAgentSession({
          ...options.sessionOptions,
          cwd: input.cwd,
        })
      ).session,
    });
}

export function createPublicPiSdkRuntimeResumer(
  options: PublicPiSdkRuntimeFactoryOptions,
): PiSdkRuntimeResumer {
  const now = options.now ?? (() => new Date().toISOString());

  return async (input) => {
    const sessionManager = options.sdk.SessionManager?.open(input.sessionFile);

    if (!sessionManager) {
      throw new Error("Pi SDK SessionManager.open is unavailable.");
    }

    const { session } = await options.sdk.createAgentSession({
      ...options.sessionOptions,
      cwd: sessionManager.getCwd?.() || input.cwd,
      sessionManager,
    });

    return createPublicPiSdkRuntime({
      input,
      now,
      session,
    });
  };
}

export function createPublicPiSdkRuntimeForker(
  options: PublicPiSdkRuntimeFactoryOptions,
): PiSdkRuntimeForker {
  return async (input) => {
    const sourceSessionManager = options.sdk.SessionManager?.open(
      input.sourceSessionFile,
    );

    if (!sourceSessionManager) {
      throw new Error("Pi SDK SessionManager.open is unavailable.");
    }

    const entry = sourceSessionManager.getEntry?.(input.piEntryId);
    const { parentId, selectedText } = forkEntryDetail(entry);
    let sessionManager = sourceSessionManager;

    if (parentId) {
      const forkedSessionFile =
        sourceSessionManager.createBranchedSession?.(parentId);

      if (!forkedSessionFile) {
        throw new Error("Failed to create forked session");
      }
    } else {
      const sourceSessionFile =
        sourceSessionManager.getSessionFile?.() ?? input.sourceSessionFile;
      const createdSessionManager = options.sdk.SessionManager?.create?.(
        sourceSessionManager.getCwd?.() || input.cwd,
        sourceSessionManager.getSessionDir?.(),
        { parentSession: sourceSessionFile },
      );

      if (createdSessionManager) {
        sessionManager = createdSessionManager;
      } else {
        sourceSessionManager.newSession?.({ parentSession: sourceSessionFile });
      }
    }

    const { session } = await options.sdk.createAgentSession({
      ...options.sessionOptions,
      cwd: sessionManager.getCwd?.() || input.cwd,
      sessionManager,
    });

    return {
      runtime: createPublicPiSdkRuntime({
        input,
        now: options.now ?? (() => new Date().toISOString()),
        session,
      }),
      selectedText,
    };
  };
}

function createPublicPiSdkRuntime(context: {
  input:
    | CreateRuntimeSessionInput
    | ResumeRuntimeSessionInput
    | ForkRuntimeSessionInput;
  now: () => string;
  session: PublicPiSdkAgentSession;
}): PiSdkSessionRuntime {
    const { session } = context;
    const now = context.now;
    // One normalizer per session: its lifecycle counters are the identity
    // source for runId/turnId/messageId. The driver subscribes exactly once.
    const normalizer = createAgentRuntimeEventNormalizer({
      piSessionId: session.sessionId,
      origin: "sdk",
    });
    const pendingUserBoundaries: PiSdkUserMessageBoundary[] = [];
    const userBoundaryWaiters: Array<(boundary: PiSdkUserMessageBoundary) => void> = [];
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
      runtimeId: `pi-sdk:${context.input.sessionId}`,
      cwd: session.sessionManager?.getCwd?.() ?? context.input.cwd,
      status: session.isStreaming ? "running" : "idle",
      sessionFile: session.sessionManager?.getSessionFile?.(),
      getLeafId() {
        return session.sessionManager?.getLeafId?.() ?? null;
      },
      async waitForNextUserMessageBoundary() {
        const pendingBoundary = pendingUserBoundaries.shift();

        if (pendingBoundary) {
          return pendingBoundary;
        }

        return new Promise((resolve) => {
          userBoundaryWaiters.push(resolve);
        });
      },
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
          if (isUserMessageEndEvent(event)) {
            void waitForSessionManagerAppend().then(() => {
              const piEntryId = userEntryIdFromSessionManager(
                session.sessionManager,
              );
              const boundary = piEntryId ? { piEntryId } : {};
              const waiter = userBoundaryWaiters.shift();

              if (waiter) {
                waiter(boundary);
              } else {
                pendingUserBoundaries.push(boundary);
              }
            });
          }

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
}
