import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentWorkspaceSessionsPage,
  AgentWorkspaceSessionsView,
  SessionActionsContent,
} from "@/pages/agent-workspace";
import { addProjectToRegistry } from "@/entities/project/project-registry";
import { PiRuntimeBridgeError } from "@/entities/runtime/pi-runtime-bridge";
import { createInMemoryPiRuntimeBridge } from "@/entities/runtime/in-memory-pi-runtime-bridge";
import { createExecutionCheckoutManager } from "@/entities/checkout/execution-checkout";
import {
  createInMemorySessionProjectionStore,
  createSessionFromDraft,
} from "@/entities/session/session-creation";
import { applySessionProjectionEvent, createSessionProjection } from "@/entities/session/session-projection";
import { getFollowUpDraft, saveFollowUpDraft } from "@/entities/session/follow-up-drafts";
import { getSessionDraft, saveSessionDraft } from "@/entities/session/session-drafts";

vi.mock("@heroui-pro/react/markdown", () => ({
  Markdown: ({ children }: { children: string }) => (
    <div data-testid="markdown-renderer">{children}</div>
  ),
  StreamMarkdown: ({
    children,
    isStreaming,
  }: {
    children: string;
    isStreaming?: boolean;
  }) => (
    <div data-is-streaming={String(Boolean(isStreaming))} data-testid="stream-markdown-renderer">
      {children}
    </div>
  ),
}));

vi.mock("@heroui-pro/react/chat-tool", () => ({
  ChatTool: ({
    argsText,
    output,
    state,
    toolName,
    triggerPrefix,
  }: {
    argsText?: string;
    output?: unknown;
    state: string;
    toolName?: string;
    triggerPrefix?: string;
  }) => (
    <div data-slot="chat-tool" data-state={state}>
      <div data-slot="chat-tool-trigger">
        {triggerPrefix}
        {toolName}
      </div>
      {argsText ? <div data-slot="chat-tool-args">{argsText}</div> : null}
      {output !== undefined ? (
        <div data-slot="chat-tool-result">
          {typeof output === "string" ? output : JSON.stringify(output)}
        </div>
      ) : null}
    </div>
  ),
}));

const pigProjectPath = "/Users/void/code/opensource/Pig";
const studyProjectPath = "/Users/void/Documents/study";

function renderProjectSessions(
  path = "/projects/pig/sessions",
  { seedProjects = true }: { seedProjects?: boolean } = {},
) {
  if (seedProjects) {
    addProjectToRegistry(pigProjectPath, {
      now: () => "2026-06-30T08:00:00.000Z",
    });
  }

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/sessions",
    component: AgentWorkspaceSessionsPage,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([sessionsRoute]),
  });

  return render(<RouterProvider router={router} />);
}

async function chooseProjectFromPicker(
  user: ReturnType<typeof userEvent.setup>,
  projectName: string,
) {
  await user.click(screen.getByTestId("project-picker-trigger"));
  await user.click(await screen.findByRole("option", { name: projectName }));
}

describe("AgentWorkspaceSessionsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete (
      window as typeof window & {
        __PIGUI_ENABLE_BROWSER_DEVELOPMENT_MOCKS__?: boolean;
      }
    ).__PIGUI_ENABLE_BROWSER_DEVELOPMENT_MOCKS__;
  });

  it("renders a Project-scoped Sessions view with Live Chat and the action surface", async () => {
    const user = userEvent.setup();

    const { container } = renderProjectSessions();

    const sessionsView = await screen.findByTestId("project-sessions-view");

    expect(within(sessionsView).queryByText("Project Workspace")).not.toBeInTheDocument();
    expect(within(sessionsView).queryByText(/Pig keeps live Pi work/)).not.toBeInTheDocument();
    expect(within(sessionsView).queryByText("Live Session View")).not.toBeInTheDocument();
    expect(within(sessionsView).queryByText(/Messages and run activity/)).not.toBeInTheDocument();

    const liveColumn = screen.getByTestId("live-session-column");
    const navbarActions = screen.getByTestId("navbar-actions");

    const source = readFileSync(join(process.cwd(), "apps/desktop/src/pages/agent-workspace.tsx"), "utf8");

    expect(source).toContain(
      "Project Sessions keep live Pi work separate from Trace and Usage evidence.",
    );
    expect(source).not.toContain("Analyze evidence");
    expect(within(liveColumn).queryByText("Evidence preserved")).not.toBeInTheDocument();
    expect(within(liveColumn).queryByText("Analyze preserved")).not.toBeInTheDocument();

    expect(screen.getByTestId("sidebar-projects")).toBeInTheDocument();
    expect(
      within(sessionsView).queryByTestId("project-session-list-column"),
    ).not.toBeInTheDocument();
    expect(
      within(sessionsView).queryByTestId("structured-action-surface-column"),
    ).not.toBeInTheDocument();
    expect(within(liveColumn).queryByRole("heading", { name: "Live Chat" })).not.toBeInTheDocument();
    expect(within(liveColumn).queryByRole("heading", { name: "Run timeline" })).not.toBeInTheDocument();
    expect(within(liveColumn).queryByRole("button", { name: "Session actions" })).not.toBeInTheDocument();
    expect(liveColumn).toHaveClass("h-full");
    expect(sessionsView).toHaveClass("pt-6", "pb-0");
    expect(sessionsView).not.toHaveClass("py-6");
    const sessionActionsButton = within(navbarActions).getByRole("button", {
      name: "Session actions",
    });
    const chatConversation = liveColumn.querySelector('[data-slot="chat-conversation"]');
    const promptInput = liveColumn.querySelector('[data-slot="prompt-input"]');
    const composer = liveColumn.querySelector('[data-testid="full-chat-composer"]');
    const liveComposerInput = within(liveColumn).getByPlaceholderText(
      "What do you want to know?",
    );
    const traceSidebarLabel = within(screen.getByRole("row", { name: "Trace" }))
      .getByText("Trace")
      .closest('[data-slot="sidebar-menu-label"]');
    const newSessionSidebarLabel = within(
      screen.getByLabelText("Trace and usage navigation"),
    )
      .getByText("New Session")
      .closest('[data-slot="sidebar-menu-label"]');

    expect(sessionActionsButton).toBeInTheDocument();
    expect(container.querySelector('[data-slot="navbar-spacer"]')).toHaveAttribute(
      "data-window-drag-region",
    );
    expect(chatConversation).toBeInTheDocument();
    expect(chatConversation?.closest(".card")).toBeNull();
    expect(promptInput?.closest(".card")).toBeNull();
    expect(chatConversation).toHaveAttribute("role", "log");
    expect(traceSidebarLabel).not.toHaveClass("font-medium");
    expect(newSessionSidebarLabel).not.toHaveClass("font-medium");
    expect(liveComposerInput).not.toHaveClass("font-medium");
    expect(
      liveColumn.querySelector('[data-slot="chat-conversation-content"]'),
    ).toBeInTheDocument();
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-user"]')).toHaveLength(1);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-assistant"]')).toHaveLength(1);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-bubble"]')).toHaveLength(1);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-body"]')).toHaveLength(1);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-content"]')).toHaveLength(2);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-avatar"]')).toHaveLength(1);
    const assistantMessage = liveColumn.querySelector(
      '[data-slot="chat-message-assistant"]',
    );
    const assistantTrace = assistantMessage?.querySelector(
      '[data-slot="chain-of-thought"]',
    );
    const assistantContent = assistantMessage?.querySelector(
      '[data-slot="chat-message-content"]',
    );
    expect(assistantTrace).not.toBeInTheDocument();
    expect(assistantContent).toBeInTheDocument();
    expect(liveColumn.querySelectorAll('[data-slot="chain-of-thought-step"]')).toHaveLength(0);
    expect(within(liveColumn).queryByText("Project context loaded")).not.toBeInTheDocument();
    expect(promptInput).toBeInTheDocument();
    expect(composer).toBeInTheDocument();
    expect(composer).toHaveClass("mt-auto", "pb-3");
    expect(liveColumn.querySelector('[data-slot="prompt-input-shell"]')).toBeInTheDocument();
    expect(liveColumn.querySelector('[data-slot="prompt-input-textarea"]')).toBeInTheDocument();
    expect(liveColumn.querySelector('[data-slot="prompt-input-send"]')).toBeInTheDocument();
    expect(promptInput).toHaveAttribute("data-status", "streaming");
    expect(within(liveColumn).getByPlaceholderText("What do you want to know?")).not.toBeDisabled();
    expect(within(liveColumn).getByRole("button", { name: "Steer" })).toBeInTheDocument();
    expect(within(liveColumn).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(within(liveColumn).queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(
      within(liveColumn).queryByText("Queue is the default while Pi is running."),
    ).not.toBeInTheDocument();
    expect(within(navbarActions).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Session actions" })).not.toBeInTheDocument();

    await user.click(sessionActionsButton);

    const actionDialog = await screen.findByRole("dialog", { name: "Session actions" });
    const sheetContent = document.querySelector('[data-slot="sheet-content"]');

    expect(sheetContent).toHaveStyle({
      animation: "none",
      transform: "translate3d(0, 0, 0)",
    });
    expect(within(actionDialog).getByText("Diff summary")).toBeInTheDocument();
    expect(within(actionDialog).getByText("Checkout")).toBeInTheDocument();
    expect(within(actionDialog).getByText("gpt-5-codex")).toBeInTheDocument();
    expect(within(actionDialog).getByText("$0.042137")).toBeInTheDocument();
  });

  it("shows an empty Workspace state until a Project is added manually", async () => {
    renderProjectSessions("/projects/pig/sessions", { seedProjects: false });

    expect(await screen.findByTestId("empty-workspace-state")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "No Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Project" })).toBeInTheDocument();
    expect(screen.queryByText("Agent Workspace shell")).not.toBeInTheDocument();
  });

  it("uses browser development Project data for plain-browser draft debugging", async () => {
    (
      window as typeof window & {
        __PIGUI_ENABLE_BROWSER_DEVELOPMENT_MOCKS__?: boolean;
      }
    ).__PIGUI_ENABLE_BROWSER_DEVELOPMENT_MOCKS__ = true;

    renderProjectSessions("/projects/pig/sessions?view=draft", {
      seedProjects: false,
    });

    const draftComposer = await screen.findByTestId("session-draft-composer");
    const projectNavigation = screen.getByTestId("sidebar-projects");
    const projectPickerTrigger = screen.getByTestId("project-picker-trigger");

    expect(within(projectNavigation).getByText("Pig")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-workspace-state")).not.toBeInTheDocument();
    expect(within(draftComposer).getByPlaceholderText("Do anything with Pi")).toHaveValue("");
    expect(projectPickerTrigger).toHaveTextContent("Pig");
    expect(getSessionDraft()).toBeNull();
    expect(window.localStorage.getItem("pigui.projectRegistry.v1")).toBeNull();

    delete (
      window as typeof window & {
        __PIGUI_ENABLE_BROWSER_DEVELOPMENT_MOCKS__?: boolean;
      }
    ).__PIGUI_ENABLE_BROWSER_DEVELOPMENT_MOCKS__;
  });

  it("does not expose deferred terminal, file tree, or abort placeholders", async () => {
    renderProjectSessions();

    const sessionsView = await screen.findByTestId("project-sessions-view");

    expect(within(sessionsView).queryByText(/terminal/i)).not.toBeInTheDocument();
    expect(within(sessionsView).queryByText(/file tree|file explorer/i)).not.toBeInTheDocument();
    expect(within(sessionsView).queryByText("Abort")).not.toBeInTheDocument();
  });

  it("disables archive for the selected active run in the action surface", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    await user.click(await screen.findByRole("button", { name: "Session actions" }));

    const actionDialog = await screen.findByRole("dialog", { name: "Session actions" });
    const archiveButton = within(actionDialog).getByRole("button", {
      name: "Archive Session",
    });

    expect(archiveButton).toBeDisabled();
    expect(
      within(actionDialog).getByText("Active runs cannot be archived."),
    ).toBeInTheDocument();
  });

  it("uses the sidebar-selected Session for toolbar actions", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    const projectNavigation = await screen.findByLabelText("Pig project sessions");

    await user.click(
      within(projectNavigation).getByRole("row", {
        name: "Trace boundary pass",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Session actions" }));

    const actionDialog = await screen.findByRole("dialog", { name: "Session actions" });
    const archiveButton = within(actionDialog).getByRole("button", {
      name: "Archive Session",
    });

    expect(archiveButton).toBeEnabled();
    expect(
      within(actionDialog).queryByText("Active runs cannot be archived."),
    ).not.toBeInTheDocument();
  });

  it("stops the selected active run from the composer and unlocks archive", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    const liveColumn = await screen.findByTestId("live-session-column");

    expect(within(liveColumn).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(
      within(screen.getByTestId("navbar-actions")).queryByRole("button", { name: "Stop" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Abort")).not.toBeInTheDocument();

    await user.click(within(liveColumn).getByRole("button", { name: "Stop" }));

    const liveChat = await screen.findByLabelText("Live Chat messages");

    await waitFor(() => {
      expect(within(liveColumn).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    });
    expect(within(liveChat).queryByText("Stopped")).not.toBeInTheDocument();
    expect(
      within(liveChat).queryByText("Pi stopped the active run."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Session actions" }));

    const actionDialog = await screen.findByRole("dialog", { name: "Session actions" });

    expect(within(actionDialog).getByRole("button", { name: "Archive Session" })).toBeEnabled();
    expect(
      within(actionDialog).queryByText("Active runs cannot be archived."),
    ).not.toBeInTheDocument();
  });

  it("stops a draft-created Session without appending a runtime status message", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    await user.click(await screen.findByRole("row", { name: "New Session" }));
    await chooseProjectFromPicker(user, "Pig");
    fireEvent.change(await screen.findByPlaceholderText("Do anything with Pi"), {
      target: { value: "Create a draft-backed active Session" },
    });
    await user.click(screen.getByRole("button", { name: "Submit initial prompt" }));
    expect(
      await within(screen.getByTestId("live-session-column")).findByRole("button", {
        name: "Stop",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Queue is the default while Pi is running."),
    ).not.toBeInTheDocument();

    await user.click(
      within(screen.getByTestId("live-session-column")).getByRole("button", { name: "Stop" }),
    );

    const liveChat = await screen.findByLabelText("Live Chat messages");

    await waitFor(() => {
      expect(
        within(screen.getByTestId("live-session-column")).queryByRole("button", {
          name: "Stop",
        }),
      ).not.toBeInTheDocument();
    });
    expect(within(liveChat).queryByText("Stopped")).not.toBeInTheDocument();
    expect(
      within(liveChat).queryByText("Pi stopped the active run."),
    ).not.toBeInTheDocument();
  });

  it("records stop failure in Live Chat without unlocking active archive", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      failAt: "stop-run",
      failureMessage: "Pi rejected the stop request.",
    });
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "active-session",
        projectId: "pig-docs",
        initialPrompt: "Keep working on the live run",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-active",
        piSessionId: "pi-session-active",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-active-user",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "user",
        body: "Keep working on the live run",
        timestamp: "2026-06-26T08:00:02.000Z",
      },
    });

    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "active-session",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "gpt-5-codex",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    function StopFailureHarness() {
      const [currentProjection, setCurrentProjection] = useState(projection);

      return (
        <>
          <AgentWorkspaceSessionsView
            projectId="pig-docs"
            runtimeBridge={bridge}
            sessionProjection={currentProjection}
            workspace={workspace}
            onProjectionChange={setCurrentProjection}
          />
        </>
      );
    }

    render(<StopFailureHarness />);

    await user.click(
      within(screen.getByTestId("live-session-column")).getByRole("button", { name: "Stop" }),
    );

    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(await within(liveChat).findByText("Stop failed")).toBeInTheDocument();
    expect(within(liveChat).getByText("Pi rejected the stop request.")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("live-session-column")).getByRole("button", { name: "Stop" }),
    ).toBeInTheDocument();
  });

  it("clears unread results after the selected Session content is rendered", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    const projectNavigation = await screen.findByLabelText("Pig project sessions");
    const unreadRow = within(projectNavigation).getByRole("row", {
      name: "Trace boundary pass",
    });

    expect(within(unreadRow).getByLabelText("Unread result")).toBeInTheDocument();

    await user.click(unreadRow);

    expect(
      within(screen.getByLabelText("Live Chat messages")).getByText("Trace boundary pass"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(
          within(projectNavigation).getByRole("row", {
            name: "Trace boundary pass",
          }),
        ).queryByLabelText("Unread result"),
      ).not.toBeInTheDocument();
    });
  });

  it("does not leak implementation placeholder copy into the product UI", async () => {
    renderProjectSessions();

    const sessionsView = await screen.findByTestId("project-sessions-view");

    expect(
      within(sessionsView).queryByText(
        /fixture|slice|not connected|future slices|projection|CONTEXT\.md|PRD|ADR/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("creates default Sessions through the runtime bridge factory instead of a fake bridge", () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/pages/agent-workspace.tsx"), "utf8");

    expect(source).toContain("createDefaultPiRuntimeBridge");
    expect(source).not.toContain("createInMemoryPiRuntimeBridge");
  });

  it("renders completion and failure results inside Live Chat", async () => {
    render(
      <AgentWorkspaceSessionsView
        projectId="pig-results"
        workspace={{
          id: "pig-results",
          name: "Pig Results",
          projectRoot: "/Users/void/code/opensource/Pig",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "session-results",
          liveMessages: [
            {
              id: "message-completed",
              role: "assistant",
              body: "Run completed. Projection list now uses unread result state.",
            },
            {
              id: "message-failed",
              role: "assistant",
              body: "Run failed. The runtime stream disconnected.",
            },
          ],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(
      within(liveChat).getByText("Run completed. Projection list now uses unread result state."),
    ).toBeInTheDocument();
    expect(
      within(liveChat).getByText("Run failed. The runtime stream disconnected."),
    ).toBeInTheDocument();
  });

  it("queues default active-run input in a pending area without adding it to Live Chat", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-06-26T08:10:00.000Z",
    });
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "active-session",
        projectId: "pig-docs",
        initialPrompt: "Keep working on the live run",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-active",
        piSessionId: "pi-session-active",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-active-user",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "user",
        body: "Keep working on the live run",
        timestamp: "2026-06-26T08:00:02.000Z",
      },
    });
    await bridge.restoreSessionState({
      piSessionId: "pi-session-active",
      runtimeId: "runtime-active",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "running",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={bridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "active-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    const liveChat = await screen.findByLabelText("Live Chat messages");
    const liveColumn = screen.getByTestId("live-session-column");

    expect(within(liveColumn).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText("What do you want to know?"),
      "After this, update the queue tests.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const pendingQueue = await screen.findByTestId("queued-message-list");

    expect(within(pendingQueue).getByText("Queued")).toBeInTheDocument();
    expect(
      within(pendingQueue).getByText("After this, update the queue tests."),
    ).toBeInTheDocument();
    expect(within(liveChat).getAllByText("Keep working on the live run")).toHaveLength(1);
    expect(
      within(liveChat).queryByText("After this, update the queue tests."),
    ).not.toBeInTheDocument();
    expect(getFollowUpDraft("active-session")).toBeNull();

    await user.click(within(pendingQueue).getByRole("button", { name: "Withdraw queued message" }));

    expect(await within(pendingQueue).findByText("Withdrawn")).toBeInTheDocument();
  });

  it("shows an ephemeral assistant placeholder while a run has no assistant events yet", async () => {
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "starting-session",
        projectId: "pig-docs",
        initialPrompt: "Look at the current project",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-starting",
        piSessionId: "pi-session-starting",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-starting-user",
        piSessionId: "pi-session-starting",
        kind: "message",
        role: "user",
        body: "Look at the current project",
        timestamp: "2026-06-26T08:00:02.000Z",
      },
    });

    render(
      <AgentWorkspaceSessionsView
        clockNowMs={Date.parse("2026-06-26T08:00:03.000Z")}
        projectId="pig-docs"
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "starting-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    const liveColumn = await screen.findByTestId("live-session-column");
    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(within(liveChat).getByText("Look at the current project")).toBeInTheDocument();
    expect(within(liveChat).getByText("Pi is contacting the model...")).toBeInTheDocument();
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-assistant"]')).toHaveLength(1);
    expect(within(liveColumn).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("surfaces a stalled first model response in the main chat", async () => {
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "starting-session",
        projectId: "pig-docs",
        initialPrompt: "Check whether DeepSeek responds",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-starting",
        piSessionId: "pi-session-starting",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-starting-user",
        piSessionId: "pi-session-starting",
        kind: "message",
        role: "user",
        body: "Check whether DeepSeek responds",
        timestamp: "2026-06-26T08:00:02.000Z",
      },
    });

    render(
      <AgentWorkspaceSessionsView
        clockNowMs={Date.parse("2026-06-26T08:00:18.000Z")}
        projectId="pig-docs"
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "starting-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "deepseek-v4-pro",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(
      within(liveChat).getByText(
        "Still waiting for the model response. The provider has not returned a first chunk yet.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });

  it("submits ordinary prompts to an idle Session instead of queuing them", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-06-26T08:12:00.000Z",
    });
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "waiting-session",
        projectId: "pig-docs",
        initialPrompt: "Review the first result",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-waiting",
        piSessionId: "pi-session-waiting",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-state-resynced",
      state: {
        piSessionId: "pi-session-waiting",
        runtimeId: "runtime-waiting",
        projectId: "pig-docs",
        cwd: "/Users/void/code/opensource/Pig/docs",
        status: "idle",
        events: [
          {
            id: "runtime-event-initial",
            piSessionId: "pi-session-waiting",
            kind: "message",
            role: "user",
            body: "Review the first result",
            timestamp: "2026-06-26T08:00:02.000Z",
          },
          {
            id: "runtime-event-assistant",
            piSessionId: "pi-session-waiting",
            kind: "message",
            role: "assistant",
            body: "The first result is ready.",
            timestamp: "2026-06-26T08:00:03.000Z",
          },
        ],
        updatedAt: "2026-06-26T08:00:03.000Z",
      },
    });
    await bridge.restoreSessionState({
      piSessionId: "pi-session-waiting",
      runtimeId: "runtime-waiting",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "idle",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={bridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "waiting-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Steer" })).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("What do you want to know?"),
      "Continue from the idle Session",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(
      await within(liveChat).findByText("Continue from the idle Session"),
    ).toBeInTheDocument();
    expect(getFollowUpDraft("waiting-session")).toBeNull();
    expect(screen.queryByTestId("queued-message-list")).not.toBeInTheDocument();
  });

  it("keeps the composer available after a completed run for follow-up prompts", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-06-26T08:20:00.000Z",
    });
    const projection = {
      ...createSessionProjection({
        id: "completed-session",
        projectId: "pig-docs",
        initialPrompt: "Review the first result",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "completed" as const,
      creationStage: "accepted" as const,
      runtimeId: "runtime-completed",
      piSessionId: "pi-session-completed",
      runtimeEvents: [
        {
          id: "runtime-event-initial",
          piSessionId: "pi-session-completed",
          kind: "message" as const,
          role: "user" as const,
          body: "Review the first result",
          timestamp: "2026-06-26T08:00:02.000Z",
        },
        {
          id: "runtime-event-assistant",
          piSessionId: "pi-session-completed",
          kind: "message" as const,
          role: "assistant" as const,
          body: "The first result is ready.",
          timestamp: "2026-06-26T08:00:03.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:03.000Z",
    };
    await bridge.restoreSessionState({
      piSessionId: "pi-session-completed",
      runtimeId: "runtime-completed",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "completed",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={bridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "completed-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Steer" })).not.toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText("What do you want to know?"),
      "Continue after completion",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(
      await within(liveChat).findByText("Continue after completion"),
    ).toBeInTheDocument();
    expect(getFollowUpDraft("completed-session")).toBeNull();
  });

  it("restores a per-Session Follow-up Draft without showing a Project selector", async () => {
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "waiting-session",
        projectId: "pig-docs",
        initialPrompt: "Review the first result",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-waiting",
        piSessionId: "pi-session-waiting",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-state-resynced",
      state: {
        piSessionId: "pi-session-waiting",
        runtimeId: "runtime-waiting",
        projectId: "pig-docs",
        cwd: "/Users/void/code/opensource/Pig/docs",
        status: "idle",
        events: projection.runtimeEvents,
        updatedAt: "2026-06-26T08:00:03.000Z",
      },
    });
    saveFollowUpDraft("waiting-session", "Resume from the saved composer");

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "waiting-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    expect(await screen.findByPlaceholderText("What do you want to know?")).toHaveValue(
      "Resume from the saved composer",
    );
    expect(screen.queryByLabelText("Target Project")).not.toBeInTheDocument();
  });

  it("steers an active run as a Live Chat control event instead of a queued message", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-06-26T08:10:00.000Z",
    });
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "active-session",
        projectId: "pig-docs",
        initialPrompt: "Keep working on the live run",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-active",
        piSessionId: "pi-session-active",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-active-user",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "user",
        body: "Keep working on the live run",
        timestamp: "2026-06-26T08:00:02.000Z",
      },
    });
    await bridge.restoreSessionState({
      piSessionId: "pi-session-active",
      runtimeId: "runtime-active",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "running",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={bridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "active-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(screen.getByRole("button", { name: "Steer" })).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("What do you want to know?"),
      "Avoid changing the archive model.",
    );
    await user.click(screen.getByRole("button", { name: "Steer" }));

    expect(await within(liveChat).findByText("Steer")).toBeInTheDocument();
    expect(
      within(liveChat).getByText("Avoid changing the archive model."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("queued-message-list")).not.toBeInTheDocument();
  });

  it("keeps steer text editable and shows a recoverable error when steer fails", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge();
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "active-session",
        projectId: "pig-docs",
        initialPrompt: "Keep working on the live run",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-active",
        piSessionId: "pi-session-active",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-active-user",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "user",
        body: "Keep working on the live run",
        timestamp: "2026-06-26T08:00:02.000Z",
      },
    });
    await bridge.restoreSessionState({
      piSessionId: "pi-session-active",
      runtimeId: "runtime-active",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "running",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });
    bridge.steerRun = vi.fn().mockRejectedValue(
      new PiRuntimeBridgeError({
        stage: "steering run",
        message: "Pi rejected steer input.",
      }),
    );

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={bridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "active-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    const input = screen.getByPlaceholderText("What do you want to know?");

    await user.type(input, "Keep this steer text");
    await user.click(screen.getByRole("button", { name: "Steer" }));

    expect(await screen.findByText("Pi rejected steer input.")).toBeInTheDocument();
    expect(input).toHaveValue("Keep this steer text");
    expect(getFollowUpDraft("active-session")?.message).toBe("Keep this steer text");
  });

  it("opens a global Session Draft from New Session without adding a Project row", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    const projectNavigation = await screen.findByLabelText("Pig project sessions");
    const traceUsageNavigation = screen.getByLabelText("Trace and usage navigation");
    const initialRows = within(projectNavigation).getAllByRole("row");

    await user.click(within(traceUsageNavigation).getByRole("row", { name: "New Session" }));

    const draftComposer = await screen.findByTestId("session-draft-composer");
    const emptyState = within(draftComposer).getByTestId("session-draft-empty-state");
    const draftTitle = within(draftComposer).getByRole("heading", {
      name: "Build something useful with PiGUI",
    });
    const shimmerText = within(draftTitle).getByText("PiGUI");
    const suggestionRoot = emptyState.querySelector('[data-slot="prompt-suggestion"]');
    const suggestionItems = emptyState.querySelector(
      '[data-slot="prompt-suggestion-items"]',
    );
    const suggestedPrompt = "Design a launch page";
    const suggestedLabels = [
      "Design a launch page",
      "Summarize meeting notes",
      "Generate a sound brief",
      "Plan a data model",
    ];
    const suggestedAction = within(draftComposer).getByRole("button", {
      name: suggestedPrompt,
    });
    const draftPrompt = within(draftComposer).getByPlaceholderText(
      "Do anything with Pi",
    );
    const promptInput = draftPrompt.closest('[data-slot="prompt-input"]');
    const promptInputShell = promptInput?.querySelector(
      '[data-slot="prompt-input-shell"]',
    );
    const projectPicker = within(draftComposer).getByTestId(
      "session-draft-project-picker",
    );
    const projectPickerControl = within(projectPicker).getByTestId("project-picker");
    const projectPickerTrigger = within(projectPickerControl).getByTestId(
      "project-picker-trigger",
    );
    const projectPickerLabel = within(projectPickerTrigger).getByTestId(
      "project-picker-label",
    );
    const projectPickerIcon = within(projectPickerControl).getByTestId(
      "project-picker-folder-icon",
    );
    const inlineProjectSelect = projectPicker.querySelector(
      '[data-slot="inline-select"]',
    );
    const inlineProjectIndicator = projectPicker.querySelector(
      ".inline-select__indicator",
    );
    const nativeProjectSelect = projectPicker.querySelector(
      '[data-slot="native-select"]',
    );

    expect(draftComposer).toHaveClass("items-center", "justify-center");
    expect(emptyState).toHaveClass("max-w-[46rem]");
    expect(draftComposer.closest(".card")).toBeNull();
    expect(suggestionRoot).toHaveClass("prompt-suggestion--pill");
    expect(suggestionItems).toHaveClass("prompt-suggestion__items--pill");
    expect(suggestionRoot?.querySelector(".prompt-suggestion__item-end-icon")).toBeNull();
    if (!promptInput || !promptInputShell || !suggestionRoot) {
      throw new Error("Session Draft composer layout is incomplete.");
    }
    expect(promptInputShell).toHaveClass(
      "border",
      "border-border",
      "bg-surface",
      "shadow-surface",
    );
    expect(
      Boolean(
        promptInput.compareDocumentPosition(suggestionRoot) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(
        promptInput.compareDocumentPosition(projectPickerTrigger) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(
      Boolean(
        projectPickerTrigger.compareDocumentPosition(suggestionRoot) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(projectPicker).toHaveClass("w-full", "justify-start");
    expect(projectPickerControl).not.toHaveClass("w-[9rem]");
    expect(projectPickerControl).not.toHaveClass(
      "w-[clamp(7rem,calc(var(--project-picker-label-ch)*1ch+4.75rem),16rem)]",
    );
    expect(projectPickerControl).not.toHaveAttribute("style");
    expect(projectPickerControl).toContainElement(projectPickerTrigger);
    expect(projectPickerIcon).toHaveAttribute("aria-hidden", "true");
    expect(projectPickerIcon).toHaveClass("text-muted");
    expect(projectPickerLabel).toHaveTextContent("Select Project");
    expect(projectPickerTrigger).toHaveAttribute("aria-label", "Target Project");
    expect(projectPickerTrigger).toHaveClass(
      "inline-flex",
      "w-fit",
      "border-transparent",
      "bg-surface-secondary",
      "text-sm",
      "text-muted",
      "hover:text-foreground",
    );
    expect(inlineProjectSelect).toBeInTheDocument();
    expect(inlineProjectIndicator).toBeInTheDocument();
    expect(nativeProjectSelect).not.toBeInTheDocument();
    expect(
      within(suggestedAction).getByTestId("session-draft-suggestion-icon"),
    ).toBeInTheDocument();
    expect(shimmerText).toHaveAttribute("data-slot", "text-shimmer");
    expect(shimmerText).toHaveClass("text-shimmer");
    expect(shimmerText.parentElement).toHaveClass("text-muted");
    for (const label of suggestedLabels) {
      expect(
        within(draftComposer).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
    expect(suggestionRoot).toHaveClass("max-w-[35rem]");
    expect(
      within(draftComposer).queryByText(
        "Start with a prompt, add files, or pick a suggestion to shape the first response.",
      ),
    ).not.toBeInTheDocument();
    expect(draftTitle).toHaveClass("text-center");
    expect(within(draftComposer).queryByText("HeroUI Pro AI")).not.toBeInTheDocument();
    expect(within(draftComposer).queryByText("Target Project")).not.toBeInTheDocument();
    expect(
      within(draftComposer).queryByText(
        "Start a new Pi Session from a focused prompt.",
      ),
    ).not.toBeInTheDocument();
    expect(within(draftComposer).queryByText("Session Draft")).not.toBeInTheDocument();
    expect(draftPrompt).not.toHaveClass("font-medium");
    expect(projectPickerTrigger).not.toHaveClass("font-medium");
    expect(getSessionDraft()).toMatchObject({
      projectId: null,
      prompt: "",
    });

    await user.click(suggestedAction);

    expect(draftPrompt).toHaveValue(suggestedPrompt);
    expect(getSessionDraft()).toMatchObject({
      projectId: null,
      prompt: suggestedPrompt,
    });
    expect(within(projectNavigation).getAllByRole("row")).toHaveLength(
      initialRows.length,
    );
    expect(
      within(projectNavigation).queryByRole("row", { name: "New Session" }),
    ).not.toBeInTheDocument();
    expect(within(projectNavigation).queryByText("Session Draft")).not.toBeInTheDocument();
  });

  it("only shows the draft composer when draft view is selected", async () => {
    saveSessionDraft("pig", "Keep this draft available");

    renderProjectSessions("/projects/pig/sessions");

    const liveColumn = await screen.findByTestId("live-session-column");

    expect(within(liveColumn).queryByTestId("session-draft-composer")).not.toBeInTheDocument();
    expect(
      within(liveColumn).getAllByText("Agent Workspace shell").length,
    ).toBeGreaterThan(0);
    expect(within(liveColumn).getByPlaceholderText("What do you want to know?")).toBeInTheDocument();
  });

  it("restores the same global draft after repeated New Session clicks and reload", async () => {
    const user = userEvent.setup();
    const firstRender = renderProjectSessions();

    await user.click(await screen.findByRole("row", { name: "New Session" }));
    fireEvent.change(screen.getByPlaceholderText("Do anything with Pi"), {
      target: { value: "Keep this initial prompt" },
    });

    expect(getSessionDraft()).toMatchObject({
      projectId: null,
      prompt: "Keep this initial prompt",
    });

    await user.click(screen.getByRole("row", { name: "New Session" }));

    expect(screen.getByPlaceholderText("Do anything with Pi")).toHaveValue(
      "Keep this initial prompt",
    );

    firstRender.unmount();
    renderProjectSessions("/projects/pig/sessions?view=draft");

    expect(await screen.findByPlaceholderText("Do anything with Pi")).toHaveValue(
      "Keep this initial prompt",
    );
  });

  it("submits the draft through Session Creation, clears the draft, and shows the first runtime event", async () => {
    const user = userEvent.setup();
    const onDraftSubmit = vi.fn();
    const projections = createInMemorySessionProjectionStore();

    saveSessionDraft("pig-docs", "Summarize the docs ADR");
    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        showDraft
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "session-docs-review",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
        onDraftSubmit={onDraftSubmit}
        sessionCreator={(input) =>
          createSessionFromDraft({
            ...input,
            bridge: createInMemoryPiRuntimeBridge({
              now: () => "2026-06-26T08:00:03.000Z",
            }),
            projections,
            idFactory: () => "session-created",
            now: () => "2026-06-26T08:00:00.000Z",
          })
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit initial prompt" }));

    expect(onDraftSubmit).toHaveBeenCalledWith({
      projectId: "pig-docs",
      prompt: "Summarize the docs ADR",
    });
    await waitFor(() => expect(getSessionDraft("pig-docs")).toBeNull());
    expect(screen.queryByTestId("session-draft-composer")).not.toBeInTheDocument();
    expect(screen.getAllByText("Summarize the docs ADR").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Live Chat messages")).toBeInTheDocument();
  });

  it("retargets the global Session Draft from the composer without clearing text", async () => {
    const user = userEvent.setup();

    addProjectToRegistry(pigProjectPath, {
      now: () => "2026-06-30T08:00:00.000Z",
    });
    addProjectToRegistry(studyProjectPath, {
      now: () => "2026-06-30T09:00:00.000Z",
    });
    saveSessionDraft(pigProjectPath, "Keep this prompt while switching target");
    render(
      <AgentWorkspaceSessionsView
        projectId={pigProjectPath}
        showDraft
        workspace={{
          id: pigProjectPath,
          name: "Pig",
          projectRoot: pigProjectPath,
          repoRoot: pigProjectPath,
          selectedSessionId: "session-docs-review",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: pigProjectPath,
            runtimeCwd: pigProjectPath,
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    const promptInput = await screen.findByPlaceholderText("Do anything with Pi");
    const projectPickerTrigger = screen.getByTestId("project-picker-trigger");
    const projectPickerControl = screen.getByTestId("project-picker");

    expect(promptInput).toHaveValue("Keep this prompt while switching target");
    expect(projectPickerTrigger).toHaveTextContent("Pig");
    expect(projectPickerControl).not.toHaveAttribute("style");

    await chooseProjectFromPicker(user, "study");

    expect(promptInput).toHaveValue("Keep this prompt while switching target");
    expect(projectPickerTrigger).toHaveTextContent("study");
    expect(getSessionDraft()).toMatchObject({
      projectId: studyProjectPath,
      prompt: "Keep this prompt while switching target",
    });
  });

  it("submits registry Project drafts without inventing a repoRoot", async () => {
    const user = userEvent.setup();
    type CapturedProject = {
      id: string;
      repoRoot?: string;
      projectRoot: string;
    };
    let capturedProject: CapturedProject | null = null;

    addProjectToRegistry(studyProjectPath, {
      now: () => "2026-06-30T09:00:00.000Z",
    });
    saveSessionDraft(studyProjectPath, "Run notes outside Git");
    render(
      <AgentWorkspaceSessionsView
        projectId={studyProjectPath}
        showDraft
        workspace={{
          id: studyProjectPath,
          name: "study",
          projectRoot: studyProjectPath,
          repoRoot: studyProjectPath,
          selectedSessionId: "session-study-review",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: studyProjectPath,
            runtimeCwd: studyProjectPath,
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
        sessionCreator={async (input) => {
          capturedProject = input.project;

          return {
            ok: false,
            clearDraft: false,
            projection: createSessionProjection({
              id: "session-study-created",
              projectId: input.project.id,
              initialPrompt: input.draft.prompt,
              createdAt: "2026-06-30T08:00:00.000Z",
            }),
          };
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit initial prompt" }));

    await waitFor(() => {
      expect(capturedProject).toMatchObject({
        id: studyProjectPath,
        projectRoot: studyProjectPath,
      });
    });
    expect((capturedProject as CapturedProject | null)?.repoRoot).toBeUndefined();
  });

  it("blocks Session Draft submit when the restored target Project is missing", async () => {
    const user = userEvent.setup();
    const onDraftSubmit = vi.fn();

    addProjectToRegistry(pigProjectPath, {
      now: () => "2026-06-30T08:00:00.000Z",
    });
    saveSessionDraft("/Users/void/DeletedProject", "Keep text after target removal");
    render(
      <AgentWorkspaceSessionsView
        projectId={pigProjectPath}
        showDraft
        workspace={{
          id: pigProjectPath,
          name: "Pig",
          projectRoot: pigProjectPath,
          repoRoot: pigProjectPath,
          selectedSessionId: "session-docs-review",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: pigProjectPath,
            runtimeCwd: pigProjectPath,
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
        onDraftSubmit={onDraftSubmit}
      />,
    );

    expect(await screen.findByPlaceholderText("Do anything with Pi")).toHaveValue(
      "Keep text after target removal",
    );
    expect(screen.getByTestId("project-picker-trigger")).toHaveTextContent(
      "Select Project",
    );

    await user.click(screen.getByRole("button", { name: "Submit initial prompt" }));

    expect(onDraftSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Select a Project before submitting.")).toBeInTheDocument();
    expect(getSessionDraft()).toMatchObject({
      projectId: null,
      prompt: "Keep text after target removal",
    });
  });

  it("queues follow-up input after creating a default active Session", async () => {
    const user = userEvent.setup();

    saveSessionDraft("pig-docs", "Start an active browser-backed Session");
    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        showDraft
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "session-docs-review",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit initial prompt" }));
    expect(
      await within(screen.getByTestId("live-session-column")).findByRole("button", {
        name: "Stop",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Queue is the default while Pi is running."),
    ).not.toBeInTheDocument();

    const liveColumn = screen.getByTestId("live-session-column");

    await user.type(
      within(liveColumn).getByPlaceholderText("What do you want to know?"),
      "Queue this follow-up after creation",
    );
    await user.click(within(liveColumn).getByRole("button", { name: "Send" }));

    const pendingQueue = await screen.findByTestId("queued-message-list");

    expect(within(pendingQueue).getByText("Queued")).toBeInTheDocument();
    expect(
      within(pendingQueue).getByText("Queue this follow-up after creation"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Live Chat messages")).queryByText(
        "Queue this follow-up after creation",
      ),
    ).not.toBeInTheDocument();
  });

  it("uses a managed checkout for default background Session creation when another Session is active", async () => {
    const user = userEvent.setup();
    const projections: Array<ReturnType<typeof createSessionProjection>> = [];
    const createdWorktrees: string[] = [];
    const checkoutManager = createExecutionCheckoutManager({
      worktreesRoot: "/tmp/pig-worktrees",
      gitClient: {
        async isGitRepository() {
          return true;
        },
        async addDetachedWorktree({ checkoutRoot }) {
          createdWorktrees.push(checkoutRoot);
        },
      },
    });
    let activeProjection = applySessionProjectionEvent(
      createSessionProjection({
        id: "active-session",
        projectId: "pig-docs",
        initialPrompt: "Keep the existing Session active",
        createdAt: "2026-06-27T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-active",
        piSessionId: "pi-session-active",
        occurredAt: "2026-06-27T08:00:01.000Z",
      },
    );

    activeProjection = applySessionProjectionEvent(activeProjection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-active-user",
        piSessionId: "pi-session-active",
        kind: "message",
        role: "user",
        body: "Keep the existing Session active",
        timestamp: "2026-06-27T08:00:02.000Z",
      },
    });
    saveSessionDraft("pig-docs", "Run in an isolated background checkout");
    render(
      <AgentWorkspaceSessionsView
        checkoutManager={checkoutManager}
        projectId="pig-docs"
        showDraft
        sessionProjection={activeProjection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/packages/web",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "active-session",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/packages/web",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
        onProjectionChange={(projection) => {
          projections.push(projection);
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit initial prompt" }));

    const createdProjection = await waitFor(() => {
      const latest = projections[projections.length - 1];

      expect(latest?.initialPrompt).toBe("Run in an isolated background checkout");
      expect(latest?.checkout?.mode).toBe("managed-worktree");

      return latest;
    });

    expect(createdProjection?.checkout?.executionCheckoutRoot).toMatch(
      /^\/tmp\/pig-worktrees\/session-/,
    );
    expect(createdProjection?.checkout?.runtimeCwd).toBe(
      `${createdProjection?.checkout?.executionCheckoutRoot}/packages/web`,
    );
    expect(createdWorktrees).toHaveLength(1);
  });

  it("keeps draft text visible and shows failure detail when Session Creation fails", async () => {
    const user = userEvent.setup();
    const projections = createInMemorySessionProjectionStore();

    saveSessionDraft("pig-docs", "Summarize the docs ADR");
    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        showDraft
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "session-docs-review",
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "gpt-5-codex",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
        sessionCreator={(input) =>
          createSessionFromDraft({
            ...input,
            bridge: createInMemoryPiRuntimeBridge({
              failAt: "send-initial-prompt",
              failureMessage: "Pi rejected the initial prompt",
            }),
            projections,
            idFactory: () => "session-failed",
            now: () => "2026-06-26T08:00:00.000Z",
          })
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit initial prompt" }));

    expect(await screen.findByText("Session creation failed")).toBeInTheDocument();
    expect(screen.getByText("sending prompt")).toBeInTheDocument();
    expect(screen.getByText("Pi rejected the initial prompt")).toBeInTheDocument();
    expect(getSessionDraft("pig-docs")?.prompt).toBe("Summarize the docs ADR");
    expect(screen.getByPlaceholderText("Do anything with Pi")).toHaveValue(
      "Summarize the docs ADR",
    );
  });

  it("renders completed Projection data with follow-up composer and without a runtime-unavailable warning", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = {
      id: "session-1",
      projectId: "pig-docs",
      initialPrompt: "Create a real Pi RPC-backed session",
      status: "completed" as const,
      creationStage: "accepted" as const,
      checkout: {
        mode: "foreground-local" as const,
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      runtimeEvents: [
        {
          id: "runtime-event-user",
          piSessionId: "pi-session-rpc",
          kind: "message" as const,
          role: "user" as const,
          body: "Create a real Pi RPC-backed session",
          timestamp: "2026-06-26T08:00:00.000Z",
        },
        {
          id: "runtime-event-assistant",
          piSessionId: "pi-session-rpc",
          kind: "message" as const,
          role: "assistant" as const,
          body: "Live session is ready.",
          timestamp: "2026-06-26T08:00:04.000Z",
        },
        {
          id: "runtime-event-tool",
          piSessionId: "pi-session-rpc",
          kind: "tool-call" as const,
          title: "read",
          body: "{\"path\":\"AGENTS.md\"}",
          timestamp: "2026-06-26T08:00:05.000Z",
        },
      ],
      queuedMessages: [],
      summary: {
        provider: "openai",
        model: "gpt-5-codex",
        totalTokens: 1280,
        totalCostUsd: 0.012345,
      },
      stale: false,
      staleReason: null,
      failure: null,
      unreadResult: false,
      archivedAt: null,
      createdAt: "2026-06-26T08:00:00.000Z",
      updatedAt: "2026-06-26T08:00:05.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    expect(screen.queryByTestId("runtime-fallback-banner")).not.toBeInTheDocument();
    expect(screen.getByText("Create a real Pi RPC-backed session")).toBeInTheDocument();
    expect(screen.getByText("Live session is ready.")).toBeInTheDocument();
    expect(screen.getByText("Tool: read")).toBeInTheDocument();
    expect(screen.getByText("Used tool: read")).toBeInTheDocument();
    expect(screen.getByText("{\"path\":\"AGENTS.md\"}")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("What do you want to know?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    render(<SessionActionsContent workspace={workspace} projection={projection} />);

    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("$0.012345")).toBeInTheDocument();
    expect(screen.getByText("1.3K")).toBeInTheDocument();
  });

  it("shows the runtime-unavailable warning for stale Projection data without hiding the composer", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "Continue a stale session",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "running" as const,
      stale: true,
      staleReason: "runtime event stream disconnected",
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      updatedAt: "2026-06-26T08:00:05.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    expect(screen.getByTestId("runtime-fallback-banner")).toHaveTextContent(
      "Runtime unavailable",
    );
    expect(screen.getByTestId("full-chat-composer")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("What do you want to know?")).toBeInTheDocument();
  });

  it("renders one assistant bubble for read-only streaming updates with the same message identity", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "测试一下",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "completed" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      runtimeEvents: [
        {
          id: "runtime-event-assistant-1",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: "我们",
          timestamp: "2026-06-26T08:00:01.000Z",
        },
        {
          id: "runtime-event-assistant-2",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: "我们被",
          timestamp: "2026-06-26T08:00:02.000Z",
        },
        {
          id: "runtime-event-assistant-3",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: "我们被要求",
          timestamp: "2026-06-26T08:00:03.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:03.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    const liveChat = screen.getByLabelText("Live Chat messages");

    expect(liveChat.querySelectorAll('[data-slot="chat-message-assistant"]')).toHaveLength(1);
    expect(within(liveChat).getByText("我们被要求")).toBeInTheDocument();
    expect(within(liveChat).getByTestId("markdown-renderer")).toHaveTextContent("我们被要求");
    expect(within(liveChat).queryByTestId("stream-markdown-renderer")).not.toBeInTheDocument();
    expect(within(liveChat).queryByText("我们")).not.toBeInTheDocument();
    expect(within(liveChat).queryByText("我们被")).not.toBeInTheDocument();
  });

  it("collapses adjacent read-only duplicate assistant messages without message identity", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const duplicateBody =
      "收到，流式消息测试正常。当前可以正常接收流式响应。你那边看到消息是逐步出现的吗？";
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "测试一下",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "completed" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      runtimeEvents: [
        {
          id: "runtime-event-assistant-1",
          piSessionId: "pi-session-rpc",
          kind: "message" as const,
          role: "assistant" as const,
          body: duplicateBody,
          timestamp: "2026-06-26T08:00:01.000Z",
        },
        {
          id: "runtime-event-assistant-2",
          piSessionId: "pi-session-rpc",
          kind: "message" as const,
          role: "assistant" as const,
          body: duplicateBody,
          timestamp: "2026-06-26T08:00:02.000Z",
        },
        {
          id: "runtime-event-assistant-3",
          piSessionId: "pi-session-rpc",
          kind: "message" as const,
          role: "assistant" as const,
          body: duplicateBody,
          timestamp: "2026-06-26T08:00:03.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:03.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    const liveChat = screen.getByLabelText("Live Chat messages");

    expect(liveChat.querySelectorAll('[data-slot="chat-message-assistant"]')).toHaveLength(1);
    expect(within(liveChat).getAllByText(duplicateBody)).toHaveLength(1);
    expect(within(liveChat).getByTestId("markdown-renderer")).toHaveTextContent(duplicateBody);
  });

  it("collapses adjacent duplicate assistant messages even when they have different event identities", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const duplicateBody = "你好！有什么可以帮你的吗？";
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "你好",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "completed" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      runtimeEvents: [
        {
          id: "runtime-event-assistant-1",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: duplicateBody,
          timestamp: "2026-06-26T08:00:01.000Z",
        },
        {
          id: "runtime-event-assistant-2",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:1",
          kind: "message" as const,
          role: "assistant" as const,
          body: duplicateBody,
          timestamp: "2026-06-26T08:00:02.000Z",
        },
        {
          id: "runtime-event-assistant-3",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:2",
          kind: "message" as const,
          role: "assistant" as const,
          body: duplicateBody,
          timestamp: "2026-06-26T08:00:03.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:03.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    const liveChat = screen.getByLabelText("Live Chat messages");

    expect(liveChat.querySelectorAll('[data-slot="chat-message-assistant"]')).toHaveLength(1);
    expect(within(liveChat).getAllByText(duplicateBody)).toHaveLength(1);
  });

  it("collapses intermediate assistant run messages into the final answer bubble", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "测试 DeepSeek 的服务恢复没有",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "completed" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-sdk",
      runtimeEvents: [
        {
          id: "runtime-event-assistant-1",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: "我来帮你测试 DeepSeek 的服务状态。",
          timestamp: "2026-06-26T08:00:01.000Z",
        },
        {
          id: "runtime-event-thinking-1",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:0",
          kind: "thinking" as const,
          role: "assistant" as const,
          body: "先确认配置和 endpoint。",
          timestamp: "2026-06-26T08:00:02.000Z",
        },
        {
          id: "runtime-event-assistant-2",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:1",
          kind: "message" as const,
          role: "assistant" as const,
          body: "API 有响应了！再测试一下 chat completions 端点。",
          timestamp: "2026-06-26T08:00:03.000Z",
        },
        {
          id: "runtime-event-thinking-2",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:1",
          kind: "thinking" as const,
          role: "assistant" as const,
          body: "继续确认 chat completions。",
          timestamp: "2026-06-26T08:00:04.000Z",
        },
        {
          id: "runtime-event-assistant-3",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:2",
          kind: "message" as const,
          role: "assistant" as const,
          body: "DeepSeek API 服务已完全恢复，可以正常使用。",
          timestamp: "2026-06-26T08:00:05.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:05.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    const liveChat = screen.getByLabelText("Live Chat messages");
    const assistantMessages = liveChat.querySelectorAll<HTMLElement>(
      '[data-slot="chat-message-assistant"]',
    );

    expect(assistantMessages).toHaveLength(1);
    expect(within(assistantMessages[0]).getByText("Thought for 3s")).toBeInTheDocument();
    expect(within(assistantMessages[0]).getByText("先确认配置和 endpoint。")).toBeInTheDocument();
    expect(within(assistantMessages[0]).getByText("继续确认 chat completions。")).toBeInTheDocument();
    expect(within(assistantMessages[0]).getByTestId("markdown-renderer")).toHaveTextContent(
      "DeepSeek API 服务已完全恢复，可以正常使用。",
    );
    expect(
      within(assistantMessages[0]).queryByText("我来帮你测试 DeepSeek 的服务状态。"),
    ).not.toBeInTheDocument();
    expect(
      within(assistantMessages[0]).queryByText("API 有响应了！再测试一下 chat completions 端点。"),
    ).not.toBeInTheDocument();
  });

  it("keeps runtime status events out of the Live Chat message list", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "你好",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "completed" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      runtimeEvents: [
        {
          id: "runtime-event-assistant",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: "你好！有什么可以帮你的吗？",
          timestamp: "2026-06-26T08:00:01.000Z",
        },
        {
          id: "runtime-event-completed",
          piSessionId: "pi-session-rpc",
          kind: "status" as const,
          title: "Completed",
          body: "Pi SDK runtime ended the active run.",
          timestamp: "2026-06-26T08:00:02.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:02.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    const liveChat = screen.getByLabelText("Live Chat messages");

    expect(liveChat.querySelectorAll('[data-slot="chat-message-assistant"]')).toHaveLength(1);
    expect(within(liveChat).getByText("你好！有什么可以帮你的吗？")).toBeInTheDocument();
    expect(within(liveChat).queryByText("Completed")).not.toBeInTheDocument();
    expect(
      within(liveChat).queryByText("Pi SDK runtime ended the active run."),
    ).not.toBeInTheDocument();
  });

  it("uses streaming markdown for the collapsed assistant run bubble", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "测试一下",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "running" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      runtimeEvents: [
        {
          id: "runtime-event-assistant-1",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: "**Earlier** assistant result",
          timestamp: "2026-06-26T08:00:01.000Z",
        },
        {
          id: "runtime-event-assistant-2",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:1",
          kind: "message" as const,
          role: "assistant" as const,
          body: "Streaming `markdown` now",
          timestamp: "2026-06-26T08:00:02.000Z",
        },
        {
          id: "runtime-event-tool",
          piSessionId: "pi-session-rpc",
          kind: "tool-call" as const,
          title: "Inspect context",
          body: "Read AGENTS.md",
          timestamp: "2026-06-26T08:00:03.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:03.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    const liveChat = screen.getByLabelText("Live Chat messages");
    const assistantMessages = liveChat.querySelectorAll<HTMLElement>(
      '[data-slot="chat-message-assistant"]',
    );
    const streamingAssistant = assistantMessages[0];
    const streamingTrace = streamingAssistant.querySelector(
      '[data-slot="chain-of-thought"]',
    );
    const streamingContent = streamingAssistant.querySelector(
      '[data-testid="stream-markdown-renderer"]',
    );

    expect(assistantMessages).toHaveLength(1);
    expect(within(liveChat).queryByTestId("markdown-renderer")).not.toBeInTheDocument();
    expect(within(liveChat).getByTestId("stream-markdown-renderer")).toHaveTextContent(
      "Streaming `markdown` now",
    );
    expect(within(liveChat).getByTestId("stream-markdown-renderer")).toHaveAttribute(
      "data-is-streaming",
      "true",
    );
    expect(
      within(liveChat).queryByText("**Earlier** assistant result"),
    ).not.toBeInTheDocument();
    expect(liveChat.querySelectorAll('[data-slot="chain-of-thought"]')).toHaveLength(1);
    expect(streamingTrace).toBeInTheDocument();
    expect(streamingContent).toBeInTheDocument();
    expect(within(streamingAssistant).getByText("Thinking...")).toBeInTheDocument();
    expect(
      streamingTrace!.compareDocumentPosition(streamingContent!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders assistant trace events above the visible answer without mixing them into markdown", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "测试 Agent Trace 的效果",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "running" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-sdk",
      runtimeEvents: [
        {
          id: "runtime-event-thinking",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:0",
          kind: "thinking" as const,
          role: "assistant" as const,
          body: "我需要先检查项目结构。",
          timestamp: "2026-06-26T08:00:01.000Z",
        },
        {
          id: "runtime-event-tool-call",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:0",
          kind: "tool-call" as const,
          title: "read",
          body: "{\"path\":\"AGENTS.md\"}",
          timestamp: "2026-06-26T08:00:02.000Z",
          toolCallId: "tool-call-1",
        },
        {
          id: "runtime-event-tool-result",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:0",
          kind: "tool-result" as const,
          title: "read",
          body: "Agent instructions loaded.",
          timestamp: "2026-06-26T08:00:03.000Z",
          toolCallId: "tool-call-1",
        },
        {
          id: "runtime-event-assistant",
          piSessionId: "pi-session-sdk",
          messageId: "pi-sdk:pi-session-sdk:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: "最终回答只保留结论。",
          timestamp: "2026-06-26T08:00:04.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:04.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    const liveChat = screen.getByLabelText("Live Chat messages");
    const assistantMessage = liveChat.querySelector<HTMLElement>(
      '[data-slot="chat-message-assistant"]',
    );
    const trace = assistantMessage!.querySelector(
      '[data-slot="chain-of-thought"]',
    );
    const tool = assistantMessage!.querySelector('[data-slot="chat-tool"]');
    const streamingContent = assistantMessage!.querySelector(
      '[data-testid="stream-markdown-renderer"]',
    );

    expect(trace).toBeInTheDocument();
    expect(within(assistantMessage!).getByText("Thinking...")).toBeInTheDocument();
    expect(within(assistantMessage!).getByText("Thinking")).toBeInTheDocument();
    expect(within(assistantMessage!).getByText("我需要先检查项目结构。")).toBeInTheDocument();
    expect(tool).toHaveAttribute("data-state", "output-available");
    expect(tool).toHaveTextContent("Used tool: read");
    expect(tool).toHaveTextContent("{\"path\":\"AGENTS.md\"}");
    expect(tool).toHaveTextContent("Agent instructions loaded.");
    expect(streamingContent).toHaveTextContent("最终回答只保留结论。");
    expect(streamingContent).not.toHaveTextContent("我需要先检查项目结构。");
    expect(streamingContent).not.toHaveTextContent("Agent instructions loaded.");
    expect(
      trace!.compareDocumentPosition(streamingContent!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not show fixture trace steps when a live Projection has no tool calls", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-docs-review",
      liveMessages: [
        {
          id: "fixture-assistant",
          role: "assistant" as const,
          body: "Fixture fallback should not drive a real Projection.",
        },
      ],
      runTimeline: [
        {
          id: "fixture-context",
          title: "Project context loaded",
          meta: "Fixture trace step",
        },
      ],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      summary: {
        model: "fixture-model",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = {
      ...createSessionProjection({
        id: "session-1",
        projectId: "pig-docs",
        initialPrompt: "测试一下",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "running" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      runtimeEvents: [
        {
          id: "runtime-event-assistant-1",
          piSessionId: "pi-session-rpc",
          messageId: "pi-sdk:pi-session-rpc:assistant:0",
          kind: "message" as const,
          role: "assistant" as const,
          body: "真实回复",
          timestamp: "2026-06-26T08:00:01.000Z",
        },
      ],
      updatedAt: "2026-06-26T08:00:01.000Z",
    };

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    const liveChat = screen.getByLabelText("Live Chat messages");

    expect(within(liveChat).getByText("真实回复")).toBeInTheDocument();
    expect(within(liveChat).queryByText("Project context loaded")).not.toBeInTheDocument();
    expect(liveChat.querySelector('[data-slot="chain-of-thought"]')).not.toBeInTheDocument();
  });

  it("shows managed checkout root and runtime cwd while keeping advanced checkout details collapsed", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/packages/web",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-background",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/packages/web",
      },
      summary: {
        model: "gpt-5-codex",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "session-background",
        projectId: "pig-docs",
        initialPrompt: "Run in the isolated checkout",
        createdAt: "2026-06-27T08:00:00.000Z",
      }),
      {
        type: "checkout-selected",
        stage: "preparing checkout",
        checkout: {
          mode: "managed-worktree",
          root: "/tmp/pig-worktrees/session-background",
          repoRoot: "/Users/void/code/opensource/Pig",
          projectRoot: "/Users/void/code/opensource/Pig/packages/web",
          projectRelativePath: "packages/web",
          executionCheckoutRoot: "/tmp/pig-worktrees/session-background",
          diffRoot: "/tmp/pig-worktrees/session-background",
          runtimeCwd: "/tmp/pig-worktrees/session-background/packages/web",
          sessionBound: true,
          disposable: true,
          cleanupCandidate: false,
          permanent: false,
          createdAt: "2026-06-27T08:00:00.000Z",
        },
        occurredAt: "2026-06-27T08:00:00.000Z",
      },
    );

    render(<SessionActionsContent workspace={workspace} projection={projection} />);

    expect(screen.getByText("PiGUI-managed worktree")).toBeInTheDocument();
    expect(screen.getByText("/tmp/pig-worktrees/session-background")).toBeInTheDocument();
    expect(
      screen.getByText("/tmp/pig-worktrees/session-background/packages/web"),
    ).toBeInTheDocument();
    const advancedDetails = screen
      .getByText("Advanced checkout details")
      .closest("details");

    expect(advancedDetails).not.toBeNull();
    expect(advancedDetails).not.toHaveAttribute("open");
    expect(
      within(advancedDetails as HTMLElement).getByText(
        "/Users/void/code/opensource/Pig/packages/web",
      ),
    ).not.toBeVisible();
  });

  it("shows a clear non-Git state in the action surface", () => {
    const workspace = {
      id: "notes",
      name: "Notes",
      projectRoot: "/Users/void/Documents/notes-without-git",
      repoRoot: "/Users/void/Documents/notes-without-git",
      selectedSessionId: "session-notes",
      liveMessages: [],
      runTimeline: [],
      checkout: {
        mode: "Foreground local checkout",
        root: "/Users/void/Documents/notes-without-git",
        runtimeCwd: "/Users/void/Documents/notes-without-git",
      },
      summary: {
        model: "gpt-5-codex",
        totalCostUsd: 0,
        totalTokens: 0,
      },
    };
    const projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "session-notes",
        projectId: "notes",
        initialPrompt: "Run in notes",
        createdAt: "2026-06-30T08:00:00.000Z",
      }),
      {
        type: "checkout-selected",
        stage: "preparing checkout",
        checkout: {
          mode: "foreground-local",
          root: "/Users/void/Documents/notes-without-git",
          projectRoot: "/Users/void/Documents/notes-without-git",
          projectRelativePath: ".",
          executionCheckoutRoot: "/Users/void/Documents/notes-without-git",
          runtimeCwd: "/Users/void/Documents/notes-without-git",
          sessionBound: false,
          disposable: false,
          cleanupCandidate: false,
          permanent: true,
          createdAt: "2026-06-30T08:00:00.000Z",
        },
        occurredAt: "2026-06-30T08:00:00.000Z",
      },
    );

    render(<SessionActionsContent workspace={workspace} projection={projection} />);

    expect(screen.getByText("No Git repository")).toBeInTheDocument();
    expect(screen.getByText("Git-only actions are unavailable for this Project.")).toBeInTheDocument();
  });
});
