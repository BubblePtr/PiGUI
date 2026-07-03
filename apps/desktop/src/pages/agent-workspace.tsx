import { Button, type Key, ListBox, ScrollShadow, Tooltip } from "@heroui/react";
import { ChainOfThought } from "@heroui-pro/react/chain-of-thought";
import { ChatConversation } from "@heroui-pro/react/chat-conversation";
import { ChatMessage } from "@heroui-pro/react/chat-message";
import { ChatTool, type ToolPartState } from "@heroui-pro/react/chat-tool";
import { InlineSelect } from "@heroui-pro/react/inline-select";
import { Markdown, StreamMarkdown } from "@heroui-pro/react/markdown";
import { PromptInput } from "@heroui-pro/react/prompt-input";
import { PromptSuggestion } from "@heroui-pro/react/prompt-suggestion";
import { Sheet } from "@heroui-pro/react/sheet";
import { TextShimmer } from "@heroui-pro/react/text-shimmer";
import { useParams, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppFrame, defaultSidebarProjectSessionProjections } from "@/app/app-shell";
import {
  Activity,
  Archive,
  Box,
  FolderClosed,
  GitBranch,
  LayoutAlignLeft,
  ListTree,
  Sparkles,
} from "@/shared/ui/icons";
import {
  getBrowserDevelopmentSessionDraft,
  getProjectRegistryWithBrowserDevelopmentFallback,
} from "@/shared/browser-development-data";
import {
  createExecutionCheckoutManager,
  type ExecutionCheckoutManager,
} from "@/entities/checkout/execution-checkout";
import { createInvokeExecutionCheckoutGitClient } from "@/entities/checkout/execution-checkout-client";
import {
  getProjectRegistry,
  subscribeProjectRegistry,
  type ProjectRegistryEntry,
} from "@/entities/project/project-registry";
import { createDefaultPiRuntimeBridge } from "@/entities/runtime/pi-runtime-factory";
import type { PiRuntimeBridge, PiSessionState } from "@/entities/runtime/pi-runtime-bridge";
import type { SessionRuntimeMessage } from "@/entities/session/session-runtime-model";
import {
  createInMemorySessionProjectionStore,
  createSessionFromDraft,
  type CreateSessionFromDraftInput,
  type CreateSessionFromDraftResult,
} from "@/entities/session/session-creation";
import {
  clearFollowUpDraft,
  getFollowUpDraft,
  saveFollowUpDraft,
} from "@/entities/session/follow-up-drafts";
import {
  clearSessionDraft,
  getSessionDraft,
  saveSessionDraft,
  setSessionDraftTarget,
  subscribeSessionDrafts,
  type SessionDraft,
} from "@/entities/session/session-drafts";
import {
  applySessionProjectionEvent,
  canArchiveSessionProjection,
  isSessionProjectionArchived,
  getSessionProjectionListItems,
  isSessionProjectionActive,
  type SessionProjection,
} from "@/entities/session/session-projection";
import { formatCost, formatTokens } from "@/entities/session/sessions";

type LiveMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  controlLabel?: string;
  isStreaming?: boolean;
  relatedMessageIds?: string[];
};

type RunTimelineItem = {
  id: string;
  kind?: "trace" | "thinking" | "tool";
  title: string;
  meta: string;
  messageId?: string;
  toolCallId?: string;
  toolName?: string;
  toolState?: ToolPartState;
  argsText?: string;
  outputText?: string;
};

type AgentWorkspaceFixture = {
  id: string;
  name: string;
  projectRoot: string;
  repoRoot: string;
  selectedSessionId: string;
  liveMessages: LiveMessage[];
  runTimeline: RunTimelineItem[];
  checkout: {
    mode: string;
    root: string;
    runtimeCwd: string;
  };
  summary: {
    model: string;
    totalCostUsd: number;
    totalTokens: number;
  };
};

type SessionActionsContentProps = {
  workspace: AgentWorkspaceFixture;
  projection?: SessionProjection | null;
};

type RestorablePiRuntimeBridge = PiRuntimeBridge & {
  restoreSessionState(state: PiSessionState): Promise<PiSessionState>;
};

export type SessionDraftSubmitEvent = {
  projectId: string;
  prompt: string;
};

type SessionCreatorInput = Omit<
  CreateSessionFromDraftInput,
  "bridge" | "projections"
>;

type SessionCreator = (
  input: SessionCreatorInput,
) => Promise<CreateSessionFromDraftResult>;

const fixtureWorkspace: AgentWorkspaceFixture = {
  id: "pig",
  name: "Pig",
  projectRoot: "/Users/void/code/opensource/Pig",
  repoRoot: "/Users/void/code/opensource/Pig",
  selectedSessionId: "session-control-plane-shell",
  liveMessages: [
    {
      id: "message-user",
      role: "user",
      body: "Create the Agent Workspace entry shape for this Project.",
    },
    {
      id: "message-assistant",
      role: "assistant",
      body: "Project Sessions keep live Pi work separate from Trace and Usage evidence.",
    },
  ],
  runTimeline: [
    {
      id: "timeline-read-context",
      title: "Project context loaded",
      meta: "PiGUI workspace and recent session evidence",
    },
    {
      id: "timeline-render-shell",
      title: "Workspace view prepared",
      meta: "Session list, live chat, timeline, and action surface",
    },
    {
      id: "timeline-analyze",
      title: "Evidence preserved",
      meta: "Trace and Usage stay as historical evidence views",
    },
  ],
  checkout: {
    mode: "Foreground local checkout",
    root: "/Users/void/code/opensource/Pig",
    runtimeCwd: "/Users/void/code/opensource/Pig",
  },
  summary: {
    model: "gpt-5-codex",
    totalCostUsd: 0.042137,
    totalTokens: 18_420,
  },
};

const modelFirstResponseWatchdogMs = 15_000;
const contactingModelPlaceholder = "Pi is contacting the model...";
const stalledModelResponsePlaceholder =
  "Still waiting for the model response. The provider has not returned a first chunk yet.";
const runningAssistantPlaceholder = "Pi is working...";

function getVisibleProjectRegistry() {
  return getProjectRegistryWithBrowserDevelopmentFallback(getProjectRegistry());
}

function LiveChatMessage({
  message,
  timeline = [],
}: {
  message: LiveMessage;
  timeline?: RunTimelineItem[];
}) {
  if (message.role === "user") {
    return (
      <ChatMessage.User>
        <ChatMessage.Bubble>
          {message.controlLabel ? (
            <p className="mb-1 text-xs font-medium text-muted">
              {message.controlLabel}
            </p>
          ) : null}
          <ChatMessage.Content>{message.body}</ChatMessage.Content>
        </ChatMessage.Bubble>
      </ChatMessage.User>
    );
  }

  return (
    <ChatMessage.Assistant>
      <ChatMessage.Avatar alt="Pi agent" fallback="Pi" />
      <ChatMessage.Body>
        {message.controlLabel ? (
          <p className="mb-1 text-xs font-medium text-muted">
            {message.controlLabel}
          </p>
        ) : null}
        {!message.controlLabel ? (
          <AssistantRunTrace
            isStreaming={message.isStreaming}
            timeline={timeline}
          />
        ) : null}
        <ChatMessage.Content>
          <AssistantMessageContent message={message} />
        </ChatMessage.Content>
      </ChatMessage.Body>
    </ChatMessage.Assistant>
  );
}

function AssistantRunTrace({
  isStreaming = false,
  timeline,
}: {
  isStreaming?: boolean;
  timeline: RunTimelineItem[];
}) {
  if (!timeline.length) {
    return null;
  }

  return (
    <ChainOfThought defaultExpanded isStreaming={isStreaming}>
      <ChainOfThought.Trigger>
        {isStreaming ? "Thinking..." : "Thought for 3s"}
      </ChainOfThought.Trigger>
      <ChainOfThought.Content>
        <ChainOfThought.Steps>
          {timeline.map((item) => (
            <ChainOfThought.Step key={item.id} label={item.title}>
              <RunTimelineStepContent item={item} />
            </ChainOfThought.Step>
          ))}
        </ChainOfThought.Steps>
      </ChainOfThought.Content>
    </ChainOfThought>
  );
}

function RunTimelineStepContent({ item }: { item: RunTimelineItem }) {
  if (item.kind !== "tool") {
    return item.meta;
  }

  return (
    <ChatTool
      argsText={item.argsText}
      defaultExpanded
      output={item.outputText}
      state={item.toolState ?? "input-available"}
      toolCallId={item.toolCallId}
      toolName={item.toolName ?? item.title}
      triggerPrefix="Used tool: "
    />
  );
}

function AssistantMessageContent({ message }: { message: LiveMessage }) {
  if (message.controlLabel) {
    return message.body;
  }

  if (message.isStreaming) {
    return (
      <StreamMarkdown caret="block" isStreaming>
        {message.body}
      </StreamMarkdown>
    );
  }

  return <Markdown>{message.body}</Markdown>;
}

function QueuedMessageList({
  projection,
  onWithdraw,
}: {
  projection: SessionProjection;
  onWithdraw: (queuedMessageId: string) => void;
}) {
  const queuedMessages = projection.queuedMessages.filter(
    (queuedMessage) => queuedMessage.status !== "processing",
  );

  if (!queuedMessages.length) {
    return null;
  }

  return (
    <div
      className="mx-auto mb-3 grid w-full max-w-[44rem] gap-2"
      data-testid="queued-message-list"
    >
      {queuedMessages.map((queuedMessage) => (
        <div
          key={queuedMessage.id}
          className="rounded-md bg-surface-secondary px-3 py-2 text-sm"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">
                {queuedMessage.status === "withdrawn" ? "Withdrawn" : "Queued"}
              </p>
              <p className="mt-1 break-words text-foreground">
                {queuedMessage.body}
              </p>
            </div>
            {queuedMessage.status === "pending" ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Withdraw queued message"
                onPress={() => onWithdraw(queuedMessage.id)}
              >
                Withdraw
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function FullChatComposer({
  queueMode = false,
  isStoppingRun = false,
  projection,
  onPromptSubmit,
  onQueueSubmit,
  onWithdrawQueuedMessage,
  onStopRun,
  onSteerSubmit,
}: {
  queueMode?: boolean;
  isStoppingRun?: boolean;
  projection?: SessionProjection | null;
  onPromptSubmit?: (message: string) => Promise<void> | void;
  onQueueSubmit?: (message: string) => Promise<void> | void;
  onWithdrawQueuedMessage?: (queuedMessageId: string) => Promise<void> | void;
  onStopRun?: () => Promise<void> | void;
  onSteerSubmit?: (message: string) => Promise<void> | void;
}) {
  const sessionId = projection?.id ?? null;
  const [draft, setDraft] = useState(() =>
    sessionId ? getFollowUpDraft(sessionId)?.message ?? "" : "",
  );
  const [composerError, setComposerError] = useState<string | null>(null);
  const isStopAction = queueMode && !draft.trim();
  const promptStatus = isStoppingRun
    ? "submitted"
    : queueMode
      ? "streaming"
      : composerError
        ? "error"
        : "ready";
  const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Pi could not process this input.";
  const updateDraft = (message: string) => {
    setDraft(message);

    if (!sessionId) {
      return;
    }

    if (message.trim()) {
      saveFollowUpDraft(sessionId, message);
    } else {
      clearFollowUpDraft(sessionId);
    }
  };
  const clearSubmittedDraft = () => {
    setDraft("");

    if (sessionId) {
      clearFollowUpDraft(sessionId);
    }
  };

  useEffect(() => {
    setDraft(sessionId ? getFollowUpDraft(sessionId)?.message ?? "" : "");
    setComposerError(null);
  }, [sessionId]);

  const submitDraft = async () => {
    const message = draft.trim();

    if (!message) {
      return;
    }

    if (queueMode) {
      try {
        await onQueueSubmit?.(message);
        setComposerError(null);
        clearSubmittedDraft();
      } catch (error) {
        setComposerError(errorMessage(error));
      }

      return;
    }

    try {
      await onPromptSubmit?.(message);
      setComposerError(null);
      clearSubmittedDraft();
    } catch (error) {
      setComposerError(errorMessage(error));
    }
  };
  const submitSteer = async () => {
    const message = draft.trim();

    if (!message) {
      return;
    }

    try {
      await onSteerSubmit?.(message);
      setComposerError(null);
      clearSubmittedDraft();
    } catch (error) {
      setComposerError(errorMessage(error));
    }
  };

  return (
    <div
      className="mt-auto shrink-0 px-4 pb-3 pt-3"
      data-testid="full-chat-composer"
    >
      {projection ? (
        <QueuedMessageList
          projection={projection}
          onWithdraw={(queuedMessageId) =>
            void onWithdrawQueuedMessage?.(queuedMessageId)
          }
        />
      ) : null}
      <PromptInput
        allowSubmitWhileRunning={queueMode}
        className="mx-auto w-full max-w-[44rem]"
        lockInputOnRun={!queueMode}
        status={promptStatus}
        value={draft}
        variant="primary"
        onStop={onStopRun ? () => void onStopRun() : undefined}
        onSubmit={submitDraft}
        onValueChange={updateDraft}
      >
        <PromptInput.Shell>
          <PromptInput.Content>
            <PromptInput.TextArea placeholder="What do you want to know?" />
          </PromptInput.Content>
          <PromptInput.Toolbar>
            <PromptInput.ToolbarEnd>
              {queueMode ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => void submitSteer()}
                >
                  Steer
                </Button>
              ) : null}
              <PromptInput.Send aria-label={isStopAction ? "Stop" : "Send"} />
            </PromptInput.ToolbarEnd>
          </PromptInput.Toolbar>
        </PromptInput.Shell>
        {composerError || !queueMode ? (
          <PromptInput.Footer>
            {composerError ? (
              <span role="status">{composerError}</span>
            ) : (
              "AI can make mistakes. Check important info."
            )}
          </PromptInput.Footer>
        ) : null}
      </PromptInput>
    </div>
  );
}

// —— Structured runtime model rendering (Agent Runtime Event Model) ——
// Active once run events own the session; bridges that don't speak the new
// model fall back to the legacy runtimeEvents pipeline below.

function runtimeModelIsActive(projection: SessionProjection) {
  return projection.runtimeModel.runs.size > 0;
}

function chatTextFromModelMessage(message: SessionRuntimeMessage) {
  return message.parts
    .filter((part) => part.partType === "text")
    .map((part) => part.body)
    .join("");
}

function serializeModelDetail(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

function liveMessagesFromRuntimeModel(
  projection: SessionProjection,
  clockNowMs = Date.now(),
): LiveMessage[] | null {
  if (!runtimeModelIsActive(projection)) {
    return null;
  }

  const model = projection.runtimeModel;
  const streamingAllowed = projection.status === "running" && !projection.stale;
  const messages: LiveMessage[] = [];
  let errorCursor = 0;

  for (const entry of model.order) {
    if (entry.kind === "error") {
      const error = model.errors[errorCursor];

      errorCursor += 1;

      if (error) {
        messages.push({
          id: entry.id,
          role: "assistant",
          body: error.body,
          controlLabel: "Run failed",
        });
      }

      continue;
    }

    if (entry.kind !== "message") {
      continue;
    }

    const message = model.messages.get(entry.id);

    // Abandoned retry partials are closed boundaries, not answers.
    if (!message || message.abandoned) {
      continue;
    }

    const body = chatTextFromModelMessage(message);
    const isStreaming = streamingAllowed && message.phase === "streaming";

    if (!body && !message.controlLabel && !isStreaming) {
      continue;
    }

    messages.push({
      id: message.messageId,
      role: message.role,
      body,
      ...(message.controlLabel ? { controlLabel: message.controlLabel } : {}),
      ...(isStreaming ? { isStreaming: true } : {}),
    });
  }

  const messagesWithPlaceholder = appendModelRunningPlaceholder(
    projection,
    messages,
    clockNowMs,
  );
  const hasInitialPromptMessage = messagesWithPlaceholder.some(
    (message) => message.role === "user" && message.body === projection.initialPrompt,
  );

  if (hasInitialPromptMessage) {
    return messagesWithPlaceholder;
  }

  return [
    {
      id: `${projection.id}-initial-prompt`,
      role: "user",
      body: projection.initialPrompt,
    },
    ...messagesWithPlaceholder,
  ];
}

function appendModelRunningPlaceholder(
  projection: SessionProjection,
  messages: LiveMessage[],
  clockNowMs: number,
): LiveMessage[] {
  if (projection.status !== "running" || projection.stale) {
    return messages;
  }

  const hasAssistantMessage = messages.some(
    (message) =>
      message.role === "assistant" &&
      !message.controlLabel &&
      message.body.trim().length > 0,
  );

  if (hasAssistantMessage) {
    return messages;
  }

  const model = projection.runtimeModel;
  const traceMessageId = [...model.messages.values()]
    .reverse()
    .find((message) =>
      message.parts.some(
        (part) => part.partType === "thinking" || part.partType === "tool_call",
      ),
    )?.messageId;
  const hasModelActivity =
    model.tools.size > 0 ||
    [...model.messages.values()].some(
      (message) => message.role === "assistant" && message.parts.length > 0,
    );
  const latestTimestampMs = Date.parse(model.updatedAt ?? projection.updatedAt);
  const elapsedMs = Number.isFinite(latestTimestampMs)
    ? Math.max(0, clockNowMs - latestTimestampMs)
    : 0;
  const body = hasModelActivity
    ? runningAssistantPlaceholder
    : elapsedMs >= modelFirstResponseWatchdogMs
      ? stalledModelResponsePlaceholder
      : contactingModelPlaceholder;

  return [
    ...messages,
    {
      id: traceMessageId ?? `${projection.id}-running-placeholder`,
      role: "assistant",
      body,
      isStreaming: true,
    },
  ];
}

function runTimelineFromRuntimeModel(
  projection: SessionProjection,
): RunTimelineItem[] | null {
  if (!runtimeModelIsActive(projection)) {
    return null;
  }

  const model = projection.runtimeModel;
  const messageIdByToolCallId = new Map<string, string>();

  for (const message of model.messages.values()) {
    for (const part of message.parts) {
      if (part.toolCallId) {
        messageIdByToolCallId.set(part.toolCallId, message.messageId);
      }
    }
  }

  const items: RunTimelineItem[] = [];

  for (const entry of model.order) {
    if (entry.kind === "message") {
      const message = model.messages.get(entry.id);

      for (const part of message?.parts ?? []) {
        if (part.partType === "thinking" && part.body) {
          items.push({
            id: part.partId,
            kind: "thinking",
            title: "Thinking",
            meta: part.body,
            messageId: message?.messageId,
          });
        }
      }

      continue;
    }

    if (entry.kind !== "tool") {
      continue;
    }

    const tool = model.tools.get(entry.id);

    if (!tool) {
      continue;
    }

    const toolName = tool.name ?? "Tool";
    const argsText =
      tool.args !== undefined ? serializeModelDetail(tool.args) : tool.argsText;
    const outputText =
      tool.result !== undefined ? serializeModelDetail(tool.result) : undefined;

    items.push({
      id: tool.toolCallId,
      kind: "tool",
      title: `Tool: ${toolName}`,
      meta: outputText ?? argsText ?? "",
      messageId: messageIdByToolCallId.get(tool.toolCallId),
      toolCallId: tool.toolCallId,
      toolName,
      toolState: tool.phase === "done" ? "output-available" : "input-available",
      argsText,
      outputText,
    });
  }

  return items;
}

function liveMessagesFromProjection(
  projection: SessionProjection,
  clockNowMs = Date.now(),
): LiveMessage[] {
  const liveEvents = projection.runtimeEvents
    .filter(isLiveChatRuntimeEvent)
    .reduce<SessionProjection["runtimeEvents"]>((events, event) => {
      const previousEvent = events[events.length - 1];

      if (isAdjacentDuplicateLiveMessageEvent(previousEvent, event)) {
        return [...events.slice(0, -1), event];
      }

      const identity = liveRuntimeMessageIdentity(event);

      if (!identity) {
        return [...events, event];
      }

      const existingIndex = events.findIndex(
        (existingEvent) => liveRuntimeMessageIdentity(existingEvent) === identity,
      );

      if (existingIndex === -1) {
        return [...events, event];
      }

      return events.map((existingEvent, index) =>
        index === existingIndex ? event : existingEvent,
      );
    }, []);
  const projectedMessages = liveEvents
    .map(
      (event): LiveMessage => ({
        id: event.messageId ?? event.id,
        role:
          event.role === "user"
            ? "user"
            : event.role === "assistant"
              ? "assistant"
              : "assistant",
        body: event.body,
        controlLabel:
          event.kind === "control" ||
          event.kind === "status" ||
          event.kind === "error"
            ? (event.title ?? "Control")
            : undefined,
      }),
    );
  const collapsedMessages = collapseAssistantRunMessages(projectedMessages);
  const streamingMessageId =
    projection.status === "running" && !projection.stale
      ? [...collapsedMessages]
          .reverse()
          .find(
            (message) =>
              message.role === "assistant" && !message.controlLabel,
          )?.id
      : undefined;
  const visibleMessages = collapsedMessages.map((message) =>
    message.id === streamingMessageId
      ? {
          ...message,
          isStreaming: true,
        }
      : message,
  );
  const messagesWithRunningPlaceholder = appendRunningAssistantPlaceholder(
    projection,
    visibleMessages,
    clockNowMs,
  );
  const hasInitialPromptEvent = projectedMessages.some(
    (message) =>
      message.role === "user" && message.body === projection.initialPrompt,
  );

  if (hasInitialPromptEvent) {
    return messagesWithRunningPlaceholder;
  }

  return [
    {
      id: `${projection.id}-initial-prompt`,
      role: "user",
      body: projection.initialPrompt,
    },
    ...messagesWithRunningPlaceholder,
  ];
}

function isAssistantAnswerMessage(message: LiveMessage) {
  return message.role === "assistant" && !message.controlLabel;
}

function relatedMessageIdsFor(message: LiveMessage) {
  return message.relatedMessageIds ?? [message.id];
}

// Legacy-fallback only: message boundaries in the runtime-model path come from
// the protocol, so this adjacency heuristic never runs there. Delete together
// with the legacy runtimeEvents pipeline once every bridge speaks the Agent
// Runtime Event Model.
function collapseAssistantRunMessages(messages: LiveMessage[]) {
  return messages.reduce<LiveMessage[]>((collapsedMessages, message) => {
    if (!isAssistantAnswerMessage(message)) {
      return [...collapsedMessages, message];
    }

    const previousMessage = collapsedMessages[collapsedMessages.length - 1];

    if (!previousMessage || !isAssistantAnswerMessage(previousMessage)) {
      return [
        ...collapsedMessages,
        {
          ...message,
          relatedMessageIds: relatedMessageIdsFor(message),
        },
      ];
    }

    return [
      ...collapsedMessages.slice(0, -1),
      {
        ...message,
        relatedMessageIds: [
          ...relatedMessageIdsFor(previousMessage),
          ...relatedMessageIdsFor(message),
        ],
      },
    ];
  }, []);
}

function appendRunningAssistantPlaceholder(
  projection: SessionProjection,
  messages: LiveMessage[],
  clockNowMs: number,
): LiveMessage[] {
  if (projection.status !== "running" || projection.stale) {
    return messages;
  }

  const hasAssistantMessage = messages.some(
    (message) =>
      message.role === "assistant" &&
      !message.controlLabel &&
      message.body.trim().length > 0,
  );

  if (hasAssistantMessage) {
    return messages;
  }

  const traceMessageId = [...projection.runtimeEvents]
    .reverse()
    .find(
      (event) =>
        (event.kind === "thinking" ||
          event.kind === "tool-call" ||
          event.kind === "tool-result") &&
        event.messageId,
    )?.messageId;

  return [
    ...messages,
    {
      id: traceMessageId ?? `${projection.id}-running-placeholder`,
      role: "assistant",
      body: runningAssistantPlaceholderBody(projection, clockNowMs),
      isStreaming: true,
    },
  ];
}

function runningAssistantPlaceholderBody(
  projection: SessionProjection,
  clockNowMs: number,
) {
  const hasModelActivity = projection.runtimeEvents.some(
    (event) =>
      event.kind === "thinking" ||
      event.kind === "tool-call" ||
      event.kind === "tool-result" ||
      (event.kind === "message" && event.role === "assistant"),
  );

  if (hasModelActivity) {
    return runningAssistantPlaceholder;
  }

  const latestRuntimeTimestamp =
    projection.runtimeEvents[projection.runtimeEvents.length - 1]?.timestamp ??
    projection.updatedAt;
  const latestRuntimeTimeMs = Date.parse(latestRuntimeTimestamp);
  const elapsedMs = Number.isFinite(latestRuntimeTimeMs)
    ? Math.max(0, clockNowMs - latestRuntimeTimeMs)
    : 0;

  return elapsedMs >= modelFirstResponseWatchdogMs
    ? stalledModelResponsePlaceholder
    : contactingModelPlaceholder;
}

function isLiveChatRuntimeEvent(
  event: SessionProjection["runtimeEvents"][number],
) {
  return (
    ((event.kind === "message" || event.kind === "control") &&
      (event.role === "user" || event.role === "assistant")) ||
    event.kind === "error"
  );
}

function liveRuntimeMessageIdentity(
  event: SessionProjection["runtimeEvents"][number],
) {
  if (event.kind !== "message" || !event.messageId) {
    return null;
  }

  return `${event.piSessionId}\u0000${event.messageId}`;
}

function isAdjacentDuplicateLiveMessageEvent(
  previousEvent: SessionProjection["runtimeEvents"][number] | undefined,
  event: SessionProjection["runtimeEvents"][number],
) {
  return (
    previousEvent?.kind === "message" &&
    event.kind === "message" &&
    previousEvent.piSessionId === event.piSessionId &&
    previousEvent.role === "assistant" &&
    event.role === "assistant" &&
    previousEvent.body.trim() !== "" &&
    previousEvent.body === event.body
  );
}

function runTimelineFromProjection(
  projection: SessionProjection,
): RunTimelineItem[] {
  const items: RunTimelineItem[] = [];
  const toolItemIndexes = new Map<string, number>();

  for (const event of projection.runtimeEvents) {
    if (event.kind === "thinking") {
      items.push({
        id: event.id,
        kind: "thinking",
        title: "Thinking",
        meta: event.body,
        messageId: event.messageId,
      });
      continue;
    }

    if (event.kind !== "tool-call" && event.kind !== "tool-result") {
      continue;
    }

    const toolName = event.title ?? "Tool";
    const toolIdentity = event.toolCallId ?? event.id;
    const existingIndex = toolItemIndexes.get(toolIdentity);

    if (existingIndex === undefined) {
      const item: RunTimelineItem = {
        id: event.id,
        kind: "tool",
        title: `Tool: ${toolName}`,
        meta: event.body,
        messageId: event.messageId,
        toolCallId: event.toolCallId,
        toolName,
        toolState:
          event.kind === "tool-result" ? "output-available" : "input-available",
        argsText: event.kind === "tool-call" ? event.body : undefined,
        outputText: event.kind === "tool-result" ? event.body : undefined,
      };

      toolItemIndexes.set(toolIdentity, items.length);
      items.push(item);
      continue;
    }

    const existingItem = items[existingIndex];

    items[existingIndex] = {
      ...existingItem,
      id: `${existingItem.id}:${event.id}`,
      messageId: existingItem.messageId ?? event.messageId,
      toolCallId: existingItem.toolCallId ?? event.toolCallId,
      toolName: existingItem.toolName ?? toolName,
      toolState:
        event.kind === "tool-result" ? "output-available" : existingItem.toolState,
      argsText:
        event.kind === "tool-call" ? event.body : existingItem.argsText,
      outputText:
        event.kind === "tool-result" ? event.body : existingItem.outputText,
      meta: event.kind === "tool-result" ? event.body : existingItem.meta,
    };
  }

  return items;
}

function isReadOnlyProjection(projection: SessionProjection | null) {
  return Boolean(projection && isSessionProjectionArchived(projection));
}

function isRuntimeUnavailableProjection(projection: SessionProjection | null) {
  return Boolean(projection?.stale);
}

const SESSION_DRAFT_SUGGESTED_PROMPTS = [
  {
    Icon: LayoutAlignLeft,
    id: "launch-page",
    label: "Design a launch page",
    prompt: "Design a launch page",
  },
  {
    Icon: ListTree,
    id: "meeting-notes",
    label: "Summarize meeting notes",
    prompt: "Summarize meeting notes",
  },
  {
    Icon: Sparkles,
    id: "sound-brief",
    label: "Generate a sound brief",
    prompt: "Generate a sound brief",
  },
  {
    Icon: Box,
    id: "data-model",
    label: "Plan a data model",
    prompt: "Plan a data model",
  },
] as const;

const projectPickerPlaceholder = "Select Project";
const projectPickerPlaceholderKey = "__project-picker-placeholder__";

function projectPickerKeyToProjectId(key: Key | null) {
  if (key === null || key === projectPickerPlaceholderKey) {
    return null;
  }

  return String(key);
}

function ProjectPicker({
  projects,
  selectedProjectId,
  onProjectChange,
}: {
  projects: ProjectRegistryEntry[];
  selectedProjectId: string | null;
  onProjectChange: (projectId: string | null) => void;
}) {
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const displayLabel = selectedProject?.displayName ?? projectPickerPlaceholder;
  const selectedPickerKey = selectedProject?.id ?? projectPickerPlaceholderKey;

  return (
    <div className="max-w-full" data-testid="project-picker">
      <InlineSelect
        aria-label="Target Project"
        value={selectedPickerKey}
        onChange={(key) => {
          onProjectChange(projectPickerKeyToProjectId(key));
        }}
      >
        <InlineSelect.Trigger
          aria-label="Target Project"
          className="inline-flex min-h-8 w-fit max-w-full min-w-0 items-center gap-2 rounded-xl border border-transparent bg-surface-secondary px-2.5 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
          data-testid="project-picker-trigger"
        >
          <FolderClosed
            aria-hidden="true"
            className="size-4 shrink-0 text-muted"
            data-testid="project-picker-folder-icon"
          />
          <span
            className="min-w-0 truncate"
            data-testid="project-picker-label"
          >
            {displayLabel}
          </span>
          <InlineSelect.Indicator className="size-4 shrink-0 text-muted" />
        </InlineSelect.Trigger>
        <InlineSelect.Popover
          className="w-[min(18rem,calc(100vw-2rem))]"
          placement="bottom start"
        >
          <ListBox aria-label="Projects">
            <ListBox.Item
              id={projectPickerPlaceholderKey}
              textValue={projectPickerPlaceholder}
            >
              <span className="truncate text-muted">{projectPickerPlaceholder}</span>
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {projects.map((project) => (
              <ListBox.Item
                key={project.id}
                id={project.id}
                textValue={project.displayName}
              >
                <FolderClosed
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
                <span className="min-w-0 truncate">{project.displayName}</span>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </InlineSelect.Popover>
      </InlineSelect>
    </div>
  );
}

function SessionDraftComposer({
  draft,
  projects,
  creationProjection,
  onDraftChange,
  onDraftTargetChange,
  onDraftSubmit,
}: {
  draft: SessionDraft;
  projects: ProjectRegistryEntry[];
  creationProjection: SessionProjection | null;
  onDraftChange: (prompt: string) => void;
  onDraftTargetChange: (projectId: string | null) => void;
  onDraftSubmit: (event: SessionDraftSubmitEvent) => void;
}) {
  const [targetError, setTargetError] = useState(false);
  const applySuggestedPrompt = (prompt: string) => {
    setTargetError(false);
    onDraftChange(prompt);
  };
  const submitDraft = () => {
    const prompt = draft.prompt.trim();

    if (!prompt) {
      return;
    }

    if (!draft.projectId) {
      setTargetError(true);
      return;
    }

    onDraftSubmit({ projectId: draft.projectId, prompt: draft.prompt });
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col items-center justify-center px-6 py-8"
      data-testid="session-draft-composer"
    >
      <div
        className="flex w-full max-w-[46rem] flex-col items-center justify-center gap-6"
        data-testid="session-draft-empty-state"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-center text-3xl font-normal tracking-tight text-foreground">
            Build something useful with{" "}
            <span className="text-muted">
              <TextShimmer>PiGUI</TextShimmer>
            </span>
          </h2>
        </div>
        <div className="flex w-full flex-col gap-3">
          <PromptInput
            className="w-full"
            value={draft.prompt}
            variant="primary"
            onSubmit={submitDraft}
            onValueChange={onDraftChange}
          >
            <PromptInput.Shell className="border border-border bg-surface shadow-surface">
              <PromptInput.Content>
                <PromptInput.TextArea placeholder="Do anything with Pi" />
              </PromptInput.Content>
              <PromptInput.Toolbar>
                <PromptInput.ToolbarEnd>
                  <PromptInput.Send aria-label="Submit initial prompt" />
                </PromptInput.ToolbarEnd>
              </PromptInput.Toolbar>
            </PromptInput.Shell>
          </PromptInput>
          <div
            className="flex w-full justify-start"
            data-testid="session-draft-project-picker"
          >
            <ProjectPicker
              projects={projects}
              selectedProjectId={draft.projectId}
              onProjectChange={(projectId) => {
                setTargetError(false);
                onDraftTargetChange(projectId);
              }}
            />
          </div>
          {targetError ? (
            <p className="text-sm text-danger">
              Select a Project before submitting.
            </p>
          ) : null}
          {creationProjection ? (
            <div
              aria-live="polite"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              data-testid="session-creation-status"
            >
              {creationProjection.failure ? (
                <>
                  <p className="font-medium text-foreground">
                    Session creation failed
                  </p>
                  <dl className="mt-2 grid gap-1">
                    <div className="flex items-center gap-2">
                      <dt className="text-muted">Stage</dt>
                      <dd className="font-medium text-foreground">
                        {creationProjection.failure.stage}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="text-muted">Error</dt>
                      <dd className="text-foreground">
                        {creationProjection.failure.message}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="font-medium text-foreground">
                  {creationProjection.creationStage}
                </p>
              )}
            </div>
          ) : null}
        </div>
        <PromptSuggestion className="w-full max-w-[35rem]">
          <PromptSuggestion.Items className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SESSION_DRAFT_SUGGESTED_PROMPTS.map(({ Icon, id, label, prompt }) => (
              <PromptSuggestion.Item
                key={id}
                className="items-center justify-start"
                showEndIcon={false}
                onPress={() => applySuggestedPrompt(prompt)}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                    data-testid="session-draft-suggestion-icon"
                  />
                  <span className="truncate">{label}</span>
                </span>
              </PromptSuggestion.Item>
            ))}
          </PromptSuggestion.Items>
        </PromptSuggestion>
      </div>
    </section>
  );
}

function checkoutModeLabel(mode: string) {
  if (mode === "foreground-local") {
    return "Foreground local checkout";
  }

  if (mode === "managed-worktree") {
    return "PiGUI-managed worktree";
  }

  return mode;
}

export function SessionActionsContent({
  workspace,
  projection,
}: SessionActionsContentProps) {
  const checkout = projection?.checkout
    ? {
        mode: checkoutModeLabel(projection.checkout.mode),
        root:
          projection.checkout.executionCheckoutRoot ??
          projection.checkout.diffRoot ??
          projection.checkout.root,
        runtimeCwd: projection.checkout.runtimeCwd,
        repoRoot: projection.checkout.repoRoot,
        projectRoot: projection.checkout.projectRoot,
        projectRelativePath: projection.checkout.projectRelativePath,
        diffRoot: projection.checkout.diffRoot,
        sessionBound: projection.checkout.sessionBound,
        disposable: projection.checkout.disposable,
        cleanupCandidate: projection.checkout.cleanupCandidate,
        permanent: projection.checkout.permanent,
      }
    : {
        ...workspace.checkout,
        repoRoot: workspace.repoRoot,
        projectRoot: workspace.projectRoot,
        projectRelativePath: ".",
        diffRoot: workspace.checkout.root,
        sessionBound: false,
        disposable: false,
        cleanupCandidate: false,
        permanent: true,
      };
  const summary = projection
    ? {
        provider: projection.summary.provider,
        model: projection.summary.model ?? workspace.summary.model,
        totalCostUsd: projection.summary.totalCostUsd,
        totalTokens: projection.summary.totalTokens,
      }
    : {
        provider: null,
        ...workspace.summary,
      };
  const archiveAllowed = projection
    ? canArchiveSessionProjection(projection)
    : true;
  const hasGitRepository = Boolean(checkout.repoRoot);

  return (
    <div className="grid gap-5">
      {!hasGitRepository ? (
        <section className="rounded-md border border-default/70 bg-surface px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">
            No Git repository
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Git-only actions are unavailable for this Project.
          </p>
        </section>
      ) : null}

      <section>
        <h3 className="text-sm font-semibold text-foreground">Diff summary</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          No changes are attached to this Session.
        </p>
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <GitBranch className="size-4 text-muted" />
          Checkout
        </h3>
        <dl className="mt-3 grid gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase text-muted">Mode</dt>
            <dd className="mt-1 break-words text-foreground">
              {checkout.mode}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted">Root</dt>
            <dd className="mt-1 break-words text-foreground">
              {checkout.root}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted">
              Runtime cwd
            </dt>
            <dd className="mt-1 break-words text-foreground">
              {checkout.runtimeCwd}
            </dd>
          </div>
        </dl>
        <details className="mt-4 rounded-md border border-default/70 px-3 py-2 text-sm">
          <summary className="cursor-default text-muted">
            Advanced checkout details
          </summary>
          <dl className="mt-3 grid gap-3">
            {checkout.repoRoot ? (
              <div>
                <dt className="text-xs font-medium uppercase text-muted">
                  Repo root
                </dt>
                <dd className="mt-1 break-words text-foreground">
                  {checkout.repoRoot}
                </dd>
              </div>
            ) : null}
            {checkout.projectRoot ? (
              <div>
                <dt className="text-xs font-medium uppercase text-muted">
                  Project root
                </dt>
                <dd className="mt-1 break-words text-foreground">
                  {checkout.projectRoot}
                </dd>
              </div>
            ) : null}
            {checkout.projectRelativePath ? (
              <div>
                <dt className="text-xs font-medium uppercase text-muted">
                  Project relative path
                </dt>
                <dd className="mt-1 break-words text-foreground">
                  {checkout.projectRelativePath}
                </dd>
              </div>
            ) : null}
            {checkout.diffRoot && checkout.diffRoot !== checkout.root ? (
              <div>
                <dt className="text-xs font-medium uppercase text-muted">
                  Diff root
                </dt>
                <dd className="mt-1 break-words text-foreground">
                  {checkout.diffRoot}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium uppercase text-muted">
                Lifecycle
              </dt>
              <dd className="mt-1 break-words text-foreground">
                {[
                  checkout.sessionBound ? "Session-bound" : "Shared checkout",
                  checkout.disposable ? "Disposable" : "Retained",
                  checkout.cleanupCandidate ? "Cleanup candidate" : null,
                  checkout.permanent ? "Permanent" : null,
                ]
                  .filter(Boolean)
                  .join(" / ")}
              </dd>
            </div>
          </dl>
        </details>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground">
          Model and cost
        </h3>
        <dl className="mt-3 grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Model</dt>
            <dd className="min-w-0 truncate text-right font-medium text-foreground">
              {summary.model}
            </dd>
          </div>
          {summary.provider ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Provider</dt>
              <dd className="font-medium text-foreground">
                {summary.provider}
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Cost</dt>
            <dd className="font-medium text-foreground">
              {formatCost(summary.totalCostUsd)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Tokens</dt>
            <dd className="font-medium text-foreground">
              {formatTokens(summary.totalTokens)}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground">Archive</h3>
        <div className="mt-3">
          <Button isDisabled={!archiveAllowed} size="sm" variant="outline">
            <Archive className="size-4" />
            Archive Session
          </Button>
        </div>
        {!archiveAllowed ? (
          <p className="mt-2 text-sm leading-6 text-muted">
            Active runs cannot be archived.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function SessionActionsSheet({
  workspace,
  projection,
}: {
  workspace: AgentWorkspaceFixture;
  projection?: SessionProjection | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip delay={0}>
        <Tooltip.Trigger className="inline-flex">
          <Button
            isIconOnly
            aria-label="Session actions"
            size="sm"
            variant="ghost"
            onPress={() => setOpen(true)}
          >
            <Activity className="size-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>Session actions</Tooltip.Content>
      </Tooltip>

      <Sheet isOpen={open} placement="right" onOpenChange={setOpen}>
        <Sheet.Backdrop>
          <Sheet.Content
            className="w-full md:w-[28rem]"
            style={
              open
                ? {
                    animation: "none",
                    transform: "translate3d(0, 0, 0)",
                  }
                : undefined
            }
          >
            <Sheet.Dialog>
              <Sheet.CloseTrigger />
              <Sheet.Header>
                <Sheet.Heading>Session actions</Sheet.Heading>
                <p className="mt-1 text-sm text-muted">
                  Explicit checkout, diff, model, and cost context.
                </p>
              </Sheet.Header>
              <Sheet.Body>
                <ScrollShadow className="max-h-[calc(100vh-10rem)] overflow-y-auto">
                  <SessionActionsContent
                    workspace={workspace}
                    projection={projection}
                  />
                </ScrollShadow>
              </Sheet.Body>
            </Sheet.Dialog>
          </Sheet.Content>
        </Sheet.Backdrop>
      </Sheet>
    </>
  );
}

function isRestorablePiRuntimeBridge(
  bridge: PiRuntimeBridge,
): bridge is RestorablePiRuntimeBridge {
  return (
    "restoreSessionState" in bridge &&
    typeof bridge.restoreSessionState === "function"
  );
}

function runtimeStateStatusFromProjection(
  projection: SessionProjection,
): PiSessionState["status"] {
  switch (projection.status) {
    case "failed":
      return "failed";
    case "completed":
    case "archived":
      return "completed";
    case "waiting":
      return "idle";
    case "creating":
    case "running":
      return "running";
  }
}

function messageFromError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Pi could not stop the active run.";
}

async function restoreProjectionRuntimeState(input: {
  bridge: PiRuntimeBridge;
  projection: SessionProjection;
  workspace: AgentWorkspaceFixture;
}) {
  const { bridge, projection, workspace } = input;

  if (
    !projection.piSessionId ||
    !projection.runtimeId ||
    !isRestorablePiRuntimeBridge(bridge)
  ) {
    return;
  }

  await bridge.restoreSessionState({
    piSessionId: projection.piSessionId,
    runtimeId: projection.runtimeId,
    projectId: projection.projectId,
    cwd: projection.checkout?.runtimeCwd ?? workspace.checkout.runtimeCwd,
    status: runtimeStateStatusFromProjection(projection),
    events: projection.runtimeEvents,
    summary: projection.summary,
    updatedAt: projection.updatedAt,
  });
}

export function SessionToolbarActions({
  workspace,
  projection,
}: {
  workspace: AgentWorkspaceFixture;
  projection?: SessionProjection | null;
}) {
  return <SessionActionsSheet workspace={workspace} projection={projection} />;
}

function LiveSessionColumn({
  workspace,
  projectId,
  showDraft,
  onDraftSubmit,
  sessionCreator,
  getRuntimeBridge,
  sessionProjection,
  clockNowMs,
  onProjectionChange,
  onLatestMessageRendered,
}: {
  workspace: AgentWorkspaceFixture;
  projectId: string;
  showDraft: boolean;
  onDraftSubmit: (event: SessionDraftSubmitEvent) => void;
  sessionCreator: SessionCreator;
  getRuntimeBridge: () => PiRuntimeBridge;
  sessionProjection?: SessionProjection | null;
  clockNowMs?: number;
  onProjectionChange?: (projection: SessionProjection) => void;
  onLatestMessageRendered?: (sessionId: string) => void;
}) {
  const [registryProjects, setRegistryProjects] = useState(() =>
    getVisibleProjectRegistry(),
  );
  const fallbackProject: ProjectRegistryEntry = {
    id: projectId,
    path: workspace.projectRoot,
    displayName: workspace.name,
    addedAt: "1970-01-01T00:00:00.000Z",
  };
  const usingRegistryProjects = registryProjects.length > 0;
  const projects = usingRegistryProjects ? registryProjects : [fallbackProject];
  const projectIds = projects.map((project) => project.id);
  const projectIdsKey = projectIds.join("\n");
  const getVisibleSessionDraft = () =>
    getSessionDraft({ projectIds }) ??
    (showDraft ? getBrowserDevelopmentSessionDraft(projectIds) : null);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(() =>
    getVisibleSessionDraft(),
  );
  const [creationProjection, setCreationProjection] =
    useState<SessionProjection | null>(null);
  const [interactionProjection, setInteractionProjection] =
    useState<SessionProjection | null>(null);
  const [stoppingRun, setStoppingRun] = useState(false);
  const [liveClockNowMs, setLiveClockNowMs] = useState(() => Date.now());

  useEffect(
    () =>
      subscribeProjectRegistry(() =>
        setRegistryProjects(getVisibleProjectRegistry()),
      ),
    [],
  );

  useEffect(() => {
    setSessionDraft(getVisibleSessionDraft());
    setCreationProjection(null);
    setInteractionProjection(null);

    return subscribeSessionDrafts(() => {
      setSessionDraft(getVisibleSessionDraft());
    });
  }, [projectId, projectIdsKey, showDraft]);

  useEffect(() => {
    setInteractionProjection(null);
    setStoppingRun(false);
  }, [sessionProjection?.id]);

  useEffect(() => {
    if (!sessionProjection) {
      return;
    }

    setCreationProjection((currentProjection) =>
      currentProjection?.id === sessionProjection.id ? sessionProjection : null,
    );
    setInteractionProjection((currentProjection) =>
      currentProjection?.id === sessionProjection.id ? sessionProjection : null,
    );
  }, [sessionProjection]);

  useEffect(() => {
    if (!showDraft && sessionProjection?.unreadResult) {
      onLatestMessageRendered?.(sessionProjection.id);
    }
  }, [
    onLatestMessageRendered,
    sessionProjection?.id,
    sessionProjection?.unreadResult,
    showDraft,
  ]);

  const handleDraftChange = (prompt: string) => {
    setSessionDraft(saveSessionDraft(sessionDraft?.projectId ?? null, prompt));
  };
  const handleDraftTargetChange = (targetProjectId: string | null) => {
    setSessionDraft(setSessionDraftTarget(targetProjectId));
  };
  const handleDraftSubmit = async (event: SessionDraftSubmitEvent) => {
    const draft = getSessionDraft({ projectIds });

    if (!draft?.projectId) {
      return;
    }

    const targetProject = projects.find((project) => project.id === draft.projectId);

    if (!targetProject) {
      return;
    }

    onDraftSubmit(event);

    const targetProjectRoot = usingRegistryProjects ? targetProject.path : workspace.projectRoot;
    const targetRepoRoot = usingRegistryProjects ? undefined : workspace.repoRoot;

    const result = await sessionCreator({
      draft,
      project: {
        id: targetProject.id,
        repoRoot: targetRepoRoot,
        projectRoot: targetProjectRoot,
      },
      onProjectionChange: (projection) => {
        setCreationProjection(projection);
        onProjectionChange?.(projection);
      },
    });

    setCreationProjection(result.projection);
    onProjectionChange?.(result.projection);

    if (result.clearDraft) {
      clearSessionDraft(draft.projectId);
      setSessionDraft(null);
    }
  };
  const commitInteractionProjection = (nextProjection: SessionProjection) => {
    setInteractionProjection(nextProjection);
    onProjectionChange?.(nextProjection);
  };
  const liveProjection =
    interactionProjection ?? creationProjection ?? sessionProjection ?? null;
  const shouldTickLiveClock =
    clockNowMs === undefined &&
    Boolean(liveProjection && isSessionProjectionActive(liveProjection));

  useEffect(() => {
    if (!shouldTickLiveClock) {
      return;
    }

    const interval = window.setInterval(() => {
      setLiveClockNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [shouldTickLiveClock, liveProjection?.id]);

  const effectiveClockNowMs = clockNowMs ?? liveClockNowMs;
  const projectionMessages = liveProjection
    ? (liveMessagesFromRuntimeModel(liveProjection, effectiveClockNowMs) ??
      liveMessagesFromProjection(liveProjection, effectiveClockNowMs))
    : [];
  const projectionTimeline = liveProjection
    ? (runTimelineFromRuntimeModel(liveProjection) ??
      runTimelineFromProjection(liveProjection))
    : [];
  const liveMessages = projectionMessages.length
    ? projectionMessages
    : workspace.liveMessages;
  const runTimeline = liveProjection ? projectionTimeline : workspace.runTimeline;
  const fallbackTraceMessageId = runTimeline.some((item) => !item.messageId)
    ? [...liveMessages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" && !message.controlLabel,
        )?.id
    : undefined;
  const timelineForMessage = (message: LiveMessage) => {
    const relatedMessageIds = new Set(relatedMessageIdsFor(message));

    return runTimeline.filter((item) =>
      item.messageId
        ? relatedMessageIds.has(item.messageId)
        : message.id === fallbackTraceMessageId,
    );
  };
  const readOnlyProjection = isReadOnlyProjection(liveProjection);
  const runtimeUnavailableProjection =
    isRuntimeUnavailableProjection(liveProjection);
  const queueMode =
    Boolean(liveProjection?.piSessionId) &&
    Boolean(liveProjection && isSessionProjectionActive(liveProjection)) &&
    !readOnlyProjection;
  const handleQueueSubmit = async (message: string) => {
    if (!liveProjection?.piSessionId || !queueMode) {
      return;
    }

    const queuedMessage = await getRuntimeBridge().queueFollowUp({
      piSessionId: liveProjection.piSessionId,
      message,
    });

    commitInteractionProjection(
      applySessionProjectionEvent(liveProjection, {
        type: "queued-message-added",
        queuedMessage,
      }),
    );
  };
  const handlePromptSubmit = async (message: string) => {
    if (!liveProjection?.piSessionId || readOnlyProjection) {
      return;
    }

    await restoreProjectionRuntimeState({
      bridge: getRuntimeBridge(),
      projection: liveProjection,
      workspace,
    });

    const accepted = await getRuntimeBridge().sendInitialPrompt({
      piSessionId: liveProjection.piSessionId,
      prompt: message,
    });

    commitInteractionProjection(
      applySessionProjectionEvent(liveProjection, {
        type: "runtime-event-received",
        event: accepted.event,
      }),
    );
  };
  const handleWithdrawQueuedMessage = async (queuedMessageId: string) => {
    if (!liveProjection?.piSessionId) {
      return;
    }

    await getRuntimeBridge().withdrawQueuedMessage({
      piSessionId: liveProjection.piSessionId,
      queuedMessageId,
    });

    commitInteractionProjection(
      applySessionProjectionEvent(liveProjection, {
        type: "queued-message-withdrawn",
        queuedMessageId,
        occurredAt: new Date().toISOString(),
      }),
    );
  };
  const handleSteerSubmit = async (message: string) => {
    if (!liveProjection?.piSessionId || !queueMode) {
      return;
    }

    const event = await getRuntimeBridge().steerRun({
      piSessionId: liveProjection.piSessionId,
      message,
    });

    commitInteractionProjection(
      applySessionProjectionEvent(liveProjection, {
        type: "steer-submitted",
        event,
      }),
    );
  };
  const handleStopRun = async () => {
    if (!liveProjection?.piSessionId || !queueMode || stoppingRun) {
      return;
    }

    setStoppingRun(true);

    try {
      await restoreProjectionRuntimeState({
        bridge: getRuntimeBridge(),
        projection: liveProjection,
        workspace,
      });

      const event = await getRuntimeBridge().abortRun({
        piSessionId: liveProjection.piSessionId,
      });

      commitInteractionProjection(
        applySessionProjectionEvent(liveProjection, {
          type: "run-stopped",
          event,
        }),
      );
    } catch (error) {
      commitInteractionProjection(
        applySessionProjectionEvent(liveProjection, {
          type: "run-stop-failed",
          event: {
            id: `stop-failed-${Date.now()}`,
            piSessionId: liveProjection.piSessionId,
            kind: "error",
            title: "Stop failed",
            body: messageFromError(error),
            timestamp: new Date().toISOString(),
          },
        }),
      );
    } finally {
      setStoppingRun(false);
    }
  };

  return (
    <main
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="live-session-column"
    >
      {showDraft && sessionDraft ? (
        <SessionDraftComposer
          draft={sessionDraft}
          projects={projects}
          creationProjection={creationProjection}
          onDraftChange={handleDraftChange}
          onDraftTargetChange={handleDraftTargetChange}
          onDraftSubmit={(event) => void handleDraftSubmit(event)}
        />
      ) : (
        <>
          {runtimeUnavailableProjection ? (
            <div
              className="border-b border-border bg-surface px-4 py-2 text-sm text-muted"
              data-testid="runtime-fallback-banner"
            >
              Runtime unavailable. Showing read-only session data.
            </div>
          ) : null}
          <ChatConversation
            aria-label="Live Chat messages"
            className="min-h-0 flex-1"
            initial="instant"
          >
            <ChatConversation.Content className="mx-auto flex w-full max-w-[44rem] flex-col gap-8 px-4 py-6">
              {liveMessages.map((message) => (
                <LiveChatMessage
                  key={message.id}
                  message={message}
                  timeline={timelineForMessage(message)}
                />
              ))}
              <ChatConversation.ScrollAnchor />
            </ChatConversation.Content>
          </ChatConversation>

          {readOnlyProjection ? null : (
            <FullChatComposer
              isStoppingRun={stoppingRun}
              queueMode={queueMode}
              projection={liveProjection}
              onPromptSubmit={handlePromptSubmit}
              onQueueSubmit={handleQueueSubmit}
              onWithdrawQueuedMessage={handleWithdrawQueuedMessage}
              onStopRun={handleStopRun}
              onSteerSubmit={handleSteerSubmit}
            />
          )}
        </>
      )}
    </main>
  );
}

export function AgentWorkspaceSessionsView({
  projectId = fixtureWorkspace.id,
  showDraft = false,
  workspace = fixtureWorkspace,
  onDraftSubmit = () => {},
  sessionCreator,
  checkoutManager,
  hasActiveSession,
  runtimeBridge,
  sessionProjection,
  clockNowMs,
  onProjectionChange,
  onLatestMessageRendered,
}: {
  projectId?: string;
  showDraft?: boolean;
  workspace?: AgentWorkspaceFixture;
  onDraftSubmit?: (event: SessionDraftSubmitEvent) => void;
  sessionCreator?: SessionCreator;
  checkoutManager?: ExecutionCheckoutManager;
  hasActiveSession?: boolean;
  runtimeBridge?: PiRuntimeBridge;
  sessionProjection?: SessionProjection | null;
  clockNowMs?: number;
  onProjectionChange?: (projection: SessionProjection) => void;
  onLatestMessageRendered?: (sessionId: string) => void;
}) {
  const [getDefaultRuntimeBridge] = useState(() => {
    let bridge: PiRuntimeBridge | null = null;

    return () => {
      bridge ??= createDefaultPiRuntimeBridge();

      return bridge;
    };
  });
  const getActiveRuntimeBridge = runtimeBridge
    ? () => runtimeBridge
    : getDefaultRuntimeBridge;
  const [defaultProjectionStore] = useState(() =>
    createInMemorySessionProjectionStore(),
  );
  const [defaultCheckoutManager] = useState(() =>
    createExecutionCheckoutManager({
      gitClient: createInvokeExecutionCheckoutGitClient(),
    }),
  );
  const activeCheckoutManager = checkoutManager ?? defaultCheckoutManager;
  const shouldCreateBackgroundSession =
    hasActiveSession ??
    Boolean(sessionProjection && isSessionProjectionActive(sessionProjection));
  const defaultSessionCreator: SessionCreator = (input: SessionCreatorInput) =>
    createSessionFromDraft({
      ...input,
      bridge: getActiveRuntimeBridge(),
      checkoutManager: activeCheckoutManager,
      executionMode: shouldCreateBackgroundSession
        ? "background"
        : "foreground",
      projections: defaultProjectionStore,
    });

  return (
    <article
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-6 pb-0 pt-6"
      data-testid="project-sessions-view"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-col gap-4">
        <div className="min-h-0 flex-1">
          <LiveSessionColumn
            projectId={projectId}
            showDraft={showDraft}
            workspace={workspace}
            onDraftSubmit={onDraftSubmit}
            sessionCreator={sessionCreator ?? defaultSessionCreator}
            getRuntimeBridge={getActiveRuntimeBridge}
            sessionProjection={sessionProjection}
            clockNowMs={clockNowMs}
            onProjectionChange={onProjectionChange}
            onLatestMessageRendered={onLatestMessageRendered}
          />
        </div>
      </div>
    </article>
  );
}

export function AgentWorkspaceSessionsPage() {
  const { projectId } = useParams({ from: "/projects/$projectId/sessions" });
  const showDraft = useRouterState({
    select: (state) => {
      const search = state.location.search as { view?: string };

      return search.view === "draft";
    },
  });
  const workspace = fixtureWorkspace;
  const [registryProjects, setRegistryProjects] = useState(() =>
    getVisibleProjectRegistry(),
  );
  const [runtimeBridge] = useState(() => createDefaultPiRuntimeBridge());
  const [sessionProjections, setSessionProjections] = useState(
    defaultSidebarProjectSessionProjections,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    () =>
      getSessionProjectionListItems(defaultSidebarProjectSessionProjections)[0]
        ?.id ?? null,
  );
  const selectedSessionProjection =
    sessionProjections.find(
      (projection) => projection.id === selectedSessionId,
    ) ?? null;

  useEffect(
    () =>
      subscribeProjectRegistry(() =>
        setRegistryProjects(getVisibleProjectRegistry()),
      ),
    [],
  );

  const handleProjectionChange = (nextProjection: SessionProjection) => {
    setSelectedSessionId(nextProjection.id);
    setSessionProjections((projections) => {
      const projectionExists = projections.some(
        (projection) => projection.id === nextProjection.id,
      );

      if (!projectionExists) {
        return [nextProjection, ...projections];
      }

      return projections.map((projection) =>
        projection.id === nextProjection.id ? nextProjection : projection,
      );
    });
  };
  const handleLatestMessageRendered = (sessionId: string) => {
    setSessionProjections((projections) =>
      projections.map((projection) =>
        projection.id === sessionId
          ? applySessionProjectionEvent(projection, {
              type: "latest-message-rendered",
              occurredAt: new Date().toISOString(),
            })
          : projection,
      ),
    );
  };

  if (registryProjects.length === 0) {
    return (
      <AppFrame
        sessionProjections={[]}
        selectedSessionId={null}
        onSelectedSessionIdChange={setSelectedSessionId}
      >
        <section
          className="flex h-full min-h-0 min-w-0 flex-col items-center justify-center px-6 text-center"
          data-testid="empty-workspace-state"
        >
          <h2 className="text-lg font-semibold text-foreground">No Projects</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
            Add a Project to start a Session.
          </p>
        </section>
      </AppFrame>
    );
  }

  return (
    <AppFrame
      sessionProjections={sessionProjections}
      selectedSessionId={selectedSessionId}
      onSelectedSessionIdChange={setSelectedSessionId}
      toolbarActions={
        <SessionToolbarActions
          workspace={workspace}
          projection={selectedSessionProjection}
        />
      }
    >
      <AgentWorkspaceSessionsView
        projectId={projectId}
        showDraft={showDraft}
        workspace={workspace}
        runtimeBridge={runtimeBridge}
        sessionProjection={selectedSessionProjection}
        hasActiveSession={sessionProjections.some(isSessionProjectionActive)}
        onProjectionChange={handleProjectionChange}
        onLatestMessageRendered={handleLatestMessageRendered}
      />
    </AppFrame>
  );
}
