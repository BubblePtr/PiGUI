import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import {
  ChatChainOfThought as ChainOfThought,
  formatThoughtSummary,
} from "@/shared/ui/chat/chat-chain-of-thought";
import {
  ChatThoughtMarkdown,
  liveThoughtBeatIndex,
  liveThoughtLine,
} from "@/shared/ui/chat/chat-thought-markdown";
import { ChatConversation } from "@/shared/ui/chat/chat-conversation";
import {
  ChatMarkdown as Markdown,
  ChatStreamMarkdown as StreamMarkdown,
} from "@/shared/ui/chat/chat-markdown";
import { ChatMessage, ChatMessageActions } from "@/shared/ui/chat/chat-message";
import { ChatPromptInput as PromptInput } from "@/shared/ui/chat/chat-prompt-input";
import { ChatQueuedMessage } from "@/shared/ui/chat/chat-queued-message";
import { ChatPromptSuggestion as PromptSuggestion } from "@/shared/ui/chat/chat-prompt-suggestion";
import {
  ChatToolGroup,
  type ChatToolItem,
  type ToolPartState,
} from "@/shared/ui/chat/chat-tool";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import { ContextUsageMeter } from "@/shared/ui/context-usage-meter";
import { ModelSelectorControl } from "@/shared/ui/model-selector/model-selector-control";
import {
  ComposerAttachmentDrawer,
  ComposerInsertMenu,
  buildPromptWithAttachments,
  insertIntoDraft,
  useComposerAttachments,
  useComposerInsertCatalog,
  useFilePicker,
} from "@/shared/ui/composer-attachments";
import { PiSheet } from "@/shared/ui/pi-sheet";
import {
  SessionInspector,
  SessionInspectorTrigger,
  sessionInspectorDefaultWidthPx,
  sessionInspectorResizableBounds,
} from "@/shared/ui/session-inspector/session-inspector";
import {
  sessionSurfaceOrder,
  sessionSurfaces,
  type SessionSurfaceId,
} from "@/shared/ui/session-inspector/surface-registry";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import type { RuntimePromptImage, SessionChangedFile, SessionChanges } from "@pigui/core";
import { promptImageDataUrl } from "@pigui/core";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { AppFrame, defaultSidebarProjectSessionProjections } from "@/app/app-shell";
import { NoProvidersEmptyState } from "@/entities/session/no-providers-empty-state";
import { useProviderAuthStatus } from "@/entities/session/use-provider-auth-status";
import { invoke } from "@/shared/runtime";
import {
  Archive,
  Box,
  ChevronDown,
  Computer,
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
  type ExecutionCheckout,
  type PiRuntimeBridge,
  type PiSessionState,
  type RuntimeModelControls,
  type RuntimeModelSelection,
} from "@/entities/runtime/pi-runtime-bridge";
import {
  isContextCompacting,
  type SessionRuntimeMessage,
  type SessionRuntimeModel,
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
} from "@/entities/session/sessions";
import {
  sessionChangesBadge,
  useSessionChanges,
  type SessionChangesView,
} from "@/entities/session/use-session-changes";
import {
  getLastModelSelection,
  mostRecentSessionModelSelection,
  overlayPreferredModel,
  saveLastModelSelection,
} from "@/entities/session/last-model-preference";
import { getVisibleModels } from "@/entities/model/visible-models";
import { settingsModelsSectionId } from "@/pages/settings";
import {
  sessionProjectionFromPersistedProjection,
  useSessionProjections,
  useSessionProjectionsOptional,
} from "@/entities/session/use-session-projections";

type LiveMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  images?: { src: string; name?: string }[];
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
  durationMs?: number;
  timestamp?: string;
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
  /** The page owns the read so the rail badge can share it (ADR-0028). */
  changes: SessionChanges | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
};

const sessionInspectorDockMediaQuery = "(min-width: 1280px)";

/** Wide Workspaces dock the inspector; narrower ones fall back to a Sheet. */
function useDockedSessionInspectorLayout() {
  const [isDocked, setIsDocked] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return true;
    }

    return window.matchMedia(sessionInspectorDockMediaQuery).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(sessionInspectorDockMediaQuery);
    const handleChange = () => setIsDocked(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isDocked;
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
  modelSelection?: RuntimeModelSelection;
  images?: RuntimePromptImage[];
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

function getVisibleProjectRegistry() {
  return getProjectRegistryWithBrowserDevelopmentFallback(getProjectRegistry());
}

function LiveChatMessage({
  message,
  modelElapsedMs,
  timeline = [],
  onForkMessage,
}: {
  message: LiveMessage;
  /** Measured model-call time for this answer; absent when unbracketed. */
  modelElapsedMs?: number;
  timeline?: RunTimelineItem[];
  onForkMessage?: (message: LiveMessage) => void;
}) {
  if (message.role === "user") {
    const canFork = Boolean(message.piEntryId && onForkMessage);

    return (
      <ChatMessage.User>
        <div className="flex flex-col items-end gap-1">
          {message.images?.length ? (
            <div className="chat-message__images">
              {message.images.map((image, index) => (
                <Thumbnail
                  key={`${message.id}-image-${index}`}
                  alt={image.name ?? "Attached image"}
                  label={image.name ?? "Attached image"}
                  src={image.src}
                />
              ))}
            </div>
          ) : null}
          {message.body || message.controlLabel ? (
            <ChatMessage.Bubble>
              {message.controlLabel ? (
                <p className="mb-1 text-xs font-medium text-muted">
                  {message.controlLabel}
                </p>
              ) : null}
              {message.body ? (
                <ChatMessage.Content>{message.body}</ChatMessage.Content>
              ) : null}
            </ChatMessage.Bubble>
          ) : null}
          {message.body || canFork ? (
            <ChatMessageActions className="shrink-0">
              {message.body ? (
                <ChatMessageActions.Copy
                  aria-label="Copy"
                  tooltip="Copy"
                  onPress={() => {
                    void navigator.clipboard?.writeText(message.body);
                  }}
                />
              ) : null}
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
          ) : null}
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
            elapsedMs={modelElapsedMs ?? thoughtElapsedMs(timeline)}
            isStreaming={message.isStreaming}
            timeline={timeline}
          />
        ) : null}
        {message.body ? (
          <ChatMessage.Content>
            <AssistantMessageContent message={message} />
          </ChatMessage.Content>
        ) : null}
        {!message.controlLabel && !message.isStreaming ? (
          <ChatMessageActions className="chat-message__actions--persist">
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
  elapsedMs,
  isStreaming = false,
  timeline,
}: {
  elapsedMs?: number;
  isStreaming?: boolean;
  timeline: RunTimelineItem[];
}) {
  // Remount when stream ends so the settled trigger starts closed (DF-005B).
  if (isStreaming) {
    const latest = timeline[timeline.length - 1];

    if (!latest) {
      return null;
    }

    return (
      <ChainOfThought key="streaming" isStreaming>
        <ChainOfThought.Live pageKey={liveTracePageKey(latest)}>
          <LiveTracePage item={latest} />
        </ChainOfThought.Live>
      </ChainOfThought>
    );
  }

  // A measured call is worth disclosing even when the turn left no thinking or
  // tool steps behind — an answer that took 30s should say so. Without steps
  // and without a measurement there is nothing to show but a placeholder.
  if (!timeline.length) {
    if (elapsedMs === undefined) {
      return null;
    }
    return (
      <ChainOfThought key="settled">
        <ChainOfThought.Label>{formatThoughtSummary(elapsedMs)}</ChainOfThought.Label>
      </ChainOfThought>
    );
  }

  return (
    <ChainOfThought key="settled" defaultExpanded={false}>
      <ChainOfThought.Trigger>{formatThoughtSummary(elapsedMs)}</ChainOfThought.Trigger>
      <ChainOfThought.Content>
        <ChainOfThought.Steps>
          {groupTimelineSteps(timeline).map((step) =>
            step.kind === "tools" ? (
              <ChainOfThought.Step key={step.id}>
                <ChatToolGroup tools={step.tools} />
              </ChainOfThought.Step>
            ) : (
              <ChainOfThought.Step key={step.item.id}>
                <ChatThoughtMarkdown text={step.item.meta} />
              </ChainOfThought.Step>
            ),
          )}
        </ChainOfThought.Steps>
      </ChainOfThought.Content>
    </ChainOfThought>
  );
}

function liveTracePageKey(item: RunTimelineItem) {
  if (item.kind === "tool") {
    return `tool:${item.id}`;
  }
  return `think:${item.id}:${liveThoughtBeatIndex(item.meta)}`;
}

function LiveTracePage({ item }: { item: RunTimelineItem }) {
  if (item.kind === "tool") {
    return (
      <ChatToolGroup
        tools={[
          {
            argsText: item.argsText,
            durationMs: item.durationMs,
            output: item.outputText,
            state: item.toolState ?? "input-available",
            toolCallId: item.toolCallId ?? item.id,
            toolName: item.toolName ?? item.title,
          },
        ]}
      />
    );
  }

  return (
    <p className="chain-of-thought__page">
      <ChatThoughtMarkdown text={liveThoughtLine(item.meta)} unwrapLines />
    </p>
  );
}

/**
 * Legacy-bridge fallback: trace items carry only closing stamps, so this spans
 * the steps rather than the calls — it loses each call's opening wait and has
 * nothing to measure below two steps. Kept for bridges that mint no message
 * boundaries; the runtime-model path measures the calls themselves.
 */
function thoughtElapsedMs(timeline: RunTimelineItem[]) {
  const times = timeline
    .map((item) => (item.timestamp ? Date.parse(item.timestamp) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (times.length < 2) {
    return undefined;
  }
  return Math.max(...times) - Math.min(...times);
}

/**
 * Wall clock the model itself spent on one answer: every call the bubble
 * collapses, each measured between its own message boundaries. Tool execution
 * sits between calls and each tool row already reports its own duration, so
 * summing the calls keeps the two disclosures from charging the same seconds
 * twice. Undefined when no call in the run was bracketed — the caller keeps
 * its older estimate rather than pass off a guess as a measurement.
 */
function runModelElapsedMs(model: SessionRuntimeModel, messageIds: string[]) {
  let totalMs = 0;

  for (const messageId of messageIds) {
    const message = model.messages.get(messageId);

    if (!message || message.phase !== "final" || !message.startedAt) {
      continue;
    }

    const spanMs = Date.parse(message.updatedAt) - Date.parse(message.startedAt);

    // A pair that is not a plausible positive span contributes nothing, so a
    // skewed clock or an unparsable stamp degrades to the estimate.
    if (Number.isFinite(spanMs) && spanMs > 0) {
      totalMs += spanMs;
    }
  }

  return totalMs > 0 ? totalMs : undefined;
}

type TimelineStep =
  | { kind: "tools"; id: string; tools: ChatToolItem[] }
  | { kind: "item"; item: RunTimelineItem };

/** Consecutive tool items fold into one Astryx tool-call group. */
function groupTimelineSteps(timeline: RunTimelineItem[]): TimelineStep[] {
  const steps: TimelineStep[] = [];

  for (const item of timeline) {
    if (item.kind !== "tool") {
      steps.push({ kind: "item", item });
      continue;
    }

    const tool: ChatToolItem = {
      argsText: item.argsText,
      durationMs: item.durationMs,
      output: item.outputText,
      state: item.toolState ?? "input-available",
      toolCallId: item.toolCallId ?? item.id,
      toolName: item.toolName ?? item.title,
    };
    const lastStep = steps[steps.length - 1];

    if (lastStep?.kind === "tools") {
      lastStep.tools.push(tool);
    } else {
      steps.push({ kind: "tools", id: item.id, tools: [tool] });
    }
  }

  return steps;
}

function AssistantMessageContent({ message }: { message: LiveMessage }) {
  if (message.controlLabel) {
    return message.body;
  }

  if (message.isStreaming) {
    return (
      <StreamMarkdown isStreaming>
        {message.body}
      </StreamMarkdown>
    );
  }

  return <Markdown>{message.body}</Markdown>;
}

function QueuedMessageList({
  projection,
  onWithdraw,
  onSteer,
}: {
  projection: SessionProjection;
  onWithdraw: (queuedMessageId: string) => void;
  /** Present only while a run is active; queued rows offer Steer then. */
  onSteer?: (queuedMessageId: string) => void;
}) {
  const queuedMessages = projection.queuedMessages.filter(
    (queuedMessage) => queuedMessage.status !== "processing",
  );

  if (!queuedMessages.length) {
    return null;
  }

  return (
    <div
      className="mx-auto mb-3 grid w-full max-w-[44rem] gap-1.5"
      data-testid="queued-message-list"
    >
      {queuedMessages.map((queuedMessage) => (
        <ChatQueuedMessage
          body={queuedMessage.body || queuedMessage.images?.[0]?.name || "Attached image"}
          isWithdrawn={queuedMessage.status === "withdrawn"}
          key={queuedMessage.id}
          onSteer={
            onSteer && queuedMessage.status === "pending"
              ? () => onSteer(queuedMessage.id)
              : undefined
          }
          onWithdraw={
            queuedMessage.status === "pending"
              ? () => onWithdraw(queuedMessage.id)
              : undefined
          }
        />
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
  onModelConfigChange,
  onManageModels,
}: {
  queueMode?: boolean;
  isStoppingRun?: boolean;
  projection?: SessionProjection | null;
  onPromptSubmit?: (message: string, images?: RuntimePromptImage[]) => Promise<void> | void;
  onQueueSubmit?: (message: string, images?: RuntimePromptImage[]) => Promise<void> | void;
  onWithdrawQueuedMessage?: (queuedMessageId: string) => Promise<void> | void;
  onStopRun?: () => Promise<void> | void;
  onSteerSubmit?: (message: string, images?: RuntimePromptImage[]) => Promise<void> | void;
  onModelConfigChange?: (selection: RuntimeModelSelection) => Promise<void> | void;
  onManageModels?: () => void;
}) {
  const sessionId = projection?.id ?? null;
  // Read once per mount: Settings owns this set and the composer only remounts
  // after leaving that page (issue #102).
  const [visibleModels] = useState(getVisibleModels);
  const [draft, setDraft] = useState(() =>
    sessionId ? getFollowUpDraft(sessionId)?.message ?? "" : "",
  );
  const [composerError, setComposerError] = useState<string | null>(null);
  // Shelf drawer + footer Add-to-prompt menu. Images ride send_prompt /
  // queue_follow_up / steer_run. Decision: .scratch/composer-attachments/PRD.md
  const attachments = useComposerAttachments();
  const catalog = useComposerInsertCatalog();
  const picker = useFilePicker(attachments.addFiles);
  const promptStatus = isStoppingRun
    ? "submitted"
    : queueMode
      ? "streaming"
      : composerError || attachments.error
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
    attachments.clear();
  }, [sessionId, attachments.clear]);

  const submitDraft = async () => {
    const built = await buildPromptWithAttachments(draft, attachments.items);

    if (!built.ok) {
      setComposerError(built.error);
      return;
    }

    if (queueMode) {
      try {
        await onQueueSubmit?.(built.prompt, built.images);
        setComposerError(null);
        attachments.clear();
        clearSubmittedDraft();
      } catch (error) {
        setComposerError(errorMessage(error));
      }

      return;
    }

    try {
      await onPromptSubmit?.(built.prompt, built.images);
      setComposerError(null);
      attachments.clear();
      clearSubmittedDraft();
    } catch (error) {
      setComposerError(errorMessage(error));
    }
  };
  // Queue-first model: the composer always queues while a run is active, and
  // steering happens from the queued row itself — steer the run with the row's
  // body, then withdraw the row so the queue reflects what was promoted.
  // Decision record: .scratch/composer-redesign/PRD.md
  const steerQueuedMessage = async (queuedMessageId: string) => {
    const queuedMessage = projection?.queuedMessages.find(
      (message) => message.id === queuedMessageId,
    );

    if (!queuedMessage) {
      return;
    }

    try {
      await onSteerSubmit?.(queuedMessage.body, queuedMessage.images);
      await onWithdrawQueuedMessage?.(queuedMessageId);
      setComposerError(null);
    } catch (error) {
      setComposerError(errorMessage(error));
    }
  };

  // Context occupancy is session runtime state, so it rides the footer line
  // rather than any composer control. Only a bound runtime has a context
  // window to be a share of.
  const composerFooter = projection?.piSessionId ? (
    <span className="flex items-center justify-end">
      <ContextUsageMeter
        isCompacting={isContextCompacting(projection.runtimeModel)}
        usage={projection.contextUsage}
      />
    </span>
  ) : undefined;

  return (
    <div
      className="mt-auto shrink-0 px-4 pb-3 pt-3"
      data-testid="full-chat-composer"
    >
      {projection ? (
        <QueuedMessageList
          projection={projection}
          onSteer={
            queueMode && onSteerSubmit
              ? (queuedMessageId) => void steerQueuedMessage(queuedMessageId)
              : undefined
          }
          onWithdraw={(queuedMessageId) =>
            void onWithdrawQueuedMessage?.(queuedMessageId)
          }
        />
      ) : null}
      <PromptInput
        allowSubmitWhileRunning={queueMode}
        className="mx-auto w-full max-w-[44rem]"
        drawer={
          <ComposerAttachmentDrawer
            items={attachments.items}
            onRemove={attachments.remove}
          />
        }
        error={attachments.error ?? composerError}
        footer={composerFooter}
        hasAttachments={attachments.items.length > 0}
        lockInputOnRun={!queueMode}
        startActions={
          <>
            {picker.input}
            <ComposerInsertMenu
              plugins={catalog.plugins}
              skills={catalog.skills}
              onAttach={picker.open}
              onInsert={(text) => updateDraft(insertIntoDraft(draft, text))}
            />
            {projection?.modelControls && onModelConfigChange ? (
              <ModelSelectorControl
                controls={projection.modelControls}
                isLocked={queueMode}
                visibleModels={visibleModels}
                onChange={onModelConfigChange}
                onManageModels={onManageModels}
              />
            ) : null}
          </>
        }
        placeholder={
          queueMode ? "Queue the next task…" : "What do you want to know?"
        }
        status={promptStatus}
        value={draft}
        onFiles={attachments.addFiles}
        onStop={onStopRun ? () => void onStopRun() : undefined}
        onSubmit={submitDraft}
        onValueChange={updateDraft}
      />
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

function chatImagesFromModelMessage(message: SessionRuntimeMessage) {
  return message.parts
    .filter((part) => part.partType === "image" && part.body)
    .map((part) => ({
      src: part.body,
      ...(part.name ? { name: part.name } : {}),
    }));
}

function liveImagesFromPrompt(images?: RuntimePromptImage[]) {
  return images?.map((image) => ({
    src: promptImageDataUrl(image),
    name: image.name,
  }));
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

/**
 * While a queued follow-up is `processing`, the queue strip hides it and the
 * runtime may not have emitted a user message yet — bridge that gap so the
 * second (and later) user turns never disappear from live chat (DF-005A).
 */
function appendProcessingQueuedFollowUpsAsUserMessages(
  projection: SessionProjection,
  messages: LiveMessage[],
): LiveMessage[] {
  const existingUserBodies = new Set(
    messages.filter((message) => message.role === "user").map((message) => message.body),
  );

  const processingFollowUps = projection.queuedMessages.filter(
    (queuedMessage) =>
      queuedMessage.status === "processing" &&
      !existingUserBodies.has(queuedMessage.body),
  );

  if (!processingFollowUps.length) {
    return messages;
  }

  return [
    ...messages,
    ...processingFollowUps.map((queuedMessage) => ({
      id: `queued-processing-${queuedMessage.id}`,
      role: "user" as const,
      body: queuedMessage.body,
      ...(queuedMessage.images?.length
        ? { images: liveImagesFromPrompt(queuedMessage.images) }
        : {}),
    })),
  ];
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
    const images = chatImagesFromModelMessage(message);
    const isStreaming = streamingAllowed && message.phase === "streaming";

    if (!body && !images.length && !message.controlLabel && !isStreaming) {
      continue;
    }

    messages.push({
      id: message.messageId,
      role: message.role,
      body,
      ...(images.length ? { images } : {}),
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

  const withInitial = hasInitialPromptMessage
    ? collapsedMessages
    : [
        {
          id: `${projection.id}-initial-prompt`,
          role: "user" as const,
          body: projection.initialPrompt,
        },
        ...collapsedMessages,
      ];

  return appendProcessingQueuedFollowUpsAsUserMessages(projection, withInitial);
}

function appendModelRunningPlaceholder(
  projection: SessionProjection,
  messages: LiveMessage[],
  clockNowMs: number,
): LiveMessage[] {
  if (projection.status !== "running" || projection.stale) {
    return messages;
  }

  const hasAssistantShell = messages.some(
    (message) => message.role === "assistant" && !message.controlLabel,
  );
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
  if (hasModelActivity && hasAssistantShell) {
    return messages;
  }
  const body = hasModelActivity
    ? ""
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
            ...(message?.updatedAt ? { timestamp: message.updatedAt } : {}),
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

    const durationMs =
      tool.phase === "done" && tool.startedAt
        ? Date.parse(tool.updatedAt) - Date.parse(tool.startedAt)
        : undefined;

    items.push({
      id: tool.toolCallId,
      kind: "tool",
      title: `Tool: ${toolName}`,
      meta: outputText ?? argsText ?? "",
      messageId: messageIdByToolCallId.get(tool.toolCallId),
      toolCallId: tool.toolCallId,
      toolName,
      toolState:
        tool.phase === "done"
          ? tool.isError
            ? "output-error"
            : "output-available"
          : "input-available",
      argsText,
      outputText,
      timestamp: tool.updatedAt,
      ...(durationMs !== undefined && Number.isFinite(durationMs)
        ? { durationMs }
        : {}),
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
        ...(event.images?.length
          ? { images: liveImagesFromPrompt(event.images) }
          : {}),
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

  const withInitial = hasInitialPromptEvent
    ? messagesWithRunningPlaceholder
    : [
        {
          id: `${projection.id}-initial-prompt`,
          role: "user" as const,
          body: projection.initialPrompt,
        },
        ...messagesWithRunningPlaceholder,
      ];

  return appendProcessingQueuedFollowUpsAsUserMessages(projection, withInitial);
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
    return "";
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
  const toolCallTimestamps = new Map<string, string>();

  for (const event of projection.runtimeEvents) {
    if (event.kind === "thinking") {
      items.push({
        id: event.id,
        kind: "thinking",
        title: "Thinking",
        meta: event.body,
        messageId: event.messageId,
        timestamp: event.timestamp,
      });
      continue;
    }

    if (event.kind !== "tool-call" && event.kind !== "tool-result") {
      continue;
    }

    const toolName = event.title ?? "Tool";
    const toolIdentity = event.toolCallId ?? event.id;
    const existingIndex = toolItemIndexes.get(toolIdentity);

    if (event.kind === "tool-call" && !toolCallTimestamps.has(toolIdentity)) {
      toolCallTimestamps.set(toolIdentity, event.timestamp);
    }

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
        timestamp: event.timestamp,
      };

      toolItemIndexes.set(toolIdentity, items.length);
      items.push(item);
      continue;
    }

    const existingItem = items[existingIndex];
    const callTimestamp = toolCallTimestamps.get(toolIdentity);
    const durationMs =
      event.kind === "tool-result" && callTimestamp
        ? Date.parse(event.timestamp) - Date.parse(callTimestamp)
        : undefined;

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
      timestamp: event.timestamp,
      ...(durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0
        ? { durationMs }
        : {}),
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

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `session-${crypto.randomUUID()}`;
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function projectPickerKeyToProjectId(key: string | null) {
  if (key === null || key === projectPickerPlaceholderKey) {
    return null;
  }

  return key;
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
  const selectedPickerKey = selectedProject?.id ?? projectPickerPlaceholderKey;

  return (
    <div className="max-w-full" data-testid="project-picker">
      <Selector
        data-testid="project-picker-trigger"
        isLabelHidden
        label="Target Project"
        options={[
          { value: projectPickerPlaceholderKey, label: projectPickerPlaceholder },
          ...projects.map((project) => ({
            value: project.id,
            label: project.displayName,
            icon: (
              <FolderClosed
                aria-hidden="true"
                className="pigui-compact-menu-item-icon text-muted"
              />
            ),
          })),
        ]}
        size="sm"
        startIcon={
          <FolderClosed
            aria-hidden="true"
            className="size-4 shrink-0 text-muted"
            data-testid="project-picker-folder-icon"
          />
        }
        value={selectedPickerKey}
        variant="ghost"
        onChange={(value) => {
          onProjectChange(projectPickerKeyToProjectId(value));
        }}
      />
    </div>
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
    <div className="max-w-full" data-testid="checkout-strategy-picker">
      <Selector
        data-testid="checkout-strategy-trigger"
        isLabelHidden
        label="Checkout strategy"
        options={[
          {
            value: "local",
            label: checkoutModeLabels.local,
            icon: (
              <Computer
                aria-hidden="true"
                className="pigui-compact-menu-item-icon text-muted"
                data-testid="checkout-strategy-local-icon"
              />
            ),
          },
          {
            value: "worktree",
            label: checkoutModeLabels.worktree,
            icon: (
              <GitBranch
                aria-hidden="true"
                className="pigui-compact-menu-item-icon text-muted"
              />
            ),
          },
        ]}
        size="sm"
        startIcon={
          selectedCheckoutMode === "worktree" ? (
            <GitBranch aria-hidden="true" className="size-4 shrink-0 text-muted" />
          ) : (
            <Computer
              aria-hidden="true"
              className="size-4 shrink-0 text-muted"
              data-testid="checkout-strategy-local-icon"
            />
          )
        }
        value={selectedCheckoutMode}
        variant="ghost"
        onChange={(value) => {
          onCheckoutModeChange(value === "worktree" ? "worktree" : "local");
        }}
      />
    </div>
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
  onManageModels,
}: {
  draft: SessionDraft;
  projects: ProjectRegistryEntry[];
  creationProjection: SessionProjection | null;
  recommendedCheckoutMode: SessionDraftCheckoutMode;
  onDraftChange: (prompt: string) => void;
  onDraftCheckoutModeChange: (checkoutMode: SessionDraftCheckoutMode) => void;
  onDraftTargetChange: (projectId: string | null) => void;
  onDraftSubmit: (event: SessionDraftSubmitEvent) => void;
  onManageModels?: () => void;
}) {
  const [targetError, setTargetError] = useState(false);
  const [visibleModels] = useState(getVisibleModels);
  const selectedCheckoutMode = draft.checkoutMode ?? recommendedCheckoutMode;
  const { loading: providerAuthLoading, configured: providersConfigured } =
    useProviderAuthStatus();
  const [draftModelControls, setDraftModelControls] =
    useState<RuntimeModelControls | null>(null);
  const sessionProjectionsStore = useSessionProjectionsOptional();
  const recentSessionModel = mostRecentSessionModelSelection(
    sessionProjectionsStore?.sessionProjections ?? [],
  );
  const recentSessionModelKey = recentSessionModel
    ? `${recentSessionModel.provider}:${recentSessionModel.modelId}:${recentSessionModel.thinkingLevel}`
    : "";
  const attachments = useComposerAttachments();
  const catalog = useComposerInsertCatalog();
  const picker = useFilePicker(attachments.addFiles);

  useEffect(() => {
    if (providerAuthLoading || !providersConfigured) {
      setDraftModelControls(null);
      return;
    }

    let cancelled = false;

    void invoke<RuntimeModelControls>("list_available_model_controls")
      .then((controls) => {
        if (!cancelled) {
          setDraftModelControls(
            overlayPreferredModel(controls, [
              getLastModelSelection(),
              recentSessionModel,
            ]),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDraftModelControls(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providerAuthLoading, providersConfigured, recentSessionModelKey]);

  const applySuggestedPrompt = (prompt: string) => {
    setTargetError(false);
    onDraftChange(prompt);
  };
  const submitDraft = async () => {
    if (!providerAuthLoading && !providersConfigured) {
      return;
    }

    if (!draft.projectId) {
      setTargetError(true);
      return;
    }

    const built = await buildPromptWithAttachments(
      draft.prompt,
      attachments.items,
    );

    if (!built.ok) {
      attachments.setError(built.error);
      return;
    }

    onDraftSubmit({
      projectId: draft.projectId,
      prompt: built.prompt,
      checkoutMode: selectedCheckoutMode,
      ...(built.images.length ? { images: built.images } : {}),
      ...(draftModelControls?.selected
        ? { modelSelection: draftModelControls.selected }
        : {}),
    });
    attachments.clear();
  };

  if (!providerAuthLoading && !providersConfigured) {
    return (
      <section
        className="flex h-full min-h-0 flex-col items-center justify-center px-6 py-8"
        data-testid="session-draft-composer"
      >
        <NoProvidersEmptyState testId="session-draft-no-models-gate" />
      </section>
    );
  }

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
            drawer={
              <ComposerAttachmentDrawer
                items={attachments.items}
                onRemove={attachments.remove}
              />
            }
            error={attachments.error}
            hasAttachments={attachments.items.length > 0}
            placeholder="Do anything with Pi"
            startActions={
              <>
                {picker.input}
                <ComposerInsertMenu
                  plugins={catalog.plugins}
                  skills={catalog.skills}
                  onAttach={picker.open}
                  onInsert={(text) =>
                    onDraftChange(insertIntoDraft(draft.prompt, text))
                  }
                />
                {draftModelControls?.selected ? (
                  <ModelSelectorControl
                    controls={draftModelControls}
                    isLocked={false}
                    visibleModels={visibleModels}
                    onManageModels={onManageModels}
                    onChange={(selection) => {
                      saveLastModelSelection(selection);
                      setDraftModelControls((current) =>
                        current
                          ? {
                              ...current,
                              selected: selection,
                            }
                          : current,
                      );
                    }}
                  />
                ) : null}
              </>
            }
            value={draft.prompt}
            onFiles={attachments.addFiles}
            onSubmit={submitDraft}
            onValueChange={onDraftChange}
          />
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
  changes,
  error,
  loading,
  onRefresh,
}: SessionChangesPanelProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diffStyle, setDiffStyle] = useState<"unified" | "split">("unified");

  // Each read yields a new object; keep the reviewed file when it survived.
  useEffect(() => {
    if (!changes) return;

    setSelectedPath((current) =>
      changes.files.some((file) => file.path === current)
        ? current
        : (changes.files[0]?.path ?? null),
    );
  }, [changes]);

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
          <IconButton
            icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}
            isDisabled={loading}
            label="Refresh Session changes"
            size="sm"
            tooltip="Refresh changes"
            variant="ghost"
            onClick={onRefresh}
          />
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
            label="Retry"
            size="sm"
            variant="secondary"
            onClick={onRefresh}
          />
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
              <SegmentedControl
                label="Diff layout"
                size="sm"
                value={diffStyle}
                onChange={(value) =>
                  setDiffStyle(value === "split" ? "split" : "unified")
                }
              >
                <SegmentedControlItem label="Unified" value="unified" />
                <SegmentedControlItem label="Split" value="split" />
              </SegmentedControl>
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
            icon={<Archive className="size-4" />}
            isDisabled={!archiveAllowed || isArchiving}
            isLoading={isArchiving}
            label="Archive Session"
            size="sm"
            variant="secondary"
            onClick={onArchive}
          />
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

/** Renders whichever surface the inspector (or its Sheet fallback) is showing. */
function SessionSurfaceContent({
  surfaceId,
  workspace,
  projection,
  archiveError,
  isArchiving,
  sessionChanges,
  onArchive,
}: {
  surfaceId: SessionSurfaceId;
  workspace: AgentWorkspaceFixture;
  projection?: SessionProjection | null;
  archiveError?: string | null;
  isArchiving?: boolean;
  sessionChanges: SessionChangesView;
  onArchive?: () => void;
}) {
  if (surfaceId === "changes") {
    return (
      <SessionChangesPanel
        changes={sessionChanges.changes}
        error={sessionChanges.error}
        loading={sessionChanges.loading}
        sessionId={projection?.id ?? null}
        stale={projection?.stale ?? false}
        onRefresh={sessionChanges.refresh}
      />
    );
  }

  return (
    <SessionActionsContent
      archiveError={archiveError}
      isArchiving={isArchiving}
      workspace={workspace}
      projection={projection}
      onArchive={onArchive}
    />
  );
}

/**
 * Below the dock breakpoint the inspector collapses into a Sheet. The rail
 * would waste the narrow width, so surface switching moves to the header.
 */
function SessionInspectorSheet({
  activeSurfaceId,
  isOpen,
  children,
  onActiveSurfaceChange,
  onOpenChange,
}: {
  activeSurfaceId: SessionSurfaceId;
  isOpen: boolean;
  children: ReactNode;
  onActiveSurfaceChange: (surfaceId: SessionSurfaceId) => void;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const surface = sessionSurfaces[activeSurfaceId];

  return (
    <PiSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <PiSheet.Content>
        <PiSheet.CloseTrigger />
        <PiSheet.Header>
          <PiSheet.Heading>{surface.title}</PiSheet.Heading>
          <p className="mt-1 text-sm text-muted">{surface.hint}</p>
          <div className="mt-3">
            <SegmentedControl
              label="Session surfaces"
              size="sm"
              value={activeSurfaceId}
              onChange={(value) =>
                onActiveSurfaceChange(value as SessionSurfaceId)
              }
            >
              {sessionSurfaceOrder.map((surfaceId) => (
                <SegmentedControlItem
                  key={surfaceId}
                  label={sessionSurfaces[surfaceId].title}
                  value={surfaceId}
                />
              ))}
            </SegmentedControl>
          </div>
        </PiSheet.Header>
        <PiSheet.Body>
          <div className="pigui-scroll-fade max-h-[calc(100vh-14rem)] overflow-y-auto">
            {children}
          </div>
        </PiSheet.Body>
      </PiSheet.Content>
    </PiSheet>
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
  activeSurfaceId = "changes",
  archiveError,
  dockInspector = false,
  inspectorOpen = false,
  isArchiving,
  sessionChanges,
  onActiveSurfaceChange = () => {},
  onArchive,
  onInspectorOpenChange = () => {},
}: {
  workspace: AgentWorkspaceFixture;
  projection?: SessionProjection | null;
  activeSurfaceId?: SessionSurfaceId;
  archiveError?: string | null;
  dockInspector?: boolean;
  inspectorOpen?: boolean;
  isArchiving?: boolean;
  sessionChanges: SessionChangesView;
  onActiveSurfaceChange?: (surfaceId: SessionSurfaceId) => void;
  onArchive?: () => void;
  onInspectorOpenChange?: (isOpen: boolean) => void;
}) {
  return (
    <>
      <SessionInspectorTrigger
        alignToRail={dockInspector}
        isOpen={inspectorOpen}
        onOpenChange={onInspectorOpenChange}
      />
      <SessionInspectorSheet
        activeSurfaceId={activeSurfaceId}
        isOpen={inspectorOpen && !dockInspector}
        onActiveSurfaceChange={onActiveSurfaceChange}
        onOpenChange={onInspectorOpenChange}
      >
        <SessionSurfaceContent
          archiveError={archiveError}
          isArchiving={isArchiving}
          sessionChanges={sessionChanges}
          surfaceId={activeSurfaceId}
          workspace={workspace}
          projection={projection}
          onArchive={onArchive}
        />
      </SessionInspectorSheet>
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
  onManageModels,
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
  onManageModels?: () => void;
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

        // Re-base on the freshest projection: prompt/queue handlers may have
        // committed echoes while the resume RPC was in flight, and resync
        // replaces runtimeEvents wholesale from a snapshot that predates
        // them. Fall back to the prop when the view switched Sessions.
        const latest = liveProjectionRef.current ?? sessionProjection;
        const base =
          latest?.piSessionId === sessionProjection.piSessionId
            ? latest
            : sessionProjection;
        let next = applySessionProjectionEvent(base, {
          type: "runtime-state-resynced",
          state,
        });
        const snapshotEventIds = new Set(
          state.events.map((snapshotEvent) => snapshotEvent.id),
        );

        for (const event of base.runtimeEvents) {
          if (!snapshotEventIds.has(event.id)) {
            next = applySessionProjectionEvent(next, {
              type: "runtime-event-received",
              event,
            });
          }
        }

        liveProjectionRef.current = next;
        commitInteractionProjection(next);
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
      draft: {
        ...draft,
        prompt: event.prompt,
      },
      project: {
        id: targetProject.id,
        repoRoot: targetRepoRoot,
        projectRoot: targetProjectRoot,
      },
      executionMode: checkoutModeToExecutionMode(event.checkoutMode),
      ...(event.modelSelection ? { modelSelection: event.modelSelection } : {}),
      ...(event.images?.length ? { images: event.images } : {}),
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
  // Keep a mutable pointer so live event listeners can chain applies without
  // waiting for React to re-render (and without dropping mid-stream events).
  const liveProjectionRef = useRef(liveProjection);
  liveProjectionRef.current = liveProjection;

  const onProjectionChangeRef = useRef(onProjectionChange);
  onProjectionChangeRef.current = onProjectionChange;

  // DF-009: create path subscribes in sessionCreator, but resume/open of an
  // existing session only resynced once and never re-subscribed. Follow-ups
  // still hit the backend/journal while the UI only applied the user echo —
  // looks like "must start a new chat". Subscribe for any viewed piSessionId.
  useEffect(() => {
    const piSessionId = liveProjection?.piSessionId;

    if (showDraft || !piSessionId) {
      return;
    }

    const bridge = getRuntimeBridge();

    const applyLiveProjectionEvent = (
      event: Parameters<typeof applySessionProjectionEvent>[1],
    ) => {
      const base = liveProjectionRef.current;

      if (!base || base.piSessionId !== piSessionId) {
        return;
      }

      const next = applySessionProjectionEvent(base, event);
      liveProjectionRef.current = next;
      setInteractionProjection(next);
      onProjectionChangeRef.current?.(next);
    };

    const unsubscribeLegacyEvents = bridge.subscribeToEvents(
      piSessionId,
      (event) => {
        applyLiveProjectionEvent({
          type: "runtime-event-received",
          event,
        });
      },
    );
    const unsubscribeAgentEvents = bridge.subscribeToAgentEvents?.(
      piSessionId,
      (entry) => {
        applyLiveProjectionEvent({
          type: "agent-event-received",
          entry,
        });
      },
    );

    return () => {
      unsubscribeLegacyEvents();
      unsubscribeAgentEvents?.();
    };
  }, [getRuntimeBridge, liveProjection?.piSessionId, showDraft]);

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
  const modelElapsedForMessage = (message: LiveMessage) =>
    liveProjection
      ? runModelElapsedMs(liveProjection.runtimeModel, relatedMessageIdsFor(message))
      : undefined;
  const readOnlyProjection = isReadOnlyProjection(liveProjection);
  const runtimeUnavailableProjection =
    isRuntimeUnavailableProjection(liveProjection) ? liveProjection : null;
  const queueMode =
    Boolean(liveProjection?.piSessionId) &&
    Boolean(liveProjection && isSessionProjectionActive(liveProjection)) &&
    !readOnlyProjection;
  const handleQueueSubmit = async (
    message: string,
    images?: RuntimePromptImage[],
  ) => {
    // Base every interaction commit on the freshest projection (ref falls
    // back to state): steer-then-withdraw runs two commits back to back, and
    // a stale closure base would clobber the first commit's event.
    const projection = liveProjectionRef.current ?? liveProjection;

    if (!projection?.piSessionId || !queueMode) {
      return;
    }

    const queuedMessage = await getRuntimeBridge().queueFollowUp({
      piSessionId: projection.piSessionId,
      message,
      ...(images?.length ? { images } : {}),
    });

    const next = applySessionProjectionEvent(projection, {
      type: "queued-message-added",
      queuedMessage,
    });
    liveProjectionRef.current = next;
    commitInteractionProjection(next);
  };
  const handlePromptSubmit = async (
    message: string,
    images?: RuntimePromptImage[],
  ) => {
    const projection = liveProjectionRef.current ?? liveProjection;

    if (!projection?.piSessionId || readOnlyProjection) {
      return;
    }

    await restoreProjectionRuntimeState({
      bridge: getRuntimeBridge(),
      projection,
      workspace,
    });

    const accepted = await getRuntimeBridge().sendInitialPrompt({
      piSessionId: projection.piSessionId,
      prompt: message,
      ...(images?.length ? { images } : {}),
    });

    // Re-base the echo on the freshest projection: the pre-await snapshot is
    // stale by now, and committing on top of it would silently drop every live
    // event that landed during the RPC round-trip (same pattern as
    // createSessionFromDraft's mutable projection). If the view switched to
    // another Session mid-flight, fall back to the captured snapshot.
    const latest = liveProjectionRef.current ?? liveProjection;
    const base =
      latest?.piSessionId === projection.piSessionId ? latest : projection;
    const next = applySessionProjectionEvent(base, {
      type: "runtime-event-received",
      event: accepted.event,
    });
    liveProjectionRef.current = next;
    commitInteractionProjection(next);
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

    if (modelControls.selected) {
      saveLastModelSelection(modelControls.selected);
    }

    commitInteractionProjection(
      applySessionProjectionEvent(liveProjection, {
        type: "model-controls-changed",
        modelControls,
        occurredAt: new Date().toISOString(),
      }),
    );
  };
  const handleWithdrawQueuedMessage = async (queuedMessageId: string) => {
    const projection = liveProjectionRef.current ?? liveProjection;

    if (!projection?.piSessionId) {
      return;
    }

    await getRuntimeBridge().withdrawQueuedMessage({
      piSessionId: projection.piSessionId,
      queuedMessageId,
    });

    const next = applySessionProjectionEvent(projection, {
      type: "queued-message-withdrawn",
      queuedMessageId,
      occurredAt: new Date().toISOString(),
    });
    liveProjectionRef.current = next;
    commitInteractionProjection(next);
  };
  const handleSteerSubmit = async (
    message: string,
    images?: RuntimePromptImage[],
  ) => {
    const projection = liveProjectionRef.current ?? liveProjection;

    if (!projection?.piSessionId || !queueMode) {
      return;
    }

    const event = await getRuntimeBridge().steerRun({
      piSessionId: projection.piSessionId,
      message,
      ...(images?.length ? { images } : {}),
    });

    const next = applySessionProjectionEvent(projection, {
      type: "steer-submitted",
      event,
    });
    liveProjectionRef.current = next;
    commitInteractionProjection(next);
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
          onManageModels={onManageModels}
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
                <Button
                  label="Retry"
                  size="sm"
                  variant="secondary"
                  onClick={handleRetryRuntimeResume}
                />
              ) : null}
            </div>
          ) : null}
          <ChatConversation
            aria-label="Live Chat messages"
            className="min-h-0 flex-1"
            isStreaming={liveMessages.some((message) => message.isStreaming)}
          >
            {/* Tight at the top: the pane already carries the header's own
                offset, so a second 24px band only pushed the first message
                down. The bottom keeps its distance from the composer. */}
            <ChatConversation.Content className="mx-auto flex w-full max-w-[44rem] flex-col gap-8 px-4 pb-6 pt-2">
              {liveMessages.map((message) => (
                <LiveChatMessage
                  key={message.id}
                  message={message}
                  modelElapsedMs={modelElapsedForMessage(message)}
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
              onManageModels={onManageModels}
            />
          )}
        </>
      )}
    </main>
  );
}

/**
 * The 40px row under the fixed header chrome on the Chat side. The inspector
 * fills the same band with its own header; the hairline under both is drawn
 * once by the sessions view.
 */
function TitlebarBand() {
  return (
    <div
      aria-hidden="true"
      className="h-10 shrink-0"
      data-testid="session-workspace-titlebar-band"
    />
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
  runtimeBridge,
  sessionProjection,
  clockNowMs,
  onProjectionChange,
  onLatestMessageRendered,
  onManageModels,
  runtimeGeneration = 0,
}: {
  projectId?: string;
  showDraft?: boolean;
  workspace?: AgentWorkspaceFixture;
  aside?: ReactNode;
  onDraftSubmit?: (event: SessionDraftSubmitEvent) => void;
  sessionCreator?: SessionCreator;
  checkoutManager?: ExecutionCheckoutManager;
  runtimeBridge?: PiRuntimeBridge;
  sessionProjection?: SessionProjection | null;
  clockNowMs?: number;
  onProjectionChange?: (projection: SessionProjection) => void;
  onLatestMessageRendered?: (sessionId: string) => void;
  onManageModels?: () => void;
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
  const defaultSessionCreator: SessionCreator = (input: SessionCreatorInput) =>
    createSessionFromDraft({
      ...input,
      bridge: getActiveRuntimeBridge(),
      checkoutManager: activeCheckoutManager,
      executionMode: input.executionMode ?? "foreground",
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
      recommendedCheckoutMode="local"
      sessionProjection={sessionProjection}
      clockNowMs={clockNowMs}
      onProjectionChange={onProjectionChange}
      onLatestMessageRendered={onLatestMessageRendered}
      onManageModels={onManageModels}
      runtimeGeneration={runtimeGeneration}
    />
  );
  // The viewport-relative upper bound resolves once; the drag itself is
  // pixel-based (Astryx useResizable).
  const [asideSizeBounds] = useState(() =>
    sessionInspectorResizableBounds(
      typeof window !== "undefined" && window.innerWidth > 0
        ? window.innerWidth
        : 1280,
    ),
  );
  const asideResizable = useResizable({
    defaultSize: sessionInspectorDefaultWidthPx,
    minSizePx: asideSizeBounds.minSizePx,
    maxSizePx: asideSizeBounds.maxSizePx,
  });

  return (
    <article
      className="relative -mt-10 flex h-[calc(100%+2.5rem)] min-h-0 min-w-0 flex-col overflow-hidden pb-0"
      data-testid="project-sessions-view"
    >
      {/* One hairline under the titlebar band for the whole view. Drawn once
          here rather than per column so it does not break at the resize
          handle between Chat and the inspector. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-10 z-10 h-px bg-separator"
        data-testid="session-workspace-titlebar-rule"
      />
      {/* Docked: the split view spans the full width so the inspector's rail
          hugs the window edge (ADR-0028). Chat centers itself via its own
          max-width, so an outer centered box would only strand the panel
          short of the edge. */}
      {aside ? (
        <div
          className="flex h-full min-h-0 w-full flex-row"
          data-slot="resizable"
          data-testid="session-workspace-split-view"
        >
          <div
            className="h-full min-h-0 min-w-0 flex-1"
            data-slot="resizable-panel"
          >
            <div
              className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
              data-testid="session-workspace-main-pane"
            >
              <TitlebarBand />
              <div className="min-h-0 flex-1">{liveSession}</div>
            </div>
          </div>
          <ResizeHandle
            className="mx-2"
            direction="horizontal"
            hasDivider
            isReversed
            label="Resize Session inspector"
            // Astryx 0.3.0 `hitAreaOffsetX` carries a `-50%` Y translate meant
            // for vertical handles, so a side-biased pill shifts the grab zone
            // up by half its height and only the divider's top half is
            // draggable. Centering the pill skips that offset entirely.
            pillPlacement="center"
            resizable={asideResizable.props}
          />
          <div
            className="h-full min-h-0 shrink-0"
            data-slot="resizable-panel"
            style={{ width: asideResizable.size }}
          >
            <div
              className="h-full min-h-0 min-w-0 overflow-hidden"
              data-testid="session-workspace-aside-pane"
            >
              {aside}
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-col px-6">
          <TitlebarBand />
          <div className="min-h-0 flex-1">{liveSession}</div>
        </div>
      )}
    </article>
  );
}

export function AgentWorkspaceSessionsPage() {
  const navigate = useNavigate();
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
  const {
    sessionProjections,
    sessionsHydrated,
    backendGeneration,
    setSessionProjections,
  } = useSessionProjections();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Browser/vitest fixture sessions live in the same app-wide store as Electron hydrate.
  useEffect(() => {
    if (!browserDevelopmentData) {
      return;
    }

    setSessionProjections((current) =>
      current.length > 0 ? current : defaultSidebarProjectSessionProjections,
    );
  }, [browserDevelopmentData, setSessionProjections]);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  // Open state and the active surface are Workspace-level, so switching
  // Sessions keeps the inspector where the user left it.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeSurfaceId, setActiveSurfaceId] =
    useState<SessionSurfaceId>("changes");
  const dockInspector = useDockedSessionInspectorLayout();
  const project = registryProjects.find((candidate) => candidate.id === projectId) ?? null;
  const workspace = project ? workspaceFromProject(project) : null;
  const selectedSessionProjection =
    sessionProjections.find(
      (projection) =>
        projection.id === selectedSessionId && projection.projectId === projectId,
    ) ?? null;
  // One read for the panel and the rail badge. The docked rail carries the
  // Changes count whatever surface is showing, so it needs the diff even on
  // Actions; the Sheet has no rail, so there it follows the active surface.
  const sessionChanges = useSessionChanges({
    sessionId: selectedSessionProjection?.id ?? null,
    enabled: inspectorOpen && (dockInspector || activeSurfaceId === "changes"),
  });

  useEffect(
    () =>
      subscribeProjectRegistry(() =>
        setRegistryProjects(getVisibleProjectRegistry()),
      ),
    [],
  );

  useEffect(() => {
    setArchiveError(null);
  }, [selectedSessionId]);

  // After hydrate (or when project sessions appear), select the first valid session.
  useEffect(() => {
    if (selectedSessionId) {
      return;
    }

    const nextSessionId = firstSessionIdForProject(sessionProjections, projectId);
    if (nextSessionId) {
      setSelectedSessionId(nextSessionId);
    }
  }, [projectId, selectedSessionId, sessionProjections]);

  useEffect(() => {
    if (!selectedSessionProjection) {
      setInspectorOpen(false);
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
        sessionsHydrated={sessionsHydrated}
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
        sessionsHydrated={sessionsHydrated}
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
      sessionsHydrated={sessionsHydrated}
      selectedSessionId={selectedSessionId}
      onSelectedSessionIdChange={setSelectedSessionId}
      toolbarActions={selectedSessionProjection ? (
        <SessionToolbarActions
          activeSurfaceId={activeSurfaceId}
          archiveError={archiveError}
          dockInspector={dockInspector}
          inspectorOpen={inspectorOpen}
          isArchiving={isArchiving}
          sessionChanges={sessionChanges}
          workspace={workspace}
          projection={selectedSessionProjection}
          onActiveSurfaceChange={setActiveSurfaceId}
          onArchive={() => void handleArchiveSession()}
          onInspectorOpenChange={setInspectorOpen}
        />
      ) : undefined}
    >
      <AgentWorkspaceSessionsView
        aside={
          dockInspector && inspectorOpen ? (
            <SessionInspector
              activeSurfaceId={activeSurfaceId}
              badges={{ changes: sessionChangesBadge(sessionChanges.changes) }}
              onActiveSurfaceChange={setActiveSurfaceId}
              onClose={() => setInspectorOpen(false)}
            >
              <SessionSurfaceContent
                archiveError={archiveError}
                isArchiving={isArchiving}
                sessionChanges={sessionChanges}
                surfaceId={activeSurfaceId}
                workspace={workspace}
                projection={selectedSessionProjection}
                onArchive={() => void handleArchiveSession()}
              />
            </SessionInspector>
          ) : undefined
        }
        projectId={projectId}
        showDraft={showDraft}
        workspace={workspace}
        runtimeBridge={runtimeBridge}
        runtimeGeneration={backendGeneration}
        sessionProjection={selectedSessionProjection}
        onProjectionChange={handleProjectionChange}
        onLatestMessageRendered={handleLatestMessageRendered}
        onManageModels={() =>
          void navigate({ to: "/settings", hash: settingsModelsSectionId })
        }
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
