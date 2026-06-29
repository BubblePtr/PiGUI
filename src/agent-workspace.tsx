import { Button, ScrollShadow, Tooltip } from "@heroui/react";
import { ChainOfThought } from "@heroui-pro/react/chain-of-thought";
import { ChatConversation } from "@heroui-pro/react/chat-conversation";
import { ChatMessage } from "@heroui-pro/react/chat-message";
import { PromptInput } from "@heroui-pro/react/prompt-input";
import { Sheet } from "@heroui-pro/react/sheet";
import { Activity, Archive, GitBranch } from "lucide-react";
import { useParams, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppFrame, defaultSidebarProjectSessionProjections } from "./app-shell";
import {
  createExecutionCheckoutManager,
  type ExecutionCheckoutManager,
} from "./execution-checkout";
import { createInvokeExecutionCheckoutGitClient } from "./execution-checkout-client";
import { createDefaultPiRuntimeBridge } from "./pi-runtime-factory";
import type { PiRuntimeBridge, PiSessionState } from "./pi-runtime-bridge";
import {
  createInMemorySessionProjectionStore,
  createSessionFromDraft,
  type CreateSessionFromDraftInput,
  type CreateSessionFromDraftResult,
} from "./session-creation";
import {
  clearSessionDraft,
  getSessionDraft,
  saveSessionDraft,
  subscribeSessionDrafts,
  type SessionDraft,
} from "./session-drafts";
import {
  applySessionProjectionEvent,
  canArchiveSessionProjection,
  getSessionProjectionListItems,
  isSessionProjectionActive,
  type SessionProjection,
} from "./session-projection";
import { formatCost, formatTokens } from "./sessions";

type LiveMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
  controlLabel?: string;
};

type RunTimelineItem = {
  id: string;
  title: string;
  meta: string;
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
      meta: "Pig workspace and recent session evidence",
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
        <ChatMessage.Content>{message.body}</ChatMessage.Content>
        {timeline.length ? (
          <ChainOfThought defaultExpanded>
            <ChainOfThought.Trigger>Thought for 3s</ChainOfThought.Trigger>
            <ChainOfThought.Content>
              <ChainOfThought.Steps>
                {timeline.map((item) => (
                  <ChainOfThought.Step key={item.id} label={item.title}>
                    {item.meta}
                  </ChainOfThought.Step>
                ))}
              </ChainOfThought.Steps>
            </ChainOfThought.Content>
          </ChainOfThought>
        ) : null}
      </ChatMessage.Body>
    </ChatMessage.Assistant>
  );
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
  const [draft, setDraft] = useState("");
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
  const submitDraft = async () => {
    const message = draft.trim();

    if (!message) {
      return;
    }

    if (queueMode) {
      try {
        await onQueueSubmit?.(message);
        setComposerError(null);
        setDraft("");
      } catch (error) {
        setComposerError(errorMessage(error));
      }

      return;
    }

    try {
      await onPromptSubmit?.(message);
      setComposerError(null);
      setDraft("");
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
      setDraft("");
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
        onValueChange={setDraft}
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

function liveMessagesFromProjection(
  projection: SessionProjection,
): LiveMessage[] {
  const projectedMessages = projection.runtimeEvents
    .filter(
      (event) =>
        ((event.kind === "message" || event.kind === "control") &&
          (event.role === "user" || event.role === "assistant")) ||
        event.kind === "status" ||
        event.kind === "error",
    )
    .map(
      (event): LiveMessage => ({
        id: event.id,
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
  const hasInitialPromptEvent = projectedMessages.some(
    (message) =>
      message.role === "user" && message.body === projection.initialPrompt,
  );

  if (hasInitialPromptEvent) {
    return projectedMessages;
  }

  return [
    {
      id: `${projection.id}-initial-prompt`,
      role: "user",
      body: projection.initialPrompt,
    },
    ...projectedMessages,
  ];
}

function runTimelineFromProjection(
  projection: SessionProjection,
): RunTimelineItem[] {
  return projection.runtimeEvents
    .filter((event) => event.kind === "tool-call")
    .map((event) => ({
      id: event.id,
      title: event.title ?? event.kind,
      meta: event.body,
    }));
}

function isReadOnlyProjection(projection: SessionProjection | null) {
  if (!projection) {
    return false;
  }

  return (
    projection.stale ||
    projection.status === "completed" ||
    projection.status === "failed"
  );
}

function SessionDraftComposer({
  draft,
  creationProjection,
  onDraftChange,
  onDraftSubmit,
}: {
  draft: SessionDraft;
  creationProjection: SessionProjection | null;
  onDraftChange: (prompt: string) => void;
  onDraftSubmit: (event: SessionDraftSubmitEvent) => void;
}) {
  const submitDraft = () => {
    const prompt = draft.prompt.trim();

    if (!prompt) {
      return;
    }

    onDraftSubmit({ projectId: draft.projectId, prompt: draft.prompt });
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col justify-end px-4 pb-4 pt-6"
      data-testid="session-draft-composer"
    >
      <div className="mx-auto w-full max-w-[44rem]">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Session Draft
        </h2>
        {creationProjection ? (
          <div
            aria-live="polite"
            className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
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
        <PromptInput
          className="w-full"
          value={draft.prompt}
          variant="primary"
          onSubmit={submitDraft}
          onValueChange={onDraftChange}
        >
          <PromptInput.Shell>
            <PromptInput.Content>
              <PromptInput.TextArea placeholder="Describe the first Pi prompt" />
            </PromptInput.Content>
            <PromptInput.Toolbar>
              <PromptInput.ToolbarEnd>
                <PromptInput.Send aria-label="Submit initial prompt" />
              </PromptInput.ToolbarEnd>
            </PromptInput.Toolbar>
          </PromptInput.Shell>
        </PromptInput>
      </div>
    </section>
  );
}

function checkoutModeLabel(mode: string) {
  if (mode === "foreground-local") {
    return "Foreground local checkout";
  }

  if (mode === "managed-worktree") {
    return "Pig-managed worktree";
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

  return (
    <div className="grid gap-5">
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
  onProjectionChange?: (projection: SessionProjection) => void;
  onLatestMessageRendered?: (sessionId: string) => void;
}) {
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(() =>
    getSessionDraft(projectId),
  );
  const [creationProjection, setCreationProjection] =
    useState<SessionProjection | null>(null);
  const [interactionProjection, setInteractionProjection] =
    useState<SessionProjection | null>(null);
  const [stoppingRun, setStoppingRun] = useState(false);

  useEffect(() => {
    setSessionDraft(getSessionDraft(projectId));
    setCreationProjection(null);
    setInteractionProjection(null);

    return subscribeSessionDrafts(() => {
      setSessionDraft(getSessionDraft(projectId));
    });
  }, [projectId]);

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
    setSessionDraft(saveSessionDraft(projectId, prompt));
  };
  const handleDraftSubmit = async (event: SessionDraftSubmitEvent) => {
    const draft = getSessionDraft(projectId);

    if (!draft) {
      return;
    }

    onDraftSubmit(event);

    const result = await sessionCreator({
      draft,
      project: {
        id: workspace.id,
        repoRoot: workspace.repoRoot,
        projectRoot: workspace.projectRoot,
      },
      onProjectionChange: (projection) => {
        setCreationProjection(projection);
        onProjectionChange?.(projection);
      },
    });

    setCreationProjection(result.projection);
    onProjectionChange?.(result.projection);

    if (result.clearDraft) {
      clearSessionDraft(projectId);
      setSessionDraft(null);
    }
  };
  const commitInteractionProjection = (nextProjection: SessionProjection) => {
    setInteractionProjection(nextProjection);
    onProjectionChange?.(nextProjection);
  };
  const liveProjection =
    interactionProjection ?? creationProjection ?? sessionProjection ?? null;
  const projectionMessages = liveProjection
    ? liveMessagesFromProjection(liveProjection)
    : [];
  const projectionTimeline = liveProjection
    ? runTimelineFromProjection(liveProjection)
    : [];
  const liveMessages = projectionMessages.length
    ? projectionMessages
    : workspace.liveMessages;
  const runTimeline = projectionTimeline.length
    ? projectionTimeline
    : workspace.runTimeline;
  const readOnlyProjection = isReadOnlyProjection(liveProjection);
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
          creationProjection={creationProjection}
          onDraftChange={handleDraftChange}
          onDraftSubmit={(event) => void handleDraftSubmit(event)}
        />
      ) : (
        <>
          {readOnlyProjection ? (
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
                  timeline={
                    message.role === "assistant" && !message.controlLabel
                      ? runTimeline
                      : undefined
                  }
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
