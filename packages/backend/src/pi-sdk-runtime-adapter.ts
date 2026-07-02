import type { PiSdkRuntimeFactory, PiSdkSessionRuntime } from "./pi-sdk-driver";
import type { RuntimeGatewayDriverEvent } from "./runtime-gateway";

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

type AssistantMessageAccumulator = {
  index: number;
  body: string;
  hasBody: boolean;
  thinkingBody: string;
  hasThinkingBody: boolean;
};

type PiSdkRuntimeEventNormalizer = {
  normalize(event: unknown): RuntimeGatewayDriverEvent | null;
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

function maybeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (typeof block === "string") {
        return block;
      }

      if (!isRecord(block)) {
        return "";
      }

      if (block.type === "text" && typeof block.text === "string") {
        return block.text;
      }

      if (typeof block.delta === "string") {
        return block.delta;
      }

      return "";
    })
    .filter(Boolean)
    .join("");
}

function thinkingFromContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (!isRecord(block)) {
        return "";
      }

      if (block.type === "thinking" && typeof block.thinking === "string") {
        return block.thinking;
      }

      if (block.type === "thinking" && typeof block.text === "string") {
        return block.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("");
}

function textFromAssistantMessageEvent(event: Record<string, unknown>) {
  const assistantMessageEvent = isRecord(event.assistantMessageEvent)
    ? event.assistantMessageEvent
    : null;

  return (
    maybeString(assistantMessageEvent?.delta) ??
    maybeString(assistantMessageEvent?.content) ??
    maybeString(assistantMessageEvent?.text) ??
    ""
  );
}

function thinkingFromAssistantMessageEvent(event: Record<string, unknown>) {
  const assistantMessageEvent = isRecord(event.assistantMessageEvent)
    ? event.assistantMessageEvent
    : null;

  return (
    maybeString(assistantMessageEvent?.delta) ??
    maybeString(assistantMessageEvent?.thinking) ??
    maybeString(assistantMessageEvent?.content) ??
    maybeString(assistantMessageEvent?.text) ??
    ""
  );
}

function isThinkingAssistantMessageEvent(event: Record<string, unknown>) {
  const assistantMessageEvent = isRecord(event.assistantMessageEvent)
    ? event.assistantMessageEvent
    : null;

  return (
    assistantMessageEvent?.type === "thinking_delta" ||
    assistantMessageEvent?.type === "thinking_end" ||
    assistantMessageEvent?.type === "thinking_start"
  );
}

function thinkingEventPhase(event: Record<string, unknown>) {
  const assistantMessageEvent = isRecord(event.assistantMessageEvent)
    ? event.assistantMessageEvent
    : null;

  if (assistantMessageEvent?.type === "thinking_delta") {
    return "delta";
  }

  if (assistantMessageEvent?.type === "thinking_end") {
    return "final";
  }

  return "partial";
}

function assistantMessageEventPhase(event: Record<string, unknown>) {
  const assistantMessageEvent = isRecord(event.assistantMessageEvent)
    ? event.assistantMessageEvent
    : null;

  if (assistantMessageEvent?.type === "text_delta") {
    return "delta";
  }

  if (assistantMessageEvent?.type === "text_end") {
    return "final";
  }

  if (event.type === "message_end" || event.type === "turn_end") {
    return "final";
  }

  return "partial";
}

function assistantMessageText(input: {
  event: Record<string, unknown>;
  message: Record<string, unknown> | null;
}) {
  const assistantMessageEvent = isRecord(input.event.assistantMessageEvent)
    ? input.event.assistantMessageEvent
    : null;

  if (assistantMessageEvent && assistantMessageEvent.type !== undefined) {
    if (
      assistantMessageEvent.type !== "text_delta" &&
      assistantMessageEvent.type !== "text_end"
    ) {
      return "";
    }
  }

  if (
    assistantMessageEvent?.type === "text_delta" &&
    typeof assistantMessageEvent.delta === "string"
  ) {
    return assistantMessageEvent.delta;
  }

  if (
    assistantMessageEvent?.type === "text_end" &&
    typeof assistantMessageEvent.content === "string"
  ) {
    return assistantMessageEvent.content;
  }

  return input.message
    ? textFromContent(input.message.content) || textFromAssistantMessageEvent(input.event)
    : textFromAssistantMessageEvent(input.event);
}

function toolCallFromAssistantMessageEvent(event: Record<string, unknown>) {
  const assistantMessageEvent = isRecord(event.assistantMessageEvent)
    ? event.assistantMessageEvent
    : null;

  if (assistantMessageEvent?.type !== "toolcall_end") {
    return null;
  }

  if (isRecord(assistantMessageEvent.toolCall)) {
    return assistantMessageEvent.toolCall;
  }

  const contentIndex = maybeNumber(assistantMessageEvent.contentIndex);
  const partial = isRecord(assistantMessageEvent.partial)
    ? assistantMessageEvent.partial
    : null;
  const content = Array.isArray(partial?.content) ? partial.content : [];
  const block = contentIndex === null ? null : content[contentIndex];

  return isRecord(block) ? block : null;
}

function roleFromMessageEvent(input: {
  event: Record<string, unknown>;
  message: Record<string, unknown> | null;
}) {
  if (input.message?.role === "user" || input.message?.role === "assistant") {
    return input.message.role;
  }

  const assistantMessageEvent = isRecord(input.event.assistantMessageEvent)
    ? input.event.assistantMessageEvent
    : null;

  if (
    assistantMessageEvent?.type === "text_delta" ||
    assistantMessageEvent?.type === "text_end"
  ) {
    return "assistant";
  }

  return null;
}

function timestampFrom(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  return fallback;
}

function messageIdFor(input: {
  piSessionId: string;
  role: "assistant" | "user";
  index: number;
}) {
  return `pi-sdk:${input.piSessionId}:${input.role}:${input.index}`;
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

function messageEventFromAgentEvent(input: {
  event: Record<string, unknown>;
  piSessionId: string;
  now: () => string;
  assistant: AssistantMessageAccumulator;
}): RuntimeGatewayDriverEvent | null {
  const { event, piSessionId, now, assistant } = input;
  const message = isRecord(event.message) ? event.message : null;
  const role = roleFromMessageEvent({ event, message });

  if (!role || role === "user") {
    return null;
  }

  const phase = assistantMessageEventPhase(event);
  const body = assistantMessageText({ event, message });

  if (!body) {
    return null;
  }

  const messageId = messageIdFor({
    piSessionId,
    role: "assistant",
    index: assistant.index,
  });
  const timestamp = timestampFrom(message?.timestamp, now());

  if (phase === "delta") {
    assistant.body += body;
    assistant.hasBody = true;

    return {
      piSessionId,
      turnId: maybeString(event.turnId) ?? maybeString(message?.turnId) ?? undefined,
      type: "message_update",
      payload: {
        kind: "message",
        role,
        body: assistant.body,
        bodyFormat: "full",
        messageId,
        phase,
        timestamp,
      },
    };
  }

  if (phase === "partial") {
    const nextBody = !assistant.hasBody
      ? body
      : body.startsWith(assistant.body)
        ? body
        : `${assistant.body}${body}`;

    if (assistant.hasBody && nextBody === assistant.body) {
      return null;
    }

    assistant.body = nextBody;
    assistant.hasBody = true;

    return {
      piSessionId,
      turnId: maybeString(event.turnId) ?? maybeString(message?.turnId) ?? undefined,
      type: "message_update",
      payload: {
        kind: "message",
        role,
        body: assistant.body,
        bodyFormat: "full",
        messageId,
        phase,
        timestamp,
      },
    };
  }

  if (assistant.hasBody && body === assistant.body) {
    assistant.index += 1;
    assistant.body = "";
    assistant.hasBody = false;
    assistant.thinkingBody = "";
    assistant.hasThinkingBody = false;

    return null;
  }

  assistant.body = body;
  assistant.hasBody = true;

  if (phase === "final") {
    assistant.index += 1;
    assistant.body = "";
    assistant.hasBody = false;
    assistant.thinkingBody = "";
    assistant.hasThinkingBody = false;
  }

  return {
    piSessionId,
    turnId: maybeString(event.turnId) ?? maybeString(message?.turnId) ?? undefined,
    type: "message_update",
    payload: {
      kind: "message",
      role,
      body,
      bodyFormat: "full",
      messageId,
      phase,
      timestamp,
    },
  };
}

function thinkingEventFromAgentEvent(input: {
  event: Record<string, unknown>;
  piSessionId: string;
  now: () => string;
  assistant: AssistantMessageAccumulator;
}): RuntimeGatewayDriverEvent | null {
  const { event, piSessionId, now, assistant } = input;

  if (!isThinkingAssistantMessageEvent(event)) {
    return null;
  }

  const message = isRecord(event.message) ? event.message : null;
  const body = message
    ? thinkingFromContent(message.content) ||
      thinkingFromAssistantMessageEvent(event)
    : thinkingFromAssistantMessageEvent(event);

  if (!body) {
    return null;
  }

  const phase = thinkingEventPhase(event);
  const messageId = messageIdFor({
    piSessionId,
    role: "assistant",
    index: assistant.index,
  });
  const timestamp = timestampFrom(message?.timestamp, now());

  if (phase === "delta") {
    assistant.thinkingBody += body;
    assistant.hasThinkingBody = true;
  } else if (phase === "partial") {
    const nextBody = !assistant.hasThinkingBody
      ? body
      : body.startsWith(assistant.thinkingBody)
        ? body
        : `${assistant.thinkingBody}${body}`;

    if (assistant.hasThinkingBody && nextBody === assistant.thinkingBody) {
      return null;
    }

    assistant.thinkingBody = nextBody;
    assistant.hasThinkingBody = true;
  } else {
    if (assistant.hasThinkingBody && body === assistant.thinkingBody) {
      return null;
    }

    assistant.thinkingBody = body;
    assistant.hasThinkingBody = true;
  }

  return {
    piSessionId,
    turnId: maybeString(event.turnId) ?? maybeString(message?.turnId) ?? undefined,
    type: "message_update",
    payload: {
      kind: "thinking",
      role: "assistant",
      body: assistant.thinkingBody,
      bodyFormat: "full",
      messageId,
      phase,
      timestamp,
    },
  };
}

function toolEventFromAgentEvent(input: {
  event: Record<string, unknown>;
  piSessionId: string;
}): RuntimeGatewayDriverEvent {
  const { event, piSessionId } = input;
  const detail =
    event.type === "tool_execution_end"
      ? event.result
      : event.type === "tool_execution_update"
        ? event.partialResult
        : event.args;

  const toolCallId =
    maybeString(event.toolCallId) ??
    maybeString(event.tool_call_id) ??
    maybeString(event.id) ??
    undefined;
  const phase =
    event.type === "tool_execution_end"
      ? "final"
      : event.type === "tool_execution_update"
        ? "partial"
        : "partial";

  return {
    piSessionId,
    turnId: maybeString(event.turnId) ?? undefined,
    type: "tool_execution_update",
    payload: {
      kind:
        event.type === "tool_execution_start" ? "tool-call" : "tool-result",
      title: maybeString(event.toolName) ?? "Tool call",
      body: serializeEventBody(detail),
      ...(toolCallId ? { toolCallId } : {}),
      phase,
    },
  };
}

function toolEventFromAssistantToolCall(input: {
  event: Record<string, unknown>;
  piSessionId: string;
  assistant: AssistantMessageAccumulator;
}): RuntimeGatewayDriverEvent | null {
  const toolCall = toolCallFromAssistantMessageEvent(input.event);

  if (toolCall?.type !== "toolCall") {
    return null;
  }

  const title = maybeString(toolCall.name);

  if (!title) {
    return null;
  }

  const toolCallId = maybeString(toolCall.id);

  return {
    piSessionId: input.piSessionId,
    turnId: maybeString(input.event.turnId) ?? undefined,
    type: "tool_execution_update",
    payload: {
      kind: "tool-call",
      title,
      body: serializeEventBody(toolCall.arguments),
      ...(toolCallId ? { toolCallId } : {}),
      messageId: messageIdFor({
        piSessionId: input.piSessionId,
        role: "assistant",
        index: input.assistant.index,
      }),
      phase: "final",
    },
  };
}

function queueEventFromAgentEvent(input: {
  event: Record<string, unknown>;
  piSessionId: string;
}): RuntimeGatewayDriverEvent {
  return {
    piSessionId: input.piSessionId,
    type: "queue_update",
    payload: {
      kind: "queue",
      steering: maybeStringArray(input.event.steering),
      followUp: maybeStringArray(input.event.followUp),
    },
  };
}

function statusEventFromAgentEvent(input: {
  event: Record<string, unknown>;
  piSessionId: string;
}): RuntimeGatewayDriverEvent | null {
  const { event, piSessionId } = input;

  if (event.type === "agent_end") {
    return {
      piSessionId,
      type: "status",
      payload: {
        kind: "status",
        title: "Completed",
        body: "Pi SDK runtime ended the active run.",
      },
    };
  }

  if (event.type === "auto_retry_start") {
    return {
      piSessionId,
      type: "status",
      payload: {
        kind: "status",
        title: "Retrying",
        body: maybeString(event.errorMessage) ?? "Pi SDK runtime is retrying the active run.",
      },
    };
  }

  if (event.type === "auto_retry_end") {
    return {
      piSessionId,
      type: "status",
      payload: {
        kind: "status",
        title: event.success ? "Retry complete" : "Retry failed",
        body: maybeString(event.finalError) ?? "",
      },
    };
  }

  if (event.type === "compaction_start" || event.type === "compaction_end") {
    return {
      piSessionId,
      type: "status",
      payload: {
        kind: "status",
        title: event.type === "compaction_start" ? "Compacting" : "Compaction complete",
        body: maybeString(event.reason) ?? "",
      },
    };
  }

  if (event.type === "thinking_level_changed") {
    return {
      piSessionId,
      type: "model_update",
      payload: {
        kind: "model",
        title: "Thinking level changed",
        thinkingLevel: maybeString(event.level) ?? "unknown",
      },
    };
  }

  return null;
}

function createPiSdkRuntimeEventNormalizer(input: {
  piSessionId: string;
  now?: () => string;
}): PiSdkRuntimeEventNormalizer {
  const now = input.now ?? (() => new Date().toISOString());
  const assistant: AssistantMessageAccumulator = {
    index: 0,
    body: "",
    hasBody: false,
    thinkingBody: "",
    hasThinkingBody: false,
  };

  return {
    normalize(event) {
      if (!isRecord(event)) {
        return null;
      }

      if (
        event.type === "message_start" ||
        event.type === "message_update" ||
        event.type === "message_end" ||
        event.type === "turn_end"
      ) {
        const thinkingEvent = thinkingEventFromAgentEvent({
          event,
          piSessionId: input.piSessionId,
          now,
          assistant,
        });

        if (thinkingEvent) {
          return thinkingEvent;
        }

        const toolEvent = toolEventFromAssistantToolCall({
          event,
          piSessionId: input.piSessionId,
          assistant,
        });

        if (toolEvent) {
          return toolEvent;
        }

        return messageEventFromAgentEvent({
          event,
          piSessionId: input.piSessionId,
          now,
          assistant,
        });
      }

      if (
        event.type === "tool_execution_start" ||
        event.type === "tool_execution_update" ||
        event.type === "tool_execution_end"
      ) {
        return toolEventFromAgentEvent({
          event,
          piSessionId: input.piSessionId,
        });
      }

      if (event.type === "queue_update") {
        return queueEventFromAgentEvent({
          event,
          piSessionId: input.piSessionId,
        });
      }

      const statusEvent = statusEventFromAgentEvent({
        event,
        piSessionId: input.piSessionId,
      });

      if (statusEvent) {
        return statusEvent;
      }

      return null;
    },
  };
}

export function runtimeEventFromAgentSessionEvent(input: {
  event: unknown;
  piSessionId: string;
  now?: () => string;
}): RuntimeGatewayDriverEvent | null {
  return createPiSdkRuntimeEventNormalizer({
    piSessionId: input.piSessionId,
    now: input.now,
  }).normalize(input.event);
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
    const eventNormalizer = createPiSdkRuntimeEventNormalizer({
      piSessionId: session.sessionId,
      now,
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
          const runtimeEvent = eventNormalizer.normalize(event);

          if (runtimeEvent) {
            listener(runtimeEvent);
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
