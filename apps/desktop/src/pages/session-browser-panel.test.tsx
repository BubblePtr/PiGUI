import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserEvent } from "@/shared/browser-protocol";
import type { PiGUIRendererApi } from "@/shared/runtime";
import {
  getProjectBrowserUrl,
  rememberProjectBrowserUrl,
} from "@/entities/browser/browser-url-memory";
import {
  subscribeComposerInjections,
  type ComposerInjection,
} from "@/entities/session/composer-injections";
import { SessionBrowserPanel } from "@/pages/session-browser-panel";

type Invocation = { command: string; args?: Record<string, unknown> };

function installPreload(options: { captureGate?: Promise<void> } = {}) {
  const invocations: Invocation[] = [];
  const listeners: Array<(event: BrowserEvent) => void> = [];
  // Mirrors the host: every navigate answers with a fresh navigation id.
  let navigationId = 0;
  const api: PiGUIRendererApi = {
    invoke: (async (command: string, args?: Record<string, unknown>) => {
      invocations.push({ command, args });

      if (command === "browser_capture") {
        await options.captureGate;
        return "data:image/png;base64,SNAP";
      }

      if (command === "browser_capture_annotation") {
        return "data:image/png;base64,SNAP";
      }

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
    designModeResets: () =>
      invocations.filter(
        (invocation) =>
          invocation.command === "browser_set_design_mode" &&
          invocation.args?.enabled === false,
      ).length,
    last: () => invocations[invocations.length - 1],
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
    // Switching away leaves the view alone (PRD section 6): the page stays
    // loaded and invisible, so coming back is instant.
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
  });

  it("marks up the page through main and reports what came back", async () => {
    const user = userEvent.setup();
    const preload = installPreload();

    rememberProjectBrowserUrl("project-m", "http://localhost:5173/");
    render(<SessionBrowserPanel docked projectId="project-m" sessionId="session-11" />);

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));

    await user.click(screen.getByRole("button", { name: "Design" }));

    expect(preload.invocations).toContainEqual({
      command: "browser_set_design_mode",
      args: { enabled: true },
    });

    // The marks themselves live in the page; the surface only counts them.
    preload.emit({
      type: "annotations-changed",
      navigationId: 1,
      viewport: { width: 684, height: 820, dpr: 2 },
      annotations: [
        { index: 1, selector: "#cta", tag: "button", rect: { x: 0, y: 0, width: 8, height: 8 } },
        { index: 2, selector: "#copy", tag: "p", rect: { x: 0, y: 0, width: 8, height: 8 } },
      ],
    });

    expect(await screen.findByTestId("browser-annotation-count")).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: "Clear marks" }));

    expect(preload.commands()).toContain("browser_clear_annotations");
  });

  it("follows design mode the page left on its own", async () => {
    const user = userEvent.setup();
    const preload = installPreload();

    rememberProjectBrowserUrl("project-n", "http://localhost:5173/");
    render(<SessionBrowserPanel docked projectId="project-n" sessionId="session-12" />);

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));
    await user.click(screen.getByRole("button", { name: "Design" }));

    expect(screen.getByRole("button", { name: "Design" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Escape inside the page. The toolbar has to stop claiming design mode is
    // on, or the next click on the page would surprise the user.
    preload.emit({ type: "design-mode-changed", navigationId: 1, enabled: false });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Design" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
  });

  it("hands the marks and a screenshot of them to this Session's composer", async () => {
    const user = userEvent.setup();
    const preload = installPreload();
    const injections: ComposerInjection[] = [];
    const unsubscribe = subscribeComposerInjections("session-13", (injection) =>
      injections.push(injection),
    );

    rememberProjectBrowserUrl("project-s", "http://localhost:5173/");
    render(<SessionBrowserPanel docked projectId="project-s" sessionId="session-13" />);

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));

    preload.emit({
      type: "annotations-changed",
      navigationId: 1,
      viewport: { width: 684, height: 820, dpr: 2 },
      annotations: [
        {
          index: 1,
          selector: "#cta",
          tag: "button",
          rect: { x: 0, y: 0, width: 8, height: 8 },
          comment: "Too small to hit",
        },
      ],
    });

    // Typing an address is not going there, and the payload has to name the
    // page the marks are actually on.
    await user.clear(screen.getByRole("textbox", { name: "Address" }));
    await user.type(screen.getByRole("textbox", { name: "Address" }), "localhost:4000");

    await user.click(await screen.findByRole("button", { name: "Send to composer" }));
    await waitFor(() => expect(injections).toHaveLength(1));

    const [injection] = injections;

    // The page, the space the marks were measured in, and every mark — the
    // template core renders is what Pi ends up reading.
    expect(injection!.text).toContain("- URL: http://localhost:5173/");
    expect(injection!.text).toContain("- Viewport: 684×820 @2x");
    expect(injection!.text).toContain("#1 `#cta` (button) — Too small to hit");

    const [screenshot] = injection!.files ?? [];

    // A real File, so it rides the composer's existing image path rather than
    // a second one built for this surface.
    expect(preload.commands()).toContain("browser_capture_annotation");
    expect(screenshot).toBeInstanceOf(File);
    expect(screenshot!.type).toBe("image/png");
    expect(screenshot!.size).toBeGreaterThan(0);

    unsubscribe();
  });

  it("drops the marks as soon as it asks for another page", async () => {
    const user = userEvent.setup();
    const preload = installPreload();

    rememberProjectBrowserUrl("project-p", "http://localhost:5173/");
    render(<SessionBrowserPanel docked projectId="project-p" sessionId="session-14" />);

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));

    preload.emit({
      type: "annotations-changed",
      navigationId: 1,
      viewport: { width: 684, height: 820, dpr: 2 },
      annotations: [
        { index: 1, selector: "#cta", tag: "button", rect: { x: 0, y: 0, width: 8, height: 8 } },
      ],
    });

    expect(await screen.findByTestId("browser-annotation-count")).toHaveTextContent("1");

    await user.clear(screen.getByRole("textbox", { name: "Address" }));
    await user.type(screen.getByRole("textbox", { name: "Address" }), "localhost:4000");
    await user.keyboard("{Enter}");

    // The new document announces itself before its load resolves, so the empty
    // list main sends back is stamped with a navigation id this component has
    // not accepted yet and is dropped. Nothing else would clear the count.
    await waitFor(() =>
      expect(screen.queryByTestId("browser-annotation-count")).not.toBeInTheDocument(),
    );
  });

  it("starts the next Project's page unmarked and out of design mode", async () => {
    const user = userEvent.setup();
    const preload = installPreload();

    rememberProjectBrowserUrl("project-q", "http://localhost:5173/");
    rememberProjectBrowserUrl("project-r", "http://localhost:4000/");

    const view = render(
      <SessionBrowserPanel docked projectId="project-q" sessionId="session-15" />,
    );

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));
    await user.click(screen.getByRole("button", { name: "Design" }));
    preload.emit({
      type: "annotations-changed",
      navigationId: 1,
      viewport: { width: 684, height: 820, dpr: 2 },
      annotations: [
        { index: 1, selector: "#cta", tag: "button", rect: { x: 0, y: 0, width: 8, height: 8 } },
      ],
    });
    expect(await screen.findByTestId("browser-annotation-count")).toHaveTextContent("1");

    // Mounting already reset design mode once, so only a *new* reset proves the
    // switch did anything. Waiting on "contains one" would pass before the
    // rerender had run at all.
    const resetsBeforeSwitch = preload.designModeResets();

    view.rerender(
      <SessionBrowserPanel docked projectId="project-r" sessionId="session-15" />,
    );

    // Main has to hear it too: it re-applies design mode to every new document,
    // so a reset kept to this side would leave the page marking with the
    // toolbar saying it is not.
    await waitFor(() =>
      expect(preload.designModeResets()).toBe(resetsBeforeSwitch + 1),
    );

    // Polled, not read once: Astryx renders aria-pressed from a useOptimistic
    // value that only snaps back to the prop when the click's transition
    // settles, so the toggle still reads pressed for a moment after the state
    // behind it flipped.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Design" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    expect(screen.queryByTestId("browser-annotation-count")).not.toBeInTheDocument();
  });

  it("leaves design mode behind when the surface unmounts", async () => {
    const user = userEvent.setup();
    const preload = installPreload();

    rememberProjectBrowserUrl("project-o", "http://localhost:5173/");

    const view = render(
      <SessionBrowserPanel docked projectId="project-o" sessionId="session-13" />,
    );

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));
    await user.click(screen.getByRole("button", { name: "Design" }));
    view.unmount();

    // The page outlives the surface, so a page left in design mode would keep
    // swallowing clicks with no toolbar in sight — and marks left on it would
    // still be there when the surface comes back counting zero of them.
    await waitFor(() =>
      expect(preload.invocations).toContainEqual({
        command: "browser_set_design_mode",
        args: { enabled: false },
      }),
    );
    expect(preload.commands()).toContain("browser_clear_annotations");
  });

  it("stands a still of the page in for the native view while an overlay is open", async () => {
    const user = userEvent.setup();
    const preload = installPreload();

    rememberProjectBrowserUrl("project-k", "http://localhost:5173/");
    render(
      <>
        <SessionBrowserPanel docked projectId="project-k" sessionId="session-9" />
        <Tooltip content="Preview a running dev server" delay={0}>
          <IconButton icon={<span>i</span>} label="Rail" />
        </Tooltip>
      </>,
    );

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));
    expect(screen.queryByTestId("browser-snapshot")).not.toBeInTheDocument();

    // The rail's own tooltip is the case that forced this: it opens right
    // against the browser and the native view would paint straight over it.
    await user.hover(screen.getByRole("button", { name: "Rail" }));

    const snapshot = await screen.findByTestId("browser-snapshot");

    expect(snapshot).toHaveAttribute("src", "data:image/png;base64,SNAP");
    await waitFor(() =>
      expect(preload.invocations).toContainEqual({
        command: "browser_set_visible",
        args: { visible: false },
      }),
    );

    await user.unhover(screen.getByRole("button", { name: "Rail" }));

    await waitFor(() =>
      expect(screen.queryByTestId("browser-snapshot")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(preload.last()).toEqual({
        command: "browser_set_visible",
        args: { visible: true },
      }),
    );
  });

  it("keeps the native view visible when the overlay closes before its still arrives", async () => {
    const user = userEvent.setup();
    let releaseCapture = () => {};
    const preload = installPreload({
      captureGate: new Promise<void>((resolve) => {
        releaseCapture = resolve;
      }),
    });

    rememberProjectBrowserUrl("project-l", "http://localhost:5173/");
    render(
      <>
        <SessionBrowserPanel docked projectId="project-l" sessionId="session-10" />
        <Tooltip content="Preview a running dev server" delay={0}>
          <IconButton icon={<span>i</span>} label="Rail" />
        </Tooltip>
      </>,
    );

    await waitFor(() => expect(preload.commands()).toContain("browser_navigate"));

    await user.hover(screen.getByRole("button", { name: "Rail" }));
    await waitFor(() => expect(preload.commands()).toContain("browser_capture"));

    // Overlay gone before the still came back: showing it now would freeze the
    // page for no reason and flash over a view that is already correct.
    await user.unhover(screen.getByRole("button", { name: "Rail" }));
    releaseCapture();

    await waitFor(() =>
      expect(preload.last()).toEqual({
        command: "browser_set_visible",
        args: { visible: true },
      }),
    );
    expect(screen.queryByTestId("browser-snapshot")).not.toBeInTheDocument();
  });
});
