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
  SessionToolbarActions,
} from "./agent-workspace";
import { PiRuntimeBridgeError, createFakePiRuntimeBridge } from "./pi-runtime-bridge";
import {
  createInMemorySessionProjectionStore,
  createSessionFromDraft,
} from "./session-creation";
import { applySessionProjectionEvent, createSessionProjection } from "./session-projection";
import { getSessionDraft, saveSessionDraft } from "./session-drafts";

function renderProjectSessions(path = "/projects/pig/sessions") {
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

describe("AgentWorkspaceSessionsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
    const sessionActionsButton = within(navbarActions).getByRole("button", {
      name: "Session actions",
    });
    const chatConversation = liveColumn.querySelector('[data-slot="chat-conversation"]');
    const promptInput = liveColumn.querySelector('[data-slot="prompt-input"]');

    expect(sessionActionsButton).toBeInTheDocument();
    expect(container.querySelector('[data-slot="navbar-spacer"]')).toHaveAttribute(
      "data-tauri-drag-region",
    );
    expect(chatConversation).toBeInTheDocument();
    expect(chatConversation).toHaveAttribute("role", "log");
    expect(
      liveColumn.querySelector('[data-slot="chat-conversation-content"]'),
    ).toBeInTheDocument();
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-user"]')).toHaveLength(1);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-assistant"]')).toHaveLength(1);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-bubble"]')).toHaveLength(1);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-body"]')).toHaveLength(1);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-content"]')).toHaveLength(2);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-avatar"]')).toHaveLength(1);
    expect(liveColumn.querySelector('[data-slot="chain-of-thought"]')).toBeInTheDocument();
    expect(liveColumn.querySelectorAll('[data-slot="chain-of-thought-step"]')).toHaveLength(3);
    expect(within(liveColumn).getByText("Project context loaded")).toBeInTheDocument();
    expect(promptInput).toBeInTheDocument();
    expect(liveColumn.querySelector('[data-slot="prompt-input-shell"]')).toBeInTheDocument();
    expect(liveColumn.querySelector('[data-slot="prompt-input-textarea"]')).toBeInTheDocument();
    expect(liveColumn.querySelector('[data-slot="prompt-input-send"]')).toBeInTheDocument();
    expect(within(liveColumn).getByPlaceholderText("What do you want to know?")).toBeInTheDocument();
    expect(within(liveColumn).getByRole("button", { name: "Steer" })).toBeInTheDocument();
    expect(within(liveColumn).getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(
      within(liveColumn).getByText("Queue is the default while Pi is running."),
    ).toBeInTheDocument();
    expect(within(navbarActions).getByRole("button", { name: "Stop" })).toBeInTheDocument();
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
        name: "Analyze boundary pass",
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

  it("stops the selected active run from the toolbar and unlocks archive", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    expect(await screen.findByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.queryByText("Abort")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stop" }));

    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(await within(liveChat).findByText("Stopped")).toBeInTheDocument();
    expect(within(liveChat).getByText("Pi stopped the active run.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Session actions" }));

    const actionDialog = await screen.findByRole("dialog", { name: "Session actions" });

    expect(within(actionDialog).getByRole("button", { name: "Archive Session" })).toBeEnabled();
    expect(
      within(actionDialog).queryByText("Active runs cannot be archived."),
    ).not.toBeInTheDocument();
  });

  it("records stop failure in Live Chat without unlocking active archive", async () => {
    const user = userEvent.setup();
    const bridge = createFakePiRuntimeBridge({
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
          <SessionToolbarActions
            workspace={workspace}
            projection={currentProjection}
            runtimeBridge={bridge}
            onProjectionChange={setCurrentProjection}
          />
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

    await user.click(screen.getByRole("button", { name: "Stop" }));

    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(await within(liveChat).findByText("Stop failed")).toBeInTheDocument();
    expect(within(liveChat).getByText("Pi rejected the stop request.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  });

  it("clears unread results after the selected Session content is rendered", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    const projectNavigation = await screen.findByLabelText("Pig project sessions");
    const unreadRow = within(projectNavigation).getByRole("row", {
      name: "Analyze boundary pass",
    });

    expect(within(unreadRow).getByLabelText("Unread result")).toBeInTheDocument();

    await user.click(unreadRow);

    expect(
      within(screen.getByLabelText("Live Chat messages")).getByText("Analyze boundary pass"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(
          within(projectNavigation).getByRole("row", {
            name: "Analyze boundary pass",
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
    const source = readFileSync(join(process.cwd(), "src/agent-workspace.tsx"), "utf8");

    expect(source).toContain("createDefaultPiRuntimeBridge");
    expect(source).not.toContain("createFakePiRuntimeBridge");
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
    const bridge = createFakePiRuntimeBridge({
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

    await user.click(within(pendingQueue).getByRole("button", { name: "Withdraw queued message" }));

    expect(await within(pendingQueue).findByText("Withdrawn")).toBeInTheDocument();
  });

  it("steers an active run as a Live Chat control event instead of a queued message", async () => {
    const user = userEvent.setup();
    const bridge = createFakePiRuntimeBridge({
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
    const bridge = createFakePiRuntimeBridge();
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
  });

  it("opens a Project-scoped Session Draft from New Session without adding a session row", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    const projectNavigation = await screen.findByLabelText("Pig project sessions");
    const initialRows = within(projectNavigation).getAllByRole("row");

    await user.click(screen.getByRole("button", { name: "New Session for Pig" }));

    const draftComposer = await screen.findByTestId("session-draft-composer");

    expect(within(draftComposer).getByText("Session Draft")).toBeInTheDocument();
    expect(
      within(draftComposer).getByPlaceholderText("Describe the first Pi prompt"),
    ).toBeInTheDocument();
    expect(within(projectNavigation).getAllByRole("row")).toHaveLength(
      initialRows.length,
    );
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

  it("restores the same Project draft after repeated New Session clicks and reload", async () => {
    const user = userEvent.setup();
    const firstRender = renderProjectSessions();

    await user.click(await screen.findByRole("row", { name: "New Session" }));
    fireEvent.change(screen.getByPlaceholderText("Describe the first Pi prompt"), {
      target: { value: "Keep this initial prompt" },
    });

    expect(getSessionDraft("pig")?.prompt).toBe("Keep this initial prompt");

    await user.click(screen.getByRole("button", { name: "New Session for Pig" }));

    expect(screen.getByPlaceholderText("Describe the first Pi prompt")).toHaveValue(
      "Keep this initial prompt",
    );

    firstRender.unmount();
    renderProjectSessions("/projects/pig/sessions?view=draft");

    expect(await screen.findByPlaceholderText("Describe the first Pi prompt")).toHaveValue(
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
            bridge: createFakePiRuntimeBridge({
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
      await screen.findByText("Queue is the default while Pi is running."),
    ).toBeInTheDocument();

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
            bridge: createFakePiRuntimeBridge({
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
    expect(screen.getByPlaceholderText("Describe the first Pi prompt")).toHaveValue(
      "Summarize the docs ADR",
    );
  });

  it("falls back to read-only Projection data and exposes runtime summary to the action surface", () => {
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

    expect(screen.getByTestId("runtime-fallback-banner")).toHaveTextContent(
      "Runtime unavailable",
    );
    expect(screen.getByText("Create a real Pi RPC-backed session")).toBeInTheDocument();
    expect(screen.getByText("Live session is ready.")).toBeInTheDocument();
    expect(screen.getByText("read")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();

    render(<SessionActionsContent workspace={workspace} projection={projection} />);

    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("$0.012345")).toBeInTheDocument();
    expect(screen.getByText("1.3K")).toBeInTheDocument();
  });
});
