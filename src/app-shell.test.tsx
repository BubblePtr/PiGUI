import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { AppFrame } from "./app-shell";
import { saveSessionDraft } from "./session-drafts";

function renderAppFrame(
  path = "/",
  { toolbarActions }: { toolbarActions?: ReactNode } = {},
) {
  const rootRoute = createRootRoute({
    component: () => (
      <AppFrame sidebar={<div>Route sidebar</div>} toolbarActions={toolbarActions}>
        <div>Main content</div>
      </AppFrame>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const sessionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sessions/$sessionId",
    component: () => null,
  });
  const usageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/usage",
    component: () => null,
  });
  const projectSessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/sessions",
    component: () => null,
  });
  const setupRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
    component: () => null,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([
      indexRoute,
      sessionRoute,
      usageRoute,
      projectSessionsRoute,
      setupRoute,
    ]),
  });

  return render(<RouterProvider router={router} />);
}

describe("AppFrame", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("places Project sessions in the primary sidebar", async () => {
    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");
    const projectNavigation = within(projectGroup).getByLabelText("Pig project sessions");

    expect(within(projectGroup).getByText("Pig")).toBeInTheDocument();
    expect(within(projectNavigation).getByText("Agent Workspace shell")).toBeInTheDocument();
    expect(within(projectNavigation).getByText("Analyze boundary pass")).toBeInTheDocument();
    expect(within(projectNavigation).getByLabelText("Active run")).toBeInTheDocument();
    expect(within(projectNavigation).getByText("08:06")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Sessions" })).toBeInTheDocument();
  });

  it("renders the Project session list from active, unread, archive, and updated projection state", async () => {
    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectNavigation = within(screen.getByTestId("sidebar-projects")).getByLabelText(
      "Pig project sessions",
    );
    const sessionRows = within(projectNavigation).getAllByRole("row").slice(1);

    expect(
      sessionRows.map((row) =>
        row.querySelector('[data-slot="sidebar-menu-label"]')?.textContent?.trim(),
      ),
    ).toEqual([
      "Agent Workspace shell",
      "Analyze boundary pass",
      "Usage evidence review",
    ]);
    expect(within(sessionRows[0]).getByLabelText("Active run")).toBeInTheDocument();
    expect(within(sessionRows[1]).getByLabelText("Unread result")).toBeInTheDocument();
    expect(within(projectNavigation).queryByText("Archived checkout snapshot")).not.toBeInTheDocument();
    expect(within(projectNavigation).queryByText(/Running|Completed|Failed|Waiting/)).not.toBeInTheDocument();
  });

  it("selects a Session without clearing unread before route content renders it", async () => {
    const user = userEvent.setup();

    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectNavigation = within(screen.getByTestId("sidebar-projects")).getByLabelText(
      "Pig project sessions",
    );
    const unreadRow = within(projectNavigation).getByRole("row", {
      name: "Analyze boundary pass",
    });

    expect(within(unreadRow).getByLabelText("Unread result")).toBeInTheDocument();

    await user.click(unreadRow);

    const openedRow = within(projectNavigation).getByRole("row", {
      name: "Analyze boundary pass",
    });

    expect(openedRow).toHaveAttribute("data-current", "true");
    expect(within(openedRow).getByLabelText("Unread result")).toBeInTheDocument();
    expect(within(projectNavigation).queryByText(/Completed|Failed|Waiting/)).not.toBeInTheDocument();
  });

  it("shows New Session and Project plus entry points with a lightweight draft indicator", async () => {
    saveSessionDraft("pig", "Existing Project draft");

    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");
    const projectNavigation = within(projectGroup).getByLabelText("Pig project sessions");

    expect(
      within(projectGroup).getByRole("button", { name: "New Session for Pig" }),
    ).toBeInTheDocument();
    expect(within(projectNavigation).getByRole("row", { name: "New Session" })).toBeInTheDocument();
    expect(within(projectGroup).getAllByText("Draft")).toHaveLength(2);
    expect(within(projectNavigation).queryByText("Session Draft")).not.toBeInTheDocument();
  });

  it("renders Analyze as an expanded second-level sidebar menu", async () => {
    renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const analyzeNavigation = screen.getByLabelText("Analyze navigation");
    const analyzeItem = analyzeNavigation
      .querySelector('[data-key="Analyze"]')
      ?.querySelector('[data-slot="sidebar-menu-item-content"]');

    expect(within(analyzeNavigation).getByText("Analyze")).toBeInTheDocument();
    expect(within(analyzeNavigation).getByText("Trace")).toBeInTheDocument();
    expect(within(analyzeNavigation).getByText("Usage")).toBeInTheDocument();
    expect(analyzeItem).toHaveClass("min-w-0", "flex-1");
    expect(screen.getByRole("heading", { level: 1, name: "Analyze" })).toBeInTheDocument();
  });

  it("orders Analyze above a large Workspace area and pins Settings to the footer", async () => {
    const { container } = renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebarContent = container.querySelector('[data-slot="sidebar-content"]');
    const sidebarFooter = container.querySelector('[data-slot="sidebar-footer"]');
    const analyzeNavigation = screen.getByLabelText("Analyze navigation");
    const workspaceGroup = screen.getByTestId("sidebar-workspace");
    const projectGroup = screen.getByTestId("sidebar-projects");

    expect(sidebarContent).toBeInTheDocument();
    expect(sidebarFooter).toBeInTheDocument();
    expect(sidebarContent).toHaveClass("flex-1", "min-h-0");
    expect(workspaceGroup).toHaveClass("flex-1", "min-h-0", "overflow-y-auto");
    expect(within(workspaceGroup).getByText("Workspace")).toBeInTheDocument();
    expect(sidebarContent?.children[0]).toBe(
      analyzeNavigation.closest('[data-slot="sidebar-group"]'),
    );
    expect(sidebarContent?.children[1]).toBe(workspaceGroup);
    expect(projectGroup).toBe(workspaceGroup.querySelector('[data-testid="sidebar-projects"]'));
    expect(sidebarFooter).toHaveTextContent("Settings");
    expect(sidebarFooter).not.toHaveTextContent("Analyze");
    expect(sidebarContent).not.toHaveTextContent("Settings");
  });

  it("uses HeroUI Pro AppLayout and keeps the sidebar to primary tabs only", async () => {
    const { container } = renderAppFrame("/usage");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.queryByText("Route sidebar")).not.toBeInTheDocument();
    const layout = container.querySelector("[data-app-layout]");
    const sidebar = container.querySelector('[data-slot="sidebar"]');

    expect(layout).toBeInTheDocument();
    expect(layout).toHaveClass("pig-app-layout");
    expect(layout).toHaveAttribute("data-scroll-mode", "content");
    expect(layout).toHaveAttribute("data-resizable");
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveAttribute("data-collapsible", "offcanvas");
    expect(sidebar).toHaveAttribute("data-variant", "inset");
    const sidebarChrome = screen.getByTestId("sidebar-titlebar-spacer");
    expect(sidebarChrome).toBeInTheDocument();
    expect(sidebarChrome).toHaveStyle({ height: "40px" });
    expect(within(sidebarChrome).queryByRole("button")).not.toBeInTheDocument();

    const headerChrome = screen.getByTestId("header-chrome");
    expect(headerChrome).toBeInTheDocument();
    expect(headerChrome).toHaveClass("pig-header-chrome");
    expect(headerChrome).toHaveStyle({
      "--pig-header-height": "40px",
      "--pig-main-left": "16rem",
      "--pig-traffic-width": "88px",
    });
    const macTrafficSpace = within(headerChrome).getByTestId("mac-traffic-space");

    expect(macTrafficSpace).toBeInTheDocument();
    expect(macTrafficSpace).toHaveAttribute("data-tauri-drag-region");
    expect(headerChrome.querySelector("[data-tauri-drag-region]")).toBeInTheDocument();
    const sidebarCollapseTrigger = within(headerChrome).getByRole("button", {
      name: "Collapse sidebar",
    });
    expect(sidebarCollapseTrigger).toHaveAttribute("data-slot", "sidebar-trigger");
    expect(container.querySelector('[data-testid="collapsed-traffic-space"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-content"]')).not.toHaveClass("pt-12");
    expect(container.querySelector('[data-slot="navbar"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="app-layout-menu-toggle"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-rail"]')).not.toBeInTheDocument();
    const resizeHandle = container.querySelector('[data-slot="resizable-handle"]');
    expect(resizeHandle).toBeInTheDocument();
    expect(resizeHandle).toHaveAttribute("aria-label", "Resize handle");
    expect(resizeHandle).toHaveAttribute("data-type", "line");
    const currentItems = Array.from(container.querySelectorAll('[data-current="true"]'));
    expect(currentItems.some((item) => item.textContent?.includes("Analyze"))).toBe(true);
    expect(currentItems.some((item) => item.textContent?.includes("Usage"))).toBe(true);
    expect(screen.getByRole("heading", { level: 1, name: "Analyze" })).toBeInTheDocument();
  });

  it("keeps titlebar controls on the native traffic-light center line", async () => {
    const { container } = renderAppFrame("/");
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
    );
    const [mainWindow] = config.app.windows;

    expect(await screen.findByText("Main content")).toBeInTheDocument();

    const headerChrome = screen.getByTestId("header-chrome");
    const titleTrack = screen.getByTestId("header-chrome-title-track");
    const title = screen.getByTestId("header-chrome-title");
    const trigger = screen.getByRole("button", { name: "Collapse sidebar" });
    const heading = screen.getByRole("heading", { level: 1, name: "Analyze" });

    expect(container.querySelector('[data-slot="navbar"]')).not.toBeInTheDocument();
    const headerHeight = Number.parseInt(
      headerChrome.style.getPropertyValue("--pig-header-height"),
      10,
    );

    expect(headerChrome).toHaveStyle({ height: "40px" });
    expect(mainWindow.trafficLightPosition.y).toBe(headerHeight / 2 + 2);
    expect(titleTrack).toHaveStyle({ "--pig-main-left": "16rem" });
    expect(titleTrack).toHaveStyle({ "--pig-title-x": "16rem" });
    expect(titleTrack).toHaveStyle({ left: "0px" });
    expect(title).toHaveStyle({
      "--pig-title-x": "16rem",
      transform: "translateX(16rem)",
    });
    expect(trigger).toHaveStyle({ width: "28px", height: "28px" });
    expect(screen.getByTestId("header-chrome-left")).toHaveClass("pig-header-chrome__left");
    expect(title).toHaveClass("h-7", "items-center");
    expect(heading).toHaveClass("leading-7");
  });

  it("uses only blank titlebar space as Tauri drag regions", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Collapse sidebar" });
    const heading = screen.getByRole("heading", { level: 1, name: "Analyze" });
    const title = screen.getByTestId("header-chrome-title");
    const navbarSpacer = container.querySelector('[data-slot="navbar-spacer"]');
    const macTrafficSpace = within(screen.getByTestId("header-chrome")).getByTestId(
      "mac-traffic-space",
    );
    const dragRegions = container.querySelectorAll("[data-tauri-drag-region]");

    expect(dragRegions).toHaveLength(3);
    expect(macTrafficSpace).toHaveAttribute("data-tauri-drag-region");
    expect(navbarSpacer).toHaveAttribute("data-tauri-drag-region");
    expect(navbarSpacer).toHaveClass("h-full", "min-w-0", "flex-1", "select-none");
    expect(trigger).not.toHaveAttribute("data-tauri-drag-region");
    expect(title).not.toHaveAttribute("data-tauri-drag-region");
    expect(heading).not.toHaveAttribute("data-tauri-drag-region");
    expect(heading).toHaveClass("select-none");
  });

  it("renders route toolbar actions outside the titlebar drag region", async () => {
    const { container } = renderAppFrame("/projects/pig/sessions", {
      toolbarActions: <button type="button">Session actions</button>,
    });

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const navbarActions = screen.getByTestId("navbar-actions");
    const action = within(navbarActions).getByRole("button", {
      name: "Session actions",
    });

    expect(navbarActions).toBeInTheDocument();
    expect(action).toBeInTheDocument();
    expect(navbarActions).not.toHaveAttribute("data-tauri-drag-region");
    expect(action).not.toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector('[data-slot="navbar-spacer"]')).toHaveAttribute(
      "data-tauri-drag-region",
    );
    expect(container.querySelector('[data-slot="navbar"]')).not.toBeInTheDocument();
  });

  it("keeps the collapsed navbar title clear of native traffic lights", async () => {
    const user = userEvent.setup();
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const provider = container.querySelector('[data-slot="sidebar-provider"]');
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    const styles = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
    const headerChrome = screen.getByTestId("header-chrome");
    const titleTrack = screen.getByTestId("header-chrome-title-track");
    const title = screen.getByTestId("header-chrome-title");
    const fixedTrigger = within(headerChrome).getByRole("button", {
      name: "Collapse sidebar",
    });

    expect(container.querySelector('[data-testid="collapsed-traffic-space"]')).not.toBeInTheDocument();
    expect(headerChrome).toHaveStyle({ "--pig-main-left": "16rem" });
    expect(titleTrack).toHaveStyle({ "--pig-main-left": "16rem" });
    expect(titleTrack).toHaveStyle({ "--pig-title-x": "16rem" });
    expect(titleTrack).toHaveStyle({ left: "0px" });
    expect(title).toHaveStyle({
      "--pig-title-x": "16rem",
      transform: "translateX(16rem)",
    });

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(provider).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");

    const collapsedTrigger = within(headerChrome).getByRole("button", {
      name: "Expand sidebar",
    });
    const dragRegions = container.querySelectorAll("[data-tauri-drag-region]");

    expect(collapsedTrigger).toBe(fixedTrigger);
    expect(headerChrome).toHaveStyle({ "--pig-main-left": "0px" });
    expect(titleTrack).toHaveStyle({ "--pig-main-left": "0px" });
    expect(titleTrack).toHaveStyle({ left: "0px" });
    expect(titleTrack).toHaveStyle({ "--pig-title-x": "132px" });
    expect(title).toHaveStyle({
      "--pig-title-x": "132px",
      transform: "translateX(132px)",
    });
    expect(styles).not.toContain("collapsed-traffic-space");
    expect(styles).not.toContain("left: max(var(--pig-main-left)");
    expect(styles).not.toContain("padding-left 200ms cubic-bezier(.2, .8, .2, 1)");
    expect(styles).not.toContain("padding-left: calc(var(--pig-title-safe-offset)");
    expect(styles).not.toContain("transition: left 200ms cubic-bezier(.2, .8, .2, 1);");
    expect(styles).toContain("transform 200ms cubic-bezier(.2, .8, .2, 1)");
    expect(styles).toContain(".pig-header-chrome__left {\n  position: absolute;");
    expect(styles).toContain("z-index: 1;");
    expect(styles).toContain(".pig-header-chrome__title-track {\n  position: absolute;");
    expect(styles).toContain("z-index: 0;");
    expect(collapsedTrigger).not.toHaveAttribute("data-tauri-drag-region");
    expect(dragRegions).toHaveLength(3);
  });

  it("does not use transient collapsed resize widths for the title expand target", async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    const resizeObservers: Array<{ trigger: () => void }> = [];

    class TestResizeObserver {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeObservers.push({
          trigger: () => this.callback([], this as unknown as ResizeObserver),
        });
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
      writable: true,
    });

    try {
      const user = userEvent.setup();
      const { container } = renderAppFrame("/");

      expect(await screen.findByText("Main content")).toBeInTheDocument();
      const sidebarPanel = container.querySelector<HTMLElement>(
        '[data-testid="app-layout-sidebar"][data-panel]',
      );
      const title = screen.getByTestId("header-chrome-title");

      expect(sidebarPanel).toBeInTheDocument();
      if (!sidebarPanel) {
        throw new Error("Expected AppLayout sidebar panel to be rendered");
      }

      let measuredWidth = 224;
      sidebarPanel.getBoundingClientRect = () =>
        ({
          bottom: 0,
          height: 0,
          left: 0,
          right: measuredWidth,
          top: 0,
          width: measuredWidth,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;

      await act(async () => {
        resizeObservers.forEach((observer) => observer.trigger());
      });

      expect(title).toHaveStyle({
        "--pig-title-x": "224px",
        transform: "translateX(224px)",
      });

      await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      expect(title).toHaveStyle({
        "--pig-title-x": "132px",
        transform: "translateX(132px)",
      });

      measuredWidth = 12;
      await act(async () => {
        resizeObservers.forEach((observer) => observer.trigger());
      });

      await user.click(screen.getByRole("button", { name: "Expand sidebar" }));

      expect(title).toHaveStyle({
        "--pig-title-x": "224px",
        transform: "translateX(224px)",
      });
    } finally {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: originalResizeObserver,
        writable: true,
      });
    }
  });

  it("collapses and reopens the inset sidebar with the fixed header chrome trigger", async () => {
    const user = userEvent.setup();
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    const provider = container.querySelector('[data-slot="sidebar-provider"]');
    const layout = container.querySelector("[data-app-layout]");
    const headerChrome = screen.getByTestId("header-chrome");
    const styles = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

    expect(provider).toHaveAttribute("data-state", "expanded");
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(within(headerChrome).queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument();

    await user.click(
      within(headerChrome).getByRole("button", {
        name: "Collapse sidebar",
      }),
    );

    expect(provider).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(layout).toHaveAttribute("data-sidebar-animating", "true");
    const expandTrigger = within(headerChrome).getByRole("button", {
      name: "Expand sidebar",
    });
    expect(expandTrigger).toHaveAttribute("data-slot", "sidebar-trigger");
    expect(styles).toContain(
      '.pig-app-layout[data-sidebar-animating="true"] [data-testid="app-layout-sidebar"][data-panel]',
    );
    expect(styles).toContain("flex-grow 200ms ease");
    expect(styles).toContain(
      '.pig-app-layout[data-sidebar-animating="true"] [data-slot="sidebar"][data-collapsible="offcanvas"]',
    );
    expect(styles).toContain("translate 200ms ease");
    expect(styles).toContain("visibility 200ms");

    await user.click(expandTrigger);

    expect(provider).toHaveAttribute("data-state", "expanded");
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(
      within(headerChrome).getByRole("button", {
        name: "Collapse sidebar",
      }),
    ).toHaveAttribute("data-slot", "sidebar-trigger");
    expect(within(headerChrome).queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument();
  });

  it("keeps the desktop sidebar compact", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]');
    const sidebarWrapper = container.querySelector<HTMLElement>(".sidebar__offcanvas-wrapper");
    const styles = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
    const source = readFileSync(join(process.cwd(), "src/app-shell.tsx"), "utf8");

    expect(sidebar).toHaveStyle({ "--sidebar-width": "16rem" });
    expect(sidebarWrapper).toBeInTheDocument();
    expect(styles).toContain(".pig-app-layout .sidebar__offcanvas-wrapper");
    expect(styles).toContain("--sidebar-width: 16rem;");
    expect(styles).toContain(".pig-app-layout[data-resizable] .sidebar__offcanvas-wrapper");
    expect(styles).toContain(".pig-app-layout[data-resizable] [data-slot=\"sidebar\"]");
    expect(styles).toContain("min-width: 100%;");
    expect(source).toContain('const sidebarDefaultSize = "16rem";');
    expect(source).toContain('const sidebarMinSize = "14rem";');
    expect(source).toContain('const sidebarMaxSize = "22rem";');
    expect(source).toContain("sidebarDefaultSize={sidebarDefaultSize}");
    expect(source).toContain("sidebarMinSize={sidebarMinSize}");
    expect(source).toContain("sidebarMaxSize={sidebarMaxSize}");
    expect(source).toContain("sidebarResizable");
  });

  it("uses the default resizable separator line", async () => {
    const { container } = renderAppFrame("/");
    const styles = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-rail"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="resizable-handle"]')).toBeInTheDocument();
    expect(styles).not.toContain(
      ".pig-app-layout[data-resizable] [data-slot=\"resizable-handle\"]",
    );
    expect(styles).not.toContain("--resizable-handle-color: transparent;");
    expect(styles).not.toContain("--resizable-handle-color-hover: transparent;");
    expect(styles).not.toContain("--resizable-handle-color-active: transparent;");
  });

  it("removes duplicate product identity from the shell chrome", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="navbar"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("header-chrome-title")).not.toHaveTextContent("Pig");
    expect(screen.queryByText("Pi flight recorder")).not.toBeInTheDocument();
  });

  it("uses the current section label as the content title", async () => {
    renderAppFrame("/sessions/session-a");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Analyze" })).toBeInTheDocument();
  });

  it("gives routed pages a fixed-height content slot", async () => {
    renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.getByTestId("app-frame-content")).toHaveClass("h-full", "min-h-0");
    expect(screen.getByTestId("app-frame-content")).not.toHaveClass("min-h-full");
    expect(screen.getByTestId("app-frame-content")).not.toHaveClass("bg-background");
  });

  it("disables document-level elastic overscroll", () => {
    const source = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

    expect(source).toContain("html,");
    expect(source).toContain("body,");
    expect(source).toContain("#root");
    expect(source).toContain("overscroll-behavior: none;");
    expect(source).toContain("overflow: hidden;");
    expect(source).toContain(".pig-app-layout[data-scroll-mode=\"content\"] .app-layout__main");
  });

  it("lets AppLayout own the right content column surface", () => {
    const source = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

    expect(source).not.toContain(".pig-app-layout [data-slot=\"app-layout-body\"]");
    expect(source).not.toContain(".pig-app-layout > [data-slot=\"app-layout-body\"]");
    expect(source).not.toContain("border: 1px solid var(--border);");
    expect(source).not.toContain("box-shadow: var(--surface-shadow);");
    expect(source).not.toContain("--pig-color-");
    expect(source).not.toContain("border-radius: calc(var(--radius) * 2);");
    expect(source).not.toContain("margin: 0 calc(var(--spacing, 0.25rem) * 1) 0 0;");
  });

  it("does not import standalone React Aria Heading into the app shell", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app-shell.tsx"),
      "utf8",
    );

    expect(source).not.toContain('react-aria-components/Heading');
    expect(source).not.toContain("<Sidebar.Mobile");
  });

  it("extends web content into the native macOS titlebar overlay", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
    );
    const [mainWindow] = config.app.windows;

    expect(mainWindow.label).toBe("main");
    expect(mainWindow.decorations).toBe(true);
    expect(mainWindow.titleBarStyle).toBe("Overlay");
    expect(mainWindow.hiddenTitle).toBe(true);
    expect(mainWindow.trafficLightPosition).toEqual({ x: 16, y: 22 });
  });

  it("does not replace macOS titlebar gestures with React window API handlers", () => {
    const source = readFileSync(join(process.cwd(), "src/app-shell.tsx"), "utf8");

    expect(source).not.toContain("startWindowDrag");
    expect(source).not.toContain("toggleWindowMaximize");
  });

  it("allows Tauri drag-region window commands for the main window", () => {
    const capability = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri/capabilities/default.json"), "utf8"),
    );

    expect(capability.windows).toEqual(["main"]);
    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:default",
        "core:window:allow-start-dragging",
        "core:window:allow-toggle-maximize",
      ]),
    );
  });
});
