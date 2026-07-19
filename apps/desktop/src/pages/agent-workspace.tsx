import {
  Button,
  type Key,
  ListBox,
  Popover,
  ScrollShadow,
  Slider,
  Tooltip,
} from "@heroui/react";
import { ChainOfThought } from "@heroui-pro/react/chain-of-thought";
import { ChatConversation } from "@heroui-pro/react/chat-conversation";
import { ChatMessage } from "@heroui-pro/react/chat-message";
import { ChatMessageActions } from "@heroui-pro/react/chat-message-actions";
import { ChatTool, type ToolPartState } from "@heroui-pro/react/chat-tool";
import { InlineSelect } from "@heroui-pro/react/inline-select";
import { Markdown, StreamMarkdown } from "@heroui-pro/react/markdown";
import { PromptInput } from "@heroui-pro/react/prompt-input";
import { PromptSuggestion } from "@heroui-pro/react/prompt-suggestion";
import { Resizable } from "@heroui-pro/react/resizable";
import { Segment } from "@heroui-pro/react/segment";
import { Sheet } from "@heroui-pro/react/sheet";
import { TextShimmer } from "@heroui-pro/react/text-shimmer";
import { useParams, useRouterState } from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import type { SessionChangedFile, SessionChanges } from "@pigui/core";
import { AppFrame, defaultSidebarProjectSessionProjections } from "@/app/app-shell";
import {
  Activity,
  Archive,
  Box,
  Cancel,
  ChevronDown,
  Computer,
  FileDiff,
  FolderClosed,
  GitBranch,
  LayoutAlignLeft,
  ListTree,
  RefreshCw,
  Sparkles,
} from "@/shared/ui/icons";
import {
  getBrowserDevelopmentSessionDraft,
  getProjectRegistryWithBrowserDevelopmentFallback,
  shouldUseBrowserDevelopmentData,
} from "@/shared/browser-development-data";
import { onBackendEvent } from "@/shared/runtime";
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
import {
  PiRuntimeBridgeError,
  defaultRuntimeSummary,
  type ExecutionCheckout,
  type PiRuntimeBridge,
  type PiSessionState,
  type RuntimeModelControls,
  type RuntimeModelSelection,
} from "@/entities/runtime/pi-runtime-bridge";
import type {
  SessionRuntimeMessage,
  SessionRuntimeModel,
} from "@/entities/session/session-runtime-model";
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
  setSessionDraftCheckoutMode,
  setSessionDraftTarget,
  subscribeSessionDrafts,
  type SessionDraftCheckoutMode,
  type SessionDraft,
} from "@/entities/session/session-drafts";
import {
  applySessionProjectionEvent,
  canArchiveSessionProjection,
  createSessionProjection,
  isSessionProjectionArchived,
  getSessionProjectionListItems,
  isSessionProjectionActive,
  type SessionProjection,
} from "@/entities/session/session-projection";
import {
  archiveSessionProjection,
  formatCost,
  formatTokens,
  getSessionChanges,
  listSessionProjections,
  type PersistedSessionProjection,
} from "@/entities/session/sessions";

type LiveMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  runId?: string;
  piEntryId?: string;
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
  selectedSessionId: string | null;
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
  archiveError?: string | null;
  isArchiving?: boolean;
  onArchive?: () => void;
};

type SessionChangesPanelProps = {
  sessionId: string | null;
  stale: boolean;
  loadChanges?: typeof getSessionChanges;
};

const sessionChangesDockMediaQuery = "(min-width: 1280px)";

function useDockedSessionChangesLayout() {
  const [isDocked, setIsDocked] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return true;
    }

    return window.matchMedia(sessionChangesDockMediaQuery).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(sessionChangesDockMediaQuery);
    const handleChange = () => setIsDocked(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isDocked;
}

export function getSessionChangesResizableSizes() {
  return {
    changesDefaultSize: 54,
    changesMaxSize: 64,
    changesMinSize: 42,
    workspaceDefaultSize: 46,
    workspaceMinSize: 36,
  };
}

const SessionDiffViewer = lazy(
  () => import("@/entities/session/session-diff-viewer"),
);

type RestorablePiRuntimeBridge = PiRuntimeBridge & {
  restoreSessionState(state: PiSessionState): Promise<PiSessionState>;
};

export type SessionDraftSubmitEvent = {
  projectId: string;
  prompt: string;
  checkoutMode: SessionDraftCheckoutMode;
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

function workspaceFromProject(project: ProjectRegistryEntry): AgentWorkspaceFixture {
  return {
    id: project.id,
    name: project.displayName,
    projectRoot: project.path,
    repoRoot: project.path,
    selectedSessionId: null,
    liveMessages: [],
    runTimeline: [],
    checkout: {
      mode: "Foreground local checkout",
      root: project.path,
      runtimeCwd: project.path,
    },
    summary: {
      model: "Unknown",
      totalCostUsd: 0,
      totalTokens: 0,
    },
  };
}

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
  onForkMessage,
}: {
  message: LiveMessage;
  timeline?: RunTimelineItem[];
  onForkMessage?: (message: LiveMessage) => void;
}) {
  if (message.role === "user") {
    const canFork = Boolean(message.piEntryId && onForkMessage);

    return (
      <ChatMessage.User>
        <div className="flex flex-col items-end gap-1">
          <ChatMessage.Bubble>
            {message.controlLabel ? (
              <p className="mb-1 text-xs font-medium text-muted">
                {message.controlLabel}
              </p>
            ) : null}
            <ChatMessage.Content>{message.body}</ChatMessage.Content>
          </ChatMessage.Bubble>
          <ChatMessageActions className="shrink-0">
            <ChatMessageActions.Copy
              aria-label="Copy"
              tooltip="Copy"
              onPress={() => {
                void navigator.clipboard?.writeText(message.body);
              }}
            />
            {canFork ? (
              <ChatMessage.Action
                aria-label="Fork from message"
                tooltip="Fork from message"
                onPress={() => onForkMessage?.(message)}
              >
                <GitBranch className="size-4" />
              </ChatMessage.Action>
            ) : null}
          </ChatMessageActions>
        </div>
      </ChatMessage.User>
    );
  }

  return (
    <ChatMessage.Assistant>
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
        {!message.controlLabel ? (
          <ChatMessageActions>
            <ChatMessageActions.Copy
              aria-label="Copy"
              tooltip="Copy"
              onPress={() => {
                void navigator.clipboard?.writeText(message.body);
              }}
            />
            <ChatMessageActions.ThumbsUp
              aria-label="Good response"
              tooltip="Good response"
            />
            <ChatMessageActions.ThumbsDown
              aria-label="Bad response"
              tooltip="Bad response"
            />
          </ChatMessageActions>
        ) : null}
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

const thinkingLevelLabels: Record<
  RuntimeModelSelection["thinkingLevel"],
  string
> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-High",
};

const thinkingLevelOrder: RuntimeModelSelection["thinkingLevel"][] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

function modelControlKey(provider: string, modelId: string) {
  return `${provider}\u0000${modelId}`;
}

function nearestThinkingLevel(
  current: RuntimeModelSelection["thinkingLevel"],
  available: RuntimeModelSelection["thinkingLevel"][],
) {
  const currentIndex = thinkingLevelOrder.indexOf(current);

  return available.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(
      thinkingLevelOrder.indexOf(nearest) - currentIndex,
    );
    const candidateDistance = Math.abs(
      thinkingLevelOrder.indexOf(candidate) - currentIndex,
    );

    return candidateDistance < nearestDistance ? candidate : nearest;
  }, available[0] ?? "off");
}

function ModelThinkingControl({
  controls,
  isLocked,
  onChange,
}: {
  controls: RuntimeModelControls;
  isLocked: boolean;
  onChange: (selection: RuntimeModelSelection) => Promise<void> | void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = controls.selected;

  if (!selected) {
    return null;
  }

  const selectedModel = controls.models.find(
    (model) =>
      model.provider === selected.provider && model.modelId === selected.modelId,
  );
  const thinkingLevels = selectedModel?.thinkingLevels ?? [
    selected.thinkingLevel,
  ];
  const sliderValue = Math.max(
    0,
    thinkingLevels.indexOf(selected.thinkingLevel),
  );
  const submitSelection = async (selection: RuntimeModelSelection) => {
    if (isLocked || isPending) {
      return;
    }

    setIsPending(true);

    try {
      await onChange(selection);
      setError(null);
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "Model configuration failed.",
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Popover>
      <Button
        aria-label="Model and Thinking"
        className="min-w-0 max-w-[19rem] gap-1.5 px-2 text-muted"
        data-testid="model-thinking-trigger"
        isDisabled={!controls.models.length}
        size="sm"
        variant="ghost"
      >
        <span className="truncate">
          {selectedModel?.name ?? selected.modelId} · {thinkingLevelLabels[selected.thinkingLevel]}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
      </Button>
      <Popover.Content
        className="w-[18rem] max-w-[calc(100vw-2rem)]"
        data-testid="model-thinking-popover"
        placement="top start"
      >
        <Popover.Dialog className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-3">
            <Popover.Heading className="text-sm font-medium text-foreground">
              Model
            </Popover.Heading>
            <ListBox
              aria-label="Model"
              className="pigui-compact-menu-surface -mx-1 max-h-56 overflow-y-auto"
              data-testid="model-thinking-model-list"
              selectedKeys={new Set([
                modelControlKey(selected.provider, selected.modelId),
              ])}
              selectionMode="single"
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  return;
                }

                const key = [...keys][0];
                const model = controls.models.find(
                  (candidate) =>
                    modelControlKey(candidate.provider, candidate.modelId) === key,
                );

                if (!model) {
                  return;
                }

                void submitSelection({
                  provider: model.provider,
                  modelId: model.modelId,
                  thinkingLevel: nearestThinkingLevel(
                    selected.thinkingLevel,
                    model.thinkingLevels,
                  ),
                });
              }}
            >
              {controls.models.map((model) => (
                <ListBox.Item
                  className="pigui-compact-menu-item grid grid-cols-[minmax(0,1fr)_1rem] items-center text-sm"
                  id={modelControlKey(model.provider, model.modelId)}
                  isDisabled={isLocked || isPending}
                  key={modelControlKey(model.provider, model.modelId)}
                  textValue={`${model.name} ${model.provider}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">
                      {model.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {model.provider}
                    </span>
                  </span>
                  <ListBox.ItemIndicator className="text-foreground" />
                </ListBox.Item>
              ))}
            </ListBox>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">Thinking</span>
              <span className="text-xs text-muted">
                {thinkingLevelLabels[selected.thinkingLevel]}
              </span>
            </div>
            <Slider
              aria-label="Thinking level"
              isDisabled={isLocked || isPending || thinkingLevels.length < 2}
              maxValue={Math.max(0, thinkingLevels.length - 1)}
              minValue={0}
              step={1}
              value={sliderValue}
              onChangeEnd={(value) => {
                const index = Array.isArray(value) ? value[0] : value;
                const thinkingLevel = thinkingLevels[index];

                if (!thinkingLevel || thinkingLevel === selected.thinkingLevel) {
                  return;
                }

                void submitSelection({
                  provider: selected.provider,
                  modelId: selected.modelId,
                  thinkingLevel,
                });
              }}
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
              <Slider.Marks
                className="grid gap-1 pt-2 text-center text-[0.6875rem] text-muted"
                style={{
                  gridTemplateColumns: `repeat(${thinkingLevels.length}, minmax(0, 1fr))`,
                }}
              >
                {thinkingLevels.map((level) => (
                  <span className="truncate" key={level}>
                    {thinkingLevelLabels[level]}
                  </span>
                ))}
              </Slider.Marks>
            </Slider>
            {isLocked ? (
              <span className="text-xs text-muted">Locked while running</span>
            ) : null}
            {error ? (
              <span className="text-xs text-danger" role="status">
                {error}
              </span>
            ) : null}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
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
  onModelConfigChange,
}: {
  queueMode?: boolean;
  isStoppingRun?: boolean;
  projection?: SessionProjection | null;
  onPromptSubmit?: (message: string) => Promise<void> | void;
  onQueueSubmit?: (message: string) => Promise<void> | void;
  onWithdrawQueuedMessage?: (queuedMessageId: string) => Promise<void> | void;
  onStopRun?: () => Promise<void> | void;
  onSteerSubmit?: (message: string) => Promise<void> | void;
  onModelConfigChange?: (selection: RuntimeModelSelection) => Promise<void> | void;
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
            <PromptInput.ToolbarStart>
              {projection?.modelControls && onModelConfigChange ? (
                <ModelThinkingControl
                  controls={projection.modelControls}
                  isLocked={queueMode}
                  onChange={onModelConfigChange}
                />
              ) : null}
            </PromptInput.ToolbarStart>
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

function orderedRuntimeModelAssistantMessageIds(
  model: SessionRuntimeModel,
  runId: string,
) {
  const ids: string[] = [];

  for (const entry of model.order) {
    if (entry.kind !== "message") {
      continue;
    }

    const message = model.messages.get(entry.id);

    if (
      message?.role === "assistant" &&
      message.runId === runId &&
      !message.abandoned
    ) {
      ids.push(message.messageId);
    }
  }

  return [...new Set(ids)];
}

function latestRuntimeModelRunId(model: SessionRuntimeModel) {
  const runs = [...model.runs.values()];
  const activeRun = [...runs].reverse().find((run) => !run.endedAt);

  return activeRun?.runId ?? runs[runs.length - 1]?.runId;
}

function relatedRuntimeModelMessageIds(
  model: SessionRuntimeModel,
  message: LiveMessage,
) {
  if (!message.runId) {
    return relatedMessageIdsFor(message);
  }

  const relatedMessageIds = orderedRuntimeModelAssistantMessageIds(
    model,
    message.runId,
  );

  return relatedMessageIds.length ? relatedMessageIds : relatedMessageIdsFor(message);
}

function collapseRuntimeModelAssistantRunMessages(
  model: SessionRuntimeModel,
  messages: LiveMessage[],
) {
  // Agent-core emits one assistant message per turn; Live Chat presents one
  // Active Run as one answer bubble while preserving every turn's trace.
  const collapsedMessages: LiveMessage[] = [];
  const answerIndexByRunId = new Map<string, number>();

  for (const message of messages) {
    if (!isAssistantAnswerMessage(message) || !message.runId) {
      collapsedMessages.push(message);
      continue;
    }

    const relatedMessageIds = [
      ...new Set([
        ...relatedRuntimeModelMessageIds(model, message),
        ...relatedMessageIdsFor(message),
      ]),
    ];
    const nextMessage = {
      ...message,
      relatedMessageIds,
    };
    const existingIndex = answerIndexByRunId.get(message.runId);

    if (existingIndex === undefined) {
      answerIndexByRunId.set(message.runId, collapsedMessages.length);
      collapsedMessages.push(nextMessage);
      continue;
    }

    collapsedMessages[existingIndex] = {
      ...nextMessage,
      relatedMessageIds: [
        ...new Set([
          ...relatedMessageIdsFor(collapsedMessages[existingIndex]),
          ...relatedMessageIds,
        ]),
      ],
    };
  }

  return collapsedMessages;
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
          ...(error.runId ? { runId: error.runId } : {}),
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
      ...(message.runId ? { runId: message.runId } : {}),
      ...(message.piEntryId ? { piEntryId: message.piEntryId } : {}),
      ...(message.controlLabel ? { controlLabel: message.controlLabel } : {}),
      ...(isStreaming ? { isStreaming: true } : {}),
    });
  }

  const messagesWithPlaceholder = appendModelRunningPlaceholder(
    projection,
    messages,
    clockNowMs,
  );
  const collapsedMessages = collapseRuntimeModelAssistantRunMessages(
    model,
    messagesWithPlaceholder,
  );
  const hasInitialPromptMessage = collapsedMessages.some(
    (message) => message.role === "user" && message.body === projection.initialPrompt,
  );

  if (hasInitialPromptMessage) {
    return collapsedMessages;
  }

  return [
    {
      id: `${projection.id}-initial-prompt`,
      role: "user",
      body: projection.initialPrompt,
    },
    ...collapsedMessages,
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
  const runId = latestRuntimeModelRunId(model);
  const relatedMessageIds = runId
    ? orderedRuntimeModelAssistantMessageIds(model, runId)
    : [];
  const traceMessageId = [...relatedMessageIds]
    .reverse()
    .find((messageId) => {
      const message = model.messages.get(messageId);

      return message?.parts.some(
        (part) => part.partType === "thinking" || part.partType === "tool_call",
      );
    });
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
      ...(runId ? { runId } : {}),
      ...(relatedMessageIds.length ? { relatedMessageIds } : {}),
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
        ...(event.piEntryId ? { piEntryId: event.piEntryId } : {}),
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

function sessionStatusFromPersistedProjection(
  status: PersistedSessionProjection["status"],
): SessionProjection["status"] {
  switch (status) {
    case "archived":
      return "archived";
    case "running":
    case "failed":
    case "completed":
      return status;
    case "idle":
    default:
      return "waiting";
  }
}

function checkoutFromPersistedProjection(
  checkout: PersistedSessionProjection["checkout"],
) {
  if (typeof checkout !== "object" || checkout === null) {
    return null;
  }

  return checkout as ExecutionCheckout;
}

function sessionProjectionFromPersistedProjection(
  record: PersistedSessionProjection,
): SessionProjection {
  const projection = createSessionProjection({
    id: record.sessionId,
    projectId: record.projectId,
    initialPrompt: record.initialPrompt ?? "Untitled Session",
    createdAt: record.updatedAt,
  });
  const sessionFileMissing = Boolean(record.sessionFileMissing || !record.sessionFile);

  return {
    ...projection,
    cwd: record.cwd,
    status: sessionStatusFromPersistedProjection(record.status),
    creationStage: "accepted",
    checkout: checkoutFromPersistedProjection(record.checkout),
    runtimeId: record.runtimeId,
    piSessionId: record.piSessionId,
    sessionFile: record.sessionFile ?? null,
    summary: defaultRuntimeSummary(record.summary),
    modelControls: record.modelSelection
      ? {
          models: [],
          selected: { ...record.modelSelection },
        }
      : null,
    stale: sessionFileMissing,
    staleReason: sessionFileMissing
      ? "Session file is missing. Start a new PiGUI Session to continue from this Project."
      : null,
    archivedAt:
      record.archivedAt ??
      (record.status === "archived" ? record.updatedAt : null),
    updatedAt: record.updatedAt,
  };
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
const sessionDraftInlineSelectPopoverClassName =
  "pigui-compact-menu-popover w-max min-w-[var(--trigger-width)] max-w-[calc(100vw-2rem)]";
const sessionDraftInlineSelectItemClassName =
  "pigui-compact-menu-item grid grid-cols-[1rem_minmax(0,1fr)_1rem] items-center gap-2";
const sessionDraftInlineSelectItemIconClassName =
  "pigui-compact-menu-item-icon col-start-1 shrink-0 text-muted";

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `session-${crypto.randomUUID()}`;
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function projectPickerKeyToProjectId(key: Key | null) {
  if (key === null || key === projectPickerPlaceholderKey) {
    return null;
  }

  return String(key);
}

function SessionDraftInlineSelect({
  ariaLabel,
  listBoxLabel,
  value,
  onChange,
  rootTestId,
  triggerTestId,
  triggerClassName = "text-muted",
  triggerContent,
  children,
}: {
  ariaLabel: string;
  listBoxLabel: string;
  value: Key;
  onChange: (key: Key | null) => void;
  rootTestId: string;
  triggerTestId: string;
  triggerClassName?: string;
  triggerContent: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-full" data-testid={rootTestId}>
      <InlineSelect aria-label={ariaLabel} value={value} onChange={onChange}>
        <InlineSelect.Trigger
          aria-label={ariaLabel}
          className={`inline-flex min-h-8 w-fit max-w-full min-w-0 items-center gap-2 rounded-xl border border-transparent bg-surface-secondary px-2.5 py-1.5 text-sm ${triggerClassName} transition-colors hover:text-foreground`}
          data-testid={triggerTestId}
        >
          {triggerContent}
          <InlineSelect.Indicator className="size-4 shrink-0 text-muted" />
        </InlineSelect.Trigger>
        <InlineSelect.Popover
          className={sessionDraftInlineSelectPopoverClassName}
          placement="bottom start"
        >
          <ListBox
            aria-label={listBoxLabel}
            className="pigui-compact-menu-surface"
          >
            {children}
          </ListBox>
        </InlineSelect.Popover>
      </InlineSelect>
    </div>
  );
}

function SessionDraftInlineSelectItem({
  id,
  textValue,
  label,
  Icon,
  iconTestId,
  labelClassName = "",
}: {
  id: Key;
  textValue: string;
  label: string;
  Icon?: typeof FolderClosed;
  iconTestId?: string;
  labelClassName?: string;
}) {
  return (
    <ListBox.Item
      className={sessionDraftInlineSelectItemClassName}
      id={id}
      textValue={textValue}
    >
      {Icon ? (
        <Icon
          aria-hidden="true"
          className={sessionDraftInlineSelectItemIconClassName}
          data-testid={iconTestId}
        />
      ) : (
        <span
          aria-hidden="true"
          className={sessionDraftInlineSelectItemIconClassName}
        />
      )}
      <span
        className={`pigui-compact-menu-label col-start-2 min-w-0 truncate ${labelClassName}`}
      >
        {label}
      </span>
      <span
        className="pigui-compact-menu-item-indicator col-start-3 flex shrink-0 items-center justify-center justify-self-end"
        data-testid="session-draft-inline-select-item-indicator"
      >
        <ListBox.ItemIndicator className="text-muted" />
      </span>
    </ListBox.Item>
  );
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
  const triggerTextColor = selectedProject ? "text-foreground" : "text-muted";

  return (
    <SessionDraftInlineSelect
      ariaLabel="Target Project"
      listBoxLabel="Projects"
      rootTestId="project-picker"
      triggerClassName={triggerTextColor}
      triggerContent={
        <>
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
        </>
      }
      triggerTestId="project-picker-trigger"
      value={selectedPickerKey}
      onChange={(key) => {
        onProjectChange(projectPickerKeyToProjectId(key));
      }}
    >
      <SessionDraftInlineSelectItem
        id={projectPickerPlaceholderKey}
        label={projectPickerPlaceholder}
        labelClassName="text-muted"
        textValue={projectPickerPlaceholder}
      />
      {projects.map((project) => (
        <SessionDraftInlineSelectItem
          key={project.id}
          Icon={FolderClosed}
          id={project.id}
          label={project.displayName}
          textValue={project.displayName}
        />
      ))}
    </SessionDraftInlineSelect>
  );
}

const checkoutModeLabels: Record<SessionDraftCheckoutMode, string> = {
  local: "Local",
  worktree: "Worktree",
};

function checkoutModeToExecutionMode(
  checkoutMode: SessionDraftCheckoutMode,
): CreateSessionFromDraftInput["executionMode"] {
  return checkoutMode === "worktree" ? "background" : "foreground";
}

function CheckoutStrategyPicker({
  selectedCheckoutMode,
  onCheckoutModeChange,
}: {
  selectedCheckoutMode: SessionDraftCheckoutMode;
  onCheckoutModeChange: (checkoutMode: SessionDraftCheckoutMode) => void;
}) {
  return (
    <SessionDraftInlineSelect
      ariaLabel="Checkout strategy"
      listBoxLabel="Checkout strategies"
      rootTestId="checkout-strategy-picker"
      triggerContent={
        <>
          {selectedCheckoutMode === "worktree" ? (
            <GitBranch aria-hidden="true" className="size-4 shrink-0 text-muted" />
          ) : (
            <Computer
              aria-hidden="true"
              className="size-4 shrink-0 text-muted"
              data-testid="checkout-strategy-local-icon"
            />
          )}
          <span className="min-w-0 truncate">
            {checkoutModeLabels[selectedCheckoutMode]}
          </span>
        </>
      }
      triggerTestId="checkout-strategy-trigger"
      value={selectedCheckoutMode}
      onChange={(key) => {
        onCheckoutModeChange(String(key) === "worktree" ? "worktree" : "local");
      }}
    >
      <SessionDraftInlineSelectItem
        Icon={Computer}
        iconTestId="checkout-strategy-local-icon"
        id="local"
        label={checkoutModeLabels.local}
        textValue={checkoutModeLabels.local}
      />
      <SessionDraftInlineSelectItem
        Icon={GitBranch}
        id="worktree"
        label={checkoutModeLabels.worktree}
        textValue={checkoutModeLabels.worktree}
      />
    </SessionDraftInlineSelect>
  );
}

function SessionDraftComposer({
  draft,
  projects,
  creationProjection,
  recommendedCheckoutMode,
  onDraftChange,
  onDraftCheckoutModeChange,
  onDraftTargetChange,
  onDraftSubmit,
}: {
  draft: SessionDraft;
  projects: ProjectRegistryEntry[];
  creationProjection: SessionProjection | null;
  recommendedCheckoutMode: SessionDraftCheckoutMode;
  onDraftChange: (prompt: string) => void;
  onDraftCheckoutModeChange: (checkoutMode: SessionDraftCheckoutMode) => void;
  onDraftTargetChange: (projectId: string | null) => void;
  onDraftSubmit: (event: SessionDraftSubmitEvent) => void;
}) {
  const [targetError, setTargetError] = useState(false);
  const selectedCheckoutMode = draft.checkoutMode ?? recommendedCheckoutMode;
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

    onDraftSubmit({
      projectId: draft.projectId,
      prompt: draft.prompt,
      checkoutMode: selectedCheckoutMode,
    });
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
            className="flex w-full flex-wrap justify-start gap-2"
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
            <CheckoutStrategyPicker
              selectedCheckoutMode={selectedCheckoutMode}
              onCheckoutModeChange={onDraftCheckoutModeChange}
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

function changeKindLabel(kind: SessionChangedFile["kind"]) {
  switch (kind) {
    case "type-changed":
      return "Type changed";
    case "conflicted":
      return "Conflict";
    default:
      return `${kind[0]?.toUpperCase()}${kind.slice(1)}`;
  }
}

function changeStageLabel(file: SessionChangedFile) {
  if (file.kind === "untracked") return "Working tree";
  if (file.staged && file.unstaged) return "Staged + unstaged";
  if (file.staged) return "Staged";
  return "Working tree";
}

export function SessionChangesPanel({
  sessionId,
  stale,
  loadChanges = getSessionChanges,
}: SessionChangesPanelProps) {
  const [changes, setChanges] = useState<SessionChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");

  useEffect(() => {
    if (!sessionId) {
      setChanges(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadChanges(sessionId)
      .then((nextChanges) => {
        if (cancelled) return;
        setChanges(nextChanges);
        setSelectedPath((current) =>
          nextChanges.files.some((file) => file.path === current)
            ? current
            : (nextChanges.files[0]?.path ?? null),
        );
      })
      .catch((loadError) => {
        if (cancelled) return;
        setChanges(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Session changes could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadChanges, refreshKey, sessionId]);

  const selectedFile =
    changes?.files.find((file) => file.path === selectedPath) ?? null;

  return (
    <section aria-labelledby="session-diff-heading">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="text-sm font-semibold text-foreground"
            id="session-diff-heading"
          >
            Diff summary
          </h3>
          {changes?.state === "ready" ? (
            <p className="mt-1 text-xs text-muted">
              {changes.totals.files} files ·{" "}
              <span className="text-success">
                +{changes.totals.additions}
              </span>{" "}
              ·{" "}
              <span className="text-danger">
                -{changes.totals.deletions}
              </span>
            </p>
          ) : null}
        </div>
        {sessionId ? (
          <Tooltip delay={0}>
            <Tooltip.Trigger className="inline-flex">
              <Button
                isIconOnly
                aria-label="Refresh Session changes"
                isDisabled={loading}
                size="sm"
                variant="ghost"
                onPress={() => setRefreshKey((value) => value + 1)}
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>Refresh changes</Tooltip.Content>
          </Tooltip>
        ) : null}
      </div>

      {stale ? (
        <p className="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-foreground">
          Runtime state is stale. This diff is fresh, but the Session status may be outdated.
        </p>
      ) : null}

      {!sessionId ? (
        <p className="mt-2 text-sm leading-6 text-muted">
          No changes are attached to this Session.
        </p>
      ) : loading && !changes ? (
        <div className="mt-3 grid gap-2" aria-label="Loading Session changes">
          <div className="h-8 animate-pulse rounded-md bg-default/40" />
          <div className="h-24 animate-pulse rounded-md bg-default/30" />
        </div>
      ) : error ? (
        <div
          className="mt-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-3"
          role="alert"
        >
          <p className="text-sm text-danger">{error}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            onPress={() => setRefreshKey((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : changes?.state === "non-git" ? (
        <p className="mt-3 rounded-md border border-default/70 bg-surface px-3 py-3 text-sm text-muted">
          This Session checkout is not a Git repository.
        </p>
      ) : changes?.state === "clean" || !changes?.files.length ? (
        <p className="mt-3 rounded-md border border-default/70 bg-surface px-3 py-3 text-sm text-muted">
          Working tree clean. No staged, unstaged, or untracked changes.
        </p>
      ) : (
        <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="min-w-0 rounded-md border border-default/70 bg-surface p-1.5">
            <div className="max-h-[34rem] space-y-1 overflow-y-auto">
              {changes.files.map((file) => (
                <button
                  key={`${file.previousPath ?? ""}:${file.path}`}
                  aria-pressed={file.path === selectedPath}
                  className={`w-full min-w-0 rounded px-2 py-2 text-left transition-colors ${
                    file.path === selectedPath
                      ? "bg-default/70 text-foreground"
                      : "text-muted hover:bg-default/40 hover:text-foreground"
                  }`}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                >
                  <span
                    className="block truncate text-sm font-medium"
                    title={file.path}
                  >
                    {file.path}
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate" title={changeStageLabel(file)}>
                      {changeKindLabel(file.kind)} · {changeStageLabel(file)}
                    </span>
                    {file.kind === "conflicted" ? (
                      <span className="shrink-0">Resolve</span>
                    ) : file.binary ? (
                      <span>Binary</span>
                    ) : (
                      <span className="shrink-0">
                        <span className="text-success">
                          +{file.additions ?? 0}
                        </span>{" "}
                        <span className="text-danger">
                          -{file.deletions ?? 0}
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex min-h-8 items-center justify-between gap-3">
              <p
                className="min-w-0 truncate text-sm font-medium text-foreground"
                title={selectedFile?.path}
              >
                {selectedFile?.path}
              </p>
              <Segment
                aria-label="Diff layout"
                selectedKey={diffStyle}
                size="sm"
                onSelectionChange={(key) =>
                  setDiffStyle(key === "split" ? "split" : "unified")
                }
              >
                <Segment.Item id="unified">
                  <Segment.Separator />
                  Unified
                </Segment.Item>
                <Segment.Item id="split">
                  <Segment.Separator />
                  Split
                </Segment.Item>
              </Segment>
            </div>

            {selectedFile?.kind === "conflicted" ? (
              <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-3 text-sm text-foreground">
                This file has unresolved merge conflicts. Resolve it in the
                checkout before reviewing a normal patch.
              </p>
            ) : selectedFile?.binary ? (
              <p className="rounded-md border border-default/70 bg-surface px-3 py-3 text-sm text-muted">
                Binary file changed. A textual diff is not available.
              </p>
            ) : selectedFile?.patchTruncated ? (
              <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-3 text-sm text-foreground">
                This patch exceeds the review limit and was omitted. Open the
                checkout for the full diff.
              </p>
            ) : selectedFile?.patch ? (
              <Suspense
                fallback={
                  <div
                    className="h-40 animate-pulse rounded-md bg-default/30"
                    aria-label="Loading diff renderer"
                  />
                }
              >
                <SessionDiffViewer
                  cacheKey={`${changes.sessionId}:${changes.generatedAt}:${selectedFile.path}`}
                  patch={selectedFile.patch}
                  style={diffStyle}
                />
              </Suspense>
            ) : (
              <p className="rounded-md border border-default/70 bg-surface px-3 py-3 text-sm text-muted">
                No textual patch is available for this file.
              </p>
            )}
          </div>

          {changes.truncated ? (
            <p className="md:col-span-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-foreground">
              Review is bounded. {changes.omittedFileCount > 0
                ? `${changes.omittedFileCount} additional files were omitted.`
                : "One or more oversized patches were omitted."}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function SessionActionsContent({
  workspace,
  projection,
  archiveError,
  isArchiving = false,
  onArchive,
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
  const archiveAllowed = Boolean(
    projection &&
      !isSessionProjectionArchived(projection) &&
      canArchiveSessionProjection(projection),
  );
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
          <Button
            isDisabled={!archiveAllowed || isArchiving}
            isPending={isArchiving}
            size="sm"
            variant="outline"
            onPress={onArchive}
          >
            <Archive className="size-4" />
            Archive Session
          </Button>
        </div>
        {!archiveAllowed && projection && !isSessionProjectionArchived(projection) ? (
          <p className="mt-2 text-sm leading-6 text-muted">
            Active runs cannot be archived.
          </p>
        ) : null}
        {projection && isSessionProjectionArchived(projection) ? (
          <p className="mt-2 text-sm leading-6 text-muted">
            This Session is archived.
          </p>
        ) : null}
        {archiveError ? (
          <p className="mt-2 text-sm leading-6 text-danger" role="alert">
            {archiveError}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function SessionChangesTrigger({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger className="inline-flex">
        <Button
          isIconOnly
          aria-label="Session changes"
          aria-pressed={isOpen}
          size="sm"
          variant="ghost"
          onPress={() => onOpenChange(!isOpen)}
        >
          <FileDiff className="size-4" />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{isOpen ? "Close changes" : "Open changes"}</Tooltip.Content>
    </Tooltip>
  );
}

function SessionChangesSheet({
  isOpen,
  projection,
  onOpenChange,
}: {
  isOpen: boolean;
  projection?: SessionProjection | null;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <Sheet isOpen={isOpen} placement="right" onOpenChange={onOpenChange}>
      <Sheet.Backdrop>
        <Sheet.Content
          className="w-full max-w-none rounded-none md:w-[min(80rem,92vw)] md:rounded-l-lg"
          style={
            isOpen
              ? {
                  animation: "none",
                  transform: "translate3d(0, 0, 0)",
                }
              : undefined
          }
        >
          <Sheet.Dialog className="rounded-none md:rounded-l-lg">
            <Sheet.CloseTrigger />
            <Sheet.Header>
              <Sheet.Heading>Changes</Sheet.Heading>
              <p className="mt-1 text-sm text-muted">
                Review the working tree for this Session checkout.
              </p>
            </Sheet.Header>
            <Sheet.Body>
              <ScrollShadow className="max-h-[calc(100vh-10rem)] overflow-y-auto">
                <SessionChangesPanel
                  sessionId={projection?.id ?? null}
                  stale={projection?.stale ?? false}
                />
              </ScrollShadow>
            </Sheet.Body>
          </Sheet.Dialog>
        </Sheet.Content>
      </Sheet.Backdrop>
    </Sheet>
  );
}

function SessionChangesAside({
  projection,
  onClose,
}: {
  projection?: SessionProjection | null;
  onClose: () => void;
}) {
  return (
    <aside
      aria-labelledby="session-changes-heading"
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
      data-testid="session-changes-aside"
    >
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 px-4">
        <h2
          className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground"
          id="session-changes-heading"
        >
          <FileDiff className="size-4 shrink-0 text-muted" />
          <span className="truncate">Changes</span>
        </h2>
        <Tooltip delay={0}>
          <Tooltip.Trigger className="inline-flex">
            <Button
              isIconOnly
              aria-label="Close Session changes"
              size="sm"
              variant="ghost"
              onPress={onClose}
            >
              <Cancel className="size-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>Close changes</Tooltip.Content>
        </Tooltip>
      </header>
      <ScrollShadow className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <SessionChangesPanel
          sessionId={projection?.id ?? null}
          stale={projection?.stale ?? false}
        />
      </ScrollShadow>
    </aside>
  );
}

function SessionActionsSheet({
  workspace,
  projection,
  archiveError,
  isArchiving,
  onArchive,
}: {
  workspace: AgentWorkspaceFixture;
  projection?: SessionProjection | null;
  archiveError?: string | null;
  isArchiving?: boolean;
  onArchive?: () => void;
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
            className="w-full md:w-[min(80rem,92vw)]"
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
                  Checkout, model, cost, and lifecycle context.
                </p>
              </Sheet.Header>
              <Sheet.Body>
                <ScrollShadow className="max-h-[calc(100vh-10rem)] overflow-y-auto">
                  <SessionActionsContent
                    archiveError={archiveError}
                    isArchiving={isArchiving}
                    workspace={workspace}
                    projection={projection}
                    onArchive={onArchive}
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

function runtimeResumeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Pi could not resume the session runtime.";
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
  archiveError,
  changesOpen = false,
  dockChanges = false,
  isArchiving,
  onArchive,
  onChangesOpenChange = () => {},
}: {
  workspace: AgentWorkspaceFixture;
  projection?: SessionProjection | null;
  archiveError?: string | null;
  changesOpen?: boolean;
  dockChanges?: boolean;
  isArchiving?: boolean;
  onArchive?: () => void;
  onChangesOpenChange?: (isOpen: boolean) => void;
}) {
  return (
    <>
      <SessionChangesTrigger
        isOpen={changesOpen}
        onOpenChange={onChangesOpenChange}
      />
      <SessionActionsSheet
        archiveError={archiveError}
        isArchiving={isArchiving}
        workspace={workspace}
        projection={projection}
        onArchive={onArchive}
      />
      <SessionChangesSheet
        isOpen={changesOpen && !dockChanges}
        projection={projection}
        onOpenChange={onChangesOpenChange}
      />
    </>
  );
}

function LiveSessionColumn({
  workspace,
  projectId,
  showDraft,
  onDraftSubmit,
  sessionCreator,
  checkoutManager,
  getRuntimeBridge,
  recommendedCheckoutMode,
  sessionProjection,
  clockNowMs,
  onProjectionChange,
  onLatestMessageRendered,
  runtimeGeneration,
}: {
  workspace: AgentWorkspaceFixture;
  projectId: string;
  showDraft: boolean;
  onDraftSubmit: (event: SessionDraftSubmitEvent) => void;
  sessionCreator: SessionCreator;
  checkoutManager: ExecutionCheckoutManager;
  getRuntimeBridge: () => PiRuntimeBridge;
  recommendedCheckoutMode: SessionDraftCheckoutMode;
  sessionProjection?: SessionProjection | null;
  clockNowMs?: number;
  onProjectionChange?: (projection: SessionProjection) => void;
  onLatestMessageRendered?: (sessionId: string) => void;
  runtimeGeneration: number;
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
  const resumeAttemptedKeysRef = useRef(new Set<string>());
  const resumeFailedKeysRef = useRef(new Set<string>());
  const [resumeRetryNonce, setResumeRetryNonce] = useState(0);

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

  const resumeKeyForProjection = (
    projection: SessionProjection,
    retryNonce: number,
  ) =>
    projection.piSessionId && projection.sessionFile
      ? `${projection.id}\u0000${projection.piSessionId}\u0000${projection.sessionFile}\u0000${runtimeGeneration}\u0000${retryNonce}`
      : null;

  useEffect(() => {
    if (
      showDraft ||
      !sessionProjection?.piSessionId ||
      !sessionProjection.sessionFile
    ) {
      return;
    }

    const bridge = getRuntimeBridge();

    if (!bridge.resumeSession) {
      return;
    }

    const resumeKey = resumeKeyForProjection(
      sessionProjection,
      resumeRetryNonce,
    );

    if (!resumeKey || resumeFailedKeysRef.current.has(resumeKey)) {
      return;
    }

    if (resumeAttemptedKeysRef.current.has(resumeKey)) {
      return;
    }

    resumeAttemptedKeysRef.current.add(resumeKey);
    let cancelled = false;

    void bridge
      .resumeSession({
        sessionId: sessionProjection.id,
        projectId: sessionProjection.projectId,
        piSessionId: sessionProjection.piSessionId,
        cwd:
          sessionProjection.checkout?.runtimeCwd ??
          sessionProjection.cwd ??
          workspace.checkout.runtimeCwd,
        sessionFile: sessionProjection.sessionFile,
        checkout: sessionProjection.checkout,
      })
      .then((state) => {
        if (cancelled) {
          return;
        }

        resumeFailedKeysRef.current.delete(resumeKey);
        commitInteractionProjection(
          applySessionProjectionEvent(sessionProjection, {
            type: "runtime-state-resynced",
            state,
          }),
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        resumeAttemptedKeysRef.current.delete(resumeKey);
        resumeFailedKeysRef.current.add(resumeKey);
        commitInteractionProjection(
          applySessionProjectionEvent(sessionProjection, {
            type: "projection-marked-stale",
            reason: runtimeResumeErrorMessage(error),
            occurredAt: new Date().toISOString(),
          }),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    getRuntimeBridge,
    runtimeGeneration,
    resumeRetryNonce,
    sessionProjection,
    showDraft,
    workspace.checkout.runtimeCwd,
  ]);

  const handleDraftChange = (prompt: string) => {
    setSessionDraft(saveSessionDraft(sessionDraft?.projectId ?? null, prompt));
  };
  const handleDraftCheckoutModeChange = (
    checkoutMode: SessionDraftCheckoutMode,
  ) => {
    setSessionDraft(setSessionDraftCheckoutMode(checkoutMode));
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
      executionMode: checkoutModeToExecutionMode(event.checkoutMode),
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
  const canRetryRuntimeResume = Boolean(
    liveProjection?.piSessionId &&
      liveProjection.sessionFile &&
      getRuntimeBridge().resumeSession,
  );
  const handleRetryRuntimeResume = () => {
    if (!liveProjection) {
      return;
    }

    const resumeKey = resumeKeyForProjection(liveProjection, resumeRetryNonce);

    if (resumeKey) {
      resumeAttemptedKeysRef.current.delete(resumeKey);
      resumeFailedKeysRef.current.delete(resumeKey);
    }

    setResumeRetryNonce((currentNonce) => currentNonce + 1);
  };
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
    isRuntimeUnavailableProjection(liveProjection) ? liveProjection : null;
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
  const handleModelConfigChange = async (
    selection: RuntimeModelSelection,
  ) => {
    if (!liveProjection?.piSessionId || queueMode) {
      return;
    }

    const bridge = getRuntimeBridge();

    if (!bridge.configureModel) {
      throw new Error("Runtime model controls are unavailable.");
    }

    const modelControls = await bridge.configureModel({
      sessionId: liveProjection.id,
      piSessionId: liveProjection.piSessionId,
      ...selection,
    });

    commitInteractionProjection(
      applySessionProjectionEvent(liveProjection, {
        type: "model-controls-changed",
        modelControls,
        occurredAt: new Date().toISOString(),
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
  const handleForkMessage = async (message: LiveMessage) => {
    if (
      !message.piEntryId ||
      !liveProjection?.piSessionId ||
      !liveProjection.sessionFile
    ) {
      return;
    }

    const bridge = getRuntimeBridge();

    if (!bridge.forkSession) {
      return;
    }

    const confirmed = window.confirm(
      [
        "Fork this message into a new Session?",
        "",
        "PiGUI will create a separate Session from this message boundary.",
        "Git Projects use a managed worktree; non-Git Projects may reuse the foreground directory.",
        "The selected message text will be pre-filled in the new composer.",
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    const targetProject =
      projects.find((candidate) => candidate.id === liveProjection.projectId) ??
      projects.find((candidate) => candidate.id === projectId) ??
      fallbackProject;
    const forkSessionId = createSessionId();
    const now = () => new Date().toISOString();
    const targetProjectRoot = usingRegistryProjects
      ? targetProject.path
      : workspace.projectRoot;
    const targetRepoRoot = usingRegistryProjects ? undefined : workspace.repoRoot;
    let forkProjection = createSessionProjection({
      id: forkSessionId,
      projectId: targetProject.id,
      initialPrompt: message.body,
      createdAt: now(),
    });
    const commitForkProjection = (nextProjection: SessionProjection) => {
      forkProjection = nextProjection;
      commitInteractionProjection(nextProjection);
    };

    if (message.body.trim()) {
      saveFollowUpDraft(forkSessionId, message.body);
    }
    commitForkProjection(forkProjection);

    try {
      const checkout = await checkoutManager.prepareCheckout({
        sessionId: forkSessionId,
        strategy: "background-managed",
        project: {
          id: targetProject.id,
          repoRoot: targetRepoRoot,
          projectRoot: targetProjectRoot,
        },
        now,
      });

      commitForkProjection(
        applySessionProjectionEvent(forkProjection, {
          type: "checkout-selected",
          stage: "preparing checkout",
          checkout,
          occurredAt: now(),
        }),
      );

      const fork = await bridge.forkSession({
        sessionId: forkSessionId,
        projectId: targetProject.id,
        sourcePiSessionId: liveProjection.piSessionId,
        sourceSessionFile: liveProjection.sessionFile,
        piEntryId: message.piEntryId,
        cwd: checkout.runtimeCwd,
        checkout,
      });
      const selectedText = fork.selectedText ?? message.body;

      if (selectedText.trim()) {
        saveFollowUpDraft(forkSessionId, selectedText);
      }

      forkProjection = applySessionProjectionEvent(forkProjection, {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: fork.state.runtimeId,
        piSessionId: fork.state.piSessionId,
        summary: fork.state.summary,
        modelControls: fork.state.modelControls,
        occurredAt: now(),
      });
      forkProjection = applySessionProjectionEvent(forkProjection, {
        type: "runtime-state-resynced",
        state: fork.state,
      });
      commitForkProjection({
        ...forkProjection,
        initialPrompt: selectedText,
        creationStage: "accepted",
      });
    } catch (error) {
      commitForkProjection(
        applySessionProjectionEvent(forkProjection, {
          type: "creation-failed",
          stage:
            error instanceof PiRuntimeBridgeError &&
            error.stage === "forking session"
              ? "starting runtime"
              : "preparing checkout",
          message: messageFromError(error),
          occurredAt: now(),
        }),
      );
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
          recommendedCheckoutMode={recommendedCheckoutMode}
          onDraftChange={handleDraftChange}
          onDraftCheckoutModeChange={handleDraftCheckoutModeChange}
          onDraftTargetChange={handleDraftTargetChange}
          onDraftSubmit={(event) => void handleDraftSubmit(event)}
        />
      ) : (
        <>
          {runtimeUnavailableProjection ? (
            <div
              className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2 text-sm text-muted"
              data-testid="runtime-fallback-banner"
            >
              <span>
                Runtime unavailable.{" "}
                {runtimeUnavailableProjection.staleReason ??
                  "Showing read-only session data."}
              </span>
              {canRetryRuntimeResume ? (
                <Button size="sm" variant="outline" onPress={handleRetryRuntimeResume}>
                  Retry
                </Button>
              ) : null}
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
                  onForkMessage={
                    liveProjection?.sessionFile &&
                    liveProjection.piSessionId &&
                    getRuntimeBridge().forkSession
                      ? (forkMessage) => void handleForkMessage(forkMessage)
                      : undefined
                  }
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
              onModelConfigChange={handleModelConfigChange}
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
  aside,
  onDraftSubmit = () => {},
  sessionCreator,
  checkoutManager,
  hasActiveSession,
  runtimeBridge,
  sessionProjection,
  clockNowMs,
  onProjectionChange,
  onLatestMessageRendered,
  runtimeGeneration = 0,
}: {
  projectId?: string;
  showDraft?: boolean;
  workspace?: AgentWorkspaceFixture;
  aside?: ReactNode;
  onDraftSubmit?: (event: SessionDraftSubmitEvent) => void;
  sessionCreator?: SessionCreator;
  checkoutManager?: ExecutionCheckoutManager;
  hasActiveSession?: boolean;
  runtimeBridge?: PiRuntimeBridge;
  sessionProjection?: SessionProjection | null;
  clockNowMs?: number;
  onProjectionChange?: (projection: SessionProjection) => void;
  onLatestMessageRendered?: (sessionId: string) => void;
  runtimeGeneration?: number;
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
  const shouldRecommendManagedCheckout =
    hasActiveSession ??
    Boolean(sessionProjection && isSessionProjectionActive(sessionProjection));
  const defaultSessionCreator: SessionCreator = (input: SessionCreatorInput) =>
    createSessionFromDraft({
      ...input,
      bridge: getActiveRuntimeBridge(),
      checkoutManager: activeCheckoutManager,
      executionMode:
        input.executionMode ??
        (shouldRecommendManagedCheckout ? "background" : "foreground"),
      projections: defaultProjectionStore,
    });
  const liveSession = (
    <LiveSessionColumn
      projectId={projectId}
      showDraft={showDraft}
      workspace={workspace}
      onDraftSubmit={onDraftSubmit}
      sessionCreator={sessionCreator ?? defaultSessionCreator}
      checkoutManager={activeCheckoutManager}
      getRuntimeBridge={getActiveRuntimeBridge}
      recommendedCheckoutMode={
        shouldRecommendManagedCheckout ? "worktree" : "local"
      }
      sessionProjection={sessionProjection}
      clockNowMs={clockNowMs}
      onProjectionChange={onProjectionChange}
      onLatestMessageRendered={onLatestMessageRendered}
      runtimeGeneration={runtimeGeneration}
    />
  );
  const resizableSizes = getSessionChangesResizableSizes();

  return (
    <article
      className="-mt-10 flex h-[calc(100%+2.5rem)] min-h-0 min-w-0 flex-col overflow-hidden px-6 pb-0"
      data-testid="project-sessions-view"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-col gap-4">
        <div className="min-h-0 flex-1">
          {aside ? (
            <Resizable
              className="h-full min-h-0 w-full"
              data-testid="session-workspace-split-view"
              orientation="horizontal"
            >
              <Resizable.Panel
                defaultSize={resizableSizes.workspaceDefaultSize}
                minSize={resizableSizes.workspaceMinSize}
              >
                <div
                  className="h-full min-h-0 min-w-0 overflow-hidden pt-16"
                  data-testid="session-workspace-main-pane"
                >
                  {liveSession}
                </div>
              </Resizable.Panel>
              <Resizable.Handle
                aria-label="Resize Session changes"
                className="mx-2"
              />
              <Resizable.Panel
                defaultSize={resizableSizes.changesDefaultSize}
                maxSize={resizableSizes.changesMaxSize}
                minSize={resizableSizes.changesMinSize}
              >
                <div
                  className="h-full min-h-0 min-w-0 overflow-hidden pt-16"
                  data-testid="session-workspace-aside-pane"
                >
                  {aside}
                </div>
              </Resizable.Panel>
            </Resizable>
          ) : (
            <div className="h-full min-h-0 pt-16">{liveSession}</div>
          )}
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
  const [browserDevelopmentData] = useState(() =>
    shouldUseBrowserDevelopmentData(),
  );
  const [registryProjects, setRegistryProjects] = useState(() =>
    getVisibleProjectRegistry(),
  );
  const [runtimeBridge] = useState(() => createDefaultPiRuntimeBridge());
  const initialSessionProjections = browserDevelopmentData
    ? defaultSidebarProjectSessionProjections
    : [];
  const [sessionProjections, setSessionProjections] = useState(
    initialSessionProjections,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    () => firstSessionIdForProject(initialSessionProjections, projectId),
  );
  const [backendGeneration, setBackendGeneration] = useState(0);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const dockChanges = useDockedSessionChangesLayout();
  const project = registryProjects.find((candidate) => candidate.id === projectId) ?? null;
  const workspace = project ? workspaceFromProject(project) : null;
  const selectedSessionProjection =
    sessionProjections.find(
      (projection) =>
        projection.id === selectedSessionId && projection.projectId === projectId,
    ) ?? null;

  useEffect(
    () =>
      subscribeProjectRegistry(() =>
        setRegistryProjects(getVisibleProjectRegistry()),
      ),
    [],
  );

  useEffect(
    () =>
      onBackendEvent((event) => {
        if (
          event.event.sessionId === "__backend__" &&
          event.event.payload.lifecycle === "connected"
        ) {
          setBackendGeneration((generation) => generation + 1);
        }
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    void listSessionProjections()
      .then((records) => {
        if (cancelled || (browserDevelopmentData && records.length === 0)) {
          return;
        }

        const persistedProjections = records.map(
          sessionProjectionFromPersistedProjection,
        );
        const nextSelectedSessionId = firstSessionIdForProject(
          persistedProjections,
          projectId,
        );

        setSessionProjections(persistedProjections);
        setSelectedSessionId((currentSessionId) =>
          currentSessionId &&
          persistedProjections.some(
            (projection) =>
              projection.id === currentSessionId &&
              projection.projectId === projectId &&
              !isSessionProjectionArchived(projection),
          )
            ? currentSessionId
            : nextSelectedSessionId,
        );
      })
      .catch(() => {
        if (!cancelled && !browserDevelopmentData) {
          setSessionProjections([]);
          setSelectedSessionId(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backendGeneration, browserDevelopmentData, projectId]);

  useEffect(() => {
    setArchiveError(null);
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionProjection) {
      setChangesOpen(false);
    }
  }, [selectedSessionProjection?.id]);

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
  const handleArchiveSession = async () => {
    if (!selectedSessionProjection || isArchiving) {
      return;
    }

    setIsArchiving(true);
    setArchiveError(null);

    try {
      const archived = sessionProjectionFromPersistedProjection(
        await archiveSessionProjection(selectedSessionProjection.id),
      );

      setSessionProjections((projections) =>
        projections.map((projection) =>
          projection.id === archived.id ? archived : projection,
        ),
      );
    } catch (error) {
      setArchiveError(
        error instanceof Error ? error.message : "PiGUI could not archive the Session.",
      );
    } finally {
      setIsArchiving(false);
    }
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

  if (!workspace) {
    return (
      <AppFrame
        sessionProjections={sessionProjections}
        selectedSessionId={null}
        onSelectedSessionIdChange={setSelectedSessionId}
      >
        <section
          className="flex h-full min-h-0 min-w-0 flex-col items-center justify-center px-6 text-center"
          data-testid="project-not-found-state"
        >
          <h2 className="text-lg font-semibold text-foreground">Project not found</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
            Choose an existing Project from the sidebar.
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
      toolbarActions={selectedSessionProjection ? (
        <SessionToolbarActions
          archiveError={archiveError}
          changesOpen={changesOpen}
          dockChanges={dockChanges}
          isArchiving={isArchiving}
          workspace={workspace}
          projection={selectedSessionProjection}
          onArchive={() => void handleArchiveSession()}
          onChangesOpenChange={setChangesOpen}
        />
      ) : undefined}
    >
      <AgentWorkspaceSessionsView
        aside={
          dockChanges && changesOpen ? (
            <SessionChangesAside
              projection={selectedSessionProjection}
              onClose={() => setChangesOpen(false)}
            />
          ) : undefined
        }
        projectId={projectId}
        showDraft={showDraft}
        workspace={workspace}
        runtimeBridge={runtimeBridge}
        runtimeGeneration={backendGeneration}
        sessionProjection={selectedSessionProjection}
        hasActiveSession={sessionProjections.some(isSessionProjectionActive)}
        onProjectionChange={handleProjectionChange}
        onLatestMessageRendered={handleLatestMessageRendered}
      />
    </AppFrame>
  );
}

function firstSessionIdForProject(
  projections: SessionProjection[],
  projectId: string,
) {
  return (
    getSessionProjectionListItems(
      projections.filter((projection) => projection.projectId === projectId),
    )[0]?.id ?? null
  );
}
