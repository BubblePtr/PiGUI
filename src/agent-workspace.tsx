import { Button, Card, ScrollShadow, Tooltip } from "@heroui/react";
import { ChainOfThought, ChatConversation, ChatMessage, PromptInput, Sheet } from "@heroui-pro/react";
import { Activity, GitBranch } from "lucide-react";
import { useParams, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppFrame } from "./app-shell";
import { createFakePiRuntimeBridge } from "./pi-runtime-bridge";
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
import type { SessionProjection } from "./session-projection";
import { formatCost, formatTokens } from "./sessions";

type LiveMessage = {
  id: string;
  role: "user" | "assistant";
  body: string;
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

export type SessionDraftSubmitEvent = {
  projectId: string;
  prompt: string;
};

type SessionCreatorInput = Omit<CreateSessionFromDraftInput, "bridge" | "projections">;

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
      body: "Project Sessions keep live Pi work separate from Analyze evidence.",
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
      title: "Analyze preserved",
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
          <ChatMessage.Content>{message.body}</ChatMessage.Content>
        </ChatMessage.Bubble>
      </ChatMessage.User>
    );
  }

  return (
    <ChatMessage.Assistant>
      <ChatMessage.Avatar alt="Pi agent" fallback="Pi" />
      <ChatMessage.Body>
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

function FullChatComposer() {
  const [draft, setDraft] = useState("");

  return (
    <div className="shrink-0 px-4 pb-4 pt-3">
      <PromptInput
        className="mx-auto w-full max-w-[44rem]"
        value={draft}
        variant="primary"
        onSubmit={() => setDraft("")}
        onValueChange={setDraft}
      >
        <PromptInput.Shell>
          <PromptInput.Content>
            <PromptInput.TextArea placeholder="What do you want to know?" />
          </PromptInput.Content>
          <PromptInput.Toolbar>
            <PromptInput.ToolbarEnd>
              <PromptInput.Send aria-label="Send" />
            </PromptInput.ToolbarEnd>
          </PromptInput.Toolbar>
        </PromptInput.Shell>
        <PromptInput.Footer>AI can make mistakes. Check important info.</PromptInput.Footer>
      </PromptInput>
    </div>
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
        <h2 className="mb-3 text-sm font-semibold text-foreground">Session Draft</h2>
        {creationProjection ? (
          <div
            aria-live="polite"
            className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            data-testid="session-creation-status"
          >
            {creationProjection.failure ? (
              <>
                <p className="font-medium text-foreground">Session creation failed</p>
                <dl className="mt-2 grid gap-1">
                  <div className="flex items-center gap-2">
                    <dt className="text-muted">Stage</dt>
                    <dd className="font-medium text-foreground">
                      {creationProjection.failure.stage}
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-muted">Error</dt>
                    <dd className="text-foreground">{creationProjection.failure.message}</dd>
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

function SessionActionsContent({ workspace }: { workspace: AgentWorkspaceFixture }) {
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
            <dd className="mt-1 break-words text-foreground">{workspace.checkout.mode}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted">Root</dt>
            <dd className="mt-1 break-words text-foreground">{workspace.checkout.root}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-muted">Runtime cwd</dt>
            <dd className="mt-1 break-words text-foreground">
              {workspace.checkout.runtimeCwd}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground">Model and cost</h3>
        <dl className="mt-3 grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Model</dt>
            <dd className="min-w-0 truncate text-right font-medium text-foreground">
              {workspace.summary.model}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Cost</dt>
            <dd className="font-medium text-foreground">
              {formatCost(workspace.summary.totalCostUsd)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Tokens</dt>
            <dd className="font-medium text-foreground">
              {formatTokens(workspace.summary.totalTokens)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function SessionActionsSheet({ workspace }: { workspace: AgentWorkspaceFixture }) {
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
                  <SessionActionsContent workspace={workspace} />
                </ScrollShadow>
              </Sheet.Body>
            </Sheet.Dialog>
          </Sheet.Content>
        </Sheet.Backdrop>
      </Sheet>
    </>
  );
}

function LiveSessionColumn({
  workspace,
  projectId,
  showDraft,
  onDraftSubmit,
  sessionCreator,
}: {
  workspace: AgentWorkspaceFixture;
  projectId: string;
  showDraft: boolean;
  onDraftSubmit: (event: SessionDraftSubmitEvent) => void;
  sessionCreator: SessionCreator;
}) {
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(() =>
    getSessionDraft(projectId),
  );
  const [creationProjection, setCreationProjection] = useState<SessionProjection | null>(
    null,
  );

  useEffect(() => {
    setSessionDraft(getSessionDraft(projectId));
    setCreationProjection(null);

    return subscribeSessionDrafts(() => {
      setSessionDraft(getSessionDraft(projectId));
    });
  }, [projectId]);

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
      onProjectionChange: setCreationProjection,
    });

    setCreationProjection(result.projection);

    if (result.clearDraft) {
      clearSessionDraft(projectId);
      setSessionDraft(null);
    }
  };
  const runtimeMessages = creationProjection?.runtimeEvents.map((event) => ({
    id: event.id,
    role: event.role,
    body: event.body,
  }));
  const liveMessages = runtimeMessages?.length ? runtimeMessages : workspace.liveMessages;

  return (
    <main className="h-full min-h-0 min-w-0" data-testid="live-session-column">
      <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">
          {showDraft && sessionDraft ? (
            <SessionDraftComposer
              draft={sessionDraft}
              creationProjection={creationProjection}
              onDraftChange={handleDraftChange}
              onDraftSubmit={(event) => void handleDraftSubmit(event)}
            />
          ) : (
            <>
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
                      timeline={message.role === "assistant" ? workspace.runTimeline : undefined}
                    />
                  ))}
                  <ChatConversation.ScrollAnchor />
                </ChatConversation.Content>
              </ChatConversation>

              <FullChatComposer />
            </>
          )}
        </div>
      </Card>
    </main>
  );
}

export function AgentWorkspaceSessionsView({
  projectId = fixtureWorkspace.id,
  showDraft = false,
  workspace = fixtureWorkspace,
  onDraftSubmit = () => {},
  sessionCreator,
}: {
  projectId?: string;
  showDraft?: boolean;
  workspace?: AgentWorkspaceFixture;
  onDraftSubmit?: (event: SessionDraftSubmitEvent) => void;
  sessionCreator?: SessionCreator;
}) {
  const [defaultSessionCreator] = useState<SessionCreator>(() => {
    const bridge = createFakePiRuntimeBridge();
    const projections = createInMemorySessionProjectionStore();

    return (input: SessionCreatorInput) =>
      createSessionFromDraft({
        ...input,
        bridge,
        projections,
      });
  });

  return (
    <article
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-6 py-6"
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

  return (
    <AppFrame toolbarActions={<SessionActionsSheet workspace={workspace} />}>
      <AgentWorkspaceSessionsView
        projectId={projectId}
        showDraft={showDraft}
        workspace={workspace}
      />
    </AppFrame>
  );
}
