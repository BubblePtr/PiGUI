import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import type { BackendRpcEvent } from "@pigui/backend";
import type {
  AgentMessagePartSnapshot,
  AgentMessagePartType,
  SessionChanges,
} from "@pigui/core";
import {
  AgentWorkspaceSessionsPage,
  AgentWorkspaceSessionsView,
  SessionChangesPanel,
  SessionToolbarActions,
} from "@/pages/agent-workspace";
import { addProjectToRegistry } from "@/entities/project/project-registry";
import { SessionProjectionsProvider } from "@/entities/session/use-session-projections";
import {
  PiRuntimeBridgeError,
  type AgentRuntimeEventEntry,
  type ForkSessionInput,
  type ForkSessionResult,
} from "@/entities/runtime/pi-runtime-bridge";
import {
  createInMemoryPiRuntimeBridge,
  type InMemoryPiRuntimeBridge,
} from "@/entities/runtime/in-memory-pi-runtime-bridge";
import { createExecutionCheckoutManager } from "@/entities/checkout/execution-checkout";
import {
  createInMemorySessionProjectionStore,
  createSessionFromDraft,
} from "@/entities/session/session-creation";
import {
  applySessionProjectionEvent,
  createSessionProjection,
  type SessionProjection,
} from "@/entities/session/session-projection";
import { createSessionRuntimeModel } from "@/entities/session/session-runtime-model";
import { getFollowUpDraft, saveFollowUpDraft } from "@/entities/session/follow-up-drafts";
import { injectIntoComposer } from "@/entities/session/composer-injections";
import { getLastModelSelection, saveLastModelSelection } from "@/entities/session/last-model-preference";
import { saveVisibleModels } from "@/entities/model/visible-models";
import { getSessionDraft, saveSessionDraft } from "@/entities/session/session-drafts";

// The app shell renders the sidebar with Astryx SideNav: rows are buttons,
// project sessions live in the aria-controls group owned by the project
// header row. These helpers mirror app-shell.test.tsx.
function isAstryxSideNavRow(candidate: HTMLElement) {
  return candidate.classList.contains("astryx-side-nav-item");
}

function getProjectHeaderRowByName(name: string) {
  const projectGroup = screen.getByTestId("sidebar-projects");
  const header = within(projectGroup)
    .getAllByRole("button")
    .find(
      (candidate) =>
        isAstryxSideNavRow(candidate) &&
        candidate.hasAttribute("aria-expanded") &&
        !candidate.hasAttribute("aria-haspopup") &&
        (candidate.textContent ?? "").startsWith(name),
    );

  if (!header) {
    throw new Error(`Project header row not found: ${name}`);
  }

  return header;
}

function getProjectSessionsGroupByName(name: string) {
  const header = getProjectHeaderRowByName(name);
  const groupId = header.getAttribute("aria-controls");
  const group = groupId ? document.getElementById(groupId) : null;

  if (!group) {
    throw new Error(`Project sessions group not found: ${name}`);
  }

  return group as HTMLElement;
}

async function findProjectSessionsGroupByName(name: string) {
  await screen.findByTestId("sidebar-projects");

  return getProjectSessionsGroupByName(name);
}

function getSidebarSessionRows(scope: HTMLElement) {
  return within(scope)
    .getAllByRole("button")
    .filter(
      (candidate) =>
        isAstryxSideNavRow(candidate) && !candidate.hasAttribute("aria-expanded"),
    );
}

function querySidebarSessionRow(title: string) {
  const projectGroup = screen.queryByTestId("sidebar-projects");

  if (!projectGroup) {
    return undefined;
  }

  return within(projectGroup)
    .queryAllByRole("button")
    .filter(
      (candidate) =>
        isAstryxSideNavRow(candidate) && !candidate.hasAttribute("aria-expanded"),
    )
    .find((candidate) => (candidate.textContent ?? "").includes(title));
}

async function findSidebarSessionRow(title: string) {
  return waitFor(() => {
    const row = querySidebarSessionRow(title);

    if (!row) {
      throw new Error(`Session row not found: ${title}`);
    }

    return row;
  });
}

vi.mock("@/entities/session/session-diff-viewer", () => ({
  default: ({ patch, style }: { patch: string; style: string }) => (
    <div data-testid="session-diff-viewer" data-style={style}>
      {patch}
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
    if (!window.pigui) {
      window.__PIGUI_ENABLE_BROWSER_DEVELOPMENT_MOCKS__ = true;
    }
  }

  const routePath = path.replace(
    "/projects/pig/sessions",
    `/projects/${encodeURIComponent(pigProjectPath)}/sessions`,
  );

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/sessions",
    component: AgentWorkspaceSessionsPage,
  });
  // Stands in for the Settings page so navigation out of the workspace is
  // observable without pulling that page's tree into these tests.
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div>Settings route</div>,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [routePath] }),
    routeTree: rootRoute.addChildren([sessionsRoute, settingsRoute]),
  });

  return render(
    <SessionProjectionsProvider>
      <RouterProvider router={router} />
    </SessionProjectionsProvider>,
  );
}

async function chooseProjectFromPicker(
  user: ReturnType<typeof userEvent.setup>,
  projectName: string,
) {
  await user.click(screen.getByTestId("project-picker-trigger"));
  await user.click(await screen.findByRole("option", { name: projectName }));
}

// Astryx Selector renders the dropdown as a role="listbox" popup labelled by
// its trigger; these helpers assert the structural contract of that popup.
function expectAdaptiveInlineSelectPopover(listbox: HTMLElement) {
  expect(listbox).toBeInTheDocument();
  expect(listbox.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
}

function expectInlineSelectOptionIsAstryxOption(option: HTMLElement) {
  expect(option).toHaveAttribute("role", "option");
  expect(option).toHaveAttribute("aria-selected");
}

function expectInlineSelectOptionLabelMatchesCompactMenu(
  option: HTMLElement,
  label: string,
) {
  expect(within(option).getByText(label)).toBeInTheDocument();
}

function getOpenSelectorListbox() {
  const listbox = document.querySelector('[role="listbox"]');

  if (!(listbox instanceof HTMLElement)) {
    throw new Error("Expected an open Selector listbox to be rendered.");
  }

  return listbox;
}

/**
 * Every window uses the same panel, reached through its toolbar and rail.
 */
async function openSessionSurfaceSheet(
  user: ReturnType<typeof userEvent.setup>,
  surfaceTitle: "Changes" | "Terminal",
) {
  await user.click(await screen.findByRole("button", { name: "Session dock" }));

  const sheet = await screen.findByRole("complementary", { name: "Changes" });

  await user.click(within(sheet).getByRole("button", { name: surfaceTitle }));

  return sheet;
}

function setDockedLayout(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => ({
      matches: query === "(min-width: 1280px)" ? matches : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  });
}

describe("AgentWorkspaceSessionsPage", () => {
  beforeEach(() => {
    setDockedLayout(false);
    window.localStorage.clear();
    delete window.pigui;
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
    // Session hydration and auto-selection settle asynchronously after the
    // sessions view mounts; the toolbar appears once a session is selected.
    const navbarActions = await screen.findByTestId("navbar-actions");

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
    expect(within(liveColumn).queryByRole("button", { name: "Session dock" })).not.toBeInTheDocument();
    expect(liveColumn).toHaveClass("h-full");
    expect(sessionsView).toHaveClass("-mt-10", "h-[calc(100%+2.5rem)]", "pb-0");
    expect(sessionsView).not.toHaveClass("pt-6", "py-6");
    // One toolbar toggle now stands for the whole dock; Changes and
    // Actions are surfaces inside it, not separate toolbar buttons.
    const sessionDockButton = within(navbarActions).getByRole("button", {
      name: "Session dock",
    });

    expect(
      within(navbarActions).queryByRole("button", { name: "Session changes" }),
    ).not.toBeInTheDocument();
    expect(
      within(navbarActions).queryByRole("button", { name: "Session actions" }),
    ).not.toBeInTheDocument();
    const chatConversation = liveColumn.querySelector('[data-slot="chat-conversation"]');
    const promptInput = liveColumn.querySelector('[data-slot="prompt-input"]');
    const composer = liveColumn.querySelector('[data-testid="full-chat-composer"]');
    const liveComposerInput = within(liveColumn).getByPlaceholderText(
      "Queue the next task…",
    );
    const traceSidebarLabel = within(screen.getByRole("button", { name: "Trace" }))
      .getByText("Trace");
    const newSessionSidebarLabel = within(
      screen.getByRole("group", { name: "Trace and usage navigation" }),
    ).getByText("New Session");

    expect(sessionDockButton).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector('[data-slot="navbar-spacer"]')).toHaveAttribute(
      "data-window-drag-region",
    );
    expect(chatConversation).toBeInTheDocument();
    expect(chatConversation?.closest(".card")).toBeNull();
    expect(promptInput?.closest(".card")).toBeNull();
    // The log role lives on the Astryx ChatMessageList inside the viewport.
    const conversationLog = chatConversation?.querySelector('[role="log"]');
    expect(conversationLog).toBeInTheDocument();
    expect(conversationLog).toHaveClass("astryx-chat-message-list");
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
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-avatar"]')).toHaveLength(0);
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-actions"]')).toHaveLength(1);
    const userMessage = liveColumn.querySelector(
      '[data-slot="chat-message-user"]',
    );
    const userBubble = userMessage?.querySelector(
      '[data-slot="chat-message-bubble"]',
    );
    const userActions = userMessage?.querySelector(
      '[data-slot="chat-message-actions"]',
    );
    const assistantMessage = liveColumn.querySelector(
      '[data-slot="chat-message-assistant"]',
    );
    const assistantTrace = assistantMessage?.querySelector(
      '[data-slot="chain-of-thought"]',
    );
    const assistantContent = assistantMessage?.querySelector(
      '[data-slot="chat-message-content"]',
    );
    const assistantActions = assistantMessage?.querySelector(
      '[data-slot="chat-message-actions"]',
    );
    expect(userActions).toBeInTheDocument();
    expect(userActions?.parentElement).toHaveClass(
      "flex",
      "flex-col",
      "items-end",
      "gap-1",
    );
    expect(userBubble?.nextElementSibling).toBe(userActions);
    expect(
      within(userMessage as HTMLElement).getByRole("button", { name: "Copy" }),
    ).toBeInTheDocument();
    expect(assistantTrace).not.toBeInTheDocument();
    expect(assistantContent).toBeInTheDocument();
    expect(assistantActions).not.toBeInTheDocument();
    expect(
      within(assistantMessage as HTMLElement).queryByRole("button", { name: "Copy" }),
    ).not.toBeInTheDocument();
    expect(
      within(assistantMessage as HTMLElement).queryByRole("button", { name: "Good response" }),
    ).not.toBeInTheDocument();
    expect(
      within(assistantMessage as HTMLElement).queryByRole("button", { name: "Bad response" }),
    ).not.toBeInTheDocument();
    expect(liveColumn.querySelectorAll('[data-slot="chain-of-thought-step"]')).toHaveLength(0);
    expect(within(liveColumn).queryByText("Project context loaded")).not.toBeInTheDocument();
    expect(promptInput).toBeInTheDocument();
    expect(composer).toBeInTheDocument();
    expect(composer).toHaveClass("mt-auto", "pb-3");
    expect(liveColumn.querySelector(".astryx-chat-composer")).toBeInTheDocument();
    expect(liveColumn.querySelector('[data-slot="prompt-input-textarea"]')).toBeInTheDocument();
    expect(promptInput).toHaveAttribute("data-status", "streaming");
    expect(within(liveColumn).getByPlaceholderText("Queue the next task…")).not.toBeDisabled();
    // Queue-first: no composer-level Steer; steering lives on queued rows.
    expect(within(liveColumn).queryByRole("button", { name: "Steer" })).not.toBeInTheDocument();
    expect(within(liveColumn).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(within(liveColumn).queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    expect(
      within(liveColumn).queryByText("Queue is the default while Pi is running."),
    ).not.toBeInTheDocument();
    expect(within(navbarActions).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const terminalDialog = await openSessionSurfaceSheet(user, "Terminal");
    expect(terminalDialog).toHaveAttribute("data-testid", "session-dock");
    expect(within(terminalDialog).queryByText("Diff summary")).not.toBeInTheDocument();
    expect(
      within(terminalDialog).getByText("Terminal requires the desktop app."),
    ).toBeInTheDocument();
  });

  it("uses the same dock panel in narrow windows without a dialog", async () => {
    const user = userEvent.setup();
    setDockedLayout(false);
    renderProjectSessions();
    const toggle = await screen.findByRole("button", { name: "Session dock" });
    await user.click(toggle);
    const panel = await screen.findByRole("complementary", { name: "Changes" });
    expect(within(panel).getByText("Diff summary")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("session-workspace-split-view")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Terminal" }));
    const terminal = await screen.findByRole("complementary", { name: "Terminal" });
    expect(within(terminal).getByText("Terminal requires the desktop app.")).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByTestId("session-dock")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clamps the docked panel when the window no longer has room for it", async () => {
    const user = userEvent.setup();
    setDockedLayout(true);

    // The split container's own ResizeObserver is the production signal, so
    // the test drives that rather than a stand-in: a controllable observer
    // plus a measurable container width.
    let containerWidth = 1440;
    const notifyResize: Array<() => void> = [];

    class ControllableResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {
        notifyResize.push(() => this.callback([], this as unknown as ResizeObserver));
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ width: containerWidth, height: 900, x: 0, y: 0, top: 0, left: 0,
        right: containerWidth, bottom: 900, toJSON: () => ({}) }) as DOMRect,
    );

    try {
      renderProjectSessions();
      await user.click(await screen.findByRole("button", { name: "Session dock" }));

      const aside = await screen.findByRole("complementary", { name: "Changes" });
      const asidePane = aside.closest('[data-slot="resizable-panel"]') as HTMLElement;

      // 1440 container - 1px handle divider - 400px Chat leaves 1039, so the
      // 560px default is untouched.
      expect(asidePane.style.width).toBe("560px");

      containerWidth = 800;
      act(() => {
        for (const notify of notifyResize) {
          notify();
        }
      });

      // 800 - 1 - 400 = 399: the panel gives back what Chat now needs instead
      // of pushing Chat under its minimum.
      await waitFor(() => expect(asidePane.style.width).toBe("399px"));
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });

  it("puts the Session dock beside Chat on wide Workspaces", async () => {
    const user = userEvent.setup();
    setDockedLayout(true);

    renderProjectSessions();

    await user.click(await screen.findByRole("button", { name: "Session dock" }));

    const aside = await screen.findByRole("complementary", { name: "Changes" });
    const splitView = aside.closest('[data-slot="resizable"]');

    expect(within(aside).getByText("Diff summary")).toBeInTheDocument();
    expect(screen.getByLabelText("Live Chat messages")).toBeVisible();
    // The handle is the 1px divider itself: no margins, so the grab zone and
    // pill overlay the panes instead of taking width from them.
    expect(screen.getByLabelText("Resize Session dock")).not.toHaveClass("mx-2");
    // The titlebar band is a real 40px row on the Chat side; the dock's
    // own header fills that band on the aside side, so the aside pane carries
    // no offset. One hairline under the band spans the whole view (across the
    // resize handle too) rather than being drawn per column.
    expect(
      within(screen.getByTestId("session-workspace-main-pane")).getByTestId(
        "session-workspace-titlebar-band",
      ),
    ).toHaveClass("h-10");
    expect(screen.getByTestId("session-workspace-aside-pane")).not.toHaveClass("pt-10");
    expect(within(aside).getByRole("banner")).toHaveClass("h-10");
    expect(within(aside).getByRole("banner")).not.toHaveClass("border-b");
    expect(
      within(screen.getByTestId("project-sessions-view")).getByTestId(
        "session-workspace-titlebar-rule",
      ),
    ).toHaveClass("absolute", "inset-x-0", "top-10");
    expect(splitView?.querySelectorAll('[data-slot="resizable-panel"]')).toHaveLength(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The panel's rail hugs the window edge: no centered max-width box or
    // horizontal padding may sit between the split view and the viewport.
    expect(aside.closest(".max-w-\\[96rem\\]")).toBeNull();
    expect(screen.getByTestId("project-sessions-view")).not.toHaveClass("px-6");
    // The toolbar toggle is the head of the rail column: docked, it sits on
    // the rail's axis (a rail-width slot that cancels the header inset).
    expect(
      screen.getByRole("button", { name: "Session dock" }).closest(
        '[data-testid="session-dock-trigger-rail-slot"]',
      ),
    ).toHaveClass("w-11", "-mr-4", "justify-center");

    // The rail swaps the surface inside the same docked panel.
    await user.click(
      within(screen.getByRole("group", { name: "Session surfaces" })).getByRole(
        "button",
        { name: "Terminal" },
      ),
    );

    const terminalAside = await screen.findByRole("complementary", { name: "Terminal" });

    expect(
      within(terminalAside).getByText("Terminal requires the desktop app."),
    ).toBeInTheDocument();
    expect(within(terminalAside).queryByText("Diff summary")).not.toBeInTheDocument();

    // No close button in the docked header; the toolbar toggle is the one
    // way in and out.
    expect(
      within(terminalAside).queryByRole("button", { name: "Close Session dock" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Session dock" }));

    await waitFor(() => {
      expect(screen.queryByTestId("session-dock")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Session dock" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("counts changed files on the rail, whichever surface is showing", async () => {
    const user = userEvent.setup();
    setDockedLayout(true);
    const persisted = {
      sessionId: "persisted-session-1",
      runtimeId: "pi-sdk:persisted-session-1",
      piSessionId: "pi-session-persisted-1",
      projectId: pigProjectPath,
      initialPrompt: "Review the diff",
      cwd: pigProjectPath,
      status: "completed",
      updatedAt: "2026-09-02T12:00:00.000Z",
    };
    const invoke = vi.fn(async (command: string) => {
      if (command === "list_session_projections") {
        return [persisted];
      }

      if (command === "get_session_changes") {
        return {
          sessionId: "persisted-session-1",
          state: "ready",
          checkoutRoot: pigProjectPath,
          repositoryRoot: pigProjectPath,
          generatedAt: "2026-09-02T12:01:00.000Z",
          head: {
            oid: "abc1234deadbeef",
            branch: "main",
            detached: false,
          },
          files: [
            {
              path: "src/app.ts",
              kind: "modified",
              staged: false,
              unstaged: true,
              additions: 2,
              deletions: 1,
              binary: false,
              patchTruncated: false,
            },
            {
              path: "src/main.ts",
              kind: "added",
              staged: true,
              unstaged: false,
              additions: 4,
              deletions: 0,
              binary: false,
              patchTruncated: false,
            },
          ],
          totals: {
            files: 2,
            additions: 6,
            deletions: 1,
            binaryFiles: 0,
            conflictedFiles: 0,
          },
          truncated: false,
          omittedFileCount: 0,
        } satisfies SessionChanges;
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn(() => vi.fn()),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };

    renderProjectSessions();

    // The composer footer reads Git as soon as the Session is on screen, so
    // the same round-trip later feeds the dock badge and panel.
    await waitFor(() => {
      expect(screen.getByTestId("git-branch-status-trigger")).toHaveTextContent(
        "main",
      );
    });

    await user.click(await screen.findByRole("button", { name: "Session dock" }));

    const rail = await screen.findByRole("group", { name: "Session surfaces" });

    await waitFor(() => {
      expect(within(rail).getByText("2")).toBeInTheDocument();
    });
    // The badge and the panel's totals row must never disagree.
    expect(
      within(await screen.findByRole("complementary", { name: "Changes" }))
        .getByText("2 files ·", { exact: false }),
    ).toBeInTheDocument();

    await user.click(within(rail).getByRole("button", { name: "Terminal" }));

    await screen.findByRole("complementary", { name: "Terminal" });
    expect(within(rail).getByText("2")).toBeInTheDocument();
    // One read feeds the composer chip, the panel, and the badge.
    expect(
      invoke.mock.calls.filter(([command]) => command === "get_session_changes"),
    ).toHaveLength(1);
  });

  it("keeps the rail badge empty when the working tree cannot be read", async () => {
    const user = userEvent.setup();
    setDockedLayout(true);

    renderProjectSessions();

    await user.click(await screen.findByRole("button", { name: "Session dock" }));

    const aside = await screen.findByRole("complementary", { name: "Changes" });

    expect(await within(aside).findByRole("alert")).toHaveTextContent(
      "unavailable outside Electron",
    );
    expect(
      within(screen.getByRole("group", { name: "Session surfaces" })).queryByText(
        /^\d+$/,
      ),
    ).not.toBeInTheDocument();
  });

  it("shows an empty Workspace state until a Project is added manually", async () => {
    renderProjectSessions("/projects/pig/sessions", { seedProjects: false });

    expect(await screen.findByTestId("empty-workspace-state")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "No Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Project" })).toBeInTheDocument();
    expect(screen.queryByText("Agent Workspace shell")).not.toBeInTheDocument();
  });

  it("renders an Electron Project with zero Sessions without fixture data", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "list_session_projections") {
        return [];
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn(() => vi.fn()),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };

    const { container } = renderProjectSessions();

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("list_session_projections", undefined);
    });
    expect(await screen.findByTestId("project-sessions-view")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Session dock" })).not.toBeInTheDocument();
    expect(screen.queryByText("Agent Workspace shell")).not.toBeInTheDocument();
    expect(screen.queryByText("Usage evidence review")).not.toBeInTheDocument();
    expect(screen.queryByText("Create the Agent Workspace entry shape for this Project.")).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("session-control-plane-shell");
    expect(container.innerHTML).not.toContain("session-usage-review");
  });

  it("loads sidebar history from persisted Session Projections in Electron", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "list_session_projections") {
        return [
          {
            sessionId: "persisted-session-1",
            runtimeId: "pi-sdk:persisted-session-1",
            piSessionId: "pi-session-persisted-1",
            projectId: pigProjectPath,
            initialPrompt: "Persisted cold session",
            cwd: pigProjectPath,
            status: "idle",
            updatedAt: "2026-07-03T10:00:00.000Z",
          },
        ];
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn(() => vi.fn()),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };

    renderProjectSessions();

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("list_session_projections", undefined);
    });
    expect(await findSidebarSessionRow("Persisted cold session")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("list_sessions", expect.anything());
  });

  it("reloads projections and resumes the selected Session after backend recovery", async () => {
    const backendListeners: Array<(event: BackendRpcEvent) => void> = [];
    const persisted = {
      sessionId: "persisted-session-1",
      runtimeId: "pi-sdk:persisted-session-1",
      piSessionId: "pi-session-persisted-1",
      projectId: pigProjectPath,
      initialPrompt: "Recover this session",
      cwd: pigProjectPath,
      status: "idle",
      sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-persisted-1.jsonl",
      checkout: {
        mode: "foreground-local",
        root: pigProjectPath,
        runtimeCwd: pigProjectPath,
      },
      updatedAt: "2026-07-18T12:00:00.000Z",
    };
    const invoke = vi.fn(async (command: string) => {
      if (command === "list_session_projections") {
        return [persisted];
      }

      if (command === "resume_session") {
        return {
          ...persisted,
          events: [],
        };
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn((listener) => {
        backendListeners.push(listener);
        return vi.fn();
      }),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };

    renderProjectSessions();

    await waitFor(() => {
      expect(
        invoke.mock.calls.filter(([command]) => command === "resume_session"),
      ).toHaveLength(1);
    });

    backendListeners[0]?.({
      type: "event",
      event: {
        id: "backend-connected-2",
        seq: 0,
        sessionId: "__backend__",
        piSessionId: "__backend__",
        type: "status",
        ts: "2026-07-18T12:01:00.000Z",
        payload: {
          kind: "status",
          lifecycle: "connected",
          title: "Backend connected",
          body: "PiGUI backend utility process is connected.",
        },
      },
    });

    await waitFor(() => {
      expect(
        invoke.mock.calls.filter(([command]) => command === "list_session_projections"),
      ).toHaveLength(2);
      expect(
        invoke.mock.calls.filter(([command]) => command === "resume_session"),
      ).toHaveLength(2);
    });
  });

  it("cold-resumes a selected persisted Session through the Runtime Gateway", async () => {
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === "list_session_projections") {
        return [
          {
            sessionId: "persisted-session-1",
            runtimeId: "pi-sdk:persisted-session-1",
            piSessionId: "pi-session-persisted-1",
            projectId: pigProjectPath,
            initialPrompt: "Persisted cold session",
            cwd: pigProjectPath,
            status: "idle",
            sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-persisted-1.jsonl",
            checkout: {
              mode: "foreground-local",
              root: pigProjectPath,
              runtimeCwd: pigProjectPath,
            },
            updatedAt: "2026-07-03T10:00:00.000Z",
          },
        ];
      }

      if (command === "resume_session") {
        return {
          sessionId: "persisted-session-1",
          runtimeId: "pi-sdk:persisted-session-1",
          piSessionId: "pi-session-persisted-1",
          projectId: pigProjectPath,
          cwd: pigProjectPath,
          status: "idle",
          sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-persisted-1.jsonl",
          events: [
            {
              id: "evt-existing-user",
              seq: 1,
              sessionId: "persisted-session-1",
              piSessionId: "pi-session-persisted-1",
              type: "message_update",
              ts: "2026-07-03T10:00:01.000Z",
              payload: {
                kind: "message",
                role: "user",
                body: "Existing history",
              },
            },
          ],
          updatedAt: "2026-07-03T10:00:01.000Z",
        };
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn(() => vi.fn()),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };

    renderProjectSessions();

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("resume_session", {
        sessionId: "persisted-session-1",
        projectId: pigProjectPath,
        piSessionId: "pi-session-persisted-1",
        cwd: pigProjectPath,
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-persisted-1.jsonl",
        checkout: {
          mode: "foreground-local",
          root: pigProjectPath,
          runtimeCwd: pigProjectPath,
        },
      });
    });
    expect(await screen.findByText("Existing history")).toBeInTheDocument();
  });

  it("shows an unrecoverable persisted Session instead of silently opening an empty chat", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "list_session_projections") {
        return [
          {
            sessionId: "persisted-session-1",
            runtimeId: "pi-sdk:persisted-session-1",
            piSessionId: "pi-session-persisted-1",
            projectId: pigProjectPath,
            initialPrompt: "Missing session file",
            cwd: pigProjectPath,
            status: "idle",
            sessionFileMissing: true,
            updatedAt: "2026-07-03T10:00:00.000Z",
          },
        ];
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn(() => vi.fn()),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };

    renderProjectSessions();

    await waitFor(() => {
      expect(screen.getAllByText("Missing session file")).toHaveLength(2);
    });
    expect(screen.getByTestId("runtime-fallback-banner")).toHaveTextContent(
      "Session file is missing",
    );
    expect(invoke).not.toHaveBeenCalledWith("resume_session", expect.anything());
  });

  it("allows a failed cold resume to be retried for the same selected Session", async () => {
    const user = userEvent.setup();
    let resumeCalls = 0;
    const invoke = vi.fn(async (command: string) => {
      if (command === "list_session_projections") {
        return [
          {
            sessionId: "persisted-session-1",
            runtimeId: "pi-sdk:persisted-session-1",
            piSessionId: "pi-session-persisted-1",
            projectId: pigProjectPath,
            initialPrompt: "Retry cold resume",
            cwd: pigProjectPath,
            status: "idle",
            sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-persisted-1.jsonl",
            checkout: {
              mode: "foreground-local",
              root: pigProjectPath,
              runtimeCwd: pigProjectPath,
            },
            updatedAt: "2026-07-03T10:00:00.000Z",
          },
        ];
      }

      if (command === "resume_session") {
        resumeCalls += 1;

        if (resumeCalls === 1) {
          throw new Error("SessionManager.open failed");
        }

        return {
          sessionId: "persisted-session-1",
          runtimeId: "pi-sdk:persisted-session-1",
          piSessionId: "pi-session-persisted-1",
          projectId: pigProjectPath,
          cwd: pigProjectPath,
          status: "idle",
          sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-persisted-1.jsonl",
          events: [],
          updatedAt: "2026-07-03T10:00:01.000Z",
        };
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn(() => vi.fn()),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };

    renderProjectSessions();

    expect(await screen.findByTestId("runtime-fallback-banner")).toHaveTextContent(
      "SessionManager.open failed",
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(
        invoke.mock.calls.filter(([command]) => command === "resume_session"),
      ).toHaveLength(2);
    });
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
    const projectPickerTrigger = screen.getByTestId("project-picker-trigger");

    expect(getProjectHeaderRowByName("Pig")).toBeInTheDocument();
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

  it("exposes the Terminal surface on the rail, without file tree or abort placeholders", async () => {
    const user = userEvent.setup();
    setDockedLayout(true);

    renderProjectSessions();

    const sessionsView = await screen.findByTestId("project-sessions-view");

    expect(within(sessionsView).queryByText(/file tree|file explorer/i)).not.toBeInTheDocument();
    expect(within(sessionsView).queryByText("Abort")).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Session dock" }));

    const rail = await screen.findByRole("group", { name: "Session surfaces" });
    const terminalToggle = within(rail).getByRole("button", { name: "Terminal" });

    expect(terminalToggle).toBeInTheDocument();

    // Outside Electron the panel degrades to its calm empty state, no crash.
    await user.click(terminalToggle);

    expect(
      await screen.findByRole("complementary", { name: "Terminal" }),
    ).toBeInTheDocument();
  });

  it("stops the selected active run from the composer", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    const liveColumn = await screen.findByTestId("live-session-column");

    // Session hydration settles asynchronously after the column mounts.
    expect(
      await within(liveColumn).findByRole("button", { name: "Stop" }),
    ).toBeInTheDocument();
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
  });

  it("stops a draft-created Session without appending a runtime status message", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    await user.click(await screen.findByRole("button", { name: "New Session" }));
    await chooseProjectFromPicker(user, "Pig");
    fireEvent.change(await screen.findByPlaceholderText("Do anything with Pi"), {
      target: { value: "Create a draft-backed active Session" },
    });
    await user.click(screen.getByRole("button", { name: "Send" }));
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

    const unreadRow = await findSidebarSessionRow("Trace boundary pass");

    expect(within(unreadRow).getByLabelText("Unread result")).toBeInTheDocument();

    await user.click(unreadRow);

    expect(
      within(screen.getByLabelText("Live Chat messages")).getByText("Trace boundary pass"),
    ).toBeInTheDocument();
    await waitFor(() => {
      const row = querySidebarSessionRow("Trace boundary pass");

      if (!row) {
        throw new Error("Session row not found: Trace boundary pass");
      }

      expect(within(row).queryByLabelText("Unread result")).not.toBeInTheDocument();
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
      screen.getByPlaceholderText("Queue the next task…"),
      "After this, update the queue tests.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const pendingQueue = await screen.findByTestId("queued-message-list");

    expect(
      within(pendingQueue).getByText("After this, update the queue tests."),
    ).toBeInTheDocument();
    // Pending rows carry their own routing actions while the run is active.
    expect(
      within(pendingQueue).getByRole("button", {
        name: "Steer the run with this message",
      }),
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
    // Astryx streaming reveals text progressively inside per-chunk spans, so
    // assert on the subtree text instead of a single text node.
    await waitFor(() =>
      expect(liveChat).toHaveTextContent("Pi is contacting the model"),
    );
    expect(liveColumn.querySelectorAll('[data-slot="chat-message-assistant"]')).toHaveLength(1);
    expect(within(liveColumn).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("does not show Pi is working once the live trace has think activity", async () => {
    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "thinking-session",
        projectId: "pig-docs",
        initialPrompt: "Look at the current code",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-thinking",
        piSessionId: "pi-session-thinking",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-thinking-user",
        piSessionId: "pi-session-thinking",
        kind: "message",
        role: "user",
        body: "Look at the current code",
        timestamp: "2026-06-26T08:00:02.000Z",
      },
    });

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      stage: "accepted",
      event: {
        id: "runtime-event-thinking",
        piSessionId: "pi-session-thinking",
        messageId: "pi-sdk:pi-session-thinking:assistant:0",
        kind: "thinking",
        role: "assistant",
        body: [
          "Identifying illegal human raises risk",
          "Validating raise amounts and state resets",
          "Confirming fold winner logic consistency",
        ].join("\n"),
        timestamp: "2026-06-26T08:00:03.000Z",
      },
    });

    render(
      <AgentWorkspaceSessionsView
        clockNowMs={Date.parse("2026-06-26T08:00:04.000Z")}
        projectId="pig-docs"
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "thinking-session",
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

    // The legacy pipeline mints no Message boundaries, so its trace has no Run
    // to phase and no anchor to measure: it settles at once, with the whole
    // thinking body behind an unnumbered header (ADR-0030 §"后果").
    expect(within(liveChat).getByRole("button", { name: /^Worked/ })).toBeInTheDocument();
    expect(liveChat).toHaveTextContent("Confirming fold winner logic consistency");
    expect(liveChat).toHaveTextContent("Identifying illegal human raises risk");
    expect(liveChat).not.toHaveTextContent("Pi is working");
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

    // Astryx streaming reveals text progressively inside per-chunk spans, so
    // assert on the subtree text; the reveal needs longer than the default 1s.
    await waitFor(
      () =>
        expect(liveChat).toHaveTextContent(
          "The provider has not returned a first chunk yet",
        ),
      { timeout: 3000 },
    );
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

  it("keeps both user bubbles and the in-flight run events of a follow-up prompt on the runtime-model path", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-07-02T10:00:10.000Z",
    });
    const agentListeners = new Map<
      string,
      Set<(entry: AgentRuntimeEventEntry) => void>
    >();
    let releasePromptEcho: (() => void) | null = null;
    // In-memory bridge plus the Agent Runtime Event stream, with the prompt
    // RPC held open so the test can deliver live run events inside the
    // round-trip window — the window handlePromptSubmit used to clobber with
    // its pre-await projection snapshot.
    const runtimeModelBridge: InMemoryPiRuntimeBridge = {
      ...bridge,
      subscribeToAgentEvents(piSessionId, listener) {
        const sessionListeners = agentListeners.get(piSessionId) ?? new Set();

        sessionListeners.add(listener);
        agentListeners.set(piSessionId, sessionListeners);

        return () => {
          sessionListeners.delete(listener);
        };
      },
      async sendInitialPrompt(input) {
        const accepted = await bridge.sendInitialPrompt(input);

        await new Promise<void>((resolve) => {
          releasePromptEcho = resolve;
        });

        return accepted;
      },
    };
    const emitAgentEvent = (entry: AgentRuntimeEventEntry) => {
      for (const listener of agentListeners.get("pi-session-followup") ?? []) {
        listener(entry);
      }
    };
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "followup-session",
        projectId: "pig-docs",
        initialPrompt: "First prompt",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:followup-session",
      piSessionId: "pi-session-followup",
    };

    // Gateway-minted user echo of the opening prompt, mirrored into the model.
    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      event: {
        id: "user-echo-1",
        piSessionId: "pi-session-followup",
        kind: "message",
        role: "user",
        body: "First prompt",
        messageId: "pi-sdk:pi-session-followup:user:0",
        timestamp: "2026-07-02T10:00:00.500Z",
      },
    });

    const openingRunId = "pi-session-followup:run-1";
    const openingTurnId = `${openingRunId}:turn-1`;
    const openingAnswerId = `${openingTurnId}:msg-1`;

    for (const entry of [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId: openingRunId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "message",
          runId: openingRunId,
          turnId: openingTurnId,
          messageId: openingAnswerId,
          role: "assistant",
          phase: "end",
          parts: [
            {
              partId: `${openingAnswerId}:part-0`,
              partType: "text",
              body: "First answer",
            },
          ],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: {
          type: "run",
          runId: openingRunId,
          phase: "end",
          trigger: "prompt",
          outcome: "completed",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
    ]) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

    await bridge.restoreSessionState({
      piSessionId: "pi-session-followup",
      runtimeId: "pi-sdk:followup-session",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "completed",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={runtimeModelBridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "followup-session",
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
        }}
      />,
    );

    // Run events own the Session, so the composer sends instead of queuing.
    expect(screen.queryByRole("button", { name: "Steer" })).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("What do you want to know?"),
      "Second prompt",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    // The prompt RPC is parked mid-flight while the follow-up run streams and
    // completes inside the round-trip window.
    await waitFor(() => expect(releasePromptEcho).not.toBeNull());

    const followupRunId = "pi-session-followup:run-2";
    const followupTurnId = `${followupRunId}:turn-1`;
    const followupAnswerId = `${followupTurnId}:msg-1`;

    act(() => {
      for (const entry of [
        {
          seq: 4,
          timestamp: "2026-07-02T10:00:11.000Z",
          event: {
            type: "run",
            runId: followupRunId,
            phase: "start",
            trigger: "prompt",
            surface: "hidden",
            origin: "sdk",
          } as const,
        },
        {
          seq: 5,
          timestamp: "2026-07-02T10:00:12.000Z",
          event: {
            type: "message",
            runId: followupRunId,
            turnId: followupTurnId,
            messageId: followupAnswerId,
            role: "assistant",
            phase: "end",
            parts: [
              {
                partId: `${followupAnswerId}:part-0`,
                partType: "text",
                body: "Second answer",
              },
            ],
            surface: "chat",
            origin: "sdk",
          } as const,
        },
        {
          seq: 6,
          timestamp: "2026-07-02T10:00:13.000Z",
          event: {
            type: "run",
            runId: followupRunId,
            phase: "end",
            trigger: "prompt",
            outcome: "completed",
            surface: "hidden",
            origin: "sdk",
          } as const,
        },
      ]) {
        emitAgentEvent(entry);
      }
    });

    await act(async () => {
      releasePromptEcho?.();
    });

    const liveChat = await screen.findByLabelText("Live Chat messages");

    await waitFor(
      () => expect(liveChat).toHaveTextContent("First prompt"),
      { timeout: 3000 },
    );
    await waitFor(
      () => expect(liveChat).toHaveTextContent("First answer"),
      { timeout: 3000 },
    );
    // The user echo from the RPC return must survive the commit …
    await waitFor(
      () => expect(liveChat).toHaveTextContent("Second prompt"),
      { timeout: 3000 },
    );
    // … and so must the run events that landed inside the RPC window.
    await waitFor(
      () => expect(liveChat).toHaveTextContent("Second answer"),
      { timeout: 3000 },
    );
  });

  it("keeps the run(end) that lands inside the Stop round-trip so the aborted bubble settles", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-07-02T10:00:10.000Z",
    });
    const agentListeners = new Map<
      string,
      Set<(entry: AgentRuntimeEventEntry) => void>
    >();
    let releaseAbort: (() => void) | null = null;
    // The abort RPC is held open so the Gateway's run(end) for the aborted
    // Run can arrive inside the round-trip window — the window handleStopRun
    // used to clobber with its pre-await projection snapshot, leaving the
    // aborted bubble ticking forever next to the next prompt's live one.
    const stopRaceBridge: InMemoryPiRuntimeBridge = {
      ...bridge,
      subscribeToAgentEvents(piSessionId, listener) {
        const sessionListeners = agentListeners.get(piSessionId) ?? new Set();

        sessionListeners.add(listener);
        agentListeners.set(piSessionId, sessionListeners);

        return () => {
          sessionListeners.delete(listener);
        };
      },
      async abortRun(input) {
        const stopped = await bridge.abortRun(input);

        await new Promise<void>((resolve) => {
          releaseAbort = resolve;
        });

        return stopped;
      },
    };
    const emitAgentEvent = (entry: AgentRuntimeEventEntry) => {
      for (const listener of agentListeners.get("pi-session-stop-race") ?? []) {
        listener(entry);
      }
    };
    const runId = "pi-session-stop-race:run-1";
    const turnId = `${runId}:turn-1`;
    const messageId = `${turnId}:msg-1`;
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "stop-race-session",
        projectId: "pig-docs",
        initialPrompt: "First prompt",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:stop-race-session",
      piSessionId: "pi-session-stop-race",
    };

    // The Run is mid-thought when the user reaches for Stop.
    for (const entry of [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId,
          role: "assistant",
          phase: "start",
          parts: [],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:02.500Z",
        event: {
          type: "message_part",
          runId,
          turnId,
          messageId,
          partId: `${messageId}:part-0`,
          partType: "thinking",
          phase: "start",
          bodyMode: "delta",
          body: "Considering",
          surface: "chat",
          origin: "sdk",
        } as const,
      },
    ]) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

    await bridge.restoreSessionState({
      piSessionId: "pi-session-stop-race",
      runtimeId: "pi-sdk:stop-race-session",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "running",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={stopRaceBridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "stop-race-session",
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
        }}
      />,
    );

    const liveColumn = await screen.findByTestId("live-session-column");
    const liveChat = await screen.findByLabelText("Live Chat messages");

    expect(within(liveChat).getByRole("status")).toBeInTheDocument();

    await user.click(await within(liveColumn).findByRole("button", { name: "Stop" }));
    await waitFor(() => expect(releaseAbort).not.toBeNull());

    // Pi closes the aborted Run while the abort RPC is still in flight.
    act(() => {
      for (const entry of [
        {
          seq: 4,
          timestamp: "2026-07-02T10:00:09.000Z",
          event: {
            type: "message",
            runId,
            turnId,
            messageId,
            role: "assistant",
            phase: "end",
            parts: [
              {
                partId: `${messageId}:part-0`,
                partType: "thinking",
                body: "Considering",
              },
            ],
            surface: "chat",
            origin: "sdk",
          } as const,
        },
        {
          seq: 5,
          timestamp: "2026-07-02T10:00:09.500Z",
          event: {
            type: "run",
            runId,
            phase: "end",
            trigger: "prompt",
            outcome: "aborted",
            surface: "hidden",
            origin: "sdk",
          } as const,
        },
      ]) {
        emitAgentEvent(entry);
      }
    });

    await act(async () => {
      releaseAbort?.();
    });

    await waitFor(() => {
      expect(within(liveColumn).queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
    });

    // A completed Session hides every clock, so the lost run(end) only shows
    // once the next prompt puts the Session back in flight.
    await user.type(
      screen.getByPlaceholderText("What do you want to know?"),
      "Second prompt",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const nextRunId = "pi-session-stop-race:run-2";
    const nextTurnId = `${nextRunId}:turn-1`;
    const nextMessageId = `${nextTurnId}:msg-1`;

    act(() => {
      for (const entry of [
        {
          seq: 6,
          timestamp: "2026-07-02T10:00:20.000Z",
          event: {
            type: "run",
            runId: nextRunId,
            phase: "start",
            trigger: "prompt",
            surface: "hidden",
            origin: "sdk",
          } as const,
        },
        {
          seq: 7,
          timestamp: "2026-07-02T10:00:21.000Z",
          event: {
            type: "message",
            runId: nextRunId,
            turnId: nextTurnId,
            messageId: nextMessageId,
            role: "assistant",
            phase: "start",
            parts: [],
            surface: "chat",
            origin: "sdk",
          } as const,
        },
      ]) {
        emitAgentEvent(entry);
      }
    });

    // Only the new Run beats; the aborted one stays settled.
    await waitFor(() => {
      expect(within(liveChat).getAllByRole("status")).toHaveLength(1);
    });
    expect(within(liveChat).getByText("Second prompt")).toBeInTheDocument();
  });

  it("keeps the run events that land inside the Steer round-trip", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-07-02T10:00:10.000Z",
    });
    const agentListeners = new Map<
      string,
      Set<(entry: AgentRuntimeEventEntry) => void>
    >();
    let releaseSteer: (() => void) | null = null;
    // Same window as Stop: the steer RPC is parked so the Run's answer can
    // land inside it, and the commit must not fall back to the pre-await
    // projection snapshot.
    const steerRaceBridge: InMemoryPiRuntimeBridge = {
      ...bridge,
      subscribeToAgentEvents(piSessionId, listener) {
        const sessionListeners = agentListeners.get(piSessionId) ?? new Set();

        sessionListeners.add(listener);
        agentListeners.set(piSessionId, sessionListeners);

        return () => {
          sessionListeners.delete(listener);
        };
      },
      async steerRun(input) {
        const steered = await bridge.steerRun(input);

        await new Promise<void>((resolve) => {
          releaseSteer = resolve;
        });

        return steered;
      },
    };
    const emitAgentEvent = (entry: AgentRuntimeEventEntry) => {
      for (const listener of agentListeners.get("pi-session-steer-race") ?? []) {
        listener(entry);
      }
    };
    const runId = "pi-session-steer-race:run-1";
    const turnId = `${runId}:turn-1`;
    const messageId = `${turnId}:msg-1`;
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "steer-race-session",
        projectId: "pig-docs",
        initialPrompt: "First prompt",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:steer-race-session",
      piSessionId: "pi-session-steer-race",
    };

    for (const entry of [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId,
          role: "assistant",
          phase: "start",
          parts: [],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
    ]) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

    await bridge.restoreSessionState({
      piSessionId: "pi-session-steer-race",
      runtimeId: "pi-sdk:steer-race-session",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "running",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={steerRaceBridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "steer-race-session",
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
        }}
      />,
    );

    await user.type(
      await screen.findByPlaceholderText("Queue the next task…"),
      "Steer text",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const pendingQueue = await screen.findByTestId("queued-message-list");

    await user.click(
      within(pendingQueue).getByRole("button", {
        name: "Steer the run with this message",
      }),
    );
    await waitFor(() => expect(releaseSteer).not.toBeNull());

    // The Run answers while the steer RPC is still in flight.
    act(() => {
      emitAgentEvent({
        seq: 3,
        timestamp: "2026-07-02T10:00:09.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId,
          role: "assistant",
          phase: "end",
          parts: [
            {
              partId: `${messageId}:part-0`,
              partType: "text",
              body: "Answer before the steer landed",
            },
          ],
          surface: "chat",
          origin: "sdk",
        },
      });
    });

    await act(async () => {
      releaseSteer?.();
    });

    const liveChat = await screen.findByLabelText("Live Chat messages");

    await waitFor(() => expect(liveChat).toHaveTextContent("Steer text"));
    // The answer streams in through the incremental renderer, so give it a beat.
    await waitFor(
      () => expect(liveChat).toHaveTextContent("Answer before the steer landed"),
      { timeout: 3000 },
    );
  });

  it("keeps the submitted user bubble when a slow resume resync lands after the prompt echo", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-07-02T10:00:10.000Z",
    });
    let releaseResume: (() => void) | null = null;
    // resumeSession snapshots the Session state when the RPC starts (the way
    // the Gateway snapshot predates later events) and stays parked until the
    // test releases it.
    const resumingBridge = {
      ...bridge,
      async resumeSession(input: { piSessionId: string }) {
        const snapshot = await bridge.getSessionState(input.piSessionId);

        await new Promise<void>((resolve) => {
          releaseResume = resolve;
        });

        return snapshot;
      },
    };
    const projection: SessionProjection = {
      ...createSessionProjection({
        id: "resumed-session",
        projectId: "pig-docs",
        initialPrompt: "First prompt",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      status: "completed",
      creationStage: "accepted",
      runtimeId: "pi-sdk:resumed-session",
      piSessionId: "pi-session-resumed",
      sessionFile: "/sessions/pi-session-resumed.jsonl",
      runtimeEvents: [
        {
          id: "user-echo-1",
          piSessionId: "pi-session-resumed",
          kind: "message",
          role: "user",
          body: "First prompt",
          timestamp: "2026-07-02T10:00:00.500Z",
        },
      ],
      updatedAt: "2026-07-02T10:00:00.500Z",
    };

    await bridge.restoreSessionState({
      piSessionId: "pi-session-resumed",
      runtimeId: "pi-sdk:resumed-session",
      projectId: "pig-docs",
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "completed",
      events: projection.runtimeEvents,
      updatedAt: projection.updatedAt,
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        runtimeBridge={resumingBridge}
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "resumed-session",
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
        }}
      />,
    );

    // The resume RPC parked on mount; the user sends a follow-up while it is
    // still in flight and the echo renders.
    await waitFor(() => expect(releaseResume).not.toBeNull());

    await user.type(
      screen.getByPlaceholderText("What do you want to know?"),
      "Second prompt",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const liveChat = await screen.findByLabelText("Live Chat messages");

    await waitFor(
      () => expect(liveChat).toHaveTextContent("Second prompt"),
      { timeout: 3000 },
    );

    // The slow resume RPC now returns its pre-prompt snapshot; the resync
    // commit must not clobber the echo that landed while it was in flight.
    await act(async () => {
      releaseResume?.();
    });

    await waitFor(
      () => expect(liveChat).toHaveTextContent("Second prompt"),
      { timeout: 3000 },
    );
    expect(liveChat).toHaveTextContent("First prompt");
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

  it("takes an injected block into the draft it already has, screenshot and all", async () => {
    // The browser surface hands the composer marked-up page annotations from
    // outside the chat column (#151). jsdom has no object URLs, and the
    // attachment path makes one for every image preview.
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:annotations",
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => {},
    });

    let projection = applySessionProjectionEvent(
      createSessionProjection({
        id: "annotated-session",
        projectId: "pig-docs",
        initialPrompt: "Review the preview",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      {
        type: "runtime-bound",
        stage: "starting runtime",
        runtimeId: "runtime-annotated",
        piSessionId: "pi-session-annotated",
        occurredAt: "2026-06-26T08:00:01.000Z",
      },
    );

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-state-resynced",
      state: {
        piSessionId: "pi-session-annotated",
        runtimeId: "runtime-annotated",
        projectId: "pig-docs",
        cwd: "/Users/void/code/opensource/Pig/docs",
        status: "idle",
        events: projection.runtimeEvents,
        updatedAt: "2026-06-26T08:00:03.000Z",
      },
    });
    saveFollowUpDraft("annotated-session", "Half a thought");

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        sessionProjection={projection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "annotated-session",
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

    const composer = await screen.findByPlaceholderText("What do you want to know?");

    act(() => {
      injectIntoComposer({
        sessionId: "annotated-session",
        text: "Browser annotations from the embedded preview",
        files: [
          new File(["png"], "browser-annotations.png", { type: "image/png" }),
        ],
      });
      // Another Session's surface must not write into this composer.
      injectIntoComposer({ sessionId: "other-session", text: "Not for you" });
    });

    // Appended as its own block: whatever the user was already typing is the
    // point of landing in the draft rather than sending.
    await waitFor(() =>
      expect(composer).toHaveValue(
        "Half a thought\n\nBrowser annotations from the embedded preview",
      ),
    );
    // Persisted like any other draft, so leaving the Session does not lose it.
    expect(getFollowUpDraft("annotated-session")?.message).toBe(
      "Half a thought\n\nBrowser annotations from the embedded preview",
    );
    // The screenshot rides the existing attachment path: drawer preview, size
    // check and base64 encoding at submit all come with it.
    expect(await screen.findByAltText("browser-annotations.png")).toBeInTheDocument();
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

    // Queue-first: the composer has no Steer button; submitting queues, and
    // the queued row carries the Steer action.
    expect(screen.queryByRole("button", { name: "Steer" })).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Queue the next task…"),
      "Avoid changing the archive model.",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const pendingQueue = await screen.findByTestId("queued-message-list");

    await user.click(
      within(pendingQueue).getByRole("button", {
        name: "Steer the run with this message",
      }),
    );

    expect(await within(liveChat).findByText("Steer")).toBeInTheDocument();
    expect(
      within(liveChat).getByText("Avoid changing the archive model."),
    ).toBeInTheDocument();
    // The promoted message leaves the pending queue (kept as a withdrawn row).
    expect(
      await within(pendingQueue).findByText("Withdrawn"),
    ).toBeInTheDocument();
    expect(
      within(pendingQueue).queryByRole("button", {
        name: "Steer the run with this message",
      }),
    ).not.toBeInTheDocument();
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

    const input = screen.getByPlaceholderText("Queue the next task…");

    await user.type(input, "Keep this steer text");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const pendingQueue = await screen.findByTestId("queued-message-list");

    await user.click(
      within(pendingQueue).getByRole("button", {
        name: "Steer the run with this message",
      }),
    );

    // A failed steer surfaces the error and leaves the row queued and steerable.
    expect(await screen.findByText("Pi rejected steer input.")).toBeInTheDocument();
    expect(within(pendingQueue).getByText("Keep this steer text")).toBeInTheDocument();
    expect(
      within(pendingQueue).getByRole("button", {
        name: "Steer the run with this message",
      }),
    ).toBeInTheDocument();
  });

  it("opens a global Session Draft from New Session without adding a Project row", async () => {
    const user = userEvent.setup();

    renderProjectSessions();

    const projectNavigation = await findProjectSessionsGroupByName("Pig");
    const traceUsageNavigation = screen.getByRole("group", {
      name: "Trace and usage navigation",
    });
    const initialRows = getSidebarSessionRows(projectNavigation);

    await user.click(within(traceUsageNavigation).getByRole("button", { name: "New Session" }));

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
    // The composer surface is the Astryx ChatComposer shell now.
    const promptInputShell = promptInput?.querySelector(".astryx-chat-composer");
    const projectPicker = within(draftComposer).getByTestId(
      "session-draft-project-picker",
    );
    const projectPickerControl = within(projectPicker).getByTestId("project-picker");
    const projectPickerTrigger = within(projectPickerControl).getByTestId(
      "project-picker-trigger",
    );
    const projectPickerIcon = within(projectPickerControl).getByTestId(
      "project-picker-folder-icon",
    );
    const inlineProjectSelect = projectPicker.querySelector(".astryx-selector");
    const inlineProjectIndicator = projectPicker.querySelector(
      ".astryx-selector-indicator-icon",
    );
    const nativeProjectSelect = projectPicker.querySelector("select");

    expect(draftComposer).toHaveClass("items-center", "justify-center");
    expect(emptyState).toHaveClass("max-w-[46rem]");
    expect(draftComposer.closest(".card")).toBeNull();
    expect(suggestionRoot).toHaveClass("prompt-suggestion--pill");
    expect(suggestionItems).toHaveClass("prompt-suggestion__items--pill");
    expect(suggestionRoot?.querySelector(".prompt-suggestion__item-end-icon")).toBeNull();
    if (!promptInput || !promptInputShell || !suggestionRoot) {
      throw new Error("Session Draft composer layout is incomplete.");
    }
    expect(promptInputShell).toBeInTheDocument();
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
    expect(projectPickerTrigger).toHaveTextContent("Select Project");
    expect(
      within(projectPickerControl).getByRole("combobox", {
        name: /Target Project/,
      }),
    ).toBeInTheDocument();
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
    // The Selector label is only exposed to assistive tech, never as a
    // visible caption above the picker.
    expect(within(draftComposer).getByText("Target Project")).toHaveClass(
      "astryx-field-label",
    );
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
    expect(getSidebarSessionRows(projectNavigation)).toHaveLength(
      initialRows.length,
    );
    expect(
      within(projectNavigation).queryByRole("button", { name: "New Session" }),
    ).not.toBeInTheDocument();
    expect(within(projectNavigation).queryByText("Session Draft")).not.toBeInTheDocument();

    await user.click(projectPickerTrigger);

    expectAdaptiveInlineSelectPopover(getOpenSelectorListbox());
    expectInlineSelectOptionIsAstryxOption(
      await screen.findByRole("option", { name: "Select Project" }),
    );
    expectInlineSelectOptionLabelMatchesCompactMenu(
      await screen.findByRole("option", { name: "Select Project" }),
      "Select Project",
    );
  });

  it("only shows the draft composer when draft view is selected", async () => {
    saveSessionDraft("pig", "Keep this draft available");

    renderProjectSessions("/projects/pig/sessions");

    const liveColumn = await screen.findByTestId("live-session-column");

    expect(within(liveColumn).queryByTestId("session-draft-composer")).not.toBeInTheDocument();
    // Session hydration settles asynchronously after the column mounts.
    expect(
      (await within(liveColumn).findAllByText("Agent Workspace shell")).length,
    ).toBeGreaterThan(0);
    expect(
      within(liveColumn).getByPlaceholderText("Queue the next task…"),
    ).toBeInTheDocument();
  });

  it("restores the same global draft after repeated New Session clicks and reload", async () => {
    const user = userEvent.setup();
    const firstRender = renderProjectSessions();

    await user.click(await screen.findByRole("button", { name: "New Session" }));
    fireEvent.change(screen.getByPlaceholderText("Do anything with Pi"), {
      target: { value: "Keep this initial prompt" },
    });

    expect(getSessionDraft()).toMatchObject({
      projectId: null,
      prompt: "Keep this initial prompt",
    });

    await user.click(screen.getByRole("button", { name: "New Session" }));

    expect(screen.getByPlaceholderText("Do anything with Pi")).toHaveValue(
      "Keep this initial prompt",
    );

    firstRender.unmount();
    renderProjectSessions("/projects/pig/sessions?view=draft");

    expect(await screen.findByPlaceholderText("Do anything with Pi")).toHaveValue(
      "Keep this initial prompt",
    );
  });

  it("restores the last selected model on a new Session Draft", async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === "list_session_projections") {
        return [];
      }

      if (command === "list_provider_auth_status") {
        return {
          agentDir: "",
          authPath: "",
          configuredCount: 1,
          providers: [],
        };
      }

      if (command === "list_available_model_controls") {
        return {
          models: [
            {
              provider: "deepseek",
              modelId: "deepseek-chat",
              name: "DeepSeek Chat",
              thinkingLevels: ["off"],
            },
            {
              provider: "openai-codex",
              modelId: "gpt-5.6-sol",
              name: "GPT-5.6 SOL",
              thinkingLevels: ["off", "low", "medium", "high"],
            },
          ],
          selected: {
            provider: "deepseek",
            modelId: "deepseek-chat",
            thinkingLevel: "off",
          },
        };
      }

      if (command === "get_config_inventory") {
        return {
          skills: [],
          extensions: [],
          packages: [],
          promptTemplates: [],
        };
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn(() => vi.fn()),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };
    saveLastModelSelection({
      provider: "openai-codex",
      modelId: "gpt-5.6-sol",
      thinkingLevel: "high",
    });
    saveSessionDraft(pigProjectPath, "");

    renderProjectSessions("/projects/pig/sessions?view=draft");

    expect(await screen.findByTestId("model-thinking-trigger")).toHaveTextContent(
      "GPT-5.6 SOL · High",
    );
  });

  it("lists only the models Settings kept visible and links back to Settings", async () => {
    const user = userEvent.setup();
    const invoke = vi.fn(async (command: string) => {
      if (command === "list_session_projections") {
        return [];
      }

      if (command === "list_provider_auth_status") {
        return {
          agentDir: "",
          authPath: "",
          configuredCount: 1,
          providers: [],
        };
      }

      if (command === "list_available_model_controls") {
        return {
          models: [
            {
              provider: "deepseek",
              modelId: "deepseek-chat",
              name: "DeepSeek Chat",
              thinkingLevels: ["off"],
            },
            {
              provider: "openai-codex",
              modelId: "gpt-5.6-sol",
              name: "GPT-5.6 SOL",
              thinkingLevels: ["off", "low", "medium", "high"],
            },
          ],
          selected: {
            provider: "deepseek",
            modelId: "deepseek-chat",
            thinkingLevel: "off",
          },
        };
      }

      if (command === "get_config_inventory") {
        return {
          skills: [],
          extensions: [],
          packages: [],
          promptTemplates: [],
        };
      }

      throw new Error(`unexpected backend command ${command}`);
    });
    window.pigui = {
      invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
      onBackendEvent: vi.fn(() => vi.fn()),
      onBrowserEvent: vi.fn(() => vi.fn()),
      onWindowFocusChanged: vi.fn(() => vi.fn()),
    };
    saveLastModelSelection({
      provider: "openai-codex",
      modelId: "gpt-5.6-sol",
      thinkingLevel: "high",
    });
    saveVisibleModels([{ provider: "openai-codex", modelId: "gpt-5.6-sol" }]);
    saveSessionDraft(pigProjectPath, "");

    renderProjectSessions("/projects/pig/sessions?view=draft");

    await user.click(await screen.findByTestId("model-thinking-trigger"));

    const modelList = await screen.findByTestId("model-thinking-model-list");

    expect(within(modelList).getByText("GPT-5.6 SOL")).toBeInTheDocument();
    expect(within(modelList).queryByText("DeepSeek Chat")).not.toBeInTheDocument();

    await user.click(screen.getByText("Add Models"));

    expect(await screen.findByText("Settings route")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onDraftSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutMode: "local",
        projectId: "pig-docs",
        prompt: "Summarize the docs ADR",
      }),
    );
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

    await user.click(screen.getByRole("button", { name: "Send" }));

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

    await user.click(screen.getByRole("button", { name: "Send" }));

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

    await user.click(screen.getByRole("button", { name: "Send" }));
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
      within(liveColumn).getByPlaceholderText("Queue the next task…"),
      "Queue this follow-up after creation",
    );
    await user.click(within(liveColumn).getByRole("button", { name: "Send" }));

    const pendingQueue = await screen.findByTestId("queued-message-list");

    expect(
      within(pendingQueue).getByText("Queue this follow-up after creation"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Live Chat messages")).queryByText(
        "Queue this follow-up after creation",
      ),
    ).not.toBeInTheDocument();
  });

  it("defaults Session Draft checkout to local and still creates a managed worktree when chosen", async () => {
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

    expect(screen.getByTestId("checkout-strategy-trigger")).toHaveTextContent(
      "Local",
    );
    await user.click(screen.getByTestId("checkout-strategy-trigger"));
    const localCheckoutOption = await screen.findByRole("option", { name: "Local" });
    const worktreeCheckoutOption = await screen.findByRole("option", {
      name: "Worktree",
    });

    expect(
      within(localCheckoutOption).getByTestId("checkout-strategy-local-icon"),
    ).toHaveClass("pigui-compact-menu-item-icon");
    expect(worktreeCheckoutOption).toBeInTheDocument();
    expectInlineSelectOptionIsAstryxOption(worktreeCheckoutOption);
    expectInlineSelectOptionLabelMatchesCompactMenu(
      worktreeCheckoutOption,
      "Worktree",
    );
    expectAdaptiveInlineSelectPopover(getOpenSelectorListbox());
    await user.click(worktreeCheckoutOption);

    await user.click(screen.getByRole("button", { name: "Send" }));

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

  it("lets users choose a local checkout even when another Session is active", async () => {
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
    saveSessionDraft("pig-docs", "Run beside an active Session in place");
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

    expect(screen.getByTestId("checkout-strategy-trigger")).toHaveTextContent(
      "Local",
    );

    await user.click(screen.getByTestId("checkout-strategy-trigger"));
    await user.click(await screen.findByRole("option", { name: "Local" }));

    const checkoutStrategyTrigger = screen.getByTestId("checkout-strategy-trigger");

    expect(checkoutStrategyTrigger).toHaveTextContent("Local");
    expect(
      within(checkoutStrategyTrigger).getByTestId("checkout-strategy-local-icon"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send" }));

    const createdProjection = await waitFor(() => {
      const latest = projections[projections.length - 1];

      expect(latest?.initialPrompt).toBe("Run beside an active Session in place");
      expect(latest?.checkout?.mode).toBe("foreground-local");

      return latest;
    });

    expect(createdProjection?.checkout?.executionCheckoutRoot).toBe(
      "/Users/void/code/opensource/Pig",
    );
    expect(createdProjection?.checkout?.runtimeCwd).toBe(
      "/Users/void/code/opensource/Pig/packages/web",
    );
    expect(createdWorktrees).toHaveLength(0);
  });

  it("forks a user message into a managed worktree and pre-fills the new composer", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-07-03T12:10:00.000Z",
    });
    const projections: SessionProjection[] = [];
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
    const sourceProjection: SessionProjection = {
      ...createSessionProjection({
        id: "source-session",
        projectId: "pig-docs",
        initialPrompt: "Earlier user",
        createdAt: "2026-07-03T12:00:00.000Z",
      }),
      status: "completed",
      creationStage: "accepted",
      runtimeId: "pi-sdk:source-session",
      piSessionId: "pi-session-source",
      sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-source.jsonl",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      runtimeEvents: [
        {
          id: "evt-source-user",
          piSessionId: "pi-session-source",
          kind: "message",
          role: "user",
          body: "Revise this branch",
          messageId: "pi-sdk:pi-session-source:user:1",
          piEntryId: "pi-entry-user-2",
          timestamp: "2026-07-03T12:00:01.000Z",
        },
      ],
      updatedAt: "2026-07-03T12:00:01.000Z",
    };

    const forkSession = vi.fn(
      async (input: ForkSessionInput): Promise<ForkSessionResult> => ({
        selectedText: "Revise this branch",
        state: {
          piSessionId: "pi-session-forked",
          runtimeId: `pi-sdk:${input.sessionId}`,
          projectId: input.projectId,
          cwd: input.cwd,
          status: "idle",
          sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-forked.jsonl",
          events: [
            {
              id: "evt-fork-marker",
              piSessionId: "pi-session-forked",
              kind: "message",
              role: "user",
              body: "Earlier user",
              piEntryId: "pi-entry-user-1",
              timestamp: "2026-07-03T12:10:00.000Z",
            },
          ],
          updatedAt: "2026-07-03T12:10:00.000Z",
        },
      }),
    );

    bridge.forkSession = forkSession;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <AgentWorkspaceSessionsView
        checkoutManager={checkoutManager}
        projectId="pig-docs"
        runtimeBridge={bridge}
        sessionProjection={sourceProjection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "source-session",
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
        onProjectionChange={(projection) => {
          projections.push(projection);
        }}
      />,
    );

    const sourceMessage = (await screen.findByText("Revise this branch")).closest(
      '[data-slot="chat-message-user"]',
    );
    const sourceActions = sourceMessage?.querySelector(
      '[data-slot="chat-message-actions"]',
    );

    expect(sourceActions).toBeInTheDocument();

    await user.click(
      within(sourceActions as HTMLElement).getByRole("button", { name: "Fork from message" }),
    );

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Fork this message into a new Session?"),
    );
    const forkInput = forkSession.mock.calls[0]?.[0];

    if (!forkInput) {
      throw new Error("forkSession was not called.");
    }

    expect(forkInput).toMatchObject({
      projectId: "pig-docs",
      sourcePiSessionId: "pi-session-source",
      sourceSessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-source.jsonl",
      piEntryId: "pi-entry-user-2",
      cwd: expect.stringMatching(/^\/tmp\/pig-worktrees\/session-/),
      checkout: expect.objectContaining({
        mode: "managed-worktree",
        runtimeCwd: expect.stringMatching(/^\/tmp\/pig-worktrees\/session-.*\/docs$/),
      }),
    });
    expect(createdWorktrees).toHaveLength(1);

    const forkedProjection = await waitFor(() => {
      const latest = projections[projections.length - 1];

      expect(latest?.piSessionId).toBe("pi-session-forked");
      expect(latest?.checkout?.mode).toBe("managed-worktree");

      return latest;
    });

    expect(getFollowUpDraft(forkedProjection.id)?.message).toBe("Revise this branch");
    expect(screen.getByPlaceholderText("What do you want to know?")).toHaveValue(
      "Revise this branch",
    );
  });

  it("does not fork a user message when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const bridge = createInMemoryPiRuntimeBridge({
      now: () => "2026-07-03T12:10:00.000Z",
    });
    const projections: SessionProjection[] = [];
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
    const sourceProjection: SessionProjection = {
      ...createSessionProjection({
        id: "source-session",
        projectId: "pig-docs",
        initialPrompt: "Earlier user",
        createdAt: "2026-07-03T12:00:00.000Z",
      }),
      status: "completed",
      creationStage: "accepted",
      runtimeId: "pi-sdk:source-session",
      piSessionId: "pi-session-source",
      sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-source.jsonl",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      runtimeEvents: [
        {
          id: "evt-source-user",
          piSessionId: "pi-session-source",
          kind: "message",
          role: "user",
          body: "Revise this branch",
          messageId: "pi-sdk:pi-session-source:user:1",
          piEntryId: "pi-entry-user-2",
          timestamp: "2026-07-03T12:00:01.000Z",
        },
      ],
      updatedAt: "2026-07-03T12:00:01.000Z",
    };
    const forkSession = vi.fn(
      async (input: ForkSessionInput): Promise<ForkSessionResult> => ({
        selectedText: "Revise this branch",
        state: {
          piSessionId: "pi-session-forked",
          runtimeId: `pi-sdk:${input.sessionId}`,
          projectId: input.projectId,
          cwd: input.cwd,
          status: "idle",
          sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-forked.jsonl",
          events: [],
          updatedAt: "2026-07-03T12:10:00.000Z",
        },
      }),
    );

    bridge.forkSession = forkSession;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <AgentWorkspaceSessionsView
        checkoutManager={checkoutManager}
        projectId="pig-docs"
        runtimeBridge={bridge}
        sessionProjection={sourceProjection}
        workspace={{
          id: "pig-docs",
          name: "Pig Docs",
          projectRoot: "/Users/void/code/opensource/Pig/docs",
          repoRoot: "/Users/void/code/opensource/Pig",
          selectedSessionId: "source-session",
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
        onProjectionChange={(projection) => {
          projections.push(projection);
        }}
      />,
    );

    const sourceMessage = (await screen.findByText("Revise this branch")).closest(
      '[data-slot="chat-message-user"]',
    );
    const sourceActions = sourceMessage?.querySelector(
      '[data-slot="chat-message-actions"]',
    );

    expect(sourceActions).toBeInTheDocument();

    await user.click(
      within(sourceActions as HTMLElement).getByRole("button", { name: "Fork from message" }),
    );
    await Promise.resolve();

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Fork this message into a new Session?"),
    );
    expect(forkSession).not.toHaveBeenCalled();
    expect(createdWorktrees).toHaveLength(0);
    expect(projections).toHaveLength(0);
    expect(window.localStorage.getItem("pigui.followUpDrafts.v1")).toBeNull();
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

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Session creation failed")).toBeInTheDocument();
    expect(screen.getByText("sending prompt")).toBeInTheDocument();
    expect(screen.getByText("Pi rejected the initial prompt")).toBeInTheDocument();
    expect(getSessionDraft("pig-docs")?.prompt).toBe("Summarize the docs ADR");
    expect(screen.getByPlaceholderText("Do anything with Pi")).toHaveValue(
      "Summarize the docs ADR",
    );
  });

  it("renders Live Chat and trace from the structured runtime model when run events own the session", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-model",
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
    const runId = "pi-session-model:run-1";
    const turnId = `${runId}:turn-1`;
    const abandonedId = `${turnId}:msg-1`;
    const answerId = `${turnId}:msg-2`;
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "session-model",
        projectId: "pig-docs",
        initialPrompt: "Ship the slice",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:session-model",
      piSessionId: "pi-session-model",
    };

    // Gateway-minted user echo arrives on the legacy stream and is mirrored.
    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      event: {
        id: "user-echo-1",
        piSessionId: "pi-session-model",
        kind: "message",
        role: "user",
        body: "Ship the slice",
        messageId: "pi-sdk:pi-session-model:user:0",
        timestamp: "2026-07-02T10:00:00.500Z",
      },
    });

    const agentEntries = [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId: abandonedId,
          role: "assistant",
          phase: "end",
          abandoned: true,
          parts: [
            { partId: `${abandonedId}:part-0`, partType: "text", body: "Partial answer before retry" },
          ],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: {
          type: "message_part",
          runId,
          turnId,
          messageId: answerId,
          partId: `${answerId}:part-0`,
          partType: "thinking",
          phase: "end",
          bodyMode: "snapshot",
          body: "Inspect the repo first.",
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 4,
        timestamp: "2026-07-02T10:00:03.500Z",
        event: {
          type: "message_part",
          runId,
          turnId,
          messageId: answerId,
          partId: `${answerId}:part-1`,
          partType: "tool_call",
          phase: "end",
          bodyMode: "snapshot",
          body: '{"path":"AGENTS.md"}',
          toolCallId: "call-1",
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 5,
        timestamp: "2026-07-02T10:00:04.000Z",
        event: {
          type: "tool",
          runId,
          turnId,
          toolCallId: "call-1",
          phase: "end",
          name: "read_file",
          args: { path: "AGENTS.md" },
          result: { ok: true },
          isError: false,
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 6,
        timestamp: "2026-07-02T10:00:05.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId: answerId,
          role: "assistant",
          phase: "end",
          parts: [
            { partId: `${answerId}:part-0`, partType: "thinking", body: "Inspect the repo first." },
            {
              partId: `${answerId}:part-1`,
              partType: "tool_call",
              body: '{"path":"AGENTS.md"}',
              toolCallId: "call-1",
            },
            { partId: `${answerId}:part-2`, partType: "text", body: "The slice is shipped." },
          ],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 7,
        timestamp: "2026-07-02T10:00:06.000Z",
        event: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "completed",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
    ];

    for (const entry of agentEntries) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    expect(screen.getByText("Ship the slice")).toBeInTheDocument();
    expect(screen.getByText("The slice is shipped.")).toBeInTheDocument();
    // Abandoned retry partials never render as chat answers.
    expect(screen.queryByText("Partial answer before retry")).not.toBeInTheDocument();
    // The settled burst reads as what it did, with the call itself behind it.
    expect(screen.getByText("Read AGENTS.md")).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("Inspect the repo first.")).toBeInTheDocument();
  });

  it("leaves no empty assistant bubble when a failed run's only model call was abandoned", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-model",
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
    const runId = "pi-session-model:run-1";
    const turnId = `${runId}:turn-1`;
    const abandonedId = `${turnId}:msg-1`;
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "session-model",
        projectId: "pig-docs",
        initialPrompt: "Ship it",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:session-model",
      piSessionId: "pi-session-model",
    };

    // The retry threw away the run's only Message and then failed outright, so
    // the Chain of Thought has nothing to show. The failure is the error
    // bubble's to tell; a second, empty bubble above it is just a gap.
    for (const entry of [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId: abandonedId,
          role: "assistant",
          phase: "start",
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: { type: "status", runId, code: "retrying", surface: "trace", origin: "sdk" } as const,
      },
      {
        seq: 4,
        timestamp: "2026-07-02T10:00:03.500Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId: abandonedId,
          role: "assistant",
          phase: "end",
          abandoned: true,
          parts: [{ partId: `${abandonedId}:part-0`, partType: "text", body: "Par" }],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 5,
        timestamp: "2026-07-02T10:00:04.000Z",
        event: {
          type: "status",
          runId,
          code: "retry_failed",
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 6,
        timestamp: "2026-07-02T10:00:04.500Z",
        event: {
          type: "error",
          runId,
          code: "provider_error",
          body: "The provider dropped the connection.",
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 7,
        timestamp: "2026-07-02T10:00:05.000Z",
        event: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "failed",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
    ]) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

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
    expect(within(assistantMessages[0]).getByText("Run failed")).toBeInTheDocument();
    expect(
      within(assistantMessages[0]).getByText("The provider dropped the connection."),
    ).toBeInTheDocument();
  });

  it("discloses a measured model call on a plain answer that leaves no trace steps behind", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-model",
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
    const runId = "pi-session-model:run-1";
    const turnId = `${runId}:turn-1`;
    const answerId = `${turnId}:msg-1`;
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "session-model",
        projectId: "pig-docs",
        initialPrompt: "Ship it",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:session-model",
      piSessionId: "pi-session-model",
    };

    // A non-reasoning model: one call, one text part, no thinking, no tools —
    // so the old last-minus-first-step heuristic had nothing to measure.
    for (const entry of [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId: answerId,
          role: "assistant",
          phase: "start",
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:07.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId: answerId,
          role: "assistant",
          phase: "end",
          parts: [{ partId: `${answerId}:part-0`, partType: "text", body: "Shipped." }],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 4,
        timestamp: "2026-07-02T10:00:07.000Z",
        event: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "completed",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
    ]) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

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

    expect(within(assistantMessage!).getByText("Shipped.")).toBeInTheDocument();
    expect(within(assistantMessage!).getByText("Worked for 5s")).toBeInTheDocument();
    // Nothing to expand behind the summary, so it must not pose as a control.
    expect(
      within(assistantMessage!).queryByRole("button", { name: "Worked for 5s" }),
    ).not.toBeInTheDocument();
  });

  it("measures the wait from the run's first model call to the answer, tool time included", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-model",
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
    const runId = "pi-session-model:run-1";
    const firstId = `${runId}:turn-1:msg-1`;
    const secondId = `${runId}:turn-2:msg-1`;
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "session-model",
        projectId: "pig-docs",
        initialPrompt: "Ship it",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:session-model",
      piSessionId: "pi-session-model",
    };

    // Two calls in one Active Run: 9s then 2s, with 4s of work between them
    // that belongs to no call. One anchor spans the lot — 10:00:01 to the
    // second call's answer — because that is what the user waited through
    // (ADR-0030 §6); summing the calls alone would drop those 4s.
    for (const entry of [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:00.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "message",
          runId,
          turnId: `${runId}:turn-1`,
          messageId: firstId,
          role: "assistant",
          phase: "start",
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:09.000Z",
        event: {
          type: "message_part",
          runId,
          turnId: `${runId}:turn-1`,
          messageId: firstId,
          partId: `${firstId}:part-0`,
          partType: "thinking",
          phase: "end",
          bodyMode: "snapshot",
          body: "Read the ADR first.",
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 4,
        timestamp: "2026-07-02T10:00:10.000Z",
        event: {
          type: "message",
          runId,
          turnId: `${runId}:turn-1`,
          messageId: firstId,
          role: "assistant",
          phase: "end",
          parts: [
            { partId: `${firstId}:part-0`, partType: "thinking", body: "Read the ADR first." },
          ],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 5,
        timestamp: "2026-07-02T10:00:14.000Z",
        event: {
          type: "message",
          runId,
          turnId: `${runId}:turn-2`,
          messageId: secondId,
          role: "assistant",
          phase: "start",
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 6,
        timestamp: "2026-07-02T10:00:16.000Z",
        event: {
          type: "message",
          runId,
          turnId: `${runId}:turn-2`,
          messageId: secondId,
          role: "assistant",
          phase: "end",
          parts: [{ partId: `${secondId}:part-0`, partType: "text", body: "Shipped." }],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 7,
        timestamp: "2026-07-02T10:00:16.000Z",
        event: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "completed",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
    ]) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

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
    expect(within(assistantMessages[0]).getByText("Worked for 15s")).toBeInTheDocument();
  });

  it("renders image parts from a Gateway-minted user echo", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-model",
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
    const runId = "pi-session-model:run-1";
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "session-model",
        projectId: "pig-docs",
        initialPrompt: "Look at this",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:session-model",
      piSessionId: "pi-session-model",
    };

    projection = applySessionProjectionEvent(projection, {
      type: "runtime-event-received",
      event: {
        id: "user-echo-1",
        piSessionId: "pi-session-model",
        kind: "message",
        role: "user",
        body: "Look at this",
        messageId: "pi-sdk:pi-session-model:user:0",
        images: [{ mimeType: "image/png", data: "abc", name: "shot.png" }],
        timestamp: "2026-07-02T10:00:00.500Z",
      },
    });
    projection = applySessionProjectionEvent(projection, {
      type: "agent-event-received",
      entry: {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        },
      },
    });

    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
      />,
    );

    expect(screen.getByText("Look at this")).toBeInTheDocument();
    expect(screen.getByAltText("shot.png")).toHaveAttribute(
      "src",
      "data:image/png;base64,abc",
    );
  });

  it("collapses structured runtime turn messages and attaches their trace to the final assistant answer", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-model",
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
    const runId = "pi-session-model:run-1";
    const turnOneId = `${runId}:turn-1`;
    const turnTwoId = `${runId}:turn-2`;
    const finalTurnId = `${runId}:turn-3`;
    const inspectMessageId = `${turnOneId}:msg-1`;
    const readMessageId = `${turnTwoId}:msg-1`;
    const answerMessageId = `${finalTurnId}:msg-1`;
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "session-model",
        projectId: "pig-docs",
        initialPrompt: "Inspect the repo",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:session-model",
      piSessionId: "pi-session-model",
    };

    const agentEntries = [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "message",
          runId,
          turnId: turnOneId,
          messageId: inspectMessageId,
          role: "assistant",
          phase: "end",
          parts: [
            {
              partId: `${inspectMessageId}:part-0`,
              partType: "thinking",
              body: "Plan the repository inspection.",
            },
            {
              partId: `${inspectMessageId}:part-1`,
              partType: "tool_call",
              body: "{\"command\":\"ls -la\"}",
              toolCallId: "call-list",
            },
          ],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: {
          type: "tool",
          runId,
          turnId: turnOneId,
          toolCallId: "call-list",
          phase: "end",
          name: "shell",
          args: { command: "ls -la" },
          result: "listed files",
          isError: false,
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 4,
        timestamp: "2026-07-02T10:00:04.000Z",
        event: {
          type: "message",
          runId,
          turnId: turnTwoId,
          messageId: readMessageId,
          role: "assistant",
          phase: "end",
          parts: [
            {
              partId: `${readMessageId}:part-0`,
              partType: "thinking",
              body: "Read the main instructions next.",
            },
            {
              partId: `${readMessageId}:part-1`,
              partType: "text",
              body: "Intermediate progress should not become a separate answer.",
            },
            {
              partId: `${readMessageId}:part-2`,
              partType: "tool_call",
              body: "{\"path\":\"AGENTS.md\"}",
              toolCallId: "call-read",
            },
          ],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 5,
        timestamp: "2026-07-02T10:00:05.000Z",
        event: {
          type: "tool",
          runId,
          turnId: turnTwoId,
          toolCallId: "call-read",
          phase: "end",
          name: "read_file",
          args: { path: "AGENTS.md" },
          result: "agent instructions loaded",
          isError: false,
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 6,
        timestamp: "2026-07-02T10:00:06.000Z",
        event: {
          type: "message",
          runId,
          turnId: finalTurnId,
          messageId: answerMessageId,
          role: "assistant",
          phase: "end",
          parts: [
            {
              partId: `${answerMessageId}:part-0`,
              partType: "thinking",
              body: "Summarize the inspection.",
            },
            {
              partId: `${answerMessageId}:part-1`,
              partType: "text",
              body: "This repository is ready to inspect.",
            },
          ],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 7,
        timestamp: "2026-07-02T10:00:07.000Z",
        event: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "completed",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
    ];

    for (const entry of agentEntries) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

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
    expect(within(assistantMessages[0]).getByTestId("markdown-renderer")).toHaveTextContent(
      "This repository is ready to inspect.",
    );
    // Not a second bubble: mid-run text is Interim Output and takes its place
    // in the step list, between that Turn's thinking and its tool call.
    expect(
      within(assistantMessages[0])
        .getByText("Intermediate progress should not become a separate answer.")
        .closest('[data-slot="chat-interim-output"]'),
    ).toBeInTheDocument();
    expect(
      within(assistantMessages[0]).getByText("Plan the repository inspection."),
    ).toBeInTheDocument();
    expect(
      within(assistantMessages[0]).getByText("Read the main instructions next."),
    ).toBeInTheDocument();
    expect(
      within(assistantMessages[0]).getByText("Summarize the inspection."),
    ).toBeInTheDocument();
    expect(within(assistantMessages[0]).getByText("shell")).toBeInTheDocument();
    expect(within(assistantMessages[0]).queryByText("listed files")).not.toBeInTheDocument();
    expect(within(assistantMessages[0]).getByText("read_file")).toBeInTheDocument();
    expect(
      within(assistantMessages[0]).queryByText("agent instructions loaded"),
    ).not.toBeInTheDocument();
  });

  it("folds consecutive tool calls into one step that expands to a row per call", () => {
    const workspace = {
      id: "pig-docs",
      name: "Pig Docs",
      projectRoot: "/Users/void/code/opensource/Pig/docs",
      repoRoot: "/Users/void/code/opensource/Pig",
      selectedSessionId: "session-group",
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
    const runId = "pi-session-group:run-1";
    const turnId = `${runId}:turn-1`;
    const messageId = `${turnId}:msg-1`;
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "session-group",
        projectId: "pig-docs",
        initialPrompt: "Run the checks",
        createdAt: "2026-07-02T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:session-group",
      piSessionId: "pi-session-group",
    };

    const agentEntries = [
      {
        seq: 1,
        timestamp: "2026-07-02T10:00:01.000Z",
        event: {
          type: "run",
          runId,
          phase: "start",
          trigger: "prompt",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
      {
        seq: 2,
        timestamp: "2026-07-02T10:00:02.000Z",
        event: {
          type: "message",
          runId,
          turnId,
          messageId,
          role: "assistant",
          phase: "end",
          parts: [
            {
              partId: `${messageId}:part-0`,
              partType: "tool_call",
              body: '{"path":"AGENTS.md"}',
              toolCallId: "call-read",
            },
            {
              partId: `${messageId}:part-1`,
              partType: "tool_call",
              body: '{"command":"grep -rn TODO"}',
              toolCallId: "call-grep",
            },
            {
              partId: `${messageId}:part-2`,
              partType: "text",
              body: "Checks are done.",
            },
          ],
          surface: "chat",
          origin: "sdk",
        } as const,
      },
      {
        seq: 3,
        timestamp: "2026-07-02T10:00:03.000Z",
        event: {
          type: "tool",
          runId,
          turnId,
          toolCallId: "call-read",
          phase: "start",
          name: "read_file",
          args: { path: "AGENTS.md" },
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 4,
        timestamp: "2026-07-02T10:00:04.000Z",
        event: {
          type: "tool",
          runId,
          turnId,
          toolCallId: "call-read",
          phase: "end",
          name: "read_file",
          result: "agent instructions loaded",
          isError: false,
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 5,
        timestamp: "2026-07-02T10:00:04.500Z",
        event: {
          type: "tool",
          runId,
          turnId,
          toolCallId: "call-grep",
          phase: "start",
          name: "shell",
          args: { command: "grep -rn TODO" },
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 6,
        timestamp: "2026-07-02T10:00:04.545Z",
        event: {
          type: "tool",
          runId,
          turnId,
          toolCallId: "call-grep",
          phase: "end",
          name: "shell",
          result: "grep: no matches",
          isError: true,
          surface: "trace",
          origin: "sdk",
        } as const,
      },
      {
        seq: 7,
        timestamp: "2026-07-02T10:00:05.000Z",
        event: {
          type: "run",
          runId,
          phase: "end",
          trigger: "prompt",
          outcome: "completed",
          surface: "hidden",
          origin: "sdk",
        } as const,
      },
    ];

    for (const entry of agentEntries) {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry,
      });
    }

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

    // The burst is one step row that says what the batch did and how it went;
    // "the last tool name and a number" would read two calls as one.
    const steps = assistantMessage!.querySelectorAll('[data-slot="chat-tool-step"]');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toHaveTextContent("Read 1 file, ran 1 command");
    expect(steps[0]).toHaveTextContent("1 failed");

    // Expanding gives each call its own production row, never the multi-tool
    // summary form of ChatToolGroup (ADR-0030 §"后果").
    const groups = steps[0].querySelectorAll('[data-slot="chat-tool-group"]');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAttribute("data-tool-count", "1");
    expect(groups[0]).toHaveTextContent("read_file");
    expect(groups[0]).toHaveTextContent("AGENTS.md");
    expect(groups[0]).toHaveTextContent("1.0s");
    expect(groups[1]).toHaveTextContent("shell");
    expect(groups[1]).toHaveTextContent("grep -rn TODO");
    // Astryx suppresses duration on errored rows; 45ms is unit-tested instead.

    // isError maps to the error status (a11y error text is rendered).
    expect(within(assistantMessage!).getByText(/grep: no matches/)).toBeInTheDocument();
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
      title: null,
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "completed" as const,
      creationStage: "accepted" as const,
      checkout: {
        mode: "foreground-local" as const,
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig/docs",
      },
      runtimeId: "pi-rpc:session-1",
      piSessionId: "pi-session-rpc",
      sessionFile: null,
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
      runtimeModel: createSessionRuntimeModel(),
      queuedMessages: [],
      summary: {
        provider: "openai",
        model: "gpt-5-codex",
        totalTokens: 1280,
        totalCostUsd: 0.012345,
      },
      modelControls: null,
      contextUsage: null,
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
    expect(screen.getByText("read")).toBeInTheDocument();
    expect(screen.getByText("read")).toBeInTheDocument();
    expect(screen.queryByText("{\"path\":\"AGENTS.md\"}")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("What do you want to know?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    // Single column too: Chat centers itself, so no outer max-width box may
    // pull its scrollbar away from the window edge.
    expect(
      screen.getByLabelText("Live Chat messages").closest(".max-w-\\[96rem\\]"),
    ).toBeNull();
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
    expect(screen.getByPlaceholderText("Queue the next task…")).toBeInTheDocument();
  });

  it("uses one composer control for the model list and capability-driven Thinking slider", async () => {
    const user = userEvent.setup();
    const models = [
      {
        provider: "anthropic",
        modelId: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        thinkingLevels: ["off" as const, "low" as const, "medium" as const, "high" as const],
      },
      {
        provider: "anthropic",
        modelId: "claude-haiku-4",
        name: "Claude Haiku 4",
        thinkingLevels: ["off" as const, "low" as const],
      },
    ];
    const configureModel = vi.fn(async (selection) => ({
      models,
      selected: { ...selection },
    }));
    const bridge = {
      ...createInMemoryPiRuntimeBridge(),
      configureModel,
    };
    const projection = {
      ...createSessionProjection({
        id: "session-model-controls",
        projectId: "pig-docs",
        initialPrompt: "Configure the next run",
        createdAt: "2026-07-19T10:00:00.000Z",
      }),
      cwd: "/Users/void/code/opensource/Pig/docs",
      status: "completed" as const,
      creationStage: "accepted" as const,
      runtimeId: "pi-sdk:session-model-controls",
      piSessionId: "pi-session-model-controls",
      modelControls: {
        models,
        selected: {
          provider: "anthropic",
          modelId: "claude-sonnet-4",
          thinkingLevel: "high" as const,
        },
      },
    };

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
          selectedSessionId: projection.id,
          liveMessages: [],
          runTimeline: [],
          checkout: {
            mode: "Foreground local checkout",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig/docs",
          },
          summary: {
            model: "claude-sonnet-4",
            totalCostUsd: 0,
            totalTokens: 0,
          },
        }}
      />,
    );

    const trigger = screen.getByTestId("model-thinking-trigger");

    expect(trigger).toHaveTextContent("Claude Sonnet 4 · High");
    await user.click(trigger);
    const popover = await screen.findByTestId("model-thinking-popover");

    expect(screen.getByRole("dialog")).toContainElement(popover);
    expect(
      screen.getByRole("textbox", { name: "Search models" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Add Models")).toBeInTheDocument();

    // Selecting another model commits it with the nearest thinking level and
    // opens its options flyout (vertical Reasoning list).
    await user.click(screen.getByText("Claude Haiku 4"));

    await waitFor(() => {
      expect(configureModel).toHaveBeenCalledWith({
        sessionId: "session-model-controls",
        piSessionId: "pi-session-model-controls",
        provider: "anthropic",
        modelId: "claude-haiku-4",
        thinkingLevel: "low",
      });
    });
    expect(trigger).toHaveTextContent("Claude Haiku 4 · Low");

    const flyout = await screen.findByRole("group", {
      name: "Claude Haiku 4 options",
    });

    expect(flyout).toBeInTheDocument();
    expect(within(flyout).getByText("Reasoning")).toBeInTheDocument();
    expect(within(flyout).getByText("Low")).toBeInTheDocument();

    // Picking a reasoning level from the flyout commits model + level.
    await user.click(screen.getByText("Off"));

    await waitFor(() => {
      expect(configureModel).toHaveBeenCalledWith({
        sessionId: "session-model-controls",
        piSessionId: "pi-session-model-controls",
        provider: "anthropic",
        modelId: "claude-haiku-4",
        thinkingLevel: "off",
      });
    });
    expect(trigger).toHaveTextContent("Claude Haiku 4 · Off");
    expect(getLastModelSelection()).toEqual({
      provider: "anthropic",
      modelId: "claude-haiku-4",
      thinkingLevel: "off",
    });

    // Search narrows the flat list.
    await user.type(
      screen.getByRole("textbox", { name: "Search models" }),
      "sonnet",
    );
    expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
    expect(screen.queryByText("Claude Haiku 4")).not.toBeInTheDocument();
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
    // Legacy bridges mint no Message boundaries, so there is nothing to
    // measure and the header carries no number.
    expect(within(assistantMessages[0]).getByRole("button", { name: /^Worked/ })).toBeInTheDocument();
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

  it("uses streaming markdown for the collapsed assistant run bubble", async () => {
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
    // Streamed text renders asynchronously through Astryx incremental parsing.
    await waitFor(() =>
      expect(within(liveChat).getByTestId("stream-markdown-renderer")).toHaveTextContent(
        "Streaming markdown now",
      ),
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
    expect(
      within(streamingAssistant).getByRole("button", { name: /^Worked/ }),
    ).toBeInTheDocument();
    expect(
      streamingTrace!.compareDocumentPosition(streamingContent!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders assistant trace events above the visible answer without mixing them into markdown", async () => {
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
    const tool = assistantMessage!.querySelector('[data-slot="chat-tool-group"]');
    const streamingContent = assistantMessage!.querySelector(
      '[data-testid="stream-markdown-renderer"]',
    );

    expect(trace).toBeInTheDocument();
    expect(within(assistantMessage!).getByRole("button", { name: /^Worked/ })).toBeInTheDocument();
    // The thinking body is disclosed inside the trace, never in the answer.
    expect(within(assistantMessage!).getByText("我需要先检查项目结构。")).toBeInTheDocument();
    expect(
      assistantMessage!.querySelector('[data-slot="chat-message-actions"]'),
    ).not.toBeInTheDocument();
    expect(tool).toHaveAttribute("data-state", "output-available");
    expect(tool).toHaveTextContent("read");
    expect(tool).not.toHaveTextContent("{\"path\":\"AGENTS.md\"}");
    expect(tool).not.toHaveTextContent("Agent instructions loaded.");
    await waitFor(() =>
      expect(streamingContent).toHaveTextContent("最终回答只保留结论。"),
    );
    expect(streamingContent).not.toHaveTextContent("我需要先检查项目结构。");
    expect(streamingContent).not.toHaveTextContent("Agent instructions loaded.");
    expect(
      trace!.compareDocumentPosition(streamingContent!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps tool call details collapsed when the assistant trace is expanded", () => {
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
        initialPrompt: "检查 trace 展开态",
        createdAt: "2026-06-26T08:00:00.000Z",
      }),
      status: "completed" as const,
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
          body: "先读项目说明。",
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
          body: "已经读取项目说明。",
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
    const tool = assistantMessage!.querySelector('[data-slot="chat-tool-group"]');

    expect(trace).toBeInTheDocument();
    expect(within(assistantMessage!).getByRole("button", { name: /^Worked/ })).toBeInTheDocument();
    expect(assistantMessage!.querySelector('[data-slot="chat-message-actions"]')).toHaveClass(
      "chat-message__actions--persist",
    );
    expect(within(assistantMessage!).getByText("先读项目说明。")).toBeInTheDocument();
    expect(tool).toHaveTextContent("read");
    expect(tool).not.toHaveTextContent("{\"path\":\"AGENTS.md\"}");
    expect(tool).not.toHaveTextContent("Agent instructions loaded.");
  });

  it("does not show fixture trace steps when a live Projection has no tool calls", async () => {
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

    expect(await within(liveChat).findByText("真实回复")).toBeInTheDocument();
    expect(within(liveChat).queryByText("Project context loaded")).not.toBeInTheDocument();
    expect(liveChat.querySelector('[data-slot="chain-of-thought"]')).not.toBeInTheDocument();
  });

});

// Context occupancy rides the composer footer line — the hint row under the
// input — and never the Session toolbar. Issue #128.
describe("Context usage placement", () => {
  const workspace = {
    id: "pig-docs",
    name: "Pig Docs",
    projectRoot: "/Users/void/code/opensource/Pig/docs",
    repoRoot: "/Users/void/code/opensource/Pig",
    selectedSessionId: "session-context",
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

  function boundProjection(
    overrides: Partial<SessionProjection> = {},
  ): SessionProjection {
    return {
      ...createSessionProjection({
        id: "session-context",
        projectId: "pig-docs",
        initialPrompt: "Watch the context window fill up",
        createdAt: "2026-08-20T08:00:00.000Z",
      }),
      status: "completed" as const,
      runtimeId: "pi-rpc:session-context",
      piSessionId: "pi-session-context",
      contextUsage: { tokens: 90_000, contextWindow: 200_000, percent: 45 },
      ...overrides,
    };
  }

  function renderSessionsView(
    projection: SessionProjection,
    sessionChanges?: {
      changes: SessionChanges | null;
      error: string | null;
      loading: boolean;
      refresh: () => void;
      checkoutBranch: (branch: string) => Promise<void>;
    },
  ) {
    render(
      <AgentWorkspaceSessionsView
        projectId="pig-docs"
        workspace={workspace}
        sessionProjection={projection}
        sessionChanges={sessionChanges}
      />,
    );

    return screen
      .getByTestId("full-chat-composer")
      .querySelector('[data-slot="prompt-input-footer"]');
  }

  function gitChanges(overrides: Partial<SessionChanges> = {}): SessionChanges {
    return {
      sessionId: "session-context",
      state: "clean",
      checkoutRoot: "/work/PiGUI",
      repositoryRoot: "/work/PiGUI",
      generatedAt: "2026-09-04T00:00:00.000Z",
      head: {
        oid: "abc1234deadbeef",
        branch: "feat/composer-git",
        detached: false,
      },
      branches: ["feat/composer-git", "main", "fix/spacing", "feat/chat-chain-of-thought-rail"],
      files: [],
      totals: {
        files: 0,
        additions: 0,
        deletions: 0,
        binaryFiles: 0,
        conflictedFiles: 0,
      },
      truncated: false,
      omittedFileCount: 0,
      ...overrides,
    };
  }

  it("meters the context window as a ring on the composer footer line", () => {
    const footer = renderSessionsView(boundProjection());

    expect(footer?.querySelector('[data-slot="context-usage-meter"]')).toHaveAttribute(
      "aria-label",
      "Context 45% · 200K",
    );
  });

  it("keeps the footer line while a run is queueing", () => {
    const footer = renderSessionsView(boundProjection({ status: "running" }));

    expect(
      footer?.querySelector('[data-slot="context-usage-meter"]'),
    ).toBeInTheDocument();
  });

  it("meters nothing until a runtime is bound, and drops the footer line", () => {
    const footer = renderSessionsView(boundProjection({ piSessionId: null }));

    expect(footer).toBeNull();
  });

  function idleSessionChanges(
    changes: SessionChanges | null,
    checkoutBranch: (branch: string) => Promise<void> = async () => {},
  ) {
    return {
      changes,
      error: null as string | null,
      loading: false,
      refresh: () => {},
      checkoutBranch,
    };
  }

  it("shows the Session git branch to the left of the context ring", () => {
    const footer = renderSessionsView(boundProjection(), idleSessionChanges(gitChanges()));
    const trigger = footer?.querySelector(
      '[data-testid="git-branch-status-trigger"]',
    );
    const ring = footer?.querySelector('[data-slot="context-usage-meter"]');
    const icon = footer?.querySelector('[data-testid="git-branch-status-icon"]');

    expect(trigger).toHaveTextContent("feat/composer-git");
    expect(icon).toBeInTheDocument();
    expect(ring).toBeInTheDocument();
    expect(
      trigger && ring
        ? Boolean(
            trigger.compareDocumentPosition(ring) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          )
        : false,
    ).toBe(true);
  });

  it("labels a detached HEAD with the short oid", () => {
    const footer = renderSessionsView(
      boundProjection(),
      idleSessionChanges(
        gitChanges({
          head: {
            oid: "deadbeefcafebabe",
            branch: null,
            detached: true,
          },
        }),
      ),
    );

    expect(
      footer?.querySelector('[data-testid="git-branch-status-trigger"]'),
    ).toHaveTextContent("deadbee");
  });

  it("lists local and remote-tracking branch names in the git selector", async () => {
    const user = userEvent.setup();
    renderSessionsView(boundProjection(), idleSessionChanges(gitChanges()));

    await user.click(screen.getByTestId("git-branch-status-trigger"));

    expect(
      await screen.findByRole("option", { name: "feat/composer-git" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "main" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "fix/spacing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "feat/chat-chain-of-thought-rail" }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search branches..."),
    ).toBeInTheDocument();
    // Same inset as the composer model selector popover (`gap-1 p-1`), not
    // Astryx Selector's sm item padding which sits flush against the chrome.
    expect(screen.getByTestId("git-branch-status-menu")).toHaveClass(
      "flex",
      "flex-col",
      "gap-1",
      "p-1",
    );
  });

  it("disables a branch already checked out in another worktree and explains why", async () => {
    const user = userEvent.setup();
    const checkoutBranch = vi.fn(async () => {});
    renderSessionsView(
      boundProjection(),
      idleSessionChanges(
        gitChanges({
          occupiedBranches: [
            {
              branch: "main",
              path: "/work/.pig-worktrees/PiGUI/session-other",
            },
          ],
        }),
        checkoutBranch,
      ),
    );

    await user.click(screen.getByTestId("git-branch-status-trigger"));

    const option = await screen.findByRole("option", { name: /main/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    expect(option).toHaveTextContent("Already checked out in session-other");

    await user.click(option);
    expect(checkoutBranch).not.toHaveBeenCalled();
  });

  it("checks out the selected local branch on the Session checkout", async () => {
    const user = userEvent.setup();
    const checkoutBranch = vi.fn(async () => {});
    renderSessionsView(
      boundProjection(),
      idleSessionChanges(gitChanges(), checkoutBranch),
    );

    await user.click(screen.getByTestId("git-branch-status-trigger"));
    await user.click(await screen.findByRole("option", { name: "main" }));

    expect(checkoutBranch).toHaveBeenCalledWith("main");
  });

  it("does not check out the branch the Session is already on", async () => {
    const user = userEvent.setup();
    const checkoutBranch = vi.fn(async () => {});
    renderSessionsView(
      boundProjection(),
      idleSessionChanges(gitChanges(), checkoutBranch),
    );

    await user.click(screen.getByTestId("git-branch-status-trigger"));
    await user.click(
      await screen.findByRole("option", { name: "feat/composer-git" }),
    );

    expect(checkoutBranch).not.toHaveBeenCalled();
  });

  it("surfaces a failed checkout on the composer", async () => {
    const user = userEvent.setup();
    const checkoutBranch = vi.fn(async () => {
      throw new Error(
        "Please commit your changes or stash them before you switch branches.",
      );
    });
    renderSessionsView(
      boundProjection(),
      idleSessionChanges(gitChanges(), checkoutBranch),
    );

    await user.click(screen.getByTestId("git-branch-status-trigger"));
    await user.click(await screen.findByRole("option", { name: "main" }));

    expect(
      await screen.findByText(
        /stash them before you switch branches/i,
      ),
    ).toBeInTheDocument();
  });

  it("hides the git branch chip when the checkout is not a repository", () => {
    const footer = renderSessionsView(
      boundProjection(),
      idleSessionChanges(
        gitChanges({
          state: "non-git",
          repositoryRoot: null,
          head: undefined,
        }),
      ),
    );

    expect(
      footer?.querySelector('[data-testid="git-branch-status"]'),
    ).not.toBeInTheDocument();
    expect(
      footer?.querySelector('[data-slot="context-usage-meter"]'),
    ).toBeInTheDocument();
  });

  it("leaves the Session toolbar to the dock toggle", () => {
    const { container } = render(
      <SessionToolbarActions />,
    );

    expect(
      container.querySelector('[data-slot="context-usage-meter"]'),
    ).not.toBeInTheDocument();
  });
});

describe("Session changes action surface", () => {
  const projection = applySessionProjectionEvent(
    createSessionProjection({
      id: "session-changes",
      projectId: "pigui",
      initialPrompt: "Review the diff",
      createdAt: "2026-07-19T00:00:00.000Z",
    }),
    {
      type: "checkout-selected",
      stage: "preparing checkout",
      checkout: {
        mode: "foreground-local",
        root: "/work/PiGUI",
        repoRoot: "/work/PiGUI",
        projectRoot: "/work/PiGUI",
        projectRelativePath: ".",
        executionCheckoutRoot: "/work/PiGUI",
        diffRoot: "/work/PiGUI",
        runtimeCwd: "/work/PiGUI",
      },
      occurredAt: "2026-07-19T00:00:00.000Z",
    },
  );

  function changes(overrides: Partial<SessionChanges> = {}): SessionChanges {
    return {
      sessionId: "session-changes",
      state: "ready",
      checkoutRoot: "/work/PiGUI",
      repositoryRoot: "/work/PiGUI",
      generatedAt: "2026-07-19T00:01:00.000Z",
      files: [
        {
          path: "src/app.ts",
          kind: "modified",
          staged: false,
          unstaged: true,
          additions: 2,
          deletions: 1,
          binary: false,
          patch: "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n",
          patchTruncated: false,
        },
        {
          path: "assets/logo.png",
          kind: "modified",
          staged: false,
          unstaged: true,
          additions: null,
          deletions: null,
          binary: true,
          patchTruncated: false,
        },
      ],
      totals: {
        files: 2,
        additions: 2,
        deletions: 1,
        binaryFiles: 1,
        conflictedFiles: 0,
      },
      truncated: false,
      omittedFileCount: 0,
      ...overrides,
    };
  }

  function panel(
    loaded: SessionChanges | null,
    {
      error = null,
      loading = false,
      onRefresh = () => {},
    }: {
      error?: string | null;
      loading?: boolean;
      onRefresh?: () => void;
    } = {},
  ) {
    return (
      <SessionChangesPanel
        changes={loaded}
        error={error}
        loading={loading}
        sessionId={projection.id}
        stale={projection.stale}
        onRefresh={onRefresh}
      />
    );
  }

  it("lists loaded changes, switches files, and changes the diff layout", async () => {
    const user = userEvent.setup();

    render(panel(changes()));

    expect(await screen.findAllByText("src/app.ts")).toHaveLength(2);
    expect(screen.getByText("2 files ·", { exact: false })).toBeInTheDocument();
    expect(await screen.findByTestId("session-diff-viewer")).toHaveAttribute(
      "data-style",
      "unified",
    );

    await user.click(screen.getByText("Split"));
    expect(screen.getByTestId("session-diff-viewer")).toHaveAttribute(
      "data-style",
      "split",
    );

    await user.click(screen.getByText("assets/logo.png"));
    expect(
      screen.getByText("Binary file changed. A textual diff is not available."),
    ).toBeInTheDocument();
  });

  it("shows clean and non-Git states without treating them as failures", async () => {
    const view = render(
      panel(
        changes({
          state: "clean",
          files: [],
          totals: {
            files: 0,
            additions: 0,
            deletions: 0,
            binaryFiles: 0,
            conflictedFiles: 0,
          },
        }),
      ),
    );

    expect(
      screen.getByText("Working tree clean. No staged, unstaged, or untracked changes."),
    ).toBeInTheDocument();

    view.rerender(
      panel(changes({ state: "non-git", files: [], repositoryRoot: null })),
    );
    expect(
      screen.getByText("This Session checkout is not a Git repository."),
    ).toBeInTheDocument();
  });

  it("exposes load errors, retry, and bounded-review warnings", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();

    const view = render(
      panel(null, { error: "Git is temporarily unavailable", onRefresh }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Git is temporarily unavailable",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    view.rerender(
      panel(
        changes({
          truncated: true,
          omittedFileCount: 3,
          files: [
            {
              ...changes().files[0]!,
              patch: undefined,
              patchTruncated: true,
            },
          ],
        }),
      ),
    );
    expect(
      await screen.findByText(
        "This patch exceeds the review limit and was omitted. Open the checkout for the full diff.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Review is bounded. 3 additional files were omitted."),
    ).toBeInTheDocument();
  });
});

// The ADR-0030 phase machine as Live Chat renders it: one flat step list while
// the run is in flight, the answer below it, and exactly one fold into
// "Worked for Ns" at run(end). Events are driven through the real reducer so
// these assert the wiring, not a hand-built view.
describe("Chain of Thought phases in Live Chat", () => {
  const cotWorkspace = {
    id: "pig-docs",
    name: "Pig Docs",
    projectRoot: "/Users/void/code/opensource/Pig/docs",
    repoRoot: "/Users/void/code/opensource/Pig",
    selectedSessionId: "session-cot",
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

  const cotRunId = "pi-session-cot:run-1";
  const cotT0 = Date.parse("2026-09-04T10:00:00.000Z");
  const cotAt = (ms: number) => new Date(cotT0 + ms).toISOString();

  type CotBeat = { ms: number; event: AgentRuntimeEventEntry["event"] };

  function cotMessage(turn: number) {
    const turnId = `${cotRunId}:turn-${turn}`;
    const messageId = `${turnId}:msg-1`;
    const base = { runId: cotRunId, turnId, messageId, role: "assistant" } as const;

    return {
      id: messageId,
      start: (ms: number): CotBeat => ({
        ms,
        event: { type: "message", ...base, phase: "start", surface: "chat", origin: "sdk" },
      }),
      end: (ms: number, parts: AgentMessagePartSnapshot[]): CotBeat => ({
        ms,
        event: { type: "message", ...base, phase: "end", parts, surface: "chat", origin: "sdk" },
      }),
      part: (slot: number, partType: AgentMessagePartType) => {
        const partId = `${messageId}:part-${slot}`;
        const surface = partType === "text" ? ("chat" as const) : ("trace" as const);
        const partBase = { type: "message_part", ...base, partId, partType, surface } as const;

        return {
          start: (ms: number, toolName?: string): CotBeat => ({
            ms,
            event: {
              ...partBase,
              phase: "start",
              bodyMode: "snapshot",
              body: "",
              ...(toolName ? { toolName } : {}),
              origin: "sdk",
            },
          }),
          delta: (ms: number, body: string): CotBeat => ({
            ms,
            event: { ...partBase, phase: "update", bodyMode: "delta", body, origin: "sdk" },
          }),
          end: (ms: number, body: string, toolCallId?: string): CotBeat => ({
            ms,
            event: {
              ...partBase,
              phase: "end",
              bodyMode: "snapshot",
              body,
              ...(toolCallId ? { toolCallId } : {}),
              origin: "sdk",
            },
          }),
          snapshot: (body: string, toolCallId?: string): AgentMessagePartSnapshot => ({
            partId,
            partType,
            body,
            ...(toolCallId ? { toolCallId } : {}),
          }),
        };
      },
    };
  }

  const cotRunStart = (ms: number): CotBeat => ({
    ms,
    event: {
      type: "run",
      runId: cotRunId,
      phase: "start",
      trigger: "prompt",
      surface: "hidden",
      origin: "sdk",
    },
  });

  const cotRunEnd = (ms: number): CotBeat => ({
    ms,
    event: {
      type: "run",
      runId: cotRunId,
      phase: "end",
      trigger: "prompt",
      outcome: "completed",
      surface: "hidden",
      origin: "sdk",
    },
  });

  const cotToolStart = (ms: number, toolCallId: string, name: string): CotBeat => ({
    ms,
    event: {
      type: "tool",
      runId: cotRunId,
      turnId: `${cotRunId}:turn-1`,
      toolCallId,
      phase: "start",
      name,
      surface: "trace",
      origin: "sdk",
    },
  });

  const cotToolEnd = (ms: number, toolCallId: string, name: string, result: string): CotBeat => ({
    ms,
    event: {
      type: "tool",
      runId: cotRunId,
      turnId: `${cotRunId}:turn-1`,
      toolCallId,
      phase: "end",
      name,
      result,
      isError: false,
      surface: "trace",
      origin: "sdk",
    },
  });

  function cotProjection(beats: CotBeat[]): SessionProjection {
    let projection: SessionProjection = {
      ...createSessionProjection({
        id: "session-cot",
        projectId: "pig-docs",
        initialPrompt: "Ship the slice",
        createdAt: "2026-09-04T10:00:00.000Z",
      }),
      creationStage: "accepted",
      runtimeId: "pi-sdk:session-cot",
      piSessionId: "pi-session-cot",
    };

    beats.forEach((beat, index) => {
      projection = applySessionProjectionEvent(projection, {
        type: "agent-event-received",
        entry: { seq: index + 1, timestamp: cotAt(beat.ms), event: beat.event },
      });
    });

    return projection;
  }

  function renderCot(beats: CotBeat[], nowMs: number) {
    return render(
      <AgentWorkspaceSessionsView
        clockNowMs={cotT0 + nowMs}
        projectId="pig-docs"
        sessionProjection={cotProjection(beats)}
        workspace={cotWorkspace}
      />,
    );
  }

  function cotBlock() {
    const liveChat = screen.getByLabelText("Live Chat messages");
    const block = liveChat.querySelector<HTMLElement>('[data-slot="chain-of-thought"]');

    if (!block) {
      throw new Error("no Chain of Thought rendered");
    }

    return block;
  }

  it("keeps a multi-turn run flat with a live last step, then folds it once at run(end)", async () => {
    const m1 = cotMessage(1);
    const m2 = cotMessage(2);
    const thought = m1.part(0, "thinking");
    const call = m1.part(1, "tool_call");
    const answer = m2.part(0, "text");
    const args = '{"path":"AGENTS.md"}';

    const acting = [
      cotRunStart(0),
      m1.start(100),
      thought.start(200),
      thought.end(900, "Read the instructions first."),
      call.start(1000, "read_file"),
      call.end(1200, args, "call-1"),
      m1.end(1300, [thought.snapshot("Read the instructions first."), call.snapshot(args, "call-1")]),
      cotToolStart(1400, "call-1", "read_file"),
    ];

    const { rerender } = renderCot(acting, 2000);

    // Flat while in flight: every completed step stays readable, so a later
    // Turn can look back at what the last one found.
    expect(cotBlock()).toHaveAttribute("data-phase", "acting");
    expect(
      screen.queryByRole("button", { name: /^Worked/ }),
    ).not.toBeInTheDocument();
    expect(cotBlock().querySelectorAll('[data-slot="chain-of-thought-step"]')).toHaveLength(2);
    expect(cotBlock()).toHaveTextContent("Running read_file…");
    // The heartbeat is the last line of the block and the only one.
    expect(cotBlock().lastElementChild).toHaveAttribute("data-slot", "chat-status-line");
    expect(cotBlock().querySelectorAll('[data-slot="chat-status-line"]')).toHaveLength(1);

    const answering = [
      ...acting,
      cotToolEnd(2000, "call-1", "read_file", "Agent instructions loaded."),
      m2.start(2100),
      answer.start(5100),
      answer.delta(5200, "Shipped."),
    ];

    rerender(
      <AgentWorkspaceSessionsView
        clockNowMs={cotT0 + 5300}
        projectId="pig-docs"
        sessionProjection={cotProjection(answering)}
        workspace={cotWorkspace}
      />,
    );

    expect(cotBlock()).toHaveAttribute("data-phase", "answering");
    expect(cotBlock().querySelector('[data-slot="chat-status-line"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Worked/ })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("stream-markdown-renderer")).toHaveTextContent("Shipped."),
    );

    const settled = [
      ...answering,
      answer.end(5400, "Shipped."),
      m2.end(5500, [answer.snapshot("Shipped.")]),
      cotRunEnd(5600),
    ];

    rerender(
      <AgentWorkspaceSessionsView
        clockNowMs={cotT0 + 5700}
        projectId="pig-docs"
        sessionProjection={cotProjection(settled)}
        workspace={cotWorkspace}
      />,
    );

    // 5s: the wait from the Run's first model call to the first answer token,
    // tool execution included (ADR-0030 §6).
    const header = screen.getByRole("button", { name: /^Worked for 5s/ });

    expect(cotBlock()).toHaveAttribute("data-phase", "settled");
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(cotBlock().querySelector('[data-slot="chat-status-line"]')).not.toBeInTheDocument();
  });

  it("shows a Thought row for a single-turn run even when the provider sends no thinking body", () => {
    const m1 = cotMessage(1);
    const thought = m1.part(0, "thinking");
    const answer = m1.part(1, "text");

    renderCot(
      [
        cotRunStart(0),
        m1.start(100),
        thought.start(200),
        thought.end(2300, ""),
        answer.start(2400),
        answer.end(2600, "Shipped."),
        m1.end(2700, [thought.snapshot(""), answer.snapshot("Shipped.")]),
        cotRunEnd(2800),
      ],
      2900,
    );

    const steps = cotBlock().querySelectorAll<HTMLElement>(
      '[data-slot="chain-of-thought-step"]',
    );

    expect(screen.getByRole("button", { name: /^Worked for 2s/ })).toBeInTheDocument();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toHaveTextContent("Thought 2s");
    // Nothing to disclose behind an empty body, so the row is not a control.
    expect(steps[0].querySelector("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("markdown-renderer")).toHaveTextContent("Shipped.");
  });

  it("withdraws the answer bubble and lists the text as Interim Output when a tool call follows it", async () => {
    const m1 = cotMessage(1);
    const interim = m1.part(0, "text");
    const call = m1.part(1, "tool_call");

    const answering = [
      cotRunStart(0),
      m1.start(100),
      interim.start(200),
      interim.delta(300, "Let me look at the repo."),
    ];

    const { rerender } = renderCot(answering, 400);

    await waitFor(() =>
      expect(screen.getByTestId("stream-markdown-renderer")).toHaveTextContent(
        "Let me look at the repo.",
      ),
    );
    expect(cotBlock()).toHaveAttribute("data-phase", "answering");

    rerender(
      <AgentWorkspaceSessionsView
        clockNowMs={cotT0 + 700}
        projectId="pig-docs"
        sessionProjection={cotProjection([
          ...answering,
          interim.end(500, "Let me look at the repo."),
          call.start(600, "read_file"),
        ])}
        workspace={cotWorkspace}
      />,
    );

    const interimRow = cotBlock().querySelector('[data-slot="chat-interim-output"]');

    expect(cotBlock()).toHaveAttribute("data-phase", "acting");
    expect(interimRow).toHaveTextContent("Let me look at the repo.");
    expect(screen.queryByTestId("stream-markdown-renderer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("markdown-renderer")).not.toBeInTheDocument();
    // The header only ever appears at run(end): showing it here and taking it
    // away again is the flicker this regression path exists to avoid.
    expect(screen.queryByRole("button", { name: /^Worked/ })).not.toBeInTheDocument();
  });

  it("settles a replayed run that never reached run(end) because streaming is not allowed", () => {
    const m1 = cotMessage(1);
    const thought = m1.part(0, "thinking");
    const answer = m1.part(1, "text");
    const beats = [
      cotRunStart(0),
      m1.start(100),
      thought.start(200),
      thought.end(1100, "Reading."),
      answer.start(1200),
      answer.delta(1300, "Shipped."),
    ];

    render(
      <AgentWorkspaceSessionsView
        clockNowMs={cotT0 + 999_999}
        projectId="pig-docs"
        sessionProjection={{ ...cotProjection(beats), stale: true }}
        workspace={cotWorkspace}
      />,
    );

    // A run cut off mid-stream: no wall clock may leak into a replay, and no
    // heartbeat may claim work is still happening.
    expect(cotBlock()).toHaveAttribute("data-phase", "settled");
    expect(cotBlock().querySelector('[data-slot="chat-status-line"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Worked for 1s/ })).toBeInTheDocument();
  });

  it("puts the Chain of Thought where the message body's stretch rule can find it", () => {
    const m1 = cotMessage(1);
    const thought = m1.part(0, "thinking");
    const answer = m1.part(1, "text");

    renderCot(
      [
        cotRunStart(0),
        m1.start(100),
        thought.start(200),
        thought.end(1100, "Reading."),
        answer.start(1200),
        answer.end(1400, "Shipped."),
        m1.end(1500, [thought.snapshot("Reading."), answer.snapshot("Shipped.")]),
        cotRunEnd(1600),
      ],
      1700,
    );

    // Astryx lays the assistant body out as a fit-content column, and the
    // block contains its own inline size, so nothing inside pushes the body
    // wide: chat.css stretches it through `:has(> .chain-of-thought)`, which
    // only holds while the block is a direct child.
    expect(cotBlock().parentElement).toHaveAttribute("data-slot", "chat-message-body");
  });
});
