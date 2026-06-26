import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentWorkspaceSessionsPage, AgentWorkspaceSessionsView } from "./agent-workspace";
import { createFakePiRuntimeBridge } from "./pi-runtime-bridge";
import {
  createInMemorySessionProjectionStore,
  createSessionFromDraft,
} from "./session-creation";
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
    expect(within(liveColumn).getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(within(liveColumn).getByText("AI can make mistakes. Check important info.")).toBeInTheDocument();
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

  it("does not expose deferred terminal, file tree, or runtime control placeholders", async () => {
    renderProjectSessions();

    const sessionsView = await screen.findByTestId("project-sessions-view");

    expect(within(sessionsView).queryByText(/terminal/i)).not.toBeInTheDocument();
    expect(within(sessionsView).queryByText(/file tree|file explorer/i)).not.toBeInTheDocument();
    expect(
      within(sessionsView).queryByRole("button", { name: /queue|steer|stop/i }),
    ).not.toBeInTheDocument();
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
      within(liveColumn).getByText("Project Sessions keep live Pi work separate from Analyze evidence."),
    ).toBeInTheDocument();
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
      />,
    );

    await user.click(screen.getByRole("button", { name: "Submit initial prompt" }));

    expect(onDraftSubmit).toHaveBeenCalledWith({
      projectId: "pig-docs",
      prompt: "Summarize the docs ADR",
    });
    await waitFor(() => expect(getSessionDraft("pig-docs")).toBeNull());
    expect(screen.queryByTestId("session-draft-composer")).not.toBeInTheDocument();
    expect(screen.getByText("Summarize the docs ADR")).toBeInTheDocument();
    expect(screen.getByLabelText("Live Chat messages")).toBeInTheDocument();
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
});
