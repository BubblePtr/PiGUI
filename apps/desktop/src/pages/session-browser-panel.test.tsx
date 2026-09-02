import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserEvent } from "@/shared/browser-protocol";
import type { PiGUIRendererApi } from "@/shared/runtime";
import {
  getProjectBrowserUrl,
  rememberProjectBrowserUrl,
} from "@/entities/browser/browser-url-memory";
import { SessionBrowserPanel } from "@/pages/session-browser-panel";

type Invocation = { command: string; args?: Record<string, unknown> };

function installPreload() {
  const invocations: Invocation[] = [];
  const listeners: Array<(event: BrowserEvent) => void> = [];
  // Mirrors the host: every navigate answers with a fresh navigation id.
  let navigationId = 0;
  const api: PiGUIRendererApi = {
    invoke: (async (command: string, args?: Record<string, unknown>) => {
      invocations.push({ command, args });

      if (command === "browser_navigate") {
        navigationId += 1;
        return {
          url: String(args?.url),
          canGoBack: false,
          canGoForward: false,
          navigationId,
        };
      }

      return null;
    }) as PiGUIRendererApi["invoke"],
    onBackendEvent: () => () => {},
    onBrowserEvent: (listener) => {
      listeners.push(listener);
      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
      };
    },
    onWindowFocusChanged: () => () => {},
  };

  window.pigui = api;

  return {
    invocations,
    commands: () => invocations.map((invocation) => invocation.command),
    emit(event: BrowserEvent) {
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };
}

describe("SessionBrowserPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    delete window.pigui;
    vi.restoreAllMocks();
  });

  it("opens the Project's remembered URL when the surface mounts", async () => {
    const preload = installPreload();

    rememberProjectBrowserUrl("project-a", "http://localhost:5173/");
    render(<SessionBrowserPanel docked projectId="project-a" sessionId="session-1" />);

    await waitFor(() =>
      expect(preload.invocations).toContainEqual({
        command: "browser_navigate",
        args: { url: "http://localhost:5173/" },
      }),
    );
    expect(await screen.findByDisplayValue("http://localhost:5173/")).toBeInTheDocument();
  });

  it("only hides the view when the Project has no remembered URL", async () => {
    const preload = installPreload();

    render(<SessionBrowserPanel docked projectId="project-b" sessionId="session-2" />);

    await waitFor(() =>
      expect(preload.invocations).toContainEqual({
        command: "browser_set_visible",
        args: { visible: false },
      }),
    );
    // Switching away must not destroy the view (PRD section 6): the page stays
    // loaded and invisible so coming back is instant.
    expect(preload.commands()).not.toContain("browser_dispose");
    expect(preload.commands()).not.toContain("browser_navigate");
    expect(screen.getByText("No page loaded")).toBeInTheDocument();
  });

  it("navigates on submit and remembers the URL the page actually landed on", async () => {
    const user = userEvent.setup();
    const preload = installPreload();

    render(<SessionBrowserPanel docked projectId="project-c" sessionId="session-3" />);

    const address = screen.getByRole("textbox", { name: "Address" });

    await user.type(address, "localhost:5173");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(preload.invocations).toContainEqual({
        command: "browser_navigate",
        args: { url: "localhost:5173" },
      }),
    );

    // Redirects mean the typed text is not what got loaded; memory follows the
    // navigation event, not the keystrokes.
    preload.emit({
      type: "did-navigate",
      navigationId: 1,
      url: "http://localhost:5173/app",
      canGoBack: true,
      canGoForward: false,
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue(
        "http://localhost:5173/app",
      ),
    );

    render(<SessionBrowserPanel docked projectId="project-c" sessionId="session-4" />);
    await waitFor(() =>
      expect(preload.invocations).toContainEqual({
        command: "browser_navigate",
        args: { url: "http://localhost:5173/app" },
      }),
    );
  });

  it("shows a failed load as its own state instead of the native error page", async () => {
    const preload = installPreload();

    rememberProjectBrowserUrl("project-d", "http://localhost:5173/");
    render(<SessionBrowserPanel docked projectId="project-d" sessionId="session-5" />);

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));

    preload.emit({
      type: "did-fail-load",
      navigationId: 1,
      url: "http://localhost:5173/",
      errorCode: -102,
      errorDescription: "ERR_CONNECTION_REFUSED",
    });

    expect(await screen.findByText("ERR_CONNECTION_REFUSED")).toBeInTheDocument();
    expect(screen.queryByTestId("browser-viewport")).not.toBeInTheDocument();
  });

  it("never touches the view from the Sheet fallback, mounted or unmounting", async () => {
    const preload = installPreload();

    rememberProjectBrowserUrl("project-e", "http://localhost:5173/");

    const view = render(
      <SessionBrowserPanel docked={false} projectId="project-e" sessionId="session-6" />,
    );

    expect(screen.getByText(/widen the window/i)).toBeInTheDocument();

    view.unmount();
    await waitFor(() => expect(screen.queryByText(/widen the window/i)).toBeNull());

    // Crossing back above the breakpoint, this instance unmounts only after
    // Base UI's exit transition — later than the docked instance that already
    // showed the view. A late `visible: false` from here would blank it.
    expect(preload.commands()).not.toContain("browser_set_visible");
    expect(preload.commands()).not.toContain("browser_navigate");
  });

  it("drops navigation events left over from the previous Project's page", async () => {
    const preload = installPreload();

    rememberProjectBrowserUrl("project-g", "http://localhost:5173/");

    const view = render(
      <SessionBrowserPanel docked projectId="project-g" sessionId="session-8" />,
    );

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));

    view.rerender(
      <SessionBrowserPanel docked projectId="project-h" sessionId="session-8" />,
    );
    await waitFor(() => expect(screen.getByText("No page loaded")).toBeInTheDocument());

    // The single view is still showing project-g's page and can still emit.
    preload.emit({
      type: "did-navigate",
      navigationId: 1,
      url: "http://localhost:5173/late",
      canGoBack: false,
      canGoForward: false,
    });

    expect(getProjectBrowserUrl("project-h")).toBeNull();
    expect(screen.getByText("No page loaded")).toBeInTheDocument();
  });

  it("hides the view when the surface unmounts but keeps the page alive", async () => {
    const preload = installPreload();

    rememberProjectBrowserUrl("project-f", "http://localhost:5173/");

    const view = render(
      <SessionBrowserPanel docked projectId="project-f" sessionId="session-7" />,
    );

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));
    view.unmount();

    await waitFor(() =>
      expect(preload.invocations).toContainEqual({
        command: "browser_set_visible",
        args: { visible: false },
      }),
    );
    expect(preload.commands()).not.toContain("browser_dispose");
  });
});
